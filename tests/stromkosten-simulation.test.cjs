const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const simulation = require("../stromkosten-simulation-model.js");

const base = {
  startHour: 18,
  departureHour: 7,
  carKm: 120,
  outdoorTemperature: 0,
  weather: "mixed",
  pvKwp: 8,
  batteryCapacityKwh: 10,
  initialSoc: 30,
  tariff: "fixed",
  gridChargeAllowed: true
};

test("Simulation erzeugt 96 ausgeglichene Viertelstunden", () => {
  const result = simulation.simulate(base);
  assert.equal(result.slots.length, 96);
  result.slots.forEach(slot => {
    const supply = slot.pvKw + slot.gridKw + slot.batteryDischargeKw;
    const use = slot.homeKw + slot.carKw + slot.heatPumpKw + slot.batteryPvChargeKw + slot.batteryGridChargeKw + slot.exportKw;
    assert.ok(Math.abs(supply - use) < 0.00001, `Energiebilanz in Slot ${slot.index}`);
  });
});

test("E-Auto-Ziel wird bis zur Abfahrt erreicht oder ehrlich begrenzt", () => {
  const reachable = simulation.simulate(base);
  const impossible = simulation.simulate({ ...base, startHour: 6, departureHour: 7, carKm: 500 });
  assert.equal(reachable.carTargetReached, true);
  assert.ok(Math.abs(reachable.carKmDelivered - 120) < 0.01);
  assert.equal(impossible.carTargetReached, false);
  assert.ok(impossible.carKmDelivered < 500);
});

test("Kältere Außentemperatur erzeugt mehr Wärmepumpenlaufzeit", () => {
  const mild = simulation.simulate({ ...base, outdoorTemperature: 12 });
  const cold = simulation.simulate({ ...base, outdoorTemperature: -10 });
  assert.ok(cold.heatPumpEnergyKwh > mild.heatPumpEnergyKwh);
  assert.ok(cold.slots.filter(slot => slot.heatPumpKw > 0).length > mild.slots.filter(slot => slot.heatPumpKw > 0).length);
});

test("Erwarteter PV-Überschuss begrenzt das nächtliche Netzladen", () => {
  const sunny = simulation.simulate({ ...base, weather: "sunny", pvKwp: 12, outdoorTemperature: 10, carKm: 50 });
  const noPv = simulation.simulate({ ...base, pvKwp: 0, outdoorTemperature: 10, carKm: 50 });
  assert.ok(sunny.gridTargetSoc < noPv.gridTargetSoc);
  assert.ok(sunny.gridChargeEnergy < noPv.gridChargeEnergy);
  assert.ok(sunny.pvExportEnergy > 0);
});

test("Monatsregler bildet Dezember mit weniger PV und mehr Wärmebedarf als August ab", () => {
  const august = simulation.simulate({ ...base, month: 8, outdoorTemperature: 5, carKm: 40 });
  const december = simulation.simulate({ ...base, month: 12, outdoorTemperature: 5, carKm: 40 });
  const augustGeneration = august.slots.reduce((sum, slot) => sum + slot.pvKw, 0);
  const decemberGeneration = december.slots.reduce((sum, slot) => sum + slot.pvKw, 0);
  assert.ok(augustGeneration > decemberGeneration);
  assert.ok(december.heatPumpEnergyKwh > august.heatPumpEnergyKwh);
  assert.ok(december.gridTargetSoc > august.gridTargetSoc);
});

test("Preisregler verändern Kosten und günstiges Netzladen", () => {
  const lowSpread = simulation.simulate({ ...base, pvKwp: 0, initialSoc: 20, normalPrice: 35, cheapPrice: 35 });
  const highSpread = simulation.simulate({ ...base, pvKwp: 0, initialSoc: 20, normalPrice: 60, cheapPrice: 10 });
  assert.equal(lowSpread.gridChargeEnergy, 0);
  assert.ok(highSpread.gridChargeEnergy > 0);
  assert.notEqual(highSpread.totalCost, lowSpread.totalCost);
});

test("hohes Fahrziel erzwingt Laden außerhalb günstiger Tarifzeiten", () => {
  const result = simulation.simulate({ ...base, carKm: 300, normalPrice: 55, cheapPrice: 10 });
  assert.equal(result.carTargetReached, true);
  assert.ok(result.carExpensiveEnergyKwh > 0);
});

test("SOC bleibt in Grenzen und Batterie lädt und entlädt nie gleichzeitig", () => {
  const result = simulation.simulate({ ...base, weather: "cloudy", outdoorTemperature: -10 });
  result.slots.forEach(slot => {
    assert.ok(slot.soc >= 20 - 0.00001 && slot.soc <= 90 + 0.00001);
    const charging = slot.batteryPvChargeKw + slot.batteryGridChargeKw;
    assert.ok(!(charging > 0.00001 && slot.batteryDischargeKw > 0.00001));
  });
});

test("Simulationsmodus ist vollständig in der Seite eingebunden", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "stromkosten-rechner.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
  assert.match(html, /id="tages-simulation"/);
  assert.match(html, /Benötigte Kilometer/);
  assert.match(html, /Außentemperatur/);
  assert.match(html, /type="range" name="carKm"/);
  assert.match(html, /type="range" name="outdoorTemperature"/);
  assert.match(html, /name="simulationMonth"/);
  assert.match(html, /Monat für PV und Wärmebedarf/);
  assert.doesNotMatch(html, /name="pvForecast"/);
  assert.match(html, /name="normalPrice"/);
  assert.match(html, /name="cheapPrice"/);
  assert.match(html, /data-sim-cheap-price/);
  assert.match(html, /data-sim-km-output/);
  assert.match(html, /data-sim-temperature-output/);
  assert.match(html, /data-simulation-chart/);
  assert.match(html, /stromkosten-simulation-model\.js/);
  assert.match(html, /stromkosten-simulation\.js/);
  assert.match(css, /\.simulation-chart-track/);
  assert.match(css, /\.simulation-range input\[type="range"\]::-webkit-slider-thumb/);
  assert.match(css, /@media\(max-width:767px\)\{\.savings-simulation,\.savings-mode-links a\[href="#tages-simulation"\]\{display:none!important\}\}/);
});
