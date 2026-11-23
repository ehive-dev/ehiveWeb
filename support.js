(() => {
  const form = document.querySelector('[data-support-form]');
  if (!form) return;
  const topic = form.elements.topic;
  const hardware = form.querySelector('[data-hardware-fields]');
  const components = form.querySelector('[data-components]');
  const addButton = form.querySelector('[data-add-component]');
  const cards = new Map();
  let nextId = 0;
  form.supportPreview = ['localhost', '127.0.0.1'].includes(location.hostname);
  form.querySelector('[data-support-preview]').hidden = !form.supportPreview;

  async function preparePhoto(file) {
    if (!file || file.size > 20 * 1024 * 1024) throw new Error('Bitte ein Foto mit höchstens 20 MB auswählen.');
    const image = new Image();
    const url = URL.createObjectURL(file);
    try {
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', .85);
      if (data.length > 1400000) throw new Error('Das Foto ist noch zu groß. Bitte fotografiere nur das Typenschild.');
      return data;
    } catch (error) {
      if (error instanceof Error && /zu groß/.test(error.message)) throw error;
      throw new Error('Das Foto konnte nicht gelesen werden. Bitte ein JPEG-, PNG- oder WebP-Foto auswählen.');
    } finally { URL.revokeObjectURL(url); }
  }

  function addComponent() {
    const id = ++nextId;
    const card = document.createElement('div');
    card.className = 'support-component';
    card.innerHTML = `
      <h3>Komponente</h3>
      <div class="support-grid">
        <div><label for="component-kind-${id}">Geräteart</label><select id="component-kind-${id}" data-kind required><option value="">Bitte auswählen</option><option>Wallbox</option><option>Wechselrichter</option><option>Speicher</option><option>Energiezähler</option><option>Wärmepumpe</option><option>eHive One</option><option>Anderes Gerät</option></select></div>
        <div><label for="component-maker-${id}">Hersteller</label><input id="component-maker-${id}" data-maker maxlength="100" placeholder="Eintragen oder Typenschild fotografieren"></div>
        <div><label for="component-model-${id}">Modell / Typ</label><input id="component-model-${id}" data-model maxlength="150" placeholder="Genaue Typbezeichnung"></div>
        <div><label for="component-data-${id}">Technische Angaben <span>(optional)</span></label><input id="component-data-${id}" data-details maxlength="300" placeholder="z. B. Firmware, Leistung, Modbus / LAN / RS485"></div>
      </div>
      <div class="support-photo-actions"><button class="btn" type="button" data-camera>Typenschild fotografieren</button><button class="btn" type="button" data-gallery>Foto auswählen</button></div>
      <input type="file" data-camera-input accept="image/*" capture="environment" hidden>
      <input type="file" data-gallery-input accept="image/*" hidden>
      <p class="support-photo-status" aria-live="polite">Optional: Fotografiere das Typenschild gut lesbar. Persönliche Angaben und QR-Codes mit Zugangsdaten bitte abdecken.</p>
      <img class="support-photo-preview" alt="Vorschau des ausgewählten Typenschilds" hidden>
      <button class="btn" type="button" data-clear-photo hidden>Foto entfernen</button>
      <button class="btn" type="button" data-remove>Komponente entfernen</button>`;
    const state = { card, photo: null, pending: Promise.resolve(), generation: 0 };
    cards.set(id, state);
    const maker = card.querySelector('[data-maker]');
    const model = card.querySelector('[data-model]');
    const status = card.querySelector('.support-photo-status');
    const preview = card.querySelector('img');
    const clear = card.querySelector('[data-clear-photo]');
    const validate = () => model.setCustomValidity(state.photo || (maker.value.trim() && model.value.trim()) ? '' : 'Bitte Hersteller und Modell eintragen oder ein Typenschild-Foto hinzufügen.');
    maker.addEventListener('input', validate);
    model.addEventListener('input', validate);
    const resetPhoto = () => {
      state.generation++;
      state.photo = null;
      preview.hidden = true;
      preview.removeAttribute('src');
      clear.hidden = true;
      card.querySelectorAll('input[type=file]').forEach(input => { input.value = ''; });
      validate();
    };
    clear.addEventListener('click', () => { resetPhoto(); status.textContent = 'Foto entfernt. Du kannst ein neues Foto auswählen.'; });
    for (const source of ['camera', 'gallery']) {
      const input = card.querySelector(`[data-${source}-input]`);
      card.querySelector(`[data-${source}]`).addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        resetPhoto();
        const generation = state.generation;
        status.textContent = 'Foto wird vorbereitet …';
        state.pending = preparePhoto(file).then(data => {
          if (generation !== state.generation) return;
          state.photo = data;
          preview.src = data;
          preview.hidden = false;
          clear.hidden = false;
          status.textContent = 'Foto bereit. Hersteller und Modell werden beim Absenden aus dem Typenschild gelesen. Bitte prüfe erkannte Angaben in der Antwort.';
          validate();
        }).catch(error => { if (generation === state.generation) { status.textContent = error.message; validate(); } });
      });
    }
    card.querySelector('[data-remove]').addEventListener('click', () => {
      resetPhoto(); cards.delete(id); card.remove();
      if (!cards.size) addComponent();
      addButton.disabled = cards.size >= 3;
    });
    components.append(card);
    validate();
    addButton.disabled = cards.size >= 3;
  }
  addButton.addEventListener('click', addComponent);
  topic.addEventListener('change', () => {
    hardware.hidden = topic.value !== 'hardware';
    hardware.disabled = hardware.hidden;
  });
  addComponent();
  form.buildSupportRequest = async () => {
    const active = topic.value === 'hardware' ? [...cards.values()] : [];
    await Promise.all(active.map(state => state.pending));
    if (!form.reportValidity()) throw new Error('Bitte vervollständige die Geräteangaben.');
    return {
      topic: topic.value,
      version: form.elements.version.value.trim(),
      error: form.elements.error.value.trim(),
      components: active.map(({ card, photo }) => ({
        kind: card.querySelector('[data-kind]').value,
        manufacturer: card.querySelector('[data-maker]').value.trim(),
        model: card.querySelector('[data-model]').value.trim(),
        details: card.querySelector('[data-details]').value.trim(),
        ...(photo ? { photo } : {})
      }))
    };
  };
})();
