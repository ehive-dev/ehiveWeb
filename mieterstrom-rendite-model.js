(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./mieterstrom-pv-profil.js"));
  } else {
    root.EHiveMieterstromReturn = factory(root.EHiveMieterstromPvProfile);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (pvProfile) {
  "use strict";
  const defaults = Object.freeze({
    additionalInvestment: 2000, apartments: 4,
    consumptionPerApartment: 1900, pvYield: 8000, householdDayShare: 50,
    salePrice: 28, feedInPrice: 8,
    wallboxesEnabled: 0, annualMileage: 10000, evConsumption: 20, homeCharging: 100,
    evDayShare: 50, evChargePower: 11, evSimultaneity: 50, evPvSurplus: 1, evMinChargePower: 1.4,
    evOneOptimized: 0, evStandardGridPrice: 32, evCheapGridPrice: 22,
    annualPvCosts: 200, additionalAnnualCosts: 200
  });
  const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const householdMonthShares = [10, 9, 9, 8, 8, 7, 7, 7, 8, 9, 9, 9];
  const householdHourWeights = [2, 2, 2, 2, 2, 3, 6, 10, 8, 7, 6, 7, 9, 8, 7, 7, 8, 10, 13, 14, 12, 9, 6, 3];
  const dayWindow = { start: 8, end: 18, firstStart: 9, lastStart: 14 };
  const eveningWindow = { start: 18, end: 24, firstStart: 18, lastStart: 21 };
  const slotsPerHour = 4;
  const slotsPerDay = 24 * slotsPerHour;
  const slotHours = 1 / slotsPerHour;
  const oneFixedShare = 0.1;
  const sum = values => values.reduce((total, value) => total + value, 0);
  const referenceYield = sum(pvProfile);
  const referenceKwhPerKwp = referenceYield / 1000;
  const dayWeight = sum(householdHourWeights.slice(dayWindow.start, dayWindow.end));
  const outsideDayWeight = sum(householdHourWeights) - dayWeight;

  function householdProfile(dayShare) {
    return householdHourWeights.map((weight, hour) => {
      const daytime = hour >= dayWindow.start && hour < dayWindow.end;
      return daytime ? weight / dayWeight * dayShare : weight / outsideDayWeight * (1 - dayShare);
    });
  }

  function planChargingSessions(load, month, days, vehicles, energyPerVehicle, power, share, window,
    connectedCars, fixedShare = connectedCars ? 0 : 1) {
    if (energyPerVehicle === 0 || share === 0) return 0;
    const hoursNeeded = energyPerVehicle * share / power;
    const windowHours = window.end - window.start;
    if (hoursNeeded > days * windowHours + 1e-9) throw new RangeError("evChargingWindow");
    // About two charge sessions per week per vehicle, split by the day share.
    // Increase the frequency if the chosen power requires longer sessions.
    const sessions = Math.min(days, Math.max(1, Math.round(days * 2 / 7 * share), Math.ceil(hoursNeeded / windowHours)));
    const duration = Math.min(hoursNeeded / sessions, windowHours);
    const firstStart = Math.min(window.firstStart, window.end - duration);
    const lastStart = Math.min(window.lastStart, window.end - duration);
    for (let vehicle = 0; vehicle < vehicles; vehicle++) {
      // Deterministic offsets allow both different and overlapping charge sessions.
      const dayOffset = ((vehicle * 17 + month * 13 + window.start * 7) % 37) / 37;
      for (let session = 0; session < sessions; session++) {
        const day = Math.floor((session + dayOffset) * days / sessions);
        if (connectedCars) connectedCars[day]++;
        if (fixedShare === 0) continue;
        const startFraction = ((vehicle * 13 + session * 7 + month * 11) % 17) / 16;
        const hour = firstStart + (lastStart - firstStart) * startFraction;
        const start = day * slotsPerDay + hour * slotsPerHour;
        const end = Math.min(day * slotsPerDay + window.end * slotsPerHour, start + duration * fixedShare * slotsPerHour);
        for (let slot = Math.floor(start); slot < end; slot++) {
          const fraction = Math.min(slot + 1, end) - Math.max(slot, start);
          load[slot] += power * slotHours * fraction;
        }
      }
    }
    return duration * power;
  }

  function distributeDirectLoad(load, days, window, groupEnergy) {
    for (let day = 0; day < days; day++) {
      const start = day * slotsPerDay + window.start * slotsPerHour;
      const end = day * slotsPerDay + window.end * slotsPerHour;
      let pending = 0;
      for (let slot = start; slot < end; slot++) {
        const requested = load[slot] + pending;
        load[slot] = Math.min(requested, groupEnergy);
        pending = requested - load[slot];
      }
      // Use capacity earlier in the same window when delaying alone is insufficient.
      for (let slot = end - 1; slot >= start && pending > 1e-9; slot--) {
        const moved = Math.min(pending, groupEnergy - load[slot]);
        load[slot] += moved;
        pending -= moved;
      }
      if (pending > 1e-9) throw new RangeError("evGroupWindow");
    }
  }

  function chargeWithSurplus(remaining, delivered, surplus, minEnergy, maxEnergy, groupEnergy, slotsLeft) {
    let charged = 0;
    let requiredFromGroup = -groupEnergy * slotsLeft;
    for (let car = 0; car < remaining.length; car++) {
      const neededNow = Math.max(0, remaining[car] - maxEnergy * slotsLeft);
      delivered[car] = neededNow;
      charged += neededNow;
      requiredFromGroup += remaining[car];
    }

    // Reserve the energy required by each departure, then allocate surplus
    // and any remaining energy required to meet the group's deadline.
    for (let car = 0; car < remaining.length; car++) {
      const room = Math.max(0, Math.min(maxEnergy - delivered[car], groupEnergy - charged));
      const availableSolar = Math.min(room, Math.max(0, surplus - charged));
      const solar = availableSolar + delivered[car] >= minEnergy ? availableSolar : 0;
      const groupNeed = Math.max(0, Math.min(room, requiredFromGroup - charged));
      const extra = Math.min(remaining[car] - delivered[car], Math.max(solar, groupNeed));
      remaining[car] -= delivered[car] + extra;
      charged += extra;
    }
    return charged;
  }

  function isCheapHour(hour) {
    return (hour >= 12 && hour < 14) || (hour >= 21 && hour < 24);
  }

  function fillChargingSlots(load, start, end, pending, limit, available) {
    for (let slot = start; slot < end && pending > 1e-9; slot++) {
      const room = Math.max(0, limit - load[slot]);
      const added = Math.min(pending, room, available(slot));
      load[slot] += added;
      pending -= added;
    }
    return pending;
  }

  function optimizeCharging(load, connected, window, sessionEnergy, solarSurplus, limits) {
    for (let day = 0; day < connected.length; day++) {
      const cars = connected[day];
      if (cars === 0) continue;
      const start = day * slotsPerDay + window.start * slotsPerHour;
      const end = day * slotsPerDay + window.end * slotsPerHour;
      const limit = Math.min(limits.group, cars * limits.vehicle);
      const target = cars * sessionEnergy;
      if (target > limit * (end - start) + 1e-9) throw new RangeError("evGroupWindow");
      let pending = target;
      for (let slot = start; slot < end; slot++) pending -= load[slot];

      // Fill the whole availability window in order of preference. Cheap grid
      // power cannot use energy reserved for solar in a later quarter-hour.
      pending = fillChargingSlots(load, start, end, pending, limit, slot => {
        const pv = Math.min(limit, solarSurplus[Math.floor(slot / slotsPerHour)]);
        return pv >= limits.start ? Math.max(0, pv - load[slot]) : 0;
      });
      pending = fillChargingSlots(load, start, end, pending, limit,
        slot => isCheapHour(Math.floor(slot / slotsPerHour) % 24) ? limit : 0);
      pending = fillChargingSlots(load, start, end, pending, limit, () => limit);
      if (pending > 1e-9) throw new RangeError("evGroupWindow");
    }
  }

  function calculate(input) {
    const p = {};
    for (const key of Object.keys(defaults)) {
      const value = input[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new RangeError(key);
      p[key] = value;
    }
    if (!Number.isInteger(p.apartments) || p.apartments > 1000) throw new RangeError("apartments");
    for (const key of ["householdDayShare", "homeCharging", "evDayShare"]) {
      if (p[key] > 100) throw new RangeError(key);
    }
    if (p.evChargePower < 1 || p.evChargePower > 22) throw new RangeError("evChargePower");
    if (p.evSimultaneity < 1 || p.evSimultaneity > 100) throw new RangeError("evSimultaneity");
    for (const key of ["wallboxesEnabled", "evPvSurplus", "evOneOptimized"]) {
      if (p[key] !== 0 && p[key] !== 1) throw new RangeError(key);
    }
    const householdDemand = p.apartments * p.consumptionPerApartment;
    const evPerVehicle = p.wallboxesEnabled ? p.annualMileage * p.evConsumption / 100 * p.homeCharging / 100 : 0;
    const evDemand = p.apartments * evPerVehicle;
    const demand = householdDemand + evDemand;
    const oneOptimized = evDemand > 0 && p.evOneOptimized === 1;
    const surplusCharging = evDemand > 0 && p.evPvSurplus === 1 && !oneOptimized;
    const prioritizeHousehold = oneOptimized || surplusCharging;
    if (prioritizeHousehold && (p.evMinChargePower < 1.4 || p.evMinChargePower > p.evChargePower)) {
      throw new RangeError("evMinChargePower");
    }
    if (oneOptimized && (p.evCheapGridPrice > p.evStandardGridPrice || p.evStandardGridPrice > 200)) {
      throw new RangeError("evGridPrices");
    }
    const minChargingEnergy = p.evMinChargePower * slotHours;
    const maxChargingEnergy = p.evChargePower * slotHours;
    const evPowerLimit = p.wallboxesEnabled && p.apartments > 0
      ? Math.max(p.evChargePower, p.apartments * p.evChargePower * p.evSimultaneity / 100)
      : 0;
    const groupChargingEnergy = evPowerLimit * slotHours;
    const pvScale = p.pvYield / referenceYield;
    const housing = householdProfile(p.householdDayShare / 100);
    let profileHour = 0;
    const months = monthNames.map((name, i) => {
      const days = daysPerMonth[i];
      const household = householdDemand * householdMonthShares[i] / 100;
      const householdPerDay = household / days;
      const ev = evDemand * days / 365;
      const charging = new Float64Array(days * slotsPerDay);
      const connected = prioritizeHousehold ? new Uint16Array(days) : null;
      let daytimeEnergy = 0;
      if (ev > 0) {
        const energyPerVehicle = ev / p.apartments;
        const dayShare = p.evDayShare / 100;
        const eveningConnected = oneOptimized ? new Uint16Array(days) : null;
        daytimeEnergy = planChargingSessions(charging, i, days, p.apartments, energyPerVehicle, p.evChargePower, dayShare,
          dayWindow, connected, oneOptimized ? oneFixedShare : undefined);
        const eveningEnergy = planChargingSessions(charging, i, days, p.apartments, energyPerVehicle, p.evChargePower, 1 - dayShare,
          eveningWindow, eveningConnected, oneOptimized ? oneFixedShare : undefined);
        if (surplusCharging) {
          const dayCapacity = evPowerLimit * (dayWindow.end - dayWindow.start);
          if (connected.some(cars => cars * daytimeEnergy > dayCapacity + 1e-9)) {
            throw new RangeError("evGroupWindow");
          }
        } else {
          distributeDirectLoad(charging, days, dayWindow, groupChargingEnergy);
        }
        distributeDirectLoad(charging, days, eveningWindow, groupChargingEnergy);
        if (oneOptimized) {
          const solarSurplus = new Float64Array(days * 24);
          for (let hour = 0; hour < solarSurplus.length; hour++) {
            const solar = pvProfile[profileHour + hour] * pvScale;
            const house = householdPerDay * housing[hour % 24];
            solarSurplus[hour] = Math.max(0, solar - house) * slotHours;
          }
          const limits = { group: groupChargingEnergy, vehicle: maxChargingEnergy, start: minChargingEnergy };
          optimizeCharging(charging, connected, dayWindow, daytimeEnergy, solarSurplus, limits);
          optimizeCharging(charging, eveningConnected, eveningWindow, eveningEnergy, solarSurplus, limits);
        }
      }
      let pv = 0;
      let pvHousehold = 0;
      let pvEv = 0;
      let householdOnlyPv = 0;
      let remaining = null;
      let delivered = null;
      let peakCharge = 0;
      let evCheapGrid = 0;
      for (let hour = 0; hour < days * 24; hour++) {
        // One PVGIS hourly average divided into four quarter-hours of equal power.
        const pvSlot = pvProfile[profileHour++] * pvScale * slotHours;
        pv += pvSlot * slotsPerHour;
        const clockHour = hour % 24;
        const householdSlot = householdPerDay * housing[clockHour] * slotHours;
        const solarForHome = Math.min(pvSlot, householdSlot);
        const surplus = pvSlot - solarForHome;
        householdOnlyPv += solarForHome * slotsPerHour;
        if (surplusCharging && clockHour === dayWindow.start) {
          remaining = new Float64Array(connected[Math.floor(hour / 24)]).fill(daytimeEnergy);
          delivered = new Float64Array(remaining.length);
        }
        if (clockHour === dayWindow.end) remaining = null;
        for (let quarter = 0; quarter < slotsPerHour; quarter++) {
          let evSlot = charging[hour * slotsPerHour + quarter];
          if (remaining && remaining.length > 0) {
            const slotsLeft = (dayWindow.end - clockHour) * slotsPerHour - quarter - 1;
            evSlot += chargeWithSurplus(remaining, delivered, surplus, minChargingEnergy, maxChargingEnergy, groupChargingEnergy, slotsLeft);
          }
          peakCharge = Math.max(peakCharge, evSlot);
          if (prioritizeHousehold) {
            pvHousehold += solarForHome;
            const solarForEv = Math.min(surplus, evSlot);
            pvEv += solarForEv;
            if (oneOptimized && isCheapHour(clockHour)) evCheapGrid += evSlot - solarForEv;
          } else {
            const need = householdSlot + evSlot;
            const localShare = need > 0 ? Math.min(1, pvSlot / need) : 0;
            pvHousehold += householdSlot * localShare;
            pvEv += evSlot * localShare;
          }
        }
      }
      const exported = Math.max(0, pv - pvHousehold - pvEv);
      const gridHousehold = Math.max(0, household - pvHousehold);
      const gridEv = Math.max(0, ev - pvEv);
      return { name, pv, household, ev, pvHousehold, pvEv, exported, gridHousehold, gridEv,
        grid: gridHousehold + gridEv, exportWithoutEv: Math.max(0, pv - householdOnlyPv),
        evPeakPower: peakCharge / slotHours, evCheapGrid };
    });
    const sumMonths = key => months.reduce((total, month) => total + month[key], 0);
    const pvHousehold = sumMonths("pvHousehold");
    const pvEv = sumMonths("pvEv");
    const gridHousehold = sumMonths("gridHousehold");
    const gridEv = sumMonths("gridEv");
    const grid = gridHousehold + gridEv;
    const soldSolar = pvHousehold + pvEv;
    const exportedSolar = sumMonths("exported");
    const fullRevenue = p.pvYield * p.feedInPrice / 100;
    const localRevenue = soldSolar * p.salePrice / 100;
    const surplusRevenue = exportedSolar * p.feedInPrice / 100;
    const baseSurplus = fullRevenue - p.annualPvCosts;
    const rentalCosts = p.annualPvCosts + p.additionalAnnualCosts;
    const rentalSurplus = localRevenue + surplusRevenue - rentalCosts;
    const grossExtra = soldSolar * (p.salePrice - p.feedInPrice) / 100;
    const improvement = grossExtra - p.additionalAnnualCosts;
    const evCheapGrid = sumMonths("evCheapGrid");
    return {
      householdDemand, evDemand, demand, soldSolar, exportedSolar,
      evPowerLimit, evPeakPower: Math.max(...months.map(month => month.evPeakPower)),
      months, pvHousehold, pvEv, gridHousehold, gridEv, grid,
      oneOptimized, evCheapGrid,
      evCheapGridSavings: evCheapGrid * (p.evStandardGridPrice - p.evCheapGridPrice) / 100,
      pvEstimatedKwp: p.pvYield / referenceKwhPerKwp,
      pvAnnualBalanceKwp: demand / referenceKwhPerKwp,
      grossExtra,
      solarPerApartment: p.apartments > 0 ? soldSolar / p.apartments : 0,
      effectiveCoverage: demand > 0 ? soldSolar / demand * 100 : 0,
      selfConsumption: p.pvYield > 0 ? soldSolar / p.pvYield * 100 : 0,
      fullRevenue, localRevenue, surplusRevenue, rentalRevenue: localRevenue + surplusRevenue,
      baseSurplus, rentalCosts, rentalSurplus,
      rentalInvestment: p.additionalInvestment,
      investmentReturn: p.additionalInvestment > 0 ? improvement / p.additionalInvestment * 100 : null,
      improvement,
      additionalPayback: improvement > 0 && p.additionalInvestment > 0 ? p.additionalInvestment / improvement : null
    };
  }
  return Object.freeze({ defaults, calculate });
});
