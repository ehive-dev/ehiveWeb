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
    node("desc", { id: "ms-monthly-desc" }, "Links je Monat PV-Direktverbrauch und Netzbezug, rechts der Gesamtverbrauch von Wohnungen und Wallboxen. Die Linie zeigt den PV-Ertrag. Die Tabelle enthält die genauen Werte.");
    const months = r.months.map(month => ({
      ...month,
      pvDirect: month.pvHousehold + month.pvEv
    }));
    const maximum = Math.max(1, ...months.map(month => Math.max(month.pv, month.household + month.ev)));
    const magnitude = Math.pow(10, Math.floor(Math.log10(maximum)));
    const step = Math.ceil(maximum / magnitude / 4) * magnitude;
    const top = Math.ceil(maximum / step) * step;
    const height = 240, baseline = 280;
    const plotLeft = 65, plotRight = 1020;
    const monthWidth = (plotRight - plotLeft) / months.length;
    const barWidth = 24, barGap = 6;
    const chartY = value => baseline - value / top * height;
    for (let value = 0; value <= top; value += step) {
      const y = chartY(value);
      node("line", { x1: plotLeft, x2: plotRight, y1: y, y2: y, stroke: "#dce4e6" });
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
      ]
    ];
    const pvPoints = [];
    months.forEach((month, i) => {
      const center = plotLeft + (i + 0.5) * monthWidth;
      const group = node("g", {});
      stacks.forEach((segments, index) => {
        const x = center - barWidth - barGap / 2 + index * (barWidth + barGap);
        let cumulative = 0;
        for (const [key, label, seriesClass] of segments) {
          const value = month[key];
          cumulative += value;
          if (value > 1e-8) {
            const rect = node("rect", {
              x, y: chartY(cumulative), width: barWidth,
              height: value / top * height, class: seriesClass
            }, undefined, group);
            node("title", {}, `${month.name} · ${label} · ${decimal.format(value)} kWh`, rect);
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
    document.getElementById("ms-wallbox-fields").hidden = !enabled;
    document.querySelectorAll("#ms-wallbox-fields input").forEach(field => { field.disabled = !enabled; });
    const invalid = fields.find(field => !field.disabled && field.type !== "checkbox" && (!field.validity.valid || !Number.isFinite(field.valueAsNumber)));
    if (invalid) {
      result.hidden = true;
      error.hidden = false;
      error.textContent = "Bitte vervollständige die Eingaben und beachte die angegebenen Wertebereiche.";
      return;
    }
    fields.forEach(field => { p[field.name] = field.type === "checkbox" ? Number(field.checked) : field.disabled ? api.defaults[field.name] : field.valueAsNumber; });
    let r;
    try { r = api.calculate(p); } catch {
      result.hidden = true; error.hidden = false; error.textContent = "Bitte prüfe die Eingabewerte."; return;
    }
    result.hidden = false;
    error.hidden = true;
    ["pvHousehold", "pvEv", "gridHousehold", "gridEv", "grid", "householdDemand", "evDemand", "demand", "soldSolar", "exportedSolar", "solarPerApartment"].forEach(key => write(key, format.format(r[key]) + " kWh/Jahr"));
    ["fullRevenue", "localRevenue", "surplusRevenue", "rentalRevenue", "baseSurplus", "rentalCosts", "rentalSurplus", "rentalInvestment"].forEach(key => write(key, euro.format(r[key])));
    write("additionalAnnualCosts", euro.format(p.additionalAnnualCosts) + " / Jahr");
    write("baseInvestment", euro.format(0));
    write("annualPvCosts", euro.format(p.annualPvCosts));
    write("pvYield", format.format(p.pvYield) + " kWh/Jahr");
    write("solarCoverage", format.format(p.solarCoverage) + " %");
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
    renderMonths(r);
    const status = document.getElementById("ms-return-status");
    status.dataset.outcome = r.improvement >= 0 ? "positive" : "negative";
    document.getElementById("ms-return-cap").hidden = !r.capped;
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
