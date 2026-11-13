const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../stromkosten-model.js");

test("PV-Nutzung wird aus dem zeitlich flexiblen Verbrauch berechnet", () => {
  const result = model.allocateConsumption({
    totalKwh: 3060,
    flexibleKwh: 2055,
    strategies: [{ key: "pv", share: 45 }]
  });
  assert.equal(result.directPvKwh, 924.75);
  assert.equal(result.remainingDemandKwh, 2135.25);
});

test("kleine PV-Anlagen begrenzen die anrechenbare PV-Energie", () => {
  const result = model.allocateConsumption({
    totalKwh: 8000,
    flexibleKwh: 5000,
    strategies: [{ key: "pv", share: 45, maxKwh: 900 }]
  });
  assert.equal(result.directPvKwh, 900);
});

test("mehr flexible Haushaltsenergie senkt im PV-Standardfall die Kosten", () => {
  const strategies = [{ key: "pv", share: 45, price: 8 }];
  const lessFlexible = model.allocateConsumption({ totalKwh: 3060, flexibleKwh: 1560, strategies });
  const moreFlexible = model.allocateConsumption({ totalKwh: 3060, flexibleKwh: 2055, strategies });
  const lessFlexibleCosts = model.calculateCostSummary({ totalKwh: 3060, basePrice: 35, strategies, allocations: lessFlexible.allocations, batterySaving: 0 });
  const moreFlexibleCosts = model.calculateCostSummary({ totalKwh: 3060, basePrice: 35, strategies, allocations: moreFlexible.allocations, batterySaving: 0 });
  assert.equal(lessFlexible.directPvKwh, 702);
  assert.equal(moreFlexible.directPvKwh, 924.75);
  assert.ok(moreFlexibleCosts.after < lessFlexibleCosts.after);
  assert.ok(moreFlexibleCosts.saving > lessFlexibleCosts.saving);
});

test("PV und Tarife werden nicht doppelt gezählt", () => {
  const result = model.allocateConsumption({
    totalKwh: 3060,
    flexibleKwh: 2055,
    strategies: [
      { key: "pv", share: 45 },
      { key: "dynamic", share: 35 },
      { key: "window", share: 40 }
    ]
  });
  assert.equal(result.allocations.pv, 924.75);
  assert.equal(result.allocations.dynamic, 719.25);
  assert.equal(result.allocations.window, 411);
  assert.equal(result.optimizedKwh, 2055);
  assert.ok(result.optimizedKwh <= 3060);
});

test("100 Prozent PV-Nutzung optimieren höchstens den flexiblen Verbrauch", () => {
  const result = model.allocateConsumption({
    totalKwh: 4000,
    flexibleKwh: 2200,
    strategies: [{ key: "pv", share: 100 }, { key: "dynamic", share: 100 }]
  });
  assert.equal(result.optimizedKwh, 2200);
  assert.equal(result.remainingDemandKwh, 1800);
  assert.equal(result.allocations.dynamic, 0);
});

test("Speicherdurchsatz folgt Kapazität mal Vollzyklen", () => {
  const result = model.calculateBattery({
    totalKwh: 4000,
    optimizedKwh: 1200,
    enabled: true,
    canCharge: true,
    capacityKwh: 4,
    cycles: 120,
    efficiency: 0.9,
    basePrice: 35,
    chargePrice: 8
  });
  assert.equal(result.dischargeKwh, 480);
  assert.ok(Math.abs(result.chargeKwh - 533.333333) < 0.00001);
  assert.ok(Math.abs(result.saving - 125.333333) < 0.00001);
});

test("übergroßer Speicher wird auf den verbleibenden Verbrauch begrenzt", () => {
  const result = model.calculateBattery({
    totalKwh: 4000,
    optimizedKwh: 1000,
    enabled: true,
    canCharge: true,
    capacityKwh: 30,
    cycles: 365,
    efficiency: 0.9,
    basePrice: 35,
    chargePrice: 8
  });
  assert.equal(result.dischargeKwh, 3000);
  assert.equal(result.remainingDemandKwh, 3000);
});

test("schlechterer Wirkungsgrad reduziert die Ersparnis", () => {
  const common = { totalKwh: 4000, optimizedKwh: 1200, enabled: true, canCharge: true, capacityKwh: 8, cycles: 120, basePrice: 35, chargePrice: 8 };
  const efficient = model.calculateBattery({ ...common, efficiency: 0.9 });
  const inefficient = model.calculateBattery({ ...common, efficiency: 0.8 });
  assert.ok(inefficient.effectivePrice > efficient.effectivePrice);
  assert.ok(inefficient.saving < efficient.saving);
});

test("unwirtschaftliches Laden erzeugt keinen Speicherbeitrag", () => {
  const result = model.calculateBattery({
    totalKwh: 4000,
    optimizedKwh: 1200,
    enabled: true,
    canCharge: true,
    capacityKwh: 8,
    cycles: 120,
    efficiency: 0.9,
    basePrice: 35,
    chargePrice: 40
  });
  assert.equal(result.economicallyUseful, false);
  assert.equal(result.dischargeKwh, 0);
  assert.equal(result.saving, 0);
});

test("HTW-Verbrauchsrichtwert begrenzt die dargestellte Abenddauer", () => {
  const recommended = model.recommendedCapacity(4000);
  assert.equal(recommended, 6);
  assert.equal(model.representativeBatterySlots(2, recommended, true), 2);
  assert.equal(model.representativeBatterySlots(4, recommended, true), 4);
  assert.equal(model.representativeBatterySlots(6, recommended, true), 6);
  assert.equal(model.representativeBatterySlots(12, recommended, true), 6);
});

test("Batterie übernimmt direkt in der ersten Stunde nach dem PV-Fenster", () => {
  const pvHours = [9, 10, 11, 12, 13, 14, 15, 16];
  const batteryHours = model.buildBatteryDischargeHours({ slots: 3, pvHours });
  const sources = model.buildEnergySourceProfile({ pvHours, tariffHours: [], batteryHours });
  assert.deepEqual(batteryHours, [17, 18, 19]);
  assert.equal(sources[16], "pv");
  assert.equal(sources[17], "battery");
});

test("größerer Speicherbeitrag verlängert das Versorgungsfenster bis nach Mitternacht", () => {
  const pvHours = [9, 10, 11, 12, 13, 14, 15, 16];
  const small = model.representativeBatteryDischargeSlots(3060, 600, pvHours);
  const medium = model.representativeBatteryDischargeSlots(3060, 1200, pvHours);
  const large = model.representativeBatteryDischargeSlots(3060, 1680, pvHours);
  assert.deepEqual([small, medium, large], [3, 6, 9]);
  assert.deepEqual(model.buildBatteryDischargeHours({ slots: large, pvHours }), [17, 18, 19, 20, 21, 22, 23, 0, 1]);
});

test("19 kWh Speicher decken im typisierten Verlauf die gesamte Nacht außerhalb der PV-Zeit", () => {
  const pvHours = [9, 10, 11, 12, 13, 14, 15, 16];
  const slots = model.representativeBatteryDischargeSlots(5900, 2200, pvHours, 19);
  assert.equal(slots, 16);
  const dischargeHours = model.buildBatteryDischargeHours({ slots, pvHours });
  assert.deepEqual(dischargeHours, [17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const profile = model.buildStorageProfile({ active: true, chargeHours: pvHours, dischargeHours });
  assert.ok(profile[0] > profile[8]);
  assert.ok(profile[23] > profile[0]);
  assert.ok(Math.abs(profile[8] - 10) < 0.00001);
  assert.ok(Math.abs(profile[16] - 90) < 0.00001);
});

test("ohne PV beginnt das typisierte Abendfenster um 18 Uhr", () => {
  assert.deepEqual(model.buildBatteryDischargeHours({ slots: 3, pvHours: [] }), [18, 19, 20]);
});

test("Standardfall liefert eine geschlossene Jahreskostenbilanz", () => {
  const strategies = [{ key: "pv", share: 45, price: 8 }];
  const allocation = model.allocateConsumption({ totalKwh: 3060, flexibleKwh: 2055, strategies });
  const battery = model.calculateBattery({
    totalKwh: 3060,
    optimizedKwh: allocation.optimizedKwh,
    enabled: true,
    canCharge: true,
    capacityKwh: 10,
    cycles: 120,
    efficiency: 0.9,
    basePrice: 35,
    chargePrice: 8
  });
  const costs = model.calculateCostSummary({
    totalKwh: 3060,
    basePrice: 35,
    strategies,
    allocations: allocation.allocations,
    batterySaving: battery.saving
  });
  assert.equal(allocation.directPvKwh, 924.75);
  assert.equal(battery.dischargeKwh, 1200);
  assert.ok(Math.abs(costs.before - 1071) < 0.00001);
  assert.ok(Math.abs(costs.saving - 563.015833) < 0.00001);
  assert.ok(Math.abs(costs.after - 507.984167) < 0.00001);
});

test("ausgewiesene Ersparnis kann die Ausgangskosten nicht überschreiten", () => {
  const result = model.calculateCostSummary({
    totalKwh: 1000,
    basePrice: 30,
    strategies: [{ key: "dynamic", price: -50 }],
    allocations: { dynamic: 1000 },
    batterySaving: 500
  });
  assert.equal(result.before, 300);
  assert.equal(result.saving, 300);
  assert.equal(result.after, 0);
  assert.equal(result.capped, true);
});

test("Speicherfüllstand steigt beim Laden und sinkt beim Entladen", () => {
  const profile = model.buildStorageProfile({ active: true, chargeHours: [11, 12, 13], dischargeHours: [18, 19, 20, 21] });
  assert.equal(profile.length, 24);
  assert.equal(profile[10], 20);
  assert.ok(profile[13] > profile[10]);
  assert.ok(Math.abs(profile[13] - 90) < 0.00001);
  assert.ok(Math.abs(profile[21] - 10) < 0.00001);
});

test("Energiequellen verwenden Batterie, PV, Netzladen, Tarif und Netz in eindeutiger Priorität", () => {
  const sources = model.buildEnergySourceProfile({
    pvHours: [10, 11, 12],
    tariffHours: [2, 3, 10],
    batteryHours: [18, 19],
    gridChargeHours: [3, 10]
  });
  assert.equal(sources[0], "grid");
  assert.equal(sources[2], "tariff");
  assert.equal(sources[3], "grid-charge");
  assert.equal(sources[10], "pv");
  assert.equal(sources[18], "battery");
});

test("Trend-Szenarien zeigen Netzladen nur bei tatsächlicher Batterieladung", () => {
  const scenarios = [
    { name: "Tarif ohne Netzladen", gridChargeHours: [], expectedAt2: "tariff" },
    { name: "Tarif mit Netzladen", gridChargeHours: [2, 3], expectedAt2: "grid-charge" },
    { name: "deaktivierte Batterie", gridChargeHours: [], expectedAt2: "tariff" }
  ];
  scenarios.forEach(scenario => {
    const sources = model.buildEnergySourceProfile({
      pvHours: [9, 10, 11, 12, 13, 14, 15, 16],
      tariffHours: [2, 3, 4],
      batteryHours: [17, 18, 19],
      gridChargeHours: scenario.gridChargeHours
    });
    assert.equal(sources[2], scenario.expectedAt2, scenario.name);
    assert.equal(sources[12], "pv", scenario.name);
    assert.equal(sources[17], "battery", scenario.name);
  });
});

test("Netzladezeiten erhöhen gleichzeitig den SOC und erscheinen als Netzladen", () => {
  const gridChargeHours = [2, 3, 4];
  const storage = model.buildStorageProfile({ active: true, chargeHours: gridChargeHours, dischargeHours: [18, 19, 20] });
  const sources = model.buildEnergySourceProfile({ pvHours: [], tariffHours: gridChargeHours, batteryHours: [18, 19, 20], gridChargeHours });
  assert.ok(storage[4] > storage[1]);
  assert.equal(sources[2], "grid-charge");
  assert.equal(sources[18], "battery");
});

test("Netzladen erhöht den SOC bereits vor dem ersten PV-Ladefenster", () => {
  const pvHours = [11, 12, 13];
  const pvOnly = model.buildStorageProfile({ active: true, chargeHours: pvHours, dischargeHours: [18, 19, 20] });
  const gridAndPv = model.buildStorageProfile({ active: true, chargeHours: [2, 3, 4, ...pvHours], dischargeHours: [18, 19, 20] });
  assert.equal(pvOnly[10], 20);
  assert.ok(Math.abs(gridAndPv[10] - 55) < 0.00001);
  assert.ok(gridAndPv[10] > pvOnly[10]);
  assert.ok(Math.abs(gridAndPv[13] - 90) < 0.00001);
});

test("Netzladen wird nicht gleichzeitig in aktive PV-Stunden gelegt", () => {
  const candidates = [2, 3, 12, 16, 4];
  const selected = model.selectAvailableHours(candidates, [9, 10, 11, 12, 13, 14, 15, 16], 3);
  assert.deepEqual(selected, [2, 3, 4]);
});

test("Netzladen ist im kombinierten Trend sichtbar verdrahtet", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "stromkosten-rechner.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
  const client = fs.readFileSync(path.join(root, "stromkosten-rechner.js"), "utf8");
  assert.match(html, /is-grid-charge-window[^>]*><\/i>Netzgünstiges Laden/);
  assert.match(css, /\.savings-inline-trend-grid-charge-window/);
  assert.match(client, /batteryGridHours\.forEach\(hour =>/);
  assert.match(client, /savings-inline-trend-grid-charge-window/);
});

test("Strompreis und Speicherfüllstand sind getrennte Kennlinien im selben Trend", () => {
  const client = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.js"), "utf8");
  const combined = client.slice(client.indexOf("function renderCombinedTrend"), client.indexOf("function renderLiveTrend"));
  assert.match(combined, /pricePath\.setAttribute\("class", "savings-inline-trend-line"\)/);
  assert.match(combined, /storagePath\.setAttribute\("class", "savings-inline-trend-storage-line"\)/);
  assert.match(combined, /output\.inlineTrend\.replaceChildren\(svg\)/);
});

test("die drei Eingabebereiche sind zu einer kompakten Basiseinstellung zusammengefasst", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.html"), "utf8");
  const basics = html.indexOf('<fieldset class="savings-basics">');
  const trend = html.indexOf('<figure class="savings-inline-trend">');
  assert.ok(basics > -1 && trend > basics);
  assert.doesNotMatch(html, /savings-guide|savings-devices|class="savings-battery/);
  assert.doesNotMatch(html, /1\. Energiequellen|2\. Zusätzliche|3\. Batteriespeicher/);
});

test("Plausibilitätsvergleich ist vollständig aus der Rechnerseite entfernt", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.html"), "utf8");
  const css = fs.readFileSync(path.resolve(__dirname, "..", "style.css"), "utf8");
  assert.doesNotMatch(html, /Plausibilitätsvergleich|HTW-Jahressimulation|savings-benchmark/);
  assert.doesNotMatch(css, /savings-benchmark/);
});

test("Basiseinstellungen nutzen ein kompaktes responsives Fragenraster", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "..", "style.css"), "utf8");
  assert.match(css, /\.savings-basics-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)\{\.savings-basics-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:520px\)\{\.savings-basics-grid\{grid-template-columns:1fr/);
});

test("Familienhaushalt wird pauschal berücksichtigt und nicht mehr abgefragt", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.html"), "utf8");
  const client = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.js"), "utf8");
  assert.match(html, /Familienhaushalt 3\.500 kWh\/Jahr/);
  assert.doesNotMatch(html, /<b>Haushaltsgeräte<\/b>/);
  assert.match(client, /familyAssumption = \{ annualKwh: 3500, flexibleShare: 15 \}/);
  assert.match(client, /let totalKwh = familyAssumption\.annualKwh/);
});

test("Live-Trend zeigt nur Strompreis und Speicherfüllstand", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.html"), "utf8");
  const client = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.js"), "utf8");
  const start = html.indexOf('<figure class="savings-inline-trend">');
  const trend = html.slice(start, html.indexOf("</figure>", start));
  assert.match(trend, /Strompreis und Speicherfüllstand über 24 Stunden/);
  assert.match(trend, /data-inline-soc hidden/);
  assert.doesNotMatch(trend, /E-Auto lädt|Wärmepumpe läuft|>Energiequellen</);
  assert.match(client, /function renderCombinedTrend/);
  assert.match(client, /renderCombinedTrend\(\{ activeStrategies/);
});

test("Batteriespeicher fragt nur die Größe ab und nutzt technische Annahmen im Hintergrund", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.html"), "utf8");
  assert.match(html, /Wie groß ist dein Batteriespeicher\?/);
  assert.match(html, /type="hidden" name="batteryCycles" value="120"/);
  assert.match(html, /type="hidden" name="batteryEfficiency" value="90"/);
  assert.doesNotMatch(html, /Erweiterte Annahmen anpassen|Speichernutzung pro Jahr|Wirkungsgrad des Speichers/);
});

test("Kunden sehen kurze direkte Fragen mit gut spielbaren Schiebereglern", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.html"), "utf8");
  const client = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.js"), "utf8");
  const ranges = html.match(/data-compact-range/g) || [];
  assert.match(html, /Wie ist dein Arbeitspreis\?/);
  assert.match(html, /Wie groß ist deine PV-Anlage\?/);
  assert.match(html, /Wie hoch ist deine Einspeisevergütung\?/);
  assert.match(html, /Wie flexibel kannst du dein Auto laden\?/);
  assert.equal(ranges.length, 9);
  assert.match(html, /data-range-output>35 ct\/kWh/);
  assert.match(client, /function syncCompactRanges\(\)/);
  assert.match(client, /--range-progress/);
  assert.doesNotMatch(html, /name="sharePv"|name="shareDynamic"|name="shareWindow"/);
});

test("Schieberegler sind groß, kontrastreich und am Desktop nebeneinander", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "..", "style.css"), "utf8");
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.savings-slider input\[type="range"\]::-webkit-slider-thumb\{width:22px;height:22px/);
  assert.match(css, /linear-gradient\(90deg,#087d74 var\(--range-progress\),#c8d6d2 var\(--range-progress\)\)/);
  assert.match(css, /\.savings-slider output\{[^}]*font-weight:900/);
});

test("Preis im Zeitfenster erhält einen breiten gut greifbaren Regler", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "stromkosten-rechner.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
  const client = fs.readFileSync(path.join(root, "stromkosten-rechner.js"), "utf8");
  assert.match(html, /savings-slider savings-price-slider/);
  assert.match(html, /data-cheap-price-label/);
  assert.match(css, /\.savings-price-slider\{grid-column:span 2/);
  assert.match(css, /\.savings-price-slider input\[type="range"\]::-webkit-slider-thumb\{width:26px;height:26px/);
  assert.match(client, /tariffMode === "window" \? "Preis im Zeitfenster" : "Günstiger Preis"/);
});

test("Speichertrend zeigt den SOC vor PV nach dem Netzladen", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "stromkosten-rechner.html"), "utf8");
  const client = fs.readFileSync(path.join(root, "stromkosten-rechner.js"), "utf8");
  assert.match(html, /data-soc-before-pv hidden/);
  assert.match(client, /SOC vor PV: \$\{number\.format\(socBeforePv\)\} % durch Netzladen/);
  assert.match(client, /Für PV-Strom bleibt deshalb nur die noch freie Speicherkapazität/);
});

test("Preis und SOC werden in einem gemeinsamen SVG gerendert", () => {
  const client = fs.readFileSync(path.resolve(__dirname, "..", "stromkosten-rechner.js"), "utf8");
  assert.match(client, /svg\.setAttribute\("class", "savings-inline-trend-combined"\)/);
  assert.match(client, /svg\.append\(pricePath\)/);
  assert.match(client, /svg\.append\(storagePath\)/);
});
