(() => {
  const form = document.querySelector("[data-savings-form]");
  if (!form) return;

  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const strategyConfig = {
    pv: { enabled: "strategyPv", price: "pricePv", share: "sharePv", label: "PV", window: [9, 16] },
    dynamic: { enabled: "strategyDynamic", price: "priceDynamic", share: "shareDynamic", label: "Dynamisch", window: [1, 6] },
    window: { enabled: "strategyWindow", price: "priceWindow", share: "shareWindow", label: "Nachtfenster 00–05 Uhr", window: [0, 4] }
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
    strategyStatus: get("[data-strategy-status]"),
    chartText: get("[data-chart-explanation]"),
    chart: get("[data-day-chart]")
  };

  function value(input) {
    const parsed = Number.parseFloat(input?.value || "0");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function renderChart(strategies, coverage) {
    const before = [22,18,16,15,16,22,42,72,66,48,40,36,34,32,34,40,52,78,92,82,62,48,38,28];
    const after = before.slice();
    const movable = Math.round(23 * (coverage / 100));
    [7, 8, 17, 18, 19].forEach(hour => { after[hour] = Math.max(12, after[hour] - movable); });
    strategies.forEach(strategy => {
      for (let hour = strategy.window[0]; hour <= strategy.window[1]; hour += 1) after[hour] = Math.min(96, after[hour] + Math.round(movable * .38));
    });
    output.chart.replaceChildren();
    before.forEach((height, hour) => {
      const column = document.createElement("span");
      column.className = "savings-chart-column";
      if (strategies.some(strategy => hour >= strategy.window[0] && hour <= strategy.window[1])) column.classList.add("is-cheap");
      column.innerHTML = `<i class="before" style="--bar:${height}%"></i><i class="after" style="--bar:${after[hour]}%"></i><small>${hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</small>`;
      output.chart.appendChild(column);
    });
  }

  function calculate() {
    const basePrice = Math.max(0, value(form.elements.basePrice));
    let totalKwh = 0;
    let flexibleKwh = 0;

    form.querySelectorAll(".savings-device-row").forEach(row => {
      const enabled = row.querySelector('input[type="checkbox"]');
      const kwh = row.querySelector(".savings-kwh");
      const share = row.querySelector('.savings-device-share input[type="range"]');
      const shareOutput = row.querySelector(".savings-device-share output");
      const flexibleShare = Math.max(0, Math.min(100, value(share)));
      shareOutput.textContent = `${number.format(flexibleShare)} % flexibel · ${number.format(100 - flexibleShare)} % fest`;
      row.classList.toggle("is-disabled", !enabled.checked);
      if (!enabled.checked) return;
      const annual = Math.max(0, value(kwh));
      totalKwh += annual;
      flexibleKwh += annual * flexibleShare / 100;
    });

    const strategies = Object.entries(strategyConfig).map(([key, config]) => {
      const enabled = Boolean(form.elements[config.enabled]?.checked);
      const price = value(form.elements[config.price]);
      const share = Math.max(0, Math.min(100, value(form.elements[config.share])));
      const card = form.querySelector(`[data-strategy-card="${key}"]`);
      card?.classList.toggle("is-disabled", !enabled);
      const shareOutput = form.querySelector(`[data-strategy-output="${key}"]`);
      if (shareOutput) shareOutput.textContent = `${number.format(share)} %`;
      return { key, ...config, enabled, price, share, allocated: 0 };
    });
    const activeStrategies = strategies.filter(strategy => strategy.enabled).sort((a, b) => a.price - b.price);
    let remainingFlexibleKwh = flexibleKwh;
    activeStrategies.forEach(strategy => {
      const requestedKwh = flexibleKwh * strategy.share / 100;
      strategy.allocated = Math.min(requestedKwh, remainingFlexibleKwh);
      remainingFlexibleKwh -= strategy.allocated;
    });
    const shiftedKwh = activeStrategies.reduce((sum, strategy) => sum + strategy.allocated, 0);
    const loadSaving = activeStrategies.reduce((sum, strategy) => sum + strategy.allocated * Math.max(0, basePrice - strategy.price) / 100, 0);
    const averageTargetPrice = shiftedKwh > 0
      ? activeStrategies.reduce((sum, strategy) => sum + strategy.allocated * strategy.price, 0) / shiftedKwh
      : basePrice;
    const priceGap = Math.max(0, basePrice - averageTargetPrice);
    const requestedCoverage = activeStrategies.reduce((sum, strategy) => sum + strategy.share, 0);
    const usedCoverage = flexibleKwh > 0 ? shiftedKwh / flexibleKwh * 100 : 0;
    output.strategyStatus.textContent = activeStrategies.length
      ? `${number.format(usedCoverage)} % der zeitlich flexiblen Energie werden berücksichtigt.${requestedCoverage > 100 ? " Anteile über 100 % werden automatisch begrenzt." : ""}`
      : "Aktiviere mindestens PV-Tageslicht, einen dynamischen Tarif oder ein günstiges Zeitfenster.";

    const batteryEnabled = Boolean(form.elements.batteryEnabled?.checked);
    form.querySelector(".savings-battery")?.classList.toggle("is-disabled", !batteryEnabled);
    const batteryCapacity = Math.max(0, value(form.elements.batteryCapacity));
    const batteryCycles = Math.max(0, value(form.elements.batteryCycles));
    const batteryEfficiency = Math.max(50, Math.min(100, value(form.elements.batteryEfficiency))) / 100;
    const gridStrategies = activeStrategies.filter(strategy => strategy.key === "dynamic" || strategy.key === "window");
    const gridChargeAvailable = gridStrategies.length > 0;
    const gridChargeInput = form.elements.batteryGridCharge;
    if (!gridChargeAvailable) gridChargeInput.checked = false;
    gridChargeInput.disabled = !gridChargeAvailable;
    const batteryGridCharge = gridChargeAvailable && gridChargeInput.checked;
    const batteryChargeSources = activeStrategies.filter(strategy => strategy.key === "pv" || batteryGridCharge);
    const batteryChargePrice = batteryChargeSources.length ? Math.min(...batteryChargeSources.map(strategy => strategy.price)) : basePrice;
    const batteryCanCharge = batteryChargeSources.length > 0;
    const batteryDischargeKwh = batteryEnabled && batteryCanCharge ? batteryCapacity * batteryCycles : 0;
    const batteryChargeKwh = batteryDischargeKwh / batteryEfficiency;
    const batterySaving = Math.max(0, (batteryDischargeKwh * basePrice - batteryChargeKwh * batteryChargePrice) / 100);
    const saving = loadSaving + batterySaving;
    const before = (totalKwh + batteryDischargeKwh) * basePrice / 100;
    const after = Math.max(0, before - saving);
    output.saving.textContent = euro.format(saving);
    output.before.textContent = euro.format(before);
    output.after.textContent = euro.format(after);
    output.total.textContent = `${number.format(totalKwh + batteryDischargeKwh)} kWh`;
    output.flex.textContent = `${number.format(flexibleKwh)} kWh`;
    output.shifted.textContent = `${number.format(shiftedKwh)} kWh`;
    output.battery.textContent = `${number.format(batteryDischargeKwh)} kWh`;
    output.gap.textContent = `${decimal.format(priceGap)} ct`;
    const loadParts = activeStrategies.filter(strategy => strategy.allocated > 0).map(strategy => `${strategy.label}: ${number.format(strategy.allocated)} kWh × ${decimal.format(Math.max(0, basePrice - strategy.price))} ct`);
    const storagePart = batteryDischargeKwh > 0 ? `Speicher: (${number.format(batteryDischargeKwh)} kWh × ${decimal.format(basePrice)} ct − ${number.format(batteryChargeKwh)} kWh × ${decimal.format(batteryChargePrice)} ct)` : "";
    const formulaParts = [...loadParts, storagePart].filter(Boolean);
    output.formula.textContent = formulaParts.length
      ? `${formulaParts.join(" + ")} ÷ 100 = ${euro.format(saving)}`
      : "Aktiviere mindestens eine Energiequelle oder Tarifzeit für die Berechnung.";
    output.chartText.textContent = activeStrategies.length > 1
      ? "Die markierten Bereiche verbinden die ausgewählten PV- und Tarifzeiten. Die günstigste verfügbare Möglichkeit wird zuerst genutzt; Überschneidungen werden nicht doppelt gezählt."
      : "Der markierte Bereich zeigt die ausgewählte PV- oder Tarifzeit. Der Tagesverlauf ist eine schematische Darstellung und keine Preis- oder Erzeugungsprognose.";
    renderChart(activeStrategies, usedCoverage);
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
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let manualMode = "auto";
  let manualTransitionTimer;
  let manualSettleTimer;

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
    const nextMode = button.dataset.manualMode || "auto";
    if (nextMode === manualMode || !manualStage || reduceMotion) {
      manualMode = nextMode;
      renderManualDemo();
      return;
    }

    window.clearTimeout(manualTransitionTimer);
    window.clearTimeout(manualSettleTimer);
    manualButtons.forEach(item => {
      const active = item.dataset.manualMode === nextMode;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", active ? "true" : "false");
    });
    manualStage.classList.remove("is-settling");
    manualStage.classList.add("is-switching");

    manualTransitionTimer = window.setTimeout(() => {
      manualMode = nextMode;
      renderManualDemo();
      manualStage.classList.remove("is-switching");
      manualStage.classList.add("is-settling");
      manualSettleTimer = window.setTimeout(() => manualStage.classList.remove("is-settling"), 650);
    }, 180);
  }));
  manualPower?.addEventListener("input", renderManualDemo);

  form.addEventListener("input", calculate);
  form.addEventListener("change", calculate);
  form.addEventListener("reset", () => window.setTimeout(calculate, 0));
  renderManualDemo();
  calculate();
})();
