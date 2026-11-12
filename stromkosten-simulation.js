(() => {
  const form = document.querySelector("[data-simulation-form]");
  const model = window.eHiveDaySimulation;
  const chart = document.querySelector("[data-simulation-chart]");
  if (!form || !model || !chart) return;

  const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
  const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const outputs = {
    car: document.querySelector("[data-sim-car-result]"),
    heat: document.querySelector("[data-sim-heat-result]"),
    soc: document.querySelector("[data-sim-soc-result]"),
    cost: document.querySelector("[data-sim-cost-result]"),
    message: document.querySelector("[data-sim-message]"),
    grid: document.querySelector("[data-sim-grid-energy]"),
    pv: document.querySelector("[data-sim-pv-energy]"),
    gridCharge: document.querySelector("[data-sim-grid-charge]"),
    finalSoc: document.querySelector("[data-sim-final-soc]"),
    timeScale: document.querySelector("[data-simulation-time-scale]"),
    km: document.querySelector("[data-sim-km-output]"),
    temperature: document.querySelector("[data-sim-temperature-output]")
  };

  function value(name) {
    const parsed = Number.parseFloat(form.elements[name]?.value || "0");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function syncSimulationRanges() {
    form.querySelectorAll("[data-sim-range]").forEach(input => {
      const current = Number.parseFloat(input.value || "0");
      const min = Number.parseFloat(input.min || "0");
      const max = Number.parseFloat(input.max || "0");
      const progress = max > min ? (current - min) / (max - min) * 100 : 0;
      const digits = Math.max(0, Number.parseInt(input.dataset.digits || "0", 10));
      const formatted = input.dataset.format === "month"
        ? monthNames[Math.max(0, Math.min(11, Math.round(current) - 1))]
        : new Intl.NumberFormat("de-DE", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits
        }).format(current);
      const rangeOutput = input.closest(".simulation-range")?.querySelector("output");
      if (rangeOutput) rangeOutput.textContent = input.dataset.format === "month" ? formatted : `${formatted} ${input.dataset.unit || ""}`.trim();
      input.style.setProperty("--range-progress", `${Math.max(0, Math.min(100, progress))}%`);
    });
  }

  function timeToHour(time) {
    const [hours, minutes] = String(time || "00:00").split(":").map(Number);
    return (hours || 0) + (minutes || 0) / 60;
  }

  function formatHour(hour) {
    const totalMinutes = Math.round((((hour % 24) + 24) % 24) * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function currentQuarterHour() {
    const now = new Date();
    return now.getHours() + Math.floor(now.getMinutes() / 15) / 4;
  }

  function createPowerRow(label, values, className, unit = "kW") {
    const row = document.createElement("div");
    row.className = "simulation-chart-row";
    const title = document.createElement("strong");
    title.textContent = label;
    const track = document.createElement("div");
    track.className = "simulation-chart-track";
    const max = Math.max(.01, ...values);
    values.forEach((entry, index) => {
      const cell = document.createElement("i");
      const valueAtSlot = Math.max(0, entry);
      cell.className = className;
      cell.style.setProperty("--level", String(valueAtSlot / max));
      cell.title = `${formatHour(lastResult.slots[index].hour)} Uhr · ${number.format(valueAtSlot)} ${unit}`;
      track.append(cell);
    });
    row.append(title, track);
    return row;
  }

  function createSocRow(slots) {
    const row = document.createElement("div");
    row.className = "simulation-chart-row simulation-soc-row";
    const title = document.createElement("strong");
    title.textContent = "Speicher-SOC";
    const track = document.createElement("div");
    track.className = "simulation-soc-track";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 960 72");
    svg.setAttribute("aria-hidden", "true");
    const points = slots.map((slot, index) => ({ x: index * 10 + 5, y: 68 - slot.soc * .64 }));
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const commands = points.length ? [`M${points[0].x} ${points[0].y}`] : [];
    points.slice(1).forEach((point, index) => {
      const previous = points[index];
      const middle = (previous.x + point.x) / 2;
      commands.push(`C${middle} ${previous.y},${middle} ${point.y},${point.x} ${point.y}`);
    });
    path.setAttribute("d", commands.join(" "));
    path.setAttribute("class", "simulation-soc-line");
    svg.append(path);
    track.append(svg);
    row.append(title, track);
    return row;
  }

  let lastResult;
  function render(result) {
    lastResult = result;
    const slots = result.slots;
    chart.replaceChildren(
      createPowerRow("Strompreis", slots.map(slot => slot.price), "is-price", "ct/kWh"),
      createPowerRow("PV-Erzeugung", slots.map(slot => slot.pvKw), "is-pv"),
      createPowerRow("E-Auto", slots.map(slot => slot.carKw), "is-car"),
      createPowerRow("Wärmepumpe", slots.map(slot => slot.heatPumpKw), "is-heat"),
      createPowerRow("Batterie aus PV", slots.map(slot => slot.batteryPvChargeKw), "is-pv-charge"),
      createPowerRow("Batterie aus Netz", slots.map(slot => slot.batteryGridChargeKw), "is-grid-charge"),
      createPowerRow("Batterieabgabe", slots.map(slot => slot.batteryDischargeKw), "is-battery"),
      createPowerRow("Netzbezug", slots.map(slot => slot.gridKw), "is-grid"),
      createSocRow(slots)
    );
    const start = slots[0]?.hour || 0;
    outputs.timeScale.replaceChildren(...[0, 6, 12, 18, 24].map(offset => {
      const span = document.createElement("span");
      span.textContent = `${formatHour(start + offset)}${offset === 24 ? " Uhr" : ""}`;
      return span;
    }));

    outputs.car.textContent = !result.carEnabled
      ? "nicht aktiviert"
      : result.carTargetReached
        ? `${number.format(result.carKmDelivered)} km erreichbar`
        : `${number.format(result.carKmDelivered)} von ${number.format(result.carKmRequested)} km`;
    outputs.car.classList.toggle("is-warning", result.carEnabled && !result.carTargetReached);
    outputs.heat.textContent = result.heatPumpEnabled ? `${number.format(result.heatPumpEnergyKwh)} kWh eingeplant` : "nicht aktiviert";
    outputs.soc.textContent = !result.batteryEnabled ? "nicht aktiviert" : result.firstPvSlot >= 0 ? `${number.format(result.socBeforePv)} %` : "kein PV-Fenster";
    outputs.cost.textContent = euro.format(result.totalCost);
    outputs.grid.textContent = `${number.format(result.gridEnergy)} kWh`;
    outputs.pv.textContent = `${number.format(result.pvUsedEnergy)} kWh`;
    outputs.gridCharge.textContent = `${number.format(result.gridChargeEnergy)} kWh`;
    outputs.finalSoc.textContent = `${number.format(result.finalSoc)} %`;

    const targetText = !result.carEnabled
      ? "Das E-Auto ist in diesem Szenario nicht aktiviert."
      : result.carTargetReached
        ? `Das E-Auto erreicht das gewünschte Fahrziel bis zur Abfahrt.`
        : `Das gewünschte Fahrziel ist mit 11 kW bis zur Abfahrt nicht vollständig erreichbar.`;
    const carPriceText = result.carEnabled && result.carExpensiveEnergyKwh > .05
      ? ` Für das Fahrziel lädt das E-Auto ${number.format(result.carExpensiveEnergyKwh)} kWh auch außerhalb günstiger Zeiten.`
      : result.carEnabled && result.carTargetReached
        ? " Das E-Auto kann sein Fahrziel in den günstigeren Zeitfenstern erreichen."
        : "";
    const gridText = !result.batteryEnabled
      ? " Der Batteriespeicher ist nicht aktiviert."
      : result.gridChargeEnergy > .05
      ? ` Die Batterie wird günstig aus dem Netz geladen, jedoch nur bis rund ${number.format(result.gridTargetSoc)} % Ziel-SOC, damit Kapazität für erwarteten PV-Strom frei bleibt.`
      : result.pvUsedEnergy + result.pvExportEnergy > .5
        ? " Die Batterie wird nicht vorsorglich aus dem Netz gefüllt, damit Kapazität für den erwarteten PV-Strom frei bleibt."
        : " Die Batterie wird in diesem Szenario nicht aus dem Netz geladen.";
    outputs.message.textContent = `${targetText}${carPriceText}${gridText}`;
  }

  function calculate() {
    syncSimulationRanges();
    const tariff = form.elements.tariff.value;
    const batteryActive = form.elements.batteryEnabled.checked && value("batteryCapacity") > 0;
    const cheapPriceField = form.querySelector("[data-sim-cheap-price]");
    if (cheapPriceField) cheapPriceField.hidden = tariff === "normal";
    form.elements.gridChargeAllowed.disabled = tariff === "normal" || !batteryActive;
    const result = model.simulate({
      startHour: currentQuarterHour(),
      departureHour: timeToHour(form.elements.departureTime.value),
      carEnabled: form.elements.carEnabled.checked,
      carKm: value("carKm"),
      heatPumpEnabled: form.elements.heatPumpEnabled.checked,
      outdoorTemperature: value("outdoorTemperature"),
      heatPumpAnnualKwh: 4000,
      month: value("simulationMonth"),
      pvEnabled: value("pvKwp") > 0,
      pvKwp: value("pvKwp"),
      batteryEnabled: form.elements.batteryEnabled.checked,
      batteryCapacityKwh: value("batteryCapacity"),
      initialSoc: value("initialSoc"),
      tariff,
      gridChargeAllowed: !form.elements.gridChargeAllowed.disabled && form.elements.gridChargeAllowed.checked,
      normalPrice: value("normalPrice"),
      cheapPrice: value("cheapPrice")
    });
    render(result);
  }

  form.addEventListener("input", calculate);
  form.addEventListener("change", calculate);
  calculate();
})();
