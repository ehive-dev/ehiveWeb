const test = require("node:test");
const assert = require("node:assert/strict");
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
