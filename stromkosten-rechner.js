(() => {
  const form = document.querySelector("[data-savings-form]");
  if (!form) return;

  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dynamicSpotProfile = [.38,.24,.08,0,.04,.14,.31,.56,.72,.63,.51,.43,.32,.18,.22,.39,.61,.9,1,.88,.72,.58,.47,.4];
  const strategyConfig = {
    pv: { enabled: "strategyPv", price: "pricePv", share: "sharePv", label: "PV", window: [9, 16] },
    dynamic: { enabled: "strategyDynamic", price: "priceDynamic", share: "shareDynamic", label: "Spotmarkt", hours: [3, 4, 2, 5, 13, 14] },
    window: { enabled: "strategyWindow", price: "priceWindow", share: "shareWindow", label: "5 feste Tarifstunden", windows: [[2, 4], [12, 12], [16, 16]] }
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
    chart: get("[data-day-chart]"),
    inlineTrend: get("[data-inline-trend]"),
    inlineTrendSummary: get("[data-inline-trend-summary]"),
    inlinePvValue: get("[data-inline-pv-value]"),
    inlineBatteryValue: get("[data-inline-battery-value]"),
    batteryCapacity: get("[data-battery-capacity-output]"),
    batterySizeHint: get("[data-battery-size-hint]")
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
    const cheapHours = new Set(strategies.flatMap(hoursForStrategy));
    cheapHours.forEach(hour => { after[hour] = Math.min(96, after[hour] + Math.round(movable * .38)); });
    output.chart.replaceChildren();
    before.forEach((height, hour) => {
      const column = document.createElement("span");
      column.className = "savings-chart-column";
      if (cheapHours.has(hour)) column.classList.add("is-cheap");
      column.innerHTML = `<i class="before" style="--bar:${height}%"></i><i class="after" style="--bar:${after[hour]}%"></i><small>${hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</small>`;
      output.chart.appendChild(column);
    });
  }

  function hoursForStrategy(strategy) {
    if (strategy.hours) return [...strategy.hours];
    const hours = [];
    const windows = strategy.windows || [strategy.window];
    windows.forEach(([from, to]) => {
      for (let hour = from; hour <= to; hour += 1) hours.push(hour);
    });
    if (strategy.key === "pv") hours.sort((a, b) => Math.abs(a - 13) - Math.abs(b - 13));
    return hours;
  }

  function pickScheduleHours(strategies, count) {
    const selected = [];
    const used = new Set();
    strategies.forEach(strategy => {
      hoursForStrategy(strategy).forEach(hour => {
        if (selected.length >= count || used.has(hour)) return;
        used.add(hour);
        selected.push({ hour, source: strategy.key });
      });
    });
    return selected;
  }

  function formatHourRanges(hours) {
    const sorted = [...new Set(hours)].sort((a, b) => a - b);
    if (!sorted.length) return "keine Zeit eingeplant";
    const ranges = [];
    let start = sorted[0];
    let previous = sorted[0];
    sorted.slice(1).forEach(hour => {
      if (hour === previous + 1) {
        previous = hour;
        return;
      }
      ranges.push([start, previous + 1]);
      start = hour;
      previous = hour;
    });
    ranges.push([start, previous + 1]);
    return ranges.map(([from, to]) => `${String(from).padStart(2, "0")}:00–${String(to).padStart(2, "0")}:00 Uhr`).join(" und ");
  }

  function renderInlineTrend({ activeStrategies, basePrice, batteryPvHours, batteryGridHours, batteryDischargeHours, batteryCapacity, batteryChargePrice, batteryChargeLabel, batteryEffectivePrice, carHours, carSources, householdHours }) {
    if (!output.inlineTrend || !output.inlineTrendSummary) return;
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 720 194");
    svg.setAttribute("aria-hidden", "true");
    const prices = Array.from({ length: 24 }, () => basePrice);
    const batteryLossDifference = batteryEffectivePrice - batteryChargePrice;
    const batteryTrendPrice = Math.min(basePrice, batteryChargePrice + batteryLossDifference * 8);
    const preferredHours = new Set();
    activeStrategies.forEach(strategy => {
      if (strategy.key === "dynamic") {
        const lowPrice = Math.min(basePrice, strategy.price);
        dynamicSpotProfile.forEach((factor, hour) => {
          const examplePrice = lowPrice + (basePrice - lowPrice) * factor;
          prices[hour] = Math.min(prices[hour], examplePrice);
        });
      }
      hoursForStrategy(strategy).forEach(hour => {
        if (strategy.key !== "dynamic") prices[hour] = Math.min(prices[hour], strategy.price);
        preferredHours.add(hour);
      });
    });
    batteryDischargeHours.forEach(hour => {
      prices[hour] = Math.min(prices[hour], batteryTrendPrice);
    });
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const hourWidth = 720 / 24;
    const yForPrice = price => {
      const referencePrice = Math.max(1, basePrice);
      const relativeDifference = (basePrice - price) / referencePrice;
      const visibleDifference = Math.max(-.2, Math.min(1.1, relativeDifference));
      return 22 + visibleDifference * 62;
    };

    preferredHours.forEach(hour => {
      const area = document.createElementNS(svgNs, "rect");
      area.setAttribute("x", String(hour * hourWidth));
      area.setAttribute("y", "8");
      area.setAttribute("width", String(hourWidth));
      area.setAttribute("height", "88");
      area.setAttribute("class", "savings-inline-trend-window");
      svg.append(area);
    });
    [22, 56, 90].forEach(y => {
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("x1", "0");
      line.setAttribute("x2", "720");
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("class", "savings-inline-trend-grid");
      svg.append(line);
    });
    const baseline = document.createElementNS(svgNs, "line");
    const baselineY = yForPrice(basePrice);
    baseline.setAttribute("x1", "0");
    baseline.setAttribute("x2", "720");
    baseline.setAttribute("y1", String(baselineY));
    baseline.setAttribute("y2", String(baselineY));
    baseline.setAttribute("class", "savings-inline-trend-baseline");
    svg.append(baseline);
    const path = document.createElementNS(svgNs, "path");
    const points = prices.map((price, hour) => {
      const x = hour * hourWidth + hourWidth / 2;
      const y = yForPrice(price);
      return { x, y };
    });
    const curve = [`M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
    points.slice(1).forEach((point, index) => {
      const previous = points[index];
      const middleX = (previous.x + point.x) / 2;
      curve.push(`C${middleX.toFixed(1)} ${previous.y.toFixed(1)},${middleX.toFixed(1)} ${point.y.toFixed(1)},${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
    });
    path.setAttribute("d", curve.join(" "));
    path.setAttribute("class", "savings-inline-trend-line");
    svg.append(path);

    if (batteryDischargeHours.length) {
      const batteryValueY = yForPrice(batteryTrendPrice);
      const firstHour = Math.min(...batteryDischargeHours);
      const lastHour = Math.max(...batteryDischargeHours);
      const batteryValueLine = document.createElementNS(svgNs, "line");
      batteryValueLine.setAttribute("x1", String(firstHour * hourWidth + 4));
      batteryValueLine.setAttribute("x2", String((lastHour + 1) * hourWidth - 4));
      batteryValueLine.setAttribute("y1", String(batteryValueY));
      batteryValueLine.setAttribute("y2", String(batteryValueY));
      batteryValueLine.setAttribute("class", "savings-inline-trend-battery-value");
      svg.append(batteryValueLine);
      batteryDischargeHours.forEach(hour => {
        const marker = document.createElementNS(svgNs, "circle");
        marker.setAttribute("cx", String(hour * hourWidth + hourWidth / 2));
        marker.setAttribute("cy", String(batteryValueY));
        marker.setAttribute("r", "4.5");
        marker.setAttribute("class", "savings-inline-trend-battery-marker");
        svg.append(marker);
      });
    }

    const activityRows = [
      { hours: batteryGridHours, y: 112, className: "is-battery-grid" },
      { hours: batteryPvHours, y: 126, className: "is-battery-pv" },
      { hours: batteryDischargeHours, y: 140, className: "is-battery-out" },
      { hours: carHours, y: 154, className: "is-car" },
      { hours: householdHours, y: 168, className: "is-home" }
    ];
    activityRows.forEach(row => row.hours.forEach(hour => {
      const activity = document.createElementNS(svgNs, "rect");
      activity.setAttribute("x", String(hour * hourWidth + 1));
      activity.setAttribute("y", String(row.y));
      activity.setAttribute("width", String(hourWidth - 2));
      activity.setAttribute("height", "9");
      activity.setAttribute("rx", "2");
      activity.setAttribute("class", row.className);
      svg.append(activity);
    }));

    output.inlineTrend.replaceChildren(svg);
    const pvStrategy = activeStrategies.find(strategy => strategy.key === "pv");
    if (output.inlinePvValue) {
      output.inlinePvValue.hidden = !pvStrategy;
      const label = output.inlinePvValue.querySelector("b");
      if (label && pvStrategy) label.textContent = `PV direkt: ${decimal.format(pvStrategy.price)} ct/kWh`;
    }
    if (output.inlineBatteryValue) {
      output.inlineBatteryValue.hidden = !batteryDischargeHours.length;
      const label = output.inlineBatteryValue.querySelector("b");
      if (label && batteryDischargeHours.length) label.textContent = `Speicher ${decimal.format(batteryCapacity)} kWh: ${decimal.format(batteryEffectivePrice)} ct/kWh inkl. Verluste`;
    }
    const summary = [`Angesetzter Preis-/Wertbereich: ${decimal.format(minPrice)} bis ${decimal.format(maxPrice)} ct/kWh.`];
    if (activeStrategies.some(strategy => strategy.key === "dynamic")) summary.push("Die Spotmarktlinie ist ein Beispielverlauf und keine Preisprognose.");
    if (batteryGridHours.length) summary.push(`Batterie aus Netz: ${formatHourRanges(batteryGridHours)}.`);
    if (batteryPvHours.length) summary.push(`Batterie aus PV: ${formatHourRanges(batteryPvHours)}.`);
    if (batteryDischargeHours.length) summary.push(`Der ${decimal.format(batteryCapacity)}-kWh-Speicher versorgt Verbraucher im typisierten Abendfenster von ${formatHourRanges(batteryDischargeHours)}. Aus ${decimal.format(batteryChargePrice)} ct/kWh Ladepreis (${batteryChargeLabel}) werden durch den eingestellten Wirkungsgrad ${decimal.format(batteryEffectivePrice)} ct/kWh Speicherwert. Der Abstand zum direkten Ladepreis ist im Trend zur besseren Erkennbarkeit grafisch verstärkt.`);
    if (carHours.length) {
      const sourceLabels = { pv: "PV", dynamic: "Spotmarkt-Beispiel", window: "festen Tarifzeiten" };
      const sources = [...new Set(carSources)].map(source => sourceLabels[source]).filter(Boolean).join(" und ");
      summary.push(`E-Auto: ${formatHourRanges(carHours)}${sources ? ` nach ${sources}` : ""}.`);
    }
    const summaryText = summary.join(" ");
    output.inlineTrendSummary.textContent = summaryText;
    output.inlineTrend.setAttribute("aria-label", summaryText);
  }

  function renderLiveTrend({ activeStrategies, basePrice, gridStrategies, batteryEnabled, batteryGridCharge, batteryCapacity, recommendedBatteryCapacity, batteryChargeKwh, batteryDischargeKwh, batteryChargePrice, batteryChargeLabel, batteryEffectivePrice, car, householdFlexibleKwh }) {
    const pvStrategy = activeStrategies.find(strategy => strategy.key === "pv");
    const capacityRatio = recommendedBatteryCapacity > 0 ? Math.min(1, batteryCapacity / recommendedBatteryCapacity) : 0;
    const representativeBatterySlots = batteryCapacity > 0 ? Math.max(1, Math.min(6, Math.round(capacityRatio * 6))) : 0;
    const batteryChargeSlots = batteryEnabled && batteryChargeKwh > 0 ? representativeBatterySlots : 0;
    const gridBatterySources = batteryGridCharge && gridStrategies.length
      ? gridStrategies.filter(strategy => strategy.price === Math.min(...gridStrategies.map(item => item.price)))
      : [];
    const hasPvCharging = Boolean(pvStrategy && batteryChargeSlots);
    const hasGridCharging = Boolean(gridBatterySources.length && batteryChargeSlots);
    const batteryPvSlots = hasPvCharging ? (hasGridCharging ? Math.max(1, Math.ceil(batteryChargeSlots / 2)) : batteryChargeSlots) : 0;
    const batteryGridSlots = hasGridCharging ? (hasPvCharging ? Math.max(1, batteryChargeSlots - batteryPvSlots) : batteryChargeSlots) : 0;
    const batteryPvHours = pickScheduleHours(pvStrategy ? [pvStrategy] : [], batteryPvSlots).map(slot => slot.hour);
    const batteryGridHours = pickScheduleHours(gridBatterySources, batteryGridSlots).map(slot => slot.hour);
    const batteryDischargeSlots = batteryEnabled && batteryDischargeKwh > 0 && batteryEffectivePrice < basePrice
      ? representativeBatterySlots
      : 0;
    const batteryDischargeHours = [18, 19, 20, 21, 22, 23].slice(0, batteryDischargeSlots);
    const carSlots = car.enabled && car.share > 0 && activeStrategies.length
      ? Math.max(1, Math.min(6, Math.ceil(((car.annual / 365) * car.share / 100) / 3.7)))
      : 0;
    const carPlan = pickScheduleHours(activeStrategies, carSlots);
    const carHours = carPlan.map(slot => slot.hour);
    const carSources = carPlan.map(slot => slot.source);
    const householdSlots = householdFlexibleKwh > 0 && activeStrategies.length
      ? Math.max(1, Math.min(4, Math.ceil((householdFlexibleKwh / 365) / 2)))
      : 0;
    const householdHours = pickScheduleHours(activeStrategies, householdSlots).map(slot => slot.hour);
    renderInlineTrend({ activeStrategies, basePrice, batteryPvHours, batteryGridHours, batteryDischargeHours, batteryCapacity, batteryChargePrice, batteryChargeLabel, batteryEffectivePrice, carHours, carSources, householdHours });
  }

  function calculate() {
    const basePrice = Math.max(0, value(form.elements.basePrice));
    let totalKwh = 0;
    let flexibleKwh = 0;
    let householdFlexibleKwh = 0;
    const car = { enabled: false, annual: 0, share: 0 };

    form.querySelectorAll(".savings-device-row").forEach(row => {
      const enabled = row.querySelector('input[type="checkbox"]');
      const kwh = row.querySelector(".savings-kwh");
      const share = row.querySelector('.savings-device-share input[type="range"]');
      const shareOutput = row.querySelector(".savings-device-share output");
      const flexibleShare = Math.max(0, Math.min(100, value(share)));
      shareOutput.textContent = `${number.format(flexibleShare)} % flexibel · ${number.format(100 - flexibleShare)} % fest`;
      row.classList.toggle("is-disabled", !enabled.checked);
      if (!enabled.checked) return;
      const deviceName = row.querySelector(".savings-device-name b")?.textContent.trim();
      const enteredAnnual = Math.max(0, value(kwh));
      const annual = deviceName === "E-Auto" ? enteredAnnual * .2 : enteredAnnual;
      totalKwh += annual;
      flexibleKwh += annual * flexibleShare / 100;
      if (deviceName === "E-Auto") {
        car.enabled = true;
        car.annual = annual;
        car.share = flexibleShare;
      } else {
        householdFlexibleKwh += annual * flexibleShare / 100;
      }
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
      : "Aktiviere mindestens die PV-Anlage, einen dynamischen Spotmarkt-Tarif oder ein günstiges Zeitfenster.";

    const batteryEnabled = Boolean(form.elements.batteryEnabled?.checked);
    form.querySelector("[data-battery-choice]")?.classList.toggle("is-disabled", !batteryEnabled);
    form.querySelector(".savings-battery")?.classList.toggle("is-disabled", !batteryEnabled);
    const batteryCapacity = Math.max(0, value(form.elements.batteryCapacity));
    const batteryCycles = Math.max(0, value(form.elements.batteryCycles));
    const batteryEfficiency = Math.max(50, Math.min(100, value(form.elements.batteryEfficiency))) / 100;
    const recommendedBatteryCapacity = totalKwh * 1.5 / 1000;
    if (output.batteryCapacity) output.batteryCapacity.textContent = `${decimal.format(batteryCapacity)} kWh`;
    if (output.batterySizeHint) {
      const comparison = batteryCapacity > recommendedBatteryCapacity && recommendedBatteryCapacity > 0
        ? `Mit deinen aktivierten Verbrauchern liegt die verbrauchsseitige Orientierung bei rund ${decimal.format(recommendedBatteryCapacity)} kWh; der gewählte Speicher liegt darüber.`
        : `Mit deinen aktivierten Verbrauchern liegt die verbrauchsseitige Orientierung bei rund ${decimal.format(recommendedBatteryCapacity)} kWh.`;
      output.batterySizeHint.textContent = comparison;
    }
    const gridStrategies = activeStrategies.filter(strategy => strategy.key === "dynamic" || strategy.key === "window");
    const gridChargeAvailable = gridStrategies.length > 0;
    const gridChargeInput = form.elements.batteryGridCharge;
    if (!gridChargeAvailable) gridChargeInput.checked = false;
    gridChargeInput.disabled = !gridChargeAvailable;
    const batteryGridCharge = gridChargeAvailable && gridChargeInput.checked;
    const batteryChargeSources = activeStrategies.filter(strategy => strategy.key === "pv" || batteryGridCharge);
    const batteryChargePrice = batteryChargeSources.length ? Math.min(...batteryChargeSources.map(strategy => strategy.price)) : basePrice;
    const batteryChargeSource = batteryChargeSources.find(strategy => strategy.price === batteryChargePrice);
    const batteryChargeLabels = { pv: "PV", dynamic: "dynamischer Tarif", window: "festes Zeitfenster" };
    const batteryChargeLabel = batteryChargeLabels[batteryChargeSource?.key] || "Normalpreis";
    const batteryCanCharge = batteryChargeSources.length > 0;
    const remainingDemandKwh = Math.max(0, totalKwh - shiftedKwh);
    const batteryPotentialKwh = batteryCapacity * batteryCycles;
    const batteryEffectivePrice = batteryCanCharge ? batteryChargePrice / batteryEfficiency : basePrice;
    const batteryEconomicallyUseful = batteryEffectivePrice < basePrice;
    const batteryDischargeKwh = batteryEnabled && batteryCanCharge && batteryEconomicallyUseful ? Math.min(batteryPotentialKwh, remainingDemandKwh) : 0;
    const batteryChargeKwh = batteryDischargeKwh / batteryEfficiency;
    const batterySaving = Math.max(0, (batteryDischargeKwh * basePrice - batteryChargeKwh * batteryChargePrice) / 100);
    const saving = loadSaving + batterySaving;
    const before = totalKwh * basePrice / 100;
    const after = Math.max(0, before - saving);
    output.saving.textContent = euro.format(saving);
    output.before.textContent = euro.format(before);
    output.after.textContent = euro.format(after);
    output.total.textContent = `${number.format(totalKwh)} kWh`;
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
    renderLiveTrend({ activeStrategies, basePrice, gridStrategies, batteryEnabled, batteryGridCharge, batteryCapacity, recommendedBatteryCapacity, batteryChargeKwh, batteryDischargeKwh, batteryChargePrice, batteryChargeLabel, batteryEffectivePrice, car, householdFlexibleKwh });
  }

  const manualButtons = Array.from(document.querySelectorAll("[data-manual-mode]"));
  const manualPower = document.querySelector("[data-manual-power]");
  const manualPowerOutput = document.querySelector("[data-manual-power-output]");
  const manualStage = document.querySelector("[data-manual-stage]");
  const manualKicker = document.querySelector("[data-manual-kicker]");
  const manualStatus = document.querySelector("[data-manual-status]");
  const manualDetail = document.querySelector("[data-manual-detail]");
  const manualPv = document.querySelector("[data-manual-pv]");
  const manualPvBalance = document.querySelector("[data-manual-pv-balance]");
  const manualCar = document.querySelector("[data-manual-car]");
  const manualGrid = document.querySelector("[data-manual-grid]");
  const manualBattery = document.querySelector("[data-manual-battery]");
  const manualBatteryBalance = document.querySelector("[data-manual-battery-balance]");
  const manualBalanceLabel = document.querySelector("[data-manual-balance-label]");
  const manualBalance = document.querySelector("[data-manual-balance]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let manualMode = "auto";
  let manualPvPower = 5.2;
  let manualPvStep = 0;
  let manualPvTimer;
  let manualPvEffectTimer;
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
    const housePower = 1.2;
    const surplus = Math.max(0, manualPvPower - housePower);
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
      setManualRoute("car", false);
      setManualRoute("battery", true);
      setManualRoute("grid", false);
    } else {
      manualKicker.textContent = "Automatik aktiv";
      manualStatus.textContent = "Das E-Auto lädt mit verfügbarem PV-Überschuss.";
      manualDetail.textContent = "Der Hausverbrauch ist bereits abgezogen. Für das Laden wird in diesem Beispiel kein zusätzlicher Netzstrom benötigt.";
      setManualRoute("car", true);
      setManualRoute("battery", false);
      setManualRoute("grid", false);
    }

    manualPv.textContent = formatPower(manualPvPower);
    manualPvBalance.textContent = formatPower(surplus);
    manualCar.textContent = formatPower(charge);
    manualBattery.textContent = battery === 0 ? "bereit · 62 %" : `${formatPower(battery)} ${batteryCharging ? "Laden" : "Abgabe"}`;
    manualBatteryBalance.textContent = battery === 0 ? "0,0 kW" : `${formatPower(battery)} ${batteryCharging ? "Laden" : "Abgabe"}`;
    manualGrid.textContent = grid === 0 ? "0,0 kW" : `${formatPower(grid)} Bezug`;
    manualBalanceLabel.textContent = "Zusätzlicher Netzbezug";
    manualBalance.textContent = formatPower(grid);
  }

  function updateManualPv() {
    if (!manualStage || manualStage.classList.contains("is-switching") || document.hidden) return;
    const pvPattern = [5.0, 5.3, 5.1, 5.4, 5.2, 4.9, 5.2];
    manualPvPower = pvPattern[manualPvStep % pvPattern.length];
    manualPvStep += 1;
    window.clearTimeout(manualPvEffectTimer);
    if (!reduceMotion) {
      manualStage.classList.remove("is-pv-updating");
      void manualStage.offsetWidth;
      manualStage.classList.add("is-pv-updating");
      manualPvEffectTimer = window.setTimeout(() => manualStage.classList.remove("is-pv-updating"), 900);
    }
    renderManualDemo();
  }

  function startManualPv() {
    if (!manualPvTimer) manualPvTimer = window.setInterval(updateManualPv, 3600);
  }

  function stopManualPv() {
    window.clearInterval(manualPvTimer);
    manualPvTimer = undefined;
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

  if (manualStage && "IntersectionObserver" in window) {
    const manualObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) startManualPv();
      else stopManualPv();
    }, { threshold: .15 });
    manualObserver.observe(manualStage);
  } else if (manualStage) {
    startManualPv();
  }

  form.addEventListener("input", calculate);
  form.addEventListener("change", calculate);
  form.addEventListener("reset", () => window.setTimeout(calculate, 0));
  renderManualDemo();
  calculate();
})();
