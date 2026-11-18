(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EHiveMieterstromReturn = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const defaults = Object.freeze({
    additionalInvestment: 2000, apartments: 4,
    consumptionPerApartment: 1900, pvYield: 8000, solarCoverage: 50,
    salePrice: 28, feedInPrice: 8,
    wallboxesEnabled: 0, annualMileage: 10000, evConsumption: 20, homeCharging: 100, evSolarCoverage: 50,
    annualPvCosts: 200, additionalAnnualCosts: 200
  });
  // Illustrative seasonal profiles, not measured data or a location-specific forecast.
  const pvShares = Object.freeze([2, 3, 7, 10, 13, 14, 14, 12, 10, 7, 5, 3]);
  const householdShares = Object.freeze([10, 9, 9, 8, 8, 7, 7, 7, 8, 9, 9, 9]);
  const days = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  const monthNames = Object.freeze(["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]);
  function calculate(input) {
    const p = {};
    for (const key of Object.keys(defaults)) {
      const value = input[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new RangeError(key);
      p[key] = value;
    }
    if (!Number.isInteger(p.apartments) || p.apartments > 1000 || p.solarCoverage > 100 || p.homeCharging > 100 || p.evSolarCoverage > 100 || ![0, 1].includes(p.wallboxesEnabled)) throw new RangeError("apartments/solarCoverage");
    const householdDemand = p.apartments * p.consumptionPerApartment;
    const evDemand = p.wallboxesEnabled ? p.apartments * p.annualMileage * p.evConsumption / 100 * p.homeCharging / 100 : 0;
    const demand = householdDemand + evDemand;
    const requestedSolar = householdDemand * p.solarCoverage / 100 + evDemand * p.evSolarCoverage / 100;
    const months = monthNames.map((name, i) => {
      const pv = p.pvYield * pvShares[i] / 100;
      const household = householdDemand * householdShares[i] / 100;
      const ev = evDemand * days[i] / 365;
      const targetHousehold = household * p.solarCoverage / 100;
      const targetEv = ev * p.evSolarCoverage / 100;
      const target = targetHousehold + targetEv;
      const factor = target > 0 ? Math.min(1, pv / target) : 0;
      // Share a shortage proportionally, without silently prioritising either load.
      const pvHousehold = targetHousehold * factor;
      const pvEv = targetEv * factor;
      const exported = Math.max(0, pv - pvHousehold - pvEv);
      const gridHousehold = Math.max(0, household - pvHousehold);
      const gridEv = Math.max(0, ev - pvEv);
      return { name, pv, household, ev, pvHousehold, pvEv, exported, gridHousehold, gridEv,
        grid: gridHousehold + gridEv, capped: target > pv };
    });
    const sum = key => months.reduce((total, month) => total + month[key], 0);
    const pvHousehold = sum("pvHousehold");
    const pvEv = sum("pvEv");
    const gridHousehold = sum("gridHousehold");
    const gridEv = sum("gridEv");
    const grid = gridHousehold + gridEv;
    const soldSolar = pvHousehold + pvEv;
    const exportedSolar = sum("exported");
    const fullRevenue = p.pvYield * p.feedInPrice / 100;
    const localRevenue = soldSolar * p.salePrice / 100;
    const surplusRevenue = exportedSolar * p.feedInPrice / 100;
    const baseSurplus = fullRevenue - p.annualPvCosts;
    const rentalCosts = p.annualPvCosts + p.additionalAnnualCosts;
    const rentalSurplus = localRevenue + surplusRevenue - rentalCosts;
    const improvement = rentalSurplus - baseSurplus;
    return {
      householdDemand, evDemand, demand, requestedSolar, soldSolar, exportedSolar,
      months, pvHousehold, pvEv, gridHousehold, gridEv, grid,
      grossExtra: soldSolar * (p.salePrice - p.feedInPrice) / 100,
      solarPerApartment: p.apartments > 0 ? soldSolar / p.apartments : 0,
      effectiveCoverage: demand > 0 ? soldSolar / demand * 100 : 0,
      selfConsumption: p.pvYield > 0 ? soldSolar / p.pvYield * 100 : 0,
      capped: months.some(month => month.capped),
      fullRevenue, localRevenue, surplusRevenue, rentalRevenue: localRevenue + surplusRevenue,
      baseSurplus, rentalCosts, rentalSurplus,
      rentalInvestment: p.additionalInvestment,
      investmentReturn: p.additionalInvestment > 0 ? improvement / p.additionalInvestment * 100 : null,
      improvement,
      additionalPayback: improvement > 0 && p.additionalInvestment > 0 ? p.additionalInvestment / improvement : null
    };
  }
  return Object.freeze({ defaults, calculate, pvShares, householdShares });
});
