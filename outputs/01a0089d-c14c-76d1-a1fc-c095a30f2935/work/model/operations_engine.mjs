function requireMonth(value, label) {
  const match = typeof value === "string" && /^(\d{4})-(\d{2})$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error(`${label} must use YYYY-MM`);
  }
  return (Number(match[1]) * 12) + Number(match[2]) - 1;
}

function formatMonth(monthIndex) {
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - (year * 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthNumber(monthIndex) {
  return monthIndex - (Math.floor(monthIndex / 12) * 12) + 1;
}

function daysInMonth(monthIndex) {
  const year = Math.floor(monthIndex / 12);
  const month = monthNumber(monthIndex);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function requireFinite(value, label, { minimum = 0, positive = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || (positive && value === 0)) {
    throw new TypeError(`${label} must be ${positive ? "a positive" : "a non-negative"} finite number`);
  }
  return value;
}

function requireRate(value, label, { positive = false } = {}) {
  const rate = requireFinite(value, label, { positive });
  if (rate > 1) throw new RangeError(`${label} must be between 0 and 1`);
  return rate;
}

function buildSeasonalityMap(input) {
  const map = new Map();
  if (Array.isArray(input)) {
    for (const [index, value] of input.entries()) {
      const month = typeof value === "object" ? value?.monthNumber : index + 1;
      const factor = typeof value === "object" ? value?.index : value;
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new RangeError("seasonality month must be an integer from 1 through 12");
      }
      if (map.has(month)) throw new Error(`duplicate seasonality month ${month}`);
      map.set(month, requireFinite(factor, `seasonality for month ${month}`, { positive: true }));
    }
  } else if (input && typeof input === "object") {
    for (const [month, factor] of Object.entries(input)) {
      const monthNumberValue = Number(month);
      if (!Number.isInteger(monthNumberValue) || monthNumberValue < 1 || monthNumberValue > 12) {
        throw new RangeError("seasonality month must be an integer from 1 through 12");
      }
      if (map.has(monthNumberValue)) throw new Error(`duplicate seasonality month ${monthNumberValue}`);
      map.set(monthNumberValue, requireFinite(factor, `seasonality for month ${month}`, { positive: true }));
    }
  } else {
    throw new TypeError("seasonalityByMonth must be an object or array");
  }
  return map;
}

/** Projects operating cohorts over a continuous monthly calculation axis. */
export function projectOperations(cohorts, config) {
  if (!Array.isArray(cohorts)) throw new TypeError("cohorts must be an array");
  if (!config || typeof config !== "object") throw new TypeError("config must be an object");
  const startMonthIndex = requireMonth(config.startMonth, "startMonth");
  if (!Number.isInteger(config.horizonMonths) || config.horizonMonths <= 0) {
    throw new TypeError("horizonMonths must be a positive integer");
  }
  if (!Array.isArray(config.ramp) || config.ramp.length === 0) throw new TypeError("ramp must be a non-empty array");
  const ramp = config.ramp.map((factor, index) => requireFinite(factor, `ramp month ${index + 1}`));
  const annualServicePerGunDay = requireFinite(config.annualServicePerGunDay, "annualServicePerGunDay");
  const propertyShare = requireRate(config.propertyShare, "propertyShare");
  const fixedRentPerStation = requireFinite(config.fixedRentPerStation, "fixedRentPerStation");
  const otherOpexRate = requireRate(config.otherOpexRate, "otherOpexRate");
  const headquartersMonthly = requireFinite(config.headquartersMonthly, "headquartersMonthly");
  const operatingTaxRate = requireRate(config.operatingTaxRate, "operatingTaxRate");
  const historicalServiceFeeRate = requireRate(
    config.historicalServiceFeeRate,
    "historicalServiceFeeRate",
    { positive: true },
  );
  if (!new Set(["分成", "固定"]).has(config.propertyMode)) {
    throw new Error("property mode must be either 分成 or 固定");
  }
  const seasonalityByMonth = buildSeasonalityMap(config.seasonalityByMonth);

  const normalizedCohorts = cohorts.map((cohort, index) => {
    if (!cohort || typeof cohort !== "object") throw new TypeError(`cohort ${index + 1} must be an object`);
    const onlineMonthIndex = requireMonth(cohort.onlineMonth, `cohort ${index + 1} onlineMonth`);
    if (onlineMonthIndex - startMonthIndex >= 36) {
      throw new RangeError(`cohort ${index + 1} cannot first come online in month 37 or later`);
    }
    if (!Number.isInteger(cohort.guns) || cohort.guns < 0) throw new TypeError(`cohort ${index + 1} guns must be a non-negative integer`);
    if (!Number.isInteger(cohort.stations) || cohort.stations < 0) {
      throw new TypeError(`cohort ${index + 1} stations must be a non-negative integer`);
    }
    if (cohort.guns % 2 !== 0
      || cohort.guns < (2 * cohort.stations)
      || cohort.guns > (4 * cohort.stations)) {
      throw new Error(`cohort ${index + 1} station and gun counts must describe whole two- or four-gun sites`);
    }
    if (cohort.twoGunSites !== undefined || cohort.fourGunSites !== undefined) {
      if (!Number.isInteger(cohort.twoGunSites) || cohort.twoGunSites < 0
        || !Number.isInteger(cohort.fourGunSites) || cohort.fourGunSites < 0
        || cohort.twoGunSites + cohort.fourGunSites !== cohort.stations
        || (2 * cohort.twoGunSites) + (4 * cohort.fourGunSites) !== cohort.guns) {
        throw new Error(`cohort ${index + 1} station-type counts do not reconcile`);
      }
    }
    const propertyMode = cohort.propertyMode ?? config.propertyModeByCity?.[cohort.city] ?? config.propertyMode;
    if (!new Set(["分成", "固定"]).has(propertyMode)) {
      throw new Error("property mode must be either 分成 or 固定");
    }
    const cityRevenueAdjustment = requireFinite(
      cohort.cityRevenueAdjustment
        ?? config.cityRevenueAdjustmentByCity?.[cohort.city]
        ?? config.cityRevenueAdjustment
        ?? 1,
      `city revenue adjustment for ${cohort.city ?? cohort.cohortId ?? index + 1}`,
    );
    const expectedDemolishedGuns = requireFinite(
      cohort.expectedDemolishedGuns ?? 0,
      `expected demolished guns for ${cohort.cohortId ?? index + 1}`,
    );
    const expectedDemolishedStations = requireFinite(
      cohort.expectedDemolishedStations ?? 0,
      `expected demolished stations for ${cohort.cohortId ?? index + 1}`,
    );
    if (expectedDemolishedGuns > cohort.guns || expectedDemolishedStations > cohort.stations) {
      throw new RangeError(`demolition exposure cannot exceed cohort ${index + 1}`);
    }
    let demolitionMonthIndex = null;
    let redeploymentOnlineMonthIndex = null;
    if (expectedDemolishedGuns > 0 || expectedDemolishedStations > 0) {
      demolitionMonthIndex = requireMonth(cohort.demolitionMonth, `cohort ${index + 1} demolitionMonth`);
      redeploymentOnlineMonthIndex = requireMonth(
        cohort.redeploymentOnlineMonth,
        `cohort ${index + 1} redeploymentOnlineMonth`,
      );
      if (demolitionMonthIndex < onlineMonthIndex
        || redeploymentOnlineMonthIndex !== demolitionMonthIndex + 1) {
        throw new Error(`cohort ${index + 1} demolition and redeployment timing is invalid`);
      }
    }
    return {
      ...cohort,
      onlineMonthIndex,
      propertyMode,
      cityRevenueAdjustment,
      expectedDemolishedGuns,
      expectedDemolishedStations,
      demolitionMonthIndex,
      redeploymentOnlineMonthIndex,
    };
  });

  const cohortMonths = [];
  const monthly = [];
  for (let monthOffset = 0; monthOffset < config.horizonMonths; monthOffset += 1) {
    const currentMonthIndex = startMonthIndex + monthOffset;
    const month = formatMonth(currentMonthIndex);
    const calendarMonth = monthNumber(currentMonthIndex);
    const days = daysInMonth(currentMonthIndex);
    const seasonality = seasonalityByMonth.get(calendarMonth);
    if (seasonality === undefined) throw new Error(`missing seasonality for calendar month ${calendarMonth}`);

    const activeRows = [];
    for (const cohort of normalizedCohorts) {
      if (currentMonthIndex < cohort.onlineMonthIndex) continue;
      const operatingAge = currentMonthIndex - cohort.onlineMonthIndex + 1;
      const originalRampFactor = ramp[Math.min(operatingAge - 1, ramp.length - 1)];
      const stableGuns = cohort.guns - cohort.expectedDemolishedGuns;
      const stableStations = cohort.stations - cohort.expectedDemolishedStations;
      const beforeDemolition = cohort.demolitionMonthIndex === null
        || currentMonthIndex < cohort.demolitionMonthIndex;
      const afterRedeployment = cohort.redeploymentOnlineMonthIndex !== null
        && currentMonthIndex >= cohort.redeploymentOnlineMonthIndex;
      const redeploymentAge = afterRedeployment
        ? currentMonthIndex - cohort.redeploymentOnlineMonthIndex + 1
        : null;
      const redeploymentRampFactor = redeploymentAge === null
        ? 0
        : ramp[Math.min(redeploymentAge - 1, ramp.length - 1)];
      const affectedActiveGuns = beforeDemolition || afterRedeployment ? cohort.expectedDemolishedGuns : 0;
      const affectedActiveStations = beforeDemolition || afterRedeployment ? cohort.expectedDemolishedStations : 0;
      const affectedRampFactor = beforeDemolition ? originalRampFactor : redeploymentRampFactor;
      const operatingGuns = stableGuns + affectedActiveGuns;
      const operatingStations = stableStations + affectedActiveStations;
      const rampWeightedGuns = (stableGuns * originalRampFactor) + (affectedActiveGuns * affectedRampFactor);
      const rampFactor = operatingGuns === 0 ? 0 : rampWeightedGuns / operatingGuns;
      const serviceFee = rampWeightedGuns * annualServicePerGunDay * days * seasonality
        * cohort.cityRevenueAdjustment;
      const gmv = serviceFee / historicalServiceFeeRate;
      const electricityPassThrough = gmv - serviceFee;
      const cohortPropertyShare = cohort.propertyShare === undefined
        ? requireRate(config.propertyShareByCity?.[cohort.city] ?? propertyShare, `propertyShare for ${cohort.cohortId}`)
        : requireRate(cohort.propertyShare, `propertyShare for ${cohort.cohortId}`);
      const cohortFixedRent = cohort.fixedRentPerStation === undefined
        ? requireFinite(
          config.fixedRentPerStationByCity?.[cohort.city] ?? fixedRentPerStation,
          `fixedRentPerStation for ${cohort.cohortId}`,
        )
        : requireFinite(cohort.fixedRentPerStation, `fixedRentPerStation for ${cohort.cohortId}`);
      const propertyCost = cohort.propertyMode === "分成"
        ? serviceFee * cohortPropertyShare
        : operatingStations * cohortFixedRent;
      const otherOpex = serviceFee * otherOpexRate;
      const operatingContribution = serviceFee - propertyCost - otherOpex;
      const row = {
        cohortId: cohort.cohortId,
        city: cohort.city,
        month,
        monthIndex: monthOffset + 1,
        operatingAge,
        guns: operatingGuns,
        stations: operatingStations,
        installedGuns: cohort.guns,
        installedStations: cohort.stations,
        offlineGuns: currentMonthIndex === cohort.demolitionMonthIndex ? cohort.expectedDemolishedGuns : 0,
        demolishedGuns: currentMonthIndex === cohort.demolitionMonthIndex ? cohort.expectedDemolishedGuns : 0,
        redeployedGuns: currentMonthIndex === cohort.redeploymentOnlineMonthIndex ? cohort.expectedDemolishedGuns : 0,
        days,
        seasonality,
        rampFactor,
        cityRevenueAdjustment: cohort.cityRevenueAdjustment,
        serviceFee,
        gmv,
        electricityPassThrough,
        propertyMode: cohort.propertyMode,
        propertyCost,
        otherOpex,
        operatingContribution,
      };
      activeRows.push(row);
      cohortMonths.push(row);
    }

    const serviceFee = activeRows.reduce((sum, row) => sum + row.serviceFee, 0);
    const propertyCost = activeRows.reduce((sum, row) => sum + row.propertyCost, 0);
    const otherOpex = activeRows.reduce((sum, row) => sum + row.otherOpex, 0);
    const operatingContribution = serviceFee - propertyCost - otherOpex;
    const operatingTax = serviceFee * operatingTaxRate;
    const operatingGuns = activeRows.reduce((sum, row) => sum + row.guns, 0);
    const operatingStations = activeRows.reduce((sum, row) => sum + row.stations, 0);
    monthly.push({
      month,
      monthIndex: monthOffset + 1,
      newGuns: normalizedCohorts
        .filter((cohort) => cohort.onlineMonthIndex === currentMonthIndex)
        .reduce((sum, cohort) => sum + cohort.guns, 0),
      demolishedGuns: activeRows.reduce((sum, row) => sum + row.demolishedGuns, 0),
      offlineGuns: activeRows.reduce((sum, row) => sum + row.offlineGuns, 0),
      redeployedGuns: activeRows.reduce((sum, row) => sum + row.redeployedGuns, 0),
      operatingGuns,
      operatingStations,
      days,
      seasonality,
      weightedRamp: operatingGuns === 0
        ? 0
        : activeRows.reduce((sum, row) => sum + (row.guns * row.rampFactor), 0) / operatingGuns,
      serviceFee,
      gmv: activeRows.reduce((sum, row) => sum + row.gmv, 0),
      electricityPassThrough: activeRows.reduce((sum, row) => sum + row.electricityPassThrough, 0),
      propertyCost,
      otherOpex,
      headquartersCost: headquartersMonthly,
      operatingTax,
      operatingContribution,
      cfads: operatingContribution - headquartersMonthly - operatingTax,
    });
  }

  return { cohortMonths, monthly };
}
