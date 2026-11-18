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
    const soldSolar = Math.min(p.pvYield, requestedSolar);
    const exportedSolar = p.pvYield - soldSolar;
    const fullRevenue = p.pvYield * p.feedInPrice / 100;
    const localRevenue = soldSolar * p.salePrice / 100;
    const surplusRevenue = exportedSolar * p.feedInPrice / 100;
    const baseSurplus = fullRevenue - p.annualPvCosts;
    const rentalCosts = p.annualPvCosts + p.additionalAnnualCosts;
    const rentalSurplus = localRevenue + surplusRevenue - rentalCosts;
    const improvement = rentalSurplus - baseSurplus;
    return {
      householdDemand, evDemand, demand, requestedSolar, soldSolar, exportedSolar,
      solarPerApartment: p.apartments > 0 ? soldSolar / p.apartments : 0,
      effectiveCoverage: demand > 0 ? soldSolar / demand * 100 : 0,
      selfConsumption: p.pvYield > 0 ? soldSolar / p.pvYield * 100 : 0,
      capped: requestedSolar > p.pvYield,
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
