const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../stromkosten-model.js");

test("direkter PV-Eigenverbrauch wird aus dem Gesamtverbrauch berechnet", () => {
  const result = model.allocateConsumption({
    totalKwh: 3060,
    flexibleKwh: 2055,
    strategies: [{ key: "pv", share: 45 }]
  });
  assert.equal(result.directPvKwh, 1377);
  assert.equal(result.remainingDemandKwh, 1683);
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
  assert.equal(result.allocations.pv, 1377);
  assert.equal(result.allocations.dynamic, 678);
  assert.equal(result.allocations.window, 0);
  assert.equal(result.optimizedKwh, 2055);
  assert.ok(result.optimizedKwh <= 3060);
});

test("100 Prozent direkter Eigenverbrauch lassen keinen Restverbrauch", () => {
  const result = model.allocateConsumption({
    totalKwh: 4000,
    flexibleKwh: 2200,
    strategies: [{ key: "pv", share: 100 }, { key: "dynamic", share: 100 }]
  });
  assert.equal(result.optimizedKwh, 4000);
  assert.equal(result.remainingDemandKwh, 0);
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
  assert.equal(allocation.directPvKwh, 1377);
  assert.equal(battery.dischargeKwh, 1200);
  assert.ok(Math.abs(costs.before - 1071) < 0.00001);
  assert.ok(Math.abs(costs.saving - 685.123333) < 0.00001);
  assert.ok(Math.abs(costs.after - 385.876667) < 0.00001);
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

test("Netzladen wird nicht gleichzeitig in aktive PV-Stunden gelegt", () => {
  const candidates = [2, 3, 12, 16, 4];
  const selected = model.selectAvailableHours(candidates, [9, 10, 11, 12, 13, 14, 15, 16], 3);
  assert.deepEqual(selected, [2, 3, 4]);
});

test("Netzladen ist vom Modell bis zum sichtbaren Energiequellen-Balken verdrahtet", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "stromkosten-rechner.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
  const client = fs.readFileSync(path.join(root, "stromkosten-rechner.js"), "utf8");
  assert.match(html, /is-source-grid-charge[^>]*><\/i>Netzladen Batterie/);
  assert.match(css, /\.is-source-grid-charge/);
  assert.match(client, /gridChargeHours:\s*batteryGridHours/);
  assert.match(client, /class", `is-source-\$\{source\}`/);
});
