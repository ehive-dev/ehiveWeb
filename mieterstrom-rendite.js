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
    node("title", {id:"ms-monthly-title"}, "Monatliche PV-Erzeugung, Nutzung und Netzbezug in kWh");
    node("desc", {}, "Je Monat links PV-Erzeugung, aufgeteilt in Wohnungen, Wallboxen und Einspeisung. Rechts Netzbezug, aufgeteilt in Wohnungen und Wallboxen. Alle Werte stehen auch in der Tabelle.");
    const maximum = Math.max(1, ...r.months.map(m => Math.max(m.pv, m.grid)));
    const magnitude = Math.pow(10, Math.floor(Math.log10(maximum)));
    const step = Math.ceil(maximum / magnitude / 4) * magnitude;
    const top = Math.ceil(maximum / step) * step;
    const height = 240, baseline = 280;
    for (let value = 0; value <= top; value += step) {
      const y = baseline - value / top * height;
      node("line", {x1:65,x2:1020,y1:y,y2:y,stroke:"#dce4e6"});
      node("text", {x:55,y:y+4,"text-anchor":"end",class:"ms-axis-label"}, format.format(value));
    }
    node("text", {x:65,y:20,class:"ms-axis-label"}, "kWh / Monat");
    const series = [
      ["pvHousehold", "PV → Wohnungen", "#088178"], ["pvEv", "PV → Wallboxen", "#78cbb3"],
      ["exported", "Einspeisung", "#e4b44f"], ["gridHousehold", "Netz → Wohnungen", "#536d87"],
      ["gridEv", "Netz → Wallboxen", "#b9c9da"]
    ];
    r.months.forEach((m, i) => {
      const x = 80 + i * 78;
      for (const [offset, keys] of [[0, series.slice(0,3)], [30, series.slice(3)]]) {
        let cumulative = 0;
        for (const [key, label, color] of keys) {
          const value = m[key];
          if (value > 1e-8) {
            const rect = node("rect", {x:x+offset,y:baseline-(cumulative+value)/top*height,width:23,height:value/top*height,fill:color});
            node("title", {}, `${m.name}: ${label}, ${decimal.format(value)} kWh`, rect);
          }
          cumulative += value;
        }
      }
      node("text", {x:x+11,y:296,"text-anchor":"middle",class:"ms-axis-small"}, "PV");
      node("text", {x:x+41,y:296,"text-anchor":"middle",class:"ms-axis-small"}, "Netz");
      node("text", {x:x+26,y:319,"text-anchor":"middle",class:"ms-axis-label"}, m.name);
    });
    const tbody = document.getElementById("ms-monthly-body");
    tbody.replaceChildren();
    const keys = ["pv", "pvHousehold", "pvEv", "exported", "gridHousehold", "gridEv", "grid"];
    const row = (label, values) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th"); th.scope = "row"; th.textContent = label; tr.appendChild(th);
      values.forEach(value => {const td = document.createElement("td");td.textContent = decimal.format(value);tr.appendChild(td);});
      tbody.appendChild(tr);
    };
    r.months.forEach(m => row(m.name, keys.map(key => m[key])));
    row("Jahr", [r.months.reduce((s,m)=>s+m.pv,0), r.pvHousehold, r.pvEv, r.exportedSolar, r.gridHousehold, r.gridEv, r.grid]);
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
