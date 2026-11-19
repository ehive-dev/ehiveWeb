(() => {
  "use strict";
  const form = document.getElementById("ms-return-form");
  const api = window.EHiveMieterstromReturn;
  if (!form || !api) return;
  const format = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const result = document.getElementById("ms-return-results");
  const error = document.getElementById("ms-return-error");
  const write = (key, value) => document.querySelectorAll(`[data-ms-value="${key}"]`).forEach(el => { el.textContent = value; });
  function renderMonths(r) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.getElementById("ms-monthly-chart");
    svg.replaceChildren();
    const node = (tag, attrs, text, parent = svg) => {
      const el = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
      if (text !== undefined) el.textContent = text;
      parent.appendChild(el); return el;
    };
    node("title", { id: "ms-monthly-title" }, "Monatliche Strombilanz in kWh");
    node("desc", { id: "ms-monthly-desc" }, "Je Monat links PV-Direktverbrauch und Netzbezug, in der Mitte der Verbrauch von Wohnungen und Wallboxen und rechts die Einspeisung unter der Nulllinie. Die gelbe Linie zeigt den PV-Ertrag.");
    const months = r.months.map(month => ({
      ...month,
      pvDirect: month.pvHousehold + month.pvEv,
      signedExport: -month.exported
    }));
    const maximum = Math.max(1, ...months.map(month => Math.max(month.pv, month.household + month.ev)));
    const magnitude = Math.pow(10, Math.floor(Math.log10(maximum)));
    const step = Math.ceil(maximum / magnitude / 4) * magnitude;
    const top = Math.ceil(maximum / step) * step;
    const largestExport = Math.max(...months.map(month => month.exported));
    const bottom = largestExport > 1e-8 ? -Math.ceil(largestExport / step) * step : 0;
    const plotTop = 40, plotBottom = 280;
    const plotLeft = 88, plotRight = 1020;
    const monthWidth = (plotRight - plotLeft) / months.length;
    const barWidth = 18, barGap = 5;
    const chartY = value => plotBottom - (value - bottom) / (top - bottom) * (plotBottom - plotTop);
    for (let value = bottom; value <= top; value += step) {
      const y = chartY(value);
      node("line", {
        x1: plotLeft, x2: plotRight, y1: y, y2: y,
        stroke: value === 0 ? "#75848e" : "#dce4e6"
      });
      node("text", { x: plotLeft - 10, y: y + 4, "text-anchor": "end", class: "ms-axis-label" }, format.format(value));
    }
    node("text", { x: plotLeft, y: 20, class: "ms-axis-label" }, "kWh / Monat");
    const stacks = [
      [
        ["pvDirect", "PV-Direktverbrauch", "ms-monthly-direct"],
        ["grid", "Netzbezug", "ms-monthly-grid"]
      ],
      [
        ["household", "Wohnungen gesamt", "ms-monthly-household"],
        ["ev", "Wallboxen gesamt", "ms-monthly-wallbox"]
      ],
      [
        ["signedExport", "Einspeisung", "ms-monthly-export"]
      ]
    ];
    const groupWidth = stacks.length * barWidth + (stacks.length - 1) * barGap;
    const pvPoints = [];
    months.forEach((month, i) => {
      const center = plotLeft + (i + 0.5) * monthWidth;
      const group = node("g", {});
      stacks.forEach((segments, index) => {
        const x = center - groupWidth / 2 + index * (barWidth + barGap);
        let cumulative = 0;
        for (const [key, label, seriesClass] of segments) {
          const value = month[key];
          const yStart = chartY(cumulative);
          cumulative += value;
          if (Math.abs(value) > 1e-8) {
            const yEnd = chartY(cumulative);
            const rect = node("rect", {
              x, y: Math.min(yStart, yEnd), width: barWidth,
              height: Math.abs(yEnd - yStart), class: seriesClass
            }, undefined, group);
            const solarDetail = key === "ev" ? ` · davon ${decimal.format(month.pvEv)} kWh PV` : "";
            const cheapDetail = key === "ev" && r.oneOptimized ? ` · ${decimal.format(month.evCheapGrid)} kWh günstiger Netzstrom` : "";
            node("title", {}, `${month.name} · ${label} · ${decimal.format(value)} kWh${solarDetail}${cheapDetail}`, rect);
          }
        }
      });
      node("text", { x: center, y: 304, "text-anchor": "middle", class: "ms-axis-label" }, month.name, group);
      pvPoints.push(`${center},${chartY(month.pv)}`);
    });
    const pvLine = node("polyline", {
      class: "ms-monthly-yield", points: pvPoints.join(" "), fill: "none",
      "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round"
    });
    node("title", {}, "PV-Ertrag", pvLine);
    const tbody = document.getElementById("ms-monthly-body");
    tbody.replaceChildren();
    const keys = [
      "pv", "pvDirect", "grid", "household", "ev", "exported",
      "pvHousehold", "gridHousehold", "pvEv", "gridEv"
    ];
    document.getElementById("ms-one-grid-column").hidden = !r.oneOptimized;
    if (r.oneOptimized) keys.push("evCheapGrid");
    const row = (label, values) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th"); th.scope = "row"; th.textContent = label; tr.appendChild(th);
      values.forEach(value => {const td = document.createElement("td");td.textContent = decimal.format(value);tr.appendChild(td);});
      tbody.appendChild(tr);
    };
    months.forEach(month => row(month.name, keys.map(key => month[key])));
    row("Jahr", keys.map(key => months.reduce((sum, month) => sum + month[key], 0)));
  }
  function update() {
    const p = {};
    const fields = Object.keys(api.defaults).map(key => form.elements.namedItem(key));
    const enabled = form.elements.namedItem("wallboxesEnabled").checked;
    const optimize = enabled && form.elements.namedItem("evOneOptimized").checked;
    const useSurplus = enabled && (optimize || form.elements.namedItem("evPvSurplus").checked);
    const powerSummary = document.getElementById("ms-ev-power-summary");
    powerSummary.hidden = true;
    document.getElementById("ms-wallbox-fields").hidden = !enabled;
    document.getElementById("ms-ev-surplus-option").hidden = optimize;
    document.getElementById("ms-one-tariff-fields").hidden = !optimize;
    document.getElementById("ms-ev-min-power").hidden = !useSurplus;
    document.querySelectorAll("#ms-wallbox-fields input").forEach(field => {
      field.disabled = !enabled || (field.name === "evMinChargePower" && !useSurplus)
        || (field.name === "evPvSurplus" && optimize) || (field.closest("#ms-one-tariff-fields") && !optimize);
    });
    const invalid = fields.find(field => !field.disabled && field.type !== "checkbox" && (!field.validity.valid || !Number.isFinite(field.valueAsNumber)));
    if (invalid) {
      result.hidden = true;
      error.hidden = false;
      error.textContent = "Bitte vervollständige die Eingaben und beachte die angegebenen Wertebereiche.";
      return;
    }
    fields.forEach(field => {
      if (field.disabled) p[field.name] = api.defaults[field.name];
      else p[field.name] = field.type === "checkbox" ? Number(field.checked) : field.valueAsNumber;
    });
    let r;
    try {
      r = api.calculate(p);
    } catch (cause) {
      result.hidden = true;
      error.hidden = false;
      const messages = {
        evChargingWindow: "Ladebedarf zu hoch für die gewählte Ladeleistung und Zeitaufteilung.",
        evMinChargePower: "Die Mindestleistung für den PV-Start muss zur eingestellten Ladeleistung passen.",
        evGroupWindow: "Der Ladebedarf passt mit diesem Wallboxlimit nicht in die angesetzten Ladefenster.",
        evGridPrices: "Der günstige Netzpreis darf höchstens dem normalen Netzpreis entsprechen."
      };
      error.textContent = messages[cause.message] || "Bitte prüfe die Eingabewerte.";
      return;
    }
    result.hidden = false;
    error.hidden = true;
    powerSummary.hidden = r.evPowerLimit === 0;
    write("evPowerLimit", decimal.format(r.evPowerLimit) + " kW");
    write("evPeakPower", decimal.format(r.evPeakPower) + " kW");
    ["pvHousehold", "pvEv", "gridHousehold", "gridEv", "grid", "householdDemand", "evDemand", "demand", "soldSolar", "exportedSolar", "solarPerApartment"].forEach(key => write(key, format.format(r[key]) + " kWh/Jahr"));
    ["fullRevenue", "localRevenue", "surplusRevenue", "rentalRevenue", "baseSurplus", "rentalCosts", "rentalSurplus", "rentalInvestment"].forEach(key => write(key, euro.format(r[key])));
    write("additionalAnnualCosts", euro.format(p.additionalAnnualCosts) + " / Jahr");
    write("baseInvestment", euro.format(0));
    write("annualPvCosts", euro.format(p.annualPvCosts));
    write("pvYield", format.format(p.pvYield) + " kWh/Jahr");
    write("householdDayShare", format.format(p.householdDayShare) + " %");
    write("effectiveCoverage", decimal.format(r.effectiveCoverage) + " %");
    write("selfConsumption", decimal.format(r.selfConsumption) + " %");
    const difference = r.improvement > 0 ? "mehr" : r.improvement < 0 ? "weniger" : "Unterschied";
    write("improvement", euro.format(Math.abs(r.improvement)) + " " + difference + " pro Jahr");
    write("investmentReturn", r.investmentReturn === null ? "Keine Umbaukosten" : decimal.format(r.investmentReturn) + " % Rendite pro Jahr");
    const payback = r.additionalPayback === null ? "Keine Amortisation" : "Amortisation nach " + decimal.format(r.additionalPayback) + " Jahren";
    write("payback", p.additionalInvestment > 0 ? payback : "");
    const wallboxDemand = enabled ? " + " + format.format(r.evDemand) + " (Wallboxen)" : "";
    write("formulaDemand", `${format.format(p.apartments)} × ${format.format(p.consumptionPerApartment)}${wallboxDemand} = ${format.format(r.demand)} kWh/Jahr`);
    write("priceMargin", decimal.format(p.salePrice - p.feedInPrice) + " ct/kWh");
    write("grossExtra", euro.format(r.grossExtra));
    write("forgoneFeedIn", euro.format(r.soldSolar * p.feedInPrice / 100));
    write("formulaMargin", `${format.format(r.soldSolar)} kWh × ${decimal.format(p.salePrice - p.feedInPrice)} ct/kWh ÷ 100 − ${euro.format(p.additionalAnnualCosts)} = ${euro.format(r.improvement)} pro Jahr`);
    document.getElementById("ms-one-summary").hidden = !r.oneOptimized;
    document.getElementById("ms-one-details").hidden = !r.oneOptimized;
    if (r.oneOptimized) {
      const chargeShare = energy => decimal.format(100 * energy / r.evDemand) + " %";
      write("evPvOrCheapShare", chargeShare(r.pvEv + r.evCheapGrid));
      write("evPvShare", chargeShare(r.pvEv));
      write("evCheapGridShare", chargeShare(r.evCheapGrid));
      write("evCheapGrid", format.format(r.evCheapGrid) + " kWh");
      write("evCheapGridSavings", euro.format(r.evCheapGridSavings));
      write("pvEstimatedKwp", decimal.format(r.pvEstimatedKwp) + " kWp");
      write("pvAnnualBalanceKwp", decimal.format(r.pvAnnualBalanceKwp) + " kWp");
    }
    document.getElementById("ms-wallbox-season").hidden = r.evDemand === 0;
    if (r.evDemand > 0) {
      const summer = r.months.slice(5, 8);
      const winter = [r.months[11], ...r.months.slice(0, 2)];
      const energy = (months, key) => months.reduce((total, month) => total + month[key], 0);
      const chargeShare = months => energy(months, "pvEv") / energy(months, "ev") * 100;
      write("summerExport", format.format(energy(summer, "exported")) + " kWh");
      write("summerExportWithoutEv", format.format(energy(summer, "exportWithoutEv")) + " kWh");
      write("evSummerShare", decimal.format(chargeShare(summer)) + " %");
      write("evWinterShare", decimal.format(chargeShare(winter)) + " %");
    }
    renderMonths(r);
    const status = document.getElementById("ms-return-status");
    status.dataset.outcome = r.improvement >= 0 ? "positive" : "negative";
    const maxWidth = Math.max(Math.abs(r.baseSurplus), Math.abs(r.rentalSurplus), 1);
    for (const [id, value] of [["ms-bar-base", r.baseSurplus], ["ms-bar-rental", r.rentalSurplus]]) {
      const bar = document.getElementById(id);
      bar.style.width = Math.abs(value) / maxWidth * 100 + "%";
      bar.classList.toggle("is-negative", value < 0);
    }
  }
  form.addEventListener("input", update);
  form.addEventListener("submit", event => { event.preventDefault(); update(); });
  document.getElementById("ms-return-reset").addEventListener("click", () => { form.reset(); update(); });
  update();
})();
