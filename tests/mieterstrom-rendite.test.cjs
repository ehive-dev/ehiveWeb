const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, defaults, evConsumptionPer100Km } = require('../mieterstrom-rendite-model.js');

const calc = values => calculate({ ...defaults, ...values });
const equal = (actual, expected) => {
  const tolerance = Math.max(1e-8, Math.abs(expected) * 1e-10);
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
};
const sumMonths = (result, key) => result.months.reduce((total, month) => total + month[key], 0);

test('Monatserträge entsprechen den PVGIS-Referenzwerten für Passau 2005–2023', () => {
  const monthlyReference = [37.85, 63.27, 98.29, 120.89, 125.63, 131.80, 134.66, 123.46, 103.09, 77.11, 41.85, 31.67];
  const result = calc({ pvYield: 1089.57 });
  for (const [index, month] of result.months.entries()) {
    equal(month.pv, monthlyReference[index]);
  }
  equal(sumMonths(result, 'pv'), 1089.57);
});

test('Zusatzrendite verwendet ausschließlich die Umbaukosten für die vorhandene PV', () => {
  const result = calc({});
  const historical = calc({ installationCost: 50000 });
  equal(result.householdDemand, 7600);
  equal(result.baseSurplus, 440);
  equal(result.rentalInvestment, 2000);
  equal(result.investmentReturn, result.improvement / 2000 * 100);
  equal(result.additionalPayback, 2000 / result.improvement);
  equal(historical.improvement, result.improvement);
  equal(historical.investmentReturn, result.investmentReturn);
  assert.ok(!('installationCost' in defaults));
});

test('Dieselbe Einspeisevergütung gilt für Ausgangslage und Überschuss', () => {
  const a = calc({ feedInPrice: 8 });
  const b = calc({ feedInPrice: 4 });
  equal(a.baseSurplus - b.baseSurplus, 8000 * 0.04);
  equal(a.rentalSurplus - b.rentalSurplus, a.exportedSolar * 0.04);
  equal(b.improvement - a.improvement, a.soldSolar * 0.04);
});

test('Mehrertrag ergibt sich aus PV-Verkauf, entgangener Vergütung und Zusatzkosten', () => {
  for (const feedInPrice of [0, 4, 8, 30]) {
    for (const apartments of [0, 1, 4, 20]) {
      const result = calc({ feedInPrice, apartments });
      equal(result.improvement, result.soldSolar * (defaults.salePrice - feedInPrice) / 100 - defaults.additionalAnnualCosts);
      equal(result.improvement, result.rentalSurplus - result.baseSurplus);
    }
  }
});

test('Ohne Preisdifferenz und Mehrkosten ändert sich der Überschuss nicht', () => {
  const result = calc({ salePrice: 10, feedInPrice: 10, additionalAnnualCosts: 0, additionalInvestment: 0 });
  equal(result.improvement, 0);
  assert.equal(result.investmentReturn, null);
});

test('Verluste und null Euro Umbaukosten werden sinnvoll ausgewiesen', () => {
  const loss = calc({ salePrice: 1, additionalAnnualCosts: 1000 });
  assert.ok(loss.improvement < 0);
  assert.ok(loss.investmentReturn < 0);
  assert.equal(loss.additionalPayback, null);
  const noInvestment = calc({ additionalInvestment: 0 });
  assert.equal(noInvestment.investmentReturn, null);
  assert.equal(noInvestment.additionalPayback, null);
  assert.ok(Number.isFinite(noInvestment.improvement));
});

test('Ohne Verbrauch wird die gesamte Erzeugung eingespeist', () => {
  for (const input of [{ apartments: 0 }, { consumptionPerApartment: 0 }]) {
    const result = calc(input);
    equal(result.soldSolar, 0);
    equal(result.localRevenue, 0);
    equal(result.exportedSolar, 8000);
    assert.ok(Number.isFinite(result.solarPerApartment));
  }
});

test('Ohne PV-Ertrag deckt das Netz den kompletten Verbrauch', () => {
  const result = calc({ pvYield: 0, wallboxesEnabled: 1 });
  equal(result.grid, 15600);
  equal(result.localRevenue, 0);
  equal(result.fullRevenue, 0);
  equal(result.surplusRevenue, 0);
  equal(result.selfConsumption, 0);
});

test('Ein Fahrzeug je Wohnung mit 10.000 km ergibt 2.000 kWh Ladebedarf je Fahrzeug', () => {
  const result = calc({ wallboxesEnabled: 1 });
  assert.equal(evConsumptionPer100Km, 20);
  equal(result.evDemand, 8000);
  equal(calc({ wallboxesEnabled: 1, evConsumption: 40 }).evDemand, 8000);
  equal(result.householdDemand, 7600);
  equal(result.demand, 15600);
  assert.ok(result.pvEv > 0 && result.gridEv > 0);
  equal(calc({ wallboxesEnabled: 1, homeCharging: 50 }).evDemand, 4000);
  equal(calc({ wallboxesEnabled: 0, annualMileage: 100000 }).evDemand, 0);
  equal(calc({ wallboxesEnabled: 1, apartments: 0 }).evDemand, 0);
});

test('Doppelter Jahresertrag erhöht die nutzbare PV-Leistung je Ladevorgang', () => {
  const small = calc({ wallboxesEnabled: 1, evPvSurplus: 0, pvYield: 8000 });
  const large = calc({ wallboxesEnabled: 1, evPvSurplus: 0, pvYield: 16000 });
  equal(small.evDemand, large.evDemand);
  equal(large.months[5].pv, 2 * small.months[5].pv);
  for (let i = 0; i < 12; i++) {
    assert.ok(large.months[i].pvEv >= small.months[i].pvEv);
    assert.ok(large.months[i].grid <= small.months[i].grid);
  }
  const juneGain = large.months[5].pvEv - small.months[5].pvEv;
  const decemberGain = large.months[11].pvEv - small.months[11].pvEv;
  assert.ok(decemberGain > 0 && juneGain > decemberGain);
  assert.ok(large.improvement > small.improvement);
});

test('PV-Erzeugung am Tag lässt sich nicht pauschal auf abendliche Ladeenergie anrechnen', () => {
  const options = { wallboxesEnabled: 1, consumptionPerApartment: 0, pvYield: 16000 };
  const evening = calc({ ...options, evDayShare: 0 });
  const daytime = calc({ ...options, evDayShare: 100 });
  assert.ok(evening.months[11].pv > 0);
  equal(evening.months[11].pvEv, 0);
  equal(evening.months[11].gridEv, evening.months[11].ev);
  assert.ok(daytime.months[11].pvEv > 0);
  assert.ok(daytime.pvEv > evening.pvEv);
  equal(daytime.evDemand, evening.evDemand);
});

test('Ladeleistung verändert die PV-Nutzung bei gleichem Ladebedarf', () => {
  const fast = calc({ wallboxesEnabled: 1, evPvSurplus: 0, evChargePower: 11 });
  const slow = calc({ wallboxesEnabled: 1, evPvSurplus: 0, evChargePower: 3.7 });
  equal(fast.evDemand, slow.evDemand);
  assert.ok(slow.pvEv > fast.pvEv);
  assert.ok(slow.improvement > fast.improvement);
});

test('Überschussladen senkt die Sommer-Einspeisung bei unverändertem Verbrauch', () => {
  const baseline = calc({});
  const direct = calc({ wallboxesEnabled: 1, evPvSurplus: 0 });
  const solar = calc({ wallboxesEnabled: 1 });
  const summerExport = r => r.months.slice(5, 8).reduce((total, month) => total + month.exported, 0);
  equal(solar.evDemand, direct.evDemand);
  equal(solar.pvHousehold, baseline.pvHousehold);
  equal(baseline.exportedSolar - solar.exportedSolar, solar.pvEv);
  assert.ok(summerExport(solar) < summerExport(baseline) * 0.7);
  assert.ok(summerExport(solar) < summerExport(direct));
  for (let i = 0; i < 12; i++) {
    equal(solar.months[i].exportWithoutEv, baseline.months[i].exported);
  }
});

test('Mindestladeleistung und verfügbare Tagesladung begrenzen die PV-Nutzung', () => {
  const solar = calc({ wallboxesEnabled: 1 });
  const threePhase = calc({ wallboxesEnabled: 1, evMinChargePower: 4.1 });
  const allDaytime = calc({ wallboxesEnabled: 1, evDayShare: 100 });
  equal(threePhase.evDemand, solar.evDemand);
  equal(allDaytime.evDemand, solar.evDemand);
  assert.ok(threePhase.pvEv < solar.pvEv);
  assert.ok(allDaytime.months[5].exported < solar.months[5].exported);
});

test('Gleichzeitigkeitsfaktor begrenzt Direktladen und Überschussladen bei gleichem Energiebedarf', () => {
  for (const evPvSurplus of [0, 1]) {
    const typical = calc({ wallboxesEnabled: 1, evPvSurplus });
    const reduced = calc({ wallboxesEnabled: 1, evPvSurplus, evSimultaneity: 25 });
    const unrestricted = calc({ wallboxesEnabled: 1, evPvSurplus, evSimultaneity: 100 });
    equal(typical.evPowerLimit, 22);
    equal(reduced.evPowerLimit, 11);
    equal(unrestricted.evPowerLimit, 44);
    equal(reduced.evDemand, 8000);
    equal(reduced.evDemand, typical.evDemand);
    equal(reduced.evPeakPower, 11);
    assert.ok(reduced.evPeakPower < unrestricted.evPeakPower);
    for (const result of [typical, reduced, unrestricted]) {
      for (const month of result.months) {
        assert.ok(month.evPeakPower <= result.evPowerLimit + 1e-8);
        equal(month.pvEv + month.gridEv, month.ev);
      }
    }
  }
});

test('Ein Ladepunkt kann seine volle Leistung nutzen und zu kleine Gruppenlimits werden erkannt', () => {
  const single = calc({ wallboxesEnabled: 1, apartments: 1, evSimultaneity: 25 });
  equal(single.evPowerLimit, 11);
  equal(single.evDemand, 2000);
  for (const evPvSurplus of [0, 1]) {
    assert.throws(() => calc({
      wallboxesEnabled: 1, evPvSurplus, evSimultaneity: 25, annualMileage: 100000
    }), /evGroupWindow/);
  }
});

test('eHive One nutzt PV vor günstigen Netzstunden und hält die Leistungsgrenzen ein', () => {
  const options = { wallboxesEnabled: 1, evOneOptimized: 1 };
  const noPv = calc({ ...options, pvYield: 0 });
  const withPv = calc(options);
  const morePv = calc({ ...options, pvYield: 16000 });
  equal(noPv.pvEv, 0);
  equal(noPv.gridEv, 8000);
  assert.ok(noPv.evCheapGrid > 0);
  assert.ok(morePv.pvEv > withPv.pvEv && withPv.pvEv > 0);
  assert.ok(morePv.evCheapGrid < withPv.evCheapGrid);
  equal(withPv.pvHousehold, calc({}).pvHousehold);
  const plannedShare = (withPv.pvEv + withPv.evCheapGrid) / withPv.evDemand;
  assert.ok(plannedShare > 0.90 && plannedShare < 1);
  const limited = calc({ ...options, evSimultaneity: 25 });
  assert.ok((limited.pvEv + limited.evCheapGrid) / limited.evDemand < 0.90);
  for (const result of [noPv, withPv, morePv, limited]) {
    equal(result.evDemand, 8000);
    assert.ok(result.evPeakPower <= result.evPowerLimit + 1e-8);
    for (const month of result.months) {
      assert.ok(month.evCheapGrid >= 0 && month.evCheapGrid <= month.gridEv + 1e-8);
      equal(month.ev, month.pvEv + month.gridEv);
      equal(month.pv, month.pvHousehold + month.pvEv + month.exported);
    }
  }
});

test('Der günstigere Netzpreis wird nur auf Netzladestrom im günstigen Fenster angewendet', () => {
  const options = { wallboxesEnabled: 1, evOneOptimized: 1 };
  const result = calc(options);
  const lower = calc({ ...options, evCheapGridPrice: 12 });
  equal(result.evCheapGridSavings, result.evCheapGrid * 0.10);
  equal(lower.evCheapGridSavings, lower.evCheapGrid * 0.20);
  equal(lower.improvement, result.improvement);
  const off = calc({ ...options, wallboxesEnabled: 0 });
  equal(off.evCheapGrid, 0);
  equal(off.evCheapGridSavings, 0);
  assert.equal(off.oneOptimized, false);
  assert.throws(() => calc({ ...options, evCheapGridPrice: 35 }), /evGridPrices/);
});

test('PV-Größencheck skaliert den Jahresbedarf mit der Zahl der Teilnehmenden', () => {
  const four = calc({ wallboxesEnabled: 1, evOneOptimized: 1 });
  const eight = calc({ wallboxesEnabled: 1, evOneOptimized: 1, apartments: 8 });
  equal(four.demand, 15600);
  equal(four.pvEstimatedKwp, 8000 / 1089.57);
  equal(four.pvAnnualBalanceKwp, 15600 / 1089.57);
  equal(eight.pvAnnualBalanceKwp, 2 * four.pvAnnualBalanceKwp);
  equal(eight.pvEstimatedKwp, four.pvEstimatedKwp);
  assert.ok(eight.pvEv / eight.evDemand < four.pvEv / four.evDemand);
});

test('Unzulässige Eingaben und Ladebedarf außerhalb des Zeitfensters werden erkannt', () => {
  for (const input of [
    { salePrice: NaN }, { apartments: 1.5 }, { additionalInvestment: -1 },
    { pvYield: Infinity }, { householdDayShare: 101 }, { apartments: 1001 },
    { salePrice: '' }, { homeCharging: 101 }, { evDayShare: 101 },
    { wallboxesEnabled: 2 }, { annualMileage: -1 }, { evChargePower: 0 }, { evChargePower: 23 },
    { evPvSurplus: 2 }, { evSimultaneity: 0 }, { evSimultaneity: 101 }, { evOneOptimized: 2 }
  ]) {
    assert.throws(() => calc(input), RangeError);
  }
  assert.throws(() => calc({ wallboxesEnabled: 1, evMinChargePower: 12 }), /evMinChargePower/);
  assert.throws(() => calc({ wallboxesEnabled: 1, annualMileage: 1000000, evChargePower: 2 }), /evChargingWindow/);
});

test('Energiebilanz schließt für beide Lasten und Erzeugung in jedem Monat', () => {
  for (const pvYield of [0, 1000, 8000, 100000]) {
    for (const apartments of [0, 1, 4, 20]) {
      for (const [householdDayShare, evDayShare, evChargePower] of [[0, 0, 3.7], [50, 50, 11], [100, 100, 22]]) {
        const result = calc({ pvYield, apartments, householdDayShare, evDayShare, evChargePower, wallboxesEnabled: 1 });
        assert.equal(result.months.length, 12);
        for (const month of result.months) {
          for (const field of ['pv', 'pvHousehold', 'pvEv', 'exported', 'gridHousehold', 'gridEv']) {
            assert.ok(month[field] >= 0);
          }
          equal(month.pv, month.pvHousehold + month.pvEv + month.exported);
          equal(month.household, month.pvHousehold + month.gridHousehold);
          equal(month.ev, month.pvEv + month.gridEv);
        }
        equal(sumMonths(result, 'pv'), pvYield);
        equal(sumMonths(result, 'household'), result.householdDemand);
        equal(sumMonths(result, 'ev'), result.evDemand);
        equal(result.soldSolar + result.exportedSolar, pvYield);
        equal(result.soldSolar + result.grid, result.demand);
        equal(result.solarPerApartment * apartments, result.soldSolar);
        equal(result.improvement, result.rentalSurplus - result.baseSurplus);
      }
    }
  }
});
