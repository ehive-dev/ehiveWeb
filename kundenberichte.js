(() => {
  const form = document.getElementById("communityForm");
  const status = document.getElementById("communityStatus");
  if (!form || !status) return;
  const preview = {
    heading: document.getElementById("communityPreviewHeading"),
    report: document.getElementById("communityPreviewReport"),
    name: document.getElementById("communityPreviewName"),
    photos: document.getElementById("communityPreviewPhotos"),
  };
  let photoUrls = [];
  const updatePreview = () => {
    preview.heading.textContent = form.elements.title.value.trim() || "Deine Überschrift";
    preview.report.textContent = form.elements.report.value.trim() || "Dein Bericht erscheint hier, während du ihn schreibst.";
    const name = form.elements.name.value.trim();
    const display = form.elements.display.value;
    preview.name.textContent = display === "anonymous" ? "Anonym" : display === "full" ? (name || "Dein Anzeigename") : display === "first" ? (name.split(/\s+/)[0] || "Dein Vorname") : "Dein Anzeigename";
  };
  const updatePhotos = () => {
    photoUrls.forEach(url => URL.revokeObjectURL(url));
    photoUrls = [];
    preview.photos.replaceChildren();
    const selected = [...form.elements.photos.files].slice(0, 2);
    if (!selected.length) {
      const placeholder = document.createElement("div");
      placeholder.className = "community-preview-placeholder";
      placeholder.textContent = "Deine Fotos erscheinen hier";
      preview.photos.append(placeholder);
      return;
    }
    selected.filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).forEach((file, index) => {
      const url = URL.createObjectURL(file);
      photoUrls.push(url);
      const img = document.createElement("img");
      img.src = url;
      img.alt = `Dein Foto ${index + 1}`;
      preview.photos.append(img);
    });
  };
  form.addEventListener("input", updatePreview);
  form.elements.display.addEventListener("change", updatePreview);
  form.elements.photos.addEventListener("change", updatePhotos);
  window.addEventListener("pagehide", () => photoUrls.forEach(url => URL.revokeObjectURL(url)));
  updatePreview();
  updatePhotos();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const photos = [...form.elements.photos.files];
    if (photos.length < 1 || photos.length > 2 || photos.some(photo => photo.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(photo.type))) {
      status.textContent = "Bitte wähle ein oder zwei JPG-, PNG- oder WebP-Fotos mit jeweils höchstens 5 MB aus.";
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = "Dein Beitrag wird gesendet …";
    try {
      const response = await fetch("https://paypal-papierkram-worker.ehive.workers.dev/community/submit", { method: "POST", body: new FormData(form) });
      const result = await response.json();
      status.textContent = result.message || "Der Beitrag konnte nicht gesendet werden.";
      if (response.ok) {
        form.reset();
        updatePreview();
        updatePhotos();
      }
    } catch {
      status.textContent = "Der Beitrag konnte nicht gesendet werden. Bitte versuche es später erneut.";
    } finally {
      button.disabled = false;
    }
  });
})();
