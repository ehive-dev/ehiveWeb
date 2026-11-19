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
    evDayShare: 50, evChargePower: 11, evPvSurplus: 1, evMinChargePower: 1.4,
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
  const sum = values => values.reduce((total, value) => total + value, 0);
  const referenceYield = sum(pvProfile);
  const dayWeight = sum(householdHourWeights.slice(dayWindow.start, dayWindow.end));
  const outsideDayWeight = sum(householdHourWeights) - dayWeight;

  function householdProfile(dayShare) {
    return householdHourWeights.map((weight, hour) => {
      const daytime = hour >= dayWindow.start && hour < dayWindow.end;
      return daytime ? weight / dayWeight * dayShare : weight / outsideDayWeight * (1 - dayShare);
    });
  }

  function planChargingSessions(load, month, days, vehicles, energyPerVehicle, power, share, window, connectedCars) {
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
        if (connectedCars) {
          connectedCars[day]++;
          continue;
        }
        const startFraction = ((vehicle * 13 + session * 7 + month * 11) % 17) / 16;
        const hour = firstStart + (lastStart - firstStart) * startFraction;
        const start = day * slotsPerDay + hour * slotsPerHour;
        const end = Math.min(load.length, start + duration * slotsPerHour);
        for (let slot = Math.floor(start); slot < end; slot++) {
          const fraction = Math.min(slot + 1, end) - Math.max(slot, start);
          load[slot] += power * slotHours * fraction;
        }
      }
    }
    return duration * power;
  }

  function chargeWithSurplus(remaining, surplus, minEnergy, maxEnergy, slotsLeft) {
    let charged = 0;
    for (let car = 0; car < remaining.length; car++) {
      // Use the surplus first. Add only the energy needed to finish by departure
      // if the remaining time no longer suffices at maximum power.
      const neededNow = Math.max(0, remaining[car] - maxEnergy * slotsLeft);
      const solar = surplus >= minEnergy ? Math.min(surplus, maxEnergy) : 0;
      const energy = Math.min(remaining[car], Math.max(solar, neededNow));
      remaining[car] -= energy;
      surplus = Math.max(0, surplus - energy);
      charged += energy;
    }
    return charged;
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
    for (const key of ["wallboxesEnabled", "evPvSurplus"]) {
      if (p[key] !== 0 && p[key] !== 1) throw new RangeError(key);
    }
    const householdDemand = p.apartments * p.consumptionPerApartment;
    const evPerVehicle = p.wallboxesEnabled ? p.annualMileage * p.evConsumption / 100 * p.homeCharging / 100 : 0;
    const evDemand = p.apartments * evPerVehicle;
    const demand = householdDemand + evDemand;
    const surplusCharging = evDemand > 0 && p.evPvSurplus === 1;
    if (surplusCharging && (p.evMinChargePower < 1.4 || p.evMinChargePower > p.evChargePower)) {
      throw new RangeError("evMinChargePower");
    }
    const minChargingEnergy = p.evMinChargePower * slotHours;
    const maxChargingEnergy = p.evChargePower * slotHours;
    const pvScale = p.pvYield / referenceYield;
    const housing = householdProfile(p.householdDayShare / 100);
    let profileHour = 0;
    const months = monthNames.map((name, i) => {
      const days = daysPerMonth[i];
      const household = householdDemand * householdMonthShares[i] / 100;
      const ev = evDemand * days / 365;
      const charging = new Float64Array(days * slotsPerDay);
      const connected = surplusCharging ? new Uint16Array(days) : null;
      let daytimeEnergy = 0;
      if (ev > 0) {
        const energyPerVehicle = ev / p.apartments;
        const dayShare = p.evDayShare / 100;
        daytimeEnergy = planChargingSessions(charging, i, days, p.apartments, energyPerVehicle, p.evChargePower, dayShare, dayWindow, connected);
        planChargingSessions(charging, i, days, p.apartments, energyPerVehicle, p.evChargePower, 1 - dayShare, eveningWindow);
      }
      let pv = 0;
      let pvHousehold = 0;
      let pvEv = 0;
      let householdOnlyPv = 0;
      let remaining = null;
      const householdPerDay = household / days;
      for (let hour = 0; hour < days * 24; hour++) {
        // One PVGIS hourly average divided into four quarter-hours of equal power.
        const pvSlot = pvProfile[profileHour++] * pvScale * slotHours;
        pv += pvSlot * slotsPerHour;
        const clockHour = hour % 24;
        const householdSlot = householdPerDay * housing[clockHour] * slotHours;
        const solarForHome = Math.min(pvSlot, householdSlot);
        const surplus = pvSlot - solarForHome;
        householdOnlyPv += solarForHome * slotsPerHour;
        if (connected && clockHour === dayWindow.start) {
          remaining = new Float64Array(connected[Math.floor(hour / 24)]).fill(daytimeEnergy);
        }
        if (clockHour === dayWindow.end) remaining = null;
        for (let quarter = 0; quarter < slotsPerHour; quarter++) {
          let evSlot = charging[hour * slotsPerHour + quarter];
          if (remaining && remaining.length > 0) {
            const slotsLeft = (dayWindow.end - clockHour) * slotsPerHour - quarter - 1;
            evSlot += chargeWithSurplus(remaining, surplus, minChargingEnergy, maxChargingEnergy, slotsLeft);
          }
          if (surplusCharging) {
            pvHousehold += solarForHome;
            pvEv += Math.min(surplus, evSlot);
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
        grid: gridHousehold + gridEv, exportWithoutEv: Math.max(0, pv - householdOnlyPv) };
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
    return {
      householdDemand, evDemand, demand, soldSolar, exportedSolar,
      months, pvHousehold, pvEv, gridHousehold, gridEv, grid,
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
