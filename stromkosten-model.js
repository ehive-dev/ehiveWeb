(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.eHiveSavingsModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value)));

  function allocateConsumption({ totalKwh, flexibleKwh, strategies }) {
    const total = Math.max(0, finite(totalKwh));
    const flexible = Math.min(total, Math.max(0, finite(flexibleKwh)));
    const active = Array.isArray(strategies) ? strategies : [];
    const allocations = Object.fromEntries(active.map(strategy => [strategy.key, 0]));
    const pvStrategy = active.find(strategy => strategy.key === "pv");
    const pvAvailableKwh = pvStrategy && Number.isFinite(Number(pvStrategy.maxKwh))
      ? Math.max(0, finite(pvStrategy.maxKwh))
      : Number.POSITIVE_INFINITY;
    const directPvKwh = pvStrategy ? Math.min(total, flexible * clamp(pvStrategy.share, 0, 100) / 100, pvAvailableKwh) : 0;
    if (pvStrategy) allocations.pv = directPvKwh;

    let remainingFlexibleKwh = Math.max(0, flexible - Math.min(flexible, directPvKwh));
    active.filter(strategy => strategy.key !== "pv").forEach(strategy => {
      const requestedKwh = flexible * clamp(strategy.share, 0, 100) / 100;
      const allocatedKwh = Math.min(requestedKwh, remainingFlexibleKwh);
      allocations[strategy.key] = allocatedKwh;
      remainingFlexibleKwh -= allocatedKwh;
    });

    const shiftedFlexibleKwh = active
      .filter(strategy => strategy.key !== "pv")
      .reduce((sum, strategy) => sum + (allocations[strategy.key] || 0), 0);
    const optimizedKwh = directPvKwh + shiftedFlexibleKwh;
    return {
      allocations,
      directPvKwh,
      shiftedFlexibleKwh,
      optimizedKwh,
      remainingDemandKwh: Math.max(0, total - optimizedKwh),
      remainingFlexibleKwh
    };
  }

  function recommendedCapacity(totalKwh) {
    return Math.max(0, finite(totalKwh)) * 1.5 / 1000;
  }

  function representativeBatterySlots(capacityKwh, recommendedCapacityKwh, active) {
    if (!active || finite(capacityKwh) <= 0) return 0;
    const recommended = Math.max(0, finite(recommendedCapacityKwh));
    const ratio = recommended > 0 ? Math.min(1, finite(capacityKwh) / recommended) : 0;
    return Math.max(1, Math.min(6, Math.round(ratio * 6)));
  }

  function representativeBatteryDischargeSlots(totalKwh, annualDischargeKwh, pvHours) {
    const total = Math.max(0, finite(totalKwh));
    const discharge = Math.max(0, finite(annualDischargeKwh));
    if (total <= 0 || discharge <= 0) return 0;
    const pv = new Set((Array.isArray(pvHours) ? pvHours : []).map(finite).filter(hour => hour >= 0 && hour <= 23));
    const availableHours = Math.max(1, 24 - pv.size);
    return Math.max(1, Math.min(availableHours, Math.round(discharge / total * availableHours)));
  }

  function buildBatteryDischargeHours({ slots, pvHours }) {
    const validPvHours = (Array.isArray(pvHours) ? pvHours : [])
      .map(finite)
      .filter(hour => hour >= 0 && hour <= 23);
    const pv = new Set(validPvHours);
    const duration = Math.max(0, Math.min(24 - pv.size, Math.floor(finite(slots))));
    const startHour = validPvHours.length ? (Math.max(...validPvHours) + 1) % 24 : 18;
    const hours = [];
    for (let offset = 0; offset < 24 && hours.length < duration; offset += 1) {
      const hour = (startHour + offset) % 24;
      if (!pv.has(hour)) hours.push(hour);
    }
    return hours;
  }

  function selectAvailableHours(hours, excludedHours, limit) {
    const excluded = new Set(Array.isArray(excludedHours) ? excludedHours.map(finite) : []);
    const count = Math.max(0, Math.floor(finite(limit)));
    return [...new Set((Array.isArray(hours) ? hours : []).map(finite))]
      .filter(hour => hour >= 0 && hour <= 23 && !excluded.has(hour))
      .slice(0, count);
  }

  function calculateBattery({ totalKwh, optimizedKwh, enabled, canCharge, capacityKwh, cycles, efficiency, basePrice, chargePrice }) {
    const total = Math.max(0, finite(totalKwh));
    const optimized = Math.min(total, Math.max(0, finite(optimizedKwh)));
    const capacity = Math.max(0, finite(capacityKwh));
    const fullCycles = Math.max(0, finite(cycles));
    const roundTripEfficiency = clamp(efficiency, 0.5, 1);
    const normalPrice = Math.max(0, finite(basePrice));
    const sourcePrice = finite(chargePrice);
    const effectivePrice = canCharge ? sourcePrice / roundTripEfficiency : normalPrice;
    const economicallyUseful = Boolean(enabled && canCharge && effectivePrice < normalPrice);
    const remainingDemandKwh = Math.max(0, total - optimized);
    const potentialDischargeKwh = capacity * fullCycles;
    const dischargeKwh = economicallyUseful ? Math.min(potentialDischargeKwh, remainingDemandKwh) : 0;
    const chargeKwh = dischargeKwh / roundTripEfficiency;
    const saving = Math.max(0, (dischargeKwh * normalPrice - chargeKwh * sourcePrice) / 100);
    return {
      recommendedCapacityKwh: recommendedCapacity(total),
      remainingDemandKwh,
      potentialDischargeKwh,
      effectivePrice,
      economicallyUseful,
      dischargeKwh,
      chargeKwh,
      saving
    };
  }

  function calculateCostSummary({ totalKwh, basePrice, strategies, allocations, batterySaving }) {
    const total = Math.max(0, finite(totalKwh));
    const normalPrice = Math.max(0, finite(basePrice));
    const active = Array.isArray(strategies) ? strategies : [];
    const allocated = allocations && typeof allocations === "object" ? allocations : {};
    const loadSaving = active.reduce((sum, strategy) => {
      const energy = Math.max(0, finite(allocated[strategy.key]));
      return sum + energy * Math.max(0, normalPrice - finite(strategy.price)) / 100;
    }, 0);
    const before = total * normalPrice / 100;
    const uncappedSaving = loadSaving + Math.max(0, finite(batterySaving));
    const saving = Math.min(before, uncappedSaving);
    return { loadSaving, before, saving, after: Math.max(0, before - saving), capped: saving < uncappedSaving };
  }

  function buildStorageProfile({ active, chargeHours, dischargeHours }) {
    const charges = new Set(Array.isArray(chargeHours) ? chargeHours : []);
    const discharges = new Set(Array.isArray(dischargeHours) ? dischargeHours : []);
    if (!active) return Array.from({ length: 24 }, () => 0);
    const chargeStep = charges.size ? 70 / charges.size : 0;
    const dischargeStep = discharges.size ? 80 / discharges.size : 0;
    let state = 20;
    return Array.from({ length: 24 }, (_, hour) => {
      if (charges.has(hour)) state = Math.min(90, state + chargeStep);
      if (discharges.has(hour)) state = Math.max(10, state - dischargeStep);
      return state;
    });
  }

  function buildEnergySourceProfile({ pvHours, tariffHours, batteryHours, gridChargeHours }) {
    const pv = new Set(Array.isArray(pvHours) ? pvHours : []);
    const tariff = new Set(Array.isArray(tariffHours) ? tariffHours : []);
    const battery = new Set(Array.isArray(batteryHours) ? batteryHours : []);
    const gridCharge = new Set(Array.isArray(gridChargeHours) ? gridChargeHours : []);
    return Array.from({ length: 24 }, (_, hour) => {
      if (battery.has(hour)) return "battery";
      if (pv.has(hour)) return "pv";
      if (gridCharge.has(hour)) return "grid-charge";
      if (tariff.has(hour)) return "tariff";
      return "grid";
    });
  }

  return {
    allocateConsumption,
    calculateBattery,
    calculateCostSummary,
    recommendedCapacity,
    representativeBatterySlots,
    representativeBatteryDischargeSlots,
    buildBatteryDischargeHours,
    selectAvailableHours,
    buildStorageProfile,
    buildEnergySourceProfile
  };
});
