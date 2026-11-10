(() => {
  const form = document.querySelector("[data-savings-form]");
  if (!form) return;

  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const modelCopy = {
    pv: {
      label: "Einspeisevergütung",
      help: "Bei eigenem PV-Strom werden als wirtschaftliche Kosten die entgangene Einspeisevergütung angesetzt.",
      chart: "Im PV-Modell werden verschiebbare Verbraucher bevorzugt in die hellen Stunden gelegt. Der Tagesverlauf ist eine schematische Darstellung und keine Erzeugungsprognose.",
      defaultPrice: 8,
      window: [9, 16]
    },
    dynamic: {
      label: "Ø günstiger Endpreis",
      help: "Trage einen realistischen durchschnittlichen Endpreis der günstigen Viertelstunden ein – einschließlich aller verbrauchsabhängigen Preisbestandteile.",
      chart: "Bei einem dynamischen Tarif liegen günstige Viertelstunden jeden Tag anders. Die Grafik zeigt deshalb nur beispielhaft, wie Lasten in ein preiswertes Zeitfenster wandern können.",
      defaultPrice: 24,
      window: [1, 6]
    },
    window: {
      label: "Preis im Zeitfenster",
      help: "Nutze den vertraglichen Endpreis des günstigen Zeitfensters. Feste Grundpreise und einmalige Boni bleiben unberücksichtigt.",
      chart: "Im Zeitfenster-Modell werden geeignete Lasten in die vertraglich günstigen Stunden gelegt. Die dargestellten Stunden sind ein Beispiel; maßgeblich ist dein Vertrag.",
      defaultPrice: 22,
      window: [0, 5]
    }
  };

  const get = selector => document.querySelector(selector);
  const output = {
    saving: get("[data-savings-value]"),
    before: get("[data-cost-before]"),
    after: get("[data-cost-after]"),
    total: get("[data-total-kwh]"),
    flex: get("[data-flex-kwh]"),
    shifted: get("[data-shifted-kwh]"),
    battery: get("[data-battery-kwh]"),
    gap: get("[data-price-gap]"),
    formula: get("[data-formula]"),
    reach: get("[data-reach-output]"),
    targetLabel: get("[data-target-price-label]"),
    help: get("[data-price-help]"),
    chartText: get("[data-chart-explanation]"),
    chart: get("[data-day-chart]")
  };

  function value(input) {
    const parsed = Number.parseFloat(input?.value || "0");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function renderChart(model, reach) {
    const copy = modelCopy[model];
    const before = [22,18,16,15,16,22,42,72,66,48,40,36,34,32,34,40,52,78,92,82,62,48,38,28];
    const after = before.slice();
    const movable = Math.round(23 * (reach / 100));
    [7, 8, 17, 18, 19].forEach(hour => { after[hour] = Math.max(12, after[hour] - movable); });
    for (let hour = copy.window[0]; hour <= copy.window[1]; hour += 1) after[hour] = Math.min(96, after[hour] + Math.round(movable * .72));
    output.chart.replaceChildren();
    before.forEach((height, hour) => {
      const column = document.createElement("span");
      column.className = "savings-chart-column";
      if (hour >= copy.window[0] && hour <= copy.window[1]) column.classList.add("is-cheap");
      column.innerHTML = `<i class="before" style="--bar:${height}%"></i><i class="after" style="--bar:${after[hour]}%"></i><small>${hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</small>`;
      output.chart.appendChild(column);
    });
  }

  function calculate() {
    const model = form.elements.model.value;
    const basePrice = Math.max(0, value(form.elements.basePrice));
    const targetPrice = value(form.elements.targetPrice);
    const reach = Math.max(0, Math.min(100, value(form.elements.reach)));
    let totalKwh = 0;
    let flexibleKwh = 0;

    form.querySelectorAll(".savings-device-row").forEach(row => {
      const enabled = row.querySelector('input[type="checkbox"]');
      const kwh = row.querySelector(".savings-kwh");
      const share = row.querySelector('.savings-device-share input[type="range"]');
      const shareOutput = row.querySelector(".savings-device-share output");
      shareOutput.textContent = `${number.format(value(share))} %`;
      row.classList.toggle("is-disabled", !enabled.checked);
      if (!enabled.checked) return;
      const annual = Math.max(0, value(kwh));
      totalKwh += annual;
      flexibleKwh += annual * Math.max(0, Math.min(100, value(share))) / 100;
    });

    const shiftedKwh = flexibleKwh * reach / 100;
    const priceGap = Math.max(0, basePrice - targetPrice);
    const loadSaving = shiftedKwh * priceGap / 100;
    const batteryEnabled = Boolean(form.elements.batteryEnabled?.checked);
    const batteryCapacity = Math.max(0, value(form.elements.batteryCapacity));
    const batteryCycles = Math.max(0, value(form.elements.batteryCycles));
    const batteryEfficiency = Math.max(50, Math.min(100, value(form.elements.batteryEfficiency))) / 100;
    const batteryDischargeKwh = batteryEnabled ? batteryCapacity * batteryCycles * reach / 100 : 0;
    const batteryChargeKwh = batteryDischargeKwh / batteryEfficiency;
    const batterySaving = Math.max(0, (batteryDischargeKwh * basePrice - batteryChargeKwh * targetPrice) / 100);
    const saving = loadSaving + batterySaving;
    const before = (totalKwh + batteryDischargeKwh) * basePrice / 100;
    const after = Math.max(0, before - saving);
    const copy = modelCopy[model];

    output.saving.textContent = euro.format(saving);
    output.before.textContent = euro.format(before);
    output.after.textContent = euro.format(after);
    output.total.textContent = `${number.format(totalKwh + batteryDischargeKwh)} kWh`;
    output.flex.textContent = `${number.format(flexibleKwh)} kWh`;
    output.shifted.textContent = `${number.format(shiftedKwh)} kWh`;
    output.battery.textContent = `${number.format(batteryDischargeKwh)} kWh`;
    output.gap.textContent = `${decimal.format(priceGap)} ct`;
    output.formula.textContent = batteryEnabled
      ? `Verbrauch: ${number.format(shiftedKwh)} kWh × ${decimal.format(priceGap)} ct ÷ 100 + Speicher: (${number.format(batteryDischargeKwh)} kWh × ${decimal.format(basePrice)} ct − ${number.format(batteryChargeKwh)} kWh × ${decimal.format(targetPrice)} ct) ÷ 100 = ${euro.format(saving)}`
      : `${number.format(shiftedKwh)} kWh × ${decimal.format(priceGap)} ct/kWh ÷ 100 = ${euro.format(saving)}`;
    output.reach.textContent = `${number.format(reach)} %`;
    output.targetLabel.textContent = copy.label;
    output.help.textContent = copy.help;
    output.chartText.textContent = copy.chart;
    renderChart(model, reach);
  }

  const manualButtons = Array.from(document.querySelectorAll("[data-manual-mode]"));
  const manualPower = document.querySelector("[data-manual-power]");
  const manualPowerOutput = document.querySelector("[data-manual-power-output]");
  const manualStage = document.querySelector("[data-manual-stage]");
  const manualKicker = document.querySelector("[data-manual-kicker]");
  const manualStatus = document.querySelector("[data-manual-status]");
  const manualDetail = document.querySelector("[data-manual-detail]");
  const manualCar = document.querySelector("[data-manual-car]");
  const manualGrid = document.querySelector("[data-manual-grid]");
  const manualBattery = document.querySelector("[data-manual-battery]");
  const manualBatteryBalance = document.querySelector("[data-manual-battery-balance]");
  const manualHubLabel = document.querySelector("[data-manual-hub-label]");
  const manualBalanceLabel = document.querySelector("[data-manual-balance-label]");
  const manualBalance = document.querySelector("[data-manual-balance]");
  let manualMode = "auto";

  function formatPower(power) {
    return `${decimal.format(power)} kW`;
  }

  function setManualRoute(name, active, reverse = false) {
    const route = document.querySelector(`[data-manual-route="${name}"]`);
    route?.classList.toggle("is-active", active);
    route?.classList.toggle("is-reverse", reverse);
  }

  function renderManualDemo() {
    if (!manualStage || !manualPower) return;
    const surplus = 4;
    const requested = Math.max(1.4, Math.min(11, value(manualPower)));
    let charge = surplus;
    let grid = 0;
    let battery = 0;
    let batteryCharging = false;

    manualButtons.forEach(button => {
      const active = button.dataset.manualMode === manualMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    manualStage.dataset.mode = manualMode;
    manualPower.disabled = manualMode !== "quick";
    manualPowerOutput.textContent = formatPower(requested);
    setManualRoute("pv", true);
    setManualRoute("house", true, true);

    if (manualMode === "quick") {
      charge = requested;
      battery = Math.min(3, Math.max(0, requested - surplus));
      grid = Math.max(0, requested - surplus - battery);
      manualKicker.textContent = "Manuelle Freigabe aktiv";
      manualStatus.textContent = `Das E-Auto lädt sofort mit ${formatPower(charge)}.`;
      manualDetail.textContent = grid > 0
        ? `Der PV-Überschuss reicht nicht vollständig aus. Der Batteriespeicher liefert ${formatPower(battery)}; zusätzlich kommen ${formatPower(grid)} aus dem Netz, bis du zur Automatik zurückkehrst.`
        : battery > 0
          ? `Der PV-Überschuss liefert ${formatPower(surplus)}. Die fehlenden ${formatPower(battery)} kommen aus dem Batteriespeicher; zusätzlicher Netzbezug ist nicht nötig.`
          : "Die gewünschte Ladeleistung kann in diesem Beispiel vollständig aus dem PV-Überschuss bereitgestellt werden.";
      manualHubLabel.textContent = "manuell";
      setManualRoute("car", true);
      setManualRoute("battery", battery > 0, true);
      setManualRoute("grid", grid > 0, true);
    } else if (manualMode === "pause") {
      charge = 0;
      battery = surplus;
      batteryCharging = true;
      manualKicker.textContent = "Laden pausiert";
      manualStatus.textContent = "Das E-Auto erhält vorübergehend keine Ladeleistung.";
      manualDetail.textContent = "Der verfügbare PV-Überschuss lädt in diesem Beispiel den Batteriespeicher. Erst wenn dieser keine Energie mehr aufnehmen kann, würde überschüssige Leistung in das Stromnetz fließen.";
      manualHubLabel.textContent = "pausiert";
      setManualRoute("car", false);
      setManualRoute("battery", true);
      setManualRoute("grid", false);
    } else {
      manualKicker.textContent = "Automatik aktiv";
      manualStatus.textContent = "Das E-Auto lädt mit verfügbarem PV-Überschuss.";
      manualDetail.textContent = "Der Hausverbrauch ist bereits abgezogen. Für das Laden wird in diesem Beispiel kein zusätzlicher Netzstrom benötigt.";
      manualHubLabel.textContent = "optimiert";
      setManualRoute("car", true);
      setManualRoute("battery", false);
      setManualRoute("grid", false);
    }

    manualCar.textContent = formatPower(charge);
    manualBattery.textContent = battery === 0 ? "bereit · 62 %" : `${formatPower(battery)} ${batteryCharging ? "Laden" : "Abgabe"}`;
    manualBatteryBalance.textContent = battery === 0 ? "0,0 kW" : `${formatPower(battery)} ${batteryCharging ? "Laden" : "Abgabe"}`;
    manualGrid.textContent = grid === 0 ? "0,0 kW" : `${formatPower(grid)} Bezug`;
    manualBalanceLabel.textContent = "Zusätzlicher Netzbezug";
    manualBalance.textContent = formatPower(grid);
  }

  manualButtons.forEach(button => button.addEventListener("click", () => {
    manualMode = button.dataset.manualMode || "auto";
    renderManualDemo();
  }));
  manualPower?.addEventListener("input", renderManualDemo);

  form.addEventListener("input", calculate);
  form.addEventListener("change", event => {
    if (event.target instanceof HTMLInputElement && event.target.name === "model") {
      form.elements.targetPrice.value = modelCopy[event.target.value].defaultPrice;
    }
    calculate();
  });
  form.addEventListener("reset", () => window.setTimeout(calculate, 0));
  renderManualDemo();
  calculate();
})();
