(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.eHiveDaySimulation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SLOT_HOURS = 0.25;
  const SLOT_COUNT = 96;
  const spotProfile = [.38,.24,.08,0,.04,.14,.31,.56,.72,.63,.51,.43,.32,.18,.22,.39,.61,.9,1,.88,.72,.58,.47,.4];
  const homeProfile = [.72,.64,.6,.58,.58,.66,.9,1.28,1.2,.9,.8,.76,.78,.8,.86,.96,1.18,1.52,1.65,1.48,1.25,1.06,.9,.8];
  const monthProfiles = [
    { pv: .18, sunrise: 8.2, sunset: 16.5, heat: 1.15 },
    { pv: .3, sunrise: 7.5, sunset: 17.5, heat: 1.1 },
    { pv: .52, sunrise: 6.5, sunset: 18.5, heat: 1 },
    { pv: .72, sunrise: 5.8, sunset: 20.2, heat: .82 },
    { pv: .9, sunrise: 5.1, sunset: 21, heat: .62 },
    { pv: 1, sunrise: 4.8, sunset: 21.4, heat: .5 },
    { pv: .95, sunrise: 5, sunset: 21.2, heat: .48 },
    { pv: .82, sunrise: 5.7, sunset: 20.4, heat: .55 },
    { pv: .62, sunrise: 6.5, sunset: 19.2, heat: .72 },
    { pv: .4, sunrise: 7.3, sunset: 18.1, heat: .9 },
    { pv: .23, sunrise: 8, sunset: 16.6, heat: 1.05 },
    { pv: .15, sunrise: 8.3, sunset: 16.2, heat: 1.18 }
  ];
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value)));
  const hourInWindow = (hour, from, to) => hour >= from && hour < to;

  function normalizeHour(hour) {
    return ((finite(hour) % 24) + 24) % 24;
  }

  function departureOffset(startHour, departureHour) {
    let offset = normalizeHour(departureHour) - normalizeHour(startHour);
    if (offset <= 0) offset += 24;
    return offset;
  }

  function priceAt(hour, tariff, normalPrice, cheapPrice) {
    if (tariff === "dynamic") {
      const factor = spotProfile[Math.floor(normalizeHour(hour))];
      return cheapPrice + (normalPrice - cheapPrice) * factor;
    }
    if (tariff === "fixed" && (
      hourInWindow(hour, 2, 5)
      || hourInWindow(hour, 12, 13)
      || hourInWindow(hour, 16, 17)
    )) return cheapPrice;
    return normalPrice;
  }

  function pvAt(hour, kwp, weather, month) {
    const normalized = normalizeHour(hour);
    const profile = month ? monthProfiles[month - 1] : null;
    const sunrise = profile?.sunrise ?? 7;
    const sunset = profile?.sunset ?? 18;
    if (normalized < sunrise || normalized >= sunset || kwp <= 0) return 0;
    const yieldFactor = profile?.pv ?? ({ sunny: 1, mixed: 0.58, cloudy: 0.22 }[weather] || 0.58);
    return Math.max(0, kwp * 0.82 * yieldFactor * Math.sin((normalized - sunrise) / (sunset - sunrise) * Math.PI));
  }

  function temperatureFactor(celsius) {
    const points = [[-15,2.15],[-10,1.9],[-5,1.55],[0,1.2],[5,.85],[10,.55],[15,.3],[20,.15]];
    const value = clamp(celsius, -15, 20);
    for (let index = 1; index < points.length; index += 1) {
      const [x1, y1] = points[index - 1];
      const [x2, y2] = points[index];
      if (value <= x2) return y1 + (y2 - y1) * (value - x1) / (x2 - x1);
    }
    return .15;
  }

  function selectHeatPumpSlots({ count, prices, pv, startHour }) {
    if (count <= 0) return new Set();
    const selected = new Set();
    const blocks = 12;
    for (let block = 0; block < blocks && selected.size < count; block += 1) {
      const candidates = [];
      for (let slot = block * 8; slot < Math.min((block + 1) * 8, SLOT_COUNT); slot += 1) {
        const hour = normalizeHour(startHour + slot * SLOT_HOURS);
        const nightPenalty = hour >= 22 || hour < 6 ? 1.5 : 0;
        candidates.push({ slot, score: prices[slot] - pv[slot] * 3 + nightPenalty });
      }
      candidates.sort((a, b) => a.score - b.score || a.slot - b.slot);
      if (candidates[0]) selected.add(candidates[0].slot);
    }
    const remaining = Array.from({ length: SLOT_COUNT }, (_, slot) => ({ slot, score: prices[slot] - pv[slot] * 3 }))
      .filter(item => !selected.has(item.slot))
      .sort((a, b) => a.score - b.score || a.slot - b.slot);
    for (const item of remaining) {
      if (selected.size >= count) break;
      selected.add(item.slot);
    }
    return selected;
  }

  function simulate(options = {}) {
    const startHour = normalizeHour(options.startHour ?? 18);
    const departureHour = normalizeHour(options.departureHour ?? 7);
    const deadline = Math.max(1, Math.min(SLOT_COUNT, Math.ceil(departureOffset(startHour, departureHour) / SLOT_HOURS)));
    const normalPrice = Math.max(0, finite(options.normalPrice ?? 35));
    const cheapPrice = Math.max(0, finite(options.cheapPrice ?? 24));
    const tariff = ["normal", "fixed", "dynamic"].includes(options.tariff) ? options.tariff : "fixed";
    const month = Number.isFinite(Number(options.month)) ? Math.round(clamp(options.month, 1, 12)) : null;
    const seasonalProfile = month ? monthProfiles[month - 1] : null;
    const prices = [];
    const pv = [];
    const home = [];
    const averageHomePower = Math.max(0, finite(options.familyAnnualKwh ?? 3500)) / 8760;
    const homeAverageFactor = homeProfile.reduce((sum, value) => sum + value, 0) / homeProfile.length;

    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const hour = normalizeHour(startHour + slot * SLOT_HOURS);
      prices.push(priceAt(hour, tariff, normalPrice, cheapPrice));
      pv.push(options.pvEnabled === false ? 0 : pvAt(hour, Math.max(0, finite(options.pvKwp ?? 8)), options.weather || "mixed", month));
      home.push(averageHomePower * homeProfile[Math.floor(hour)] / homeAverageFactor);
    }

    const heatPump = Array(SLOT_COUNT).fill(0);
    let heatPumpEnergyKwh = 0;
    if (options.heatPumpEnabled !== false) {
      heatPumpEnergyKwh = Math.max(0, finite(options.heatPumpAnnualKwh ?? 4000)) / 365
        * temperatureFactor(options.outdoorTemperature ?? 0)
        * (seasonalProfile?.heat ?? 1);
      const heatPumpPower = Math.max(.5, finite(options.heatPumpPowerKw ?? 2.5));
      const heatSlots = Math.min(SLOT_COUNT, Math.ceil(heatPumpEnergyKwh / (heatPumpPower * SLOT_HOURS)));
      const selected = selectHeatPumpSlots({ count: heatSlots, prices, pv, startHour });
      selected.forEach(slot => { heatPump[slot] = heatPumpPower; });
    }

    const car = Array(SLOT_COUNT).fill(0);
    const carKmRequested = options.carEnabled === false ? 0 : Math.max(0, finite(options.carKm ?? 120));
    const carConsumption = Math.max(1, finite(options.carKwhPer100Km ?? 20));
    const carEfficiency = clamp(options.carEfficiency ?? .9, .5, 1);
    const carPower = Math.max(1.4, finite(options.carPowerKw ?? 11));
    let carEnergyRemaining = carKmRequested * carConsumption / 100;
    const carCandidates = Array.from({ length: deadline }, (_, slot) => {
      const availablePv = Math.max(0, pv[slot] - home[slot] - heatPump[slot]);
      return { slot, score: prices[slot] - Math.min(carPower, availablePv) * 4 };
    }).sort((a, b) => a.score - b.score || a.slot - b.slot);
    for (const candidate of carCandidates) {
      if (carEnergyRemaining <= .00001) break;
      const deliveredAtFullPower = carPower * SLOT_HOURS * carEfficiency;
      const delivered = Math.min(deliveredAtFullPower, carEnergyRemaining);
      car[candidate.slot] = delivered / carEfficiency / SLOT_HOURS;
      carEnergyRemaining -= delivered;
    }

    const capacity = options.batteryEnabled === false ? 0 : Math.max(0, finite(options.batteryCapacityKwh ?? 10));
    const minSoc = 20;
    const maxSoc = 90;
    const initialSoc = capacity > 0 ? clamp(options.initialSoc ?? 30, minSoc, maxSoc) : 0;
    const batteryPower = Math.max(.5, finite(options.batteryPowerKw ?? 5));
    const batteryEfficiency = clamp(options.batteryEfficiency ?? .9, .5, 1);
    const chargeEfficiency = Math.sqrt(batteryEfficiency);
    const dischargeEfficiency = Math.sqrt(batteryEfficiency);
    const minEnergy = capacity * minSoc / 100;
    const maxEnergy = capacity * maxSoc / 100;
    let batteryEnergy = capacity * initialSoc / 100;
    const totalLoad = home.map((value, slot) => value + heatPump[slot] + car[slot]);
    const expectedPvSurplus = pv.reduce((sum, value, slot) => sum + Math.max(0, value - totalLoad[slot]) * SLOT_HOURS, 0);
    const firstPvSlot = pv.findIndex(value => value > .2);
    const pvHeadroomSoc = capacity > 0 ? maxSoc - Math.min(maxEnergy - minEnergy, expectedPvSurplus * chargeEfficiency) / capacity * 100 : 0;
    const gridTargetSoc = capacity > 0 ? clamp(pvHeadroomSoc, minSoc, maxSoc) : 0;
    const gridChargeAllowed = Boolean(options.gridChargeAllowed && capacity > 0 && tariff !== "normal");

    const slots = [];
    let totalCost = 0;
    let gridEnergy = 0;
    let pvUsedEnergy = 0;
    let pvExportEnergy = 0;
    let gridChargeEnergy = 0;
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const load = totalLoad[slot];
      const directPv = Math.min(load, pv[slot]);
      let surplus = Math.max(0, pv[slot] - directPv);
      let deficit = Math.max(0, load - directPv);
      let batteryPvCharge = 0;
      let batteryGridCharge = 0;
      let batteryDischarge = 0;
      let gridImport = 0;

      if (capacity > 0 && surplus > 0 && batteryEnergy < maxEnergy) {
        batteryPvCharge = Math.min(surplus, batteryPower, (maxEnergy - batteryEnergy) / chargeEfficiency / SLOT_HOURS);
        batteryEnergy += batteryPvCharge * SLOT_HOURS * chargeEfficiency;
        surplus -= batteryPvCharge;
      }

      const cheapSlot = prices[slot] < normalPrice - .5;
      if (capacity > 0 && gridChargeAllowed && cheapSlot && batteryEnergy < capacity * gridTargetSoc / 100) {
        batteryGridCharge = Math.min(batteryPower, (capacity * gridTargetSoc / 100 - batteryEnergy) / chargeEfficiency / SLOT_HOURS);
        batteryEnergy += batteryGridCharge * SLOT_HOURS * chargeEfficiency;
        gridImport += batteryGridCharge;
        gridChargeEnergy += batteryGridCharge * SLOT_HOURS;
      }

      if (capacity > 0 && deficit > 0 && !cheapSlot && batteryEnergy > minEnergy) {
        batteryDischarge = Math.min(deficit, batteryPower, (batteryEnergy - minEnergy) * dischargeEfficiency / SLOT_HOURS);
        batteryEnergy -= batteryDischarge * SLOT_HOURS / dischargeEfficiency;
        deficit -= batteryDischarge;
      }
      gridImport += deficit;

      const slotGridEnergy = gridImport * SLOT_HOURS;
      gridEnergy += slotGridEnergy;
      totalCost += slotGridEnergy * prices[slot] / 100;
      pvUsedEnergy += (directPv + batteryPvCharge) * SLOT_HOURS;
      pvExportEnergy += surplus * SLOT_HOURS;
      slots.push({
        index: slot,
        hour: normalizeHour(startHour + slot * SLOT_HOURS),
        price: prices[slot],
        pvKw: pv[slot],
        homeKw: home[slot],
        carKw: car[slot],
        heatPumpKw: heatPump[slot],
        batteryPvChargeKw: batteryPvCharge,
        batteryGridChargeKw: batteryGridCharge,
        batteryDischargeKw: batteryDischarge,
        gridKw: gridImport,
        exportKw: surplus,
        soc: capacity > 0 ? batteryEnergy / capacity * 100 : 0
      });
    }

    const carEnergyDelivered = car.reduce((sum, power) => sum + power * SLOT_HOURS * carEfficiency, 0);
    const carExpensiveEnergyKwh = car.reduce((sum, power, slot) => (
      prices[slot] >= normalPrice - .5 ? sum + power * SLOT_HOURS * carEfficiency : sum
    ), 0);
    const carKmDelivered = carConsumption > 0 ? carEnergyDelivered / carConsumption * 100 : 0;
    const socBeforePv = firstPvSlot > 0 && capacity > 0 ? slots[firstPvSlot - 1].soc : initialSoc;
    return {
      slots,
      deadline,
      carEnabled: options.carEnabled !== false,
      heatPumpEnabled: options.heatPumpEnabled !== false,
      batteryEnabled: options.batteryEnabled !== false && capacity > 0,
      carKmRequested,
      carKmDelivered,
      carTargetReached: carKmDelivered + .05 >= carKmRequested,
      carExpensiveEnergyKwh,
      heatPumpEnergyKwh: heatPump.reduce((sum, power) => sum + power * SLOT_HOURS, 0),
      heatPumpRequiredKwh: heatPumpEnergyKwh,
      totalCost,
      gridEnergy,
      pvUsedEnergy,
      pvExportEnergy,
      gridChargeEnergy,
      initialSoc,
      finalSoc: slots.at(-1)?.soc || initialSoc,
      socBeforePv,
      gridTargetSoc,
      firstPvSlot,
      month,
      assumptions: { minSoc, maxSoc, carConsumption, carEfficiency, batteryEfficiency }
    };
  }

  return { simulate, temperatureFactor, departureOffset, SLOT_COUNT, SLOT_HOURS };
});
