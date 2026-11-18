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
  function update() {
    const p = {};
    const fields = Object.keys(api.defaults).map(key => form.elements.namedItem(key));
    const invalid = fields.find(field => !field.validity.valid || !Number.isFinite(field.valueAsNumber));
    if (invalid) {
      result.hidden = true;
      error.hidden = false;
      error.textContent = "Bitte vervollständige die Eingaben und beachte die angegebenen Wertebereiche.";
      return;
    }
    fields.forEach(field => { p[field.name] = field.valueAsNumber; });
    let r;
    try { r = api.calculate(p); } catch {
      result.hidden = true; error.hidden = false; error.textContent = "Bitte prüfe die Eingabewerte."; return;
    }
    result.hidden = false;
    error.hidden = true;
    ["demand", "soldSolar", "exportedSolar", "solarPerApartment"].forEach(key => write(key, format.format(r[key]) + " kWh/Jahr"));
    ["fullRevenue", "localRevenue", "surplusRevenue", "rentalRevenue", "baseSurplus", "rentalCosts", "rentalSurplus", "rentalInvestment"].forEach(key => write(key, euro.format(r[key])));
    write("fullFeedInPrice", decimal.format(p.fullFeedInPrice) + " ct/kWh");
    write("additionalInvestment", euro.format(p.additionalInvestment));
    write("additionalAnnualCosts", euro.format(p.additionalAnnualCosts) + " / Jahr");
    write("baseInvestment", euro.format(0));
    write("annualPvCosts", euro.format(p.annualPvCosts));
    write("pvYield", format.format(p.pvYield) + " kWh/Jahr");
    write("solarCoverage", format.format(p.solarCoverage) + " %");
    write("effectiveCoverage", decimal.format(r.effectiveCoverage) + " %");
    write("selfConsumption", decimal.format(r.selfConsumption) + " %");
    write("improvement", (r.improvement > 0 ? "+" : "") + euro.format(r.improvement) + " / Jahr");
    write("investmentReturn", r.investmentReturn === null ? "Ohne Zusatzinvestition keine Rendite berechenbar" : "Rendite der Zusatzinvestition: " + decimal.format(r.investmentReturn) + " % pro Jahr");
    write("payback", p.additionalInvestment === 0 ? "Keine Zusatzinvestition angegeben" : r.additionalPayback === null ? "Keine Amortisation aus dem Mehrertrag" : decimal.format(r.additionalPayback) + " Jahre für die Zusatzinvestition");
    write("formulaDemand", `${format.format(p.apartments)} × ${format.format(p.consumptionPerApartment)} = ${format.format(r.demand)} kWh/Jahr`);
    write("formulaSolar", `Minimum aus ${format.format(r.demand)} × ${format.format(p.solarCoverage)} % und ${format.format(p.pvYield)} = ${format.format(r.soldSolar)} kWh/Jahr`);
    write("formulaExtra", `${euro.format(r.rentalSurplus)} − ${euro.format(r.baseSurplus)} = ${euro.format(r.improvement)} pro Jahr`);
    const status = document.getElementById("ms-return-status");
    status.textContent = r.improvement > 0 ? "Im gewählten Beispiel verbessert Mieterstrom den jährlichen Überschuss." : r.improvement < 0 ? "Im gewählten Beispiel ist die reine Einspeisung beim jährlichen Überschuss günstiger." : "Beide Varianten erzielen denselben jährlichen Überschuss.";
    status.dataset.outcome = r.improvement >= 0 ? "positive" : "negative";
    document.getElementById("ms-return-cap").hidden = !r.capped;
    document.getElementById("ms-return-zero").hidden = p.additionalInvestment > 0;
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
