import { BASE_ASSUMPTIONS } from "./constants.mjs";

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

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer`);
  return value;
}

function requireCost(cost, label) {
  if (!cost || typeof cost !== "object") throw new TypeError(`${label} cost must be an object`);
  for (const field of ["equipment", "engineering", "channel"]) {
    if (typeof cost[field] !== "number" || !Number.isFinite(cost[field]) || cost[field] < 0) {
      throw new TypeError(`${label} ${field} cost must be a non-negative finite number`);
    }
  }
  return cost;
}

function monthlyTargets(totalGuns, shares) {
  if (!Array.isArray(shares) || shares.length === 0) throw new TypeError("shares must be a non-empty array");
  if (shares.length > 18) throw new RangeError("rollout construction cannot exceed 18 months");
  if (shares.some((share) => typeof share !== "number" || !Number.isFinite(share) || share < 0)) {
    throw new TypeError("shares must contain non-negative finite numbers");
  }
  if (shares.at(-1) <= 0) throw new RangeError("final rollout month must have a positive share");
  const shareTotal = shares.reduce((sum, share) => sum + share, 0);
  if (Math.abs(shareTotal - 1) > 1e-9) throw new Error("shares must sum to 100%");

  const targets = shares.slice(0, -1).map((share) => Math.round((totalGuns * share) / 2) * 2);
  targets.push(totalGuns - targets.reduce((sum, guns) => sum + guns, 0));
  if (targets.some((guns) => guns < 0 || guns % 2 !== 0)) {
    throw new Error("monthly rollout targets must be non-negative even gun counts");
  }
  return targets;
}

/**
 * Builds chronological city cohorts from indivisible two- and four-gun sites.
 * The returned plan exposes cohorts plus exact monthly and first-launch audits.
 */
export function buildDeploymentPlan(allocations, config) {
  if (!Array.isArray(allocations)) throw new TypeError("allocations must be an array");
  if (!config || typeof config !== "object") throw new TypeError("config must be an object");

  const startMonthIndex = requireMonth(config.startMonth, "startMonth");
  const totalGuns = requireNonNegativeInteger(config.totalGuns, "totalGuns");
  if (totalGuns % 2 !== 0) throw new Error("totalGuns must be even");
  const supplierTermsMonths = requireNonNegativeInteger(config.supplierTermsMonths, "supplierTermsMonths");
  const financeDelayMonths = requireNonNegativeInteger(config.financeDelayMonths, "financeDelayMonths");
  if (financeDelayMonths > 2) throw new RangeError("financeDelayMonths must be 0, 1, or 2");
  const targets = monthlyTargets(totalGuns, config.shares);
  const costByStationType = config.costByStationType ?? BASE_ASSUMPTIONS.costByStationType;
  const twoGunCost = requireCost(costByStationType?.twoGun, "two-gun station");
  const fourGunCost = requireCost(costByStationType?.fourGun, "four-gun station");

  const states = allocations.map((allocation, allocationIndex) => {
    if (!allocation || typeof allocation !== "object" || typeof allocation.city !== "string" || allocation.city.length === 0) {
      throw new TypeError(`allocation ${allocationIndex + 1} must have a city`);
    }
    const twoGunSites = requireNonNegativeInteger(allocation.twoGunSites, `${allocation.city} twoGunSites`);
    const fourGunSites = requireNonNegativeInteger(allocation.fourGunSites, `${allocation.city} fourGunSites`);
    const guns = (2 * twoGunSites) + (4 * fourGunSites);
    if (allocation.targetGuns !== undefined && allocation.targetGuns !== guns) {
      throw new Error(`${allocation.city} station mix does not match targetGuns`);
    }
    if (allocation.isFixed && guns === 0) throw new Error(`${allocation.city} fixed city must have at least one site`);
    if (allocation.isFixed && guns > 0 && (!Number.isInteger(allocation.fixedOrder) || allocation.fixedOrder < 1)) {
      throw new Error(`${allocation.city} fixedOrder must be a positive integer`);
    }
    return {
      allocationIndex,
      city: allocation.city,
      isFixed: allocation.isFixed === true,
      fixedOrder: allocation.fixedOrder,
      remainingTwo: twoGunSites,
      remainingFour: fourGunSites,
    };
  });

  const allocationGuns = states.reduce(
    (sum, state) => sum + (2 * state.remainingTwo) + (4 * state.remainingFour),
    0,
  );
  if (allocationGuns !== totalGuns) throw new Error("allocation gun total must equal totalGuns");

  let expectedFixedCities;
  if (config.expectedFixedCities !== undefined) {
    if (!Array.isArray(config.expectedFixedCities)
      || config.expectedFixedCities.some((city) => typeof city !== "string" || city.length === 0)
      || new Set(config.expectedFixedCities).size !== config.expectedFixedCities.length) {
      throw new TypeError("expected fixed roster must contain unique non-empty city names");
    }
    expectedFixedCities = new Set(config.expectedFixedCities);
    const actualFixedCities = states.filter((state) => state.isFixed).map((state) => state.city);
    if (actualFixedCities.length !== expectedFixedCities.size
      || actualFixedCities.some((city) => !expectedFixedCities.has(city))
      || [...expectedFixedCities].some((city) => (
        states.filter((state) => state.city === city && state.isFixed).length !== 1
      ))) {
      throw new Error("expected fixed roster must exactly match allocated fixed cities");
    }
  }

  const scheduledSites = targets.map(() => []);
  const fixedStates = states
    .filter((state) => state.isFixed && ((2 * state.remainingTwo) + (4 * state.remainingFour)) > 0)
    .toSorted((left, right) => left.fixedOrder - right.fixedOrder);
  if (new Set(fixedStates.map((state) => state.fixedOrder)).size !== fixedStates.length) {
    throw new Error("fixedOrder must be unique among allocated fixed cities");
  }
  const launchWindowMonths = Math.min(6, targets.length);
  for (const state of fixedStates) {
    const monthIndex = (state.fixedOrder - 1) % launchWindowMonths;
    const type = state.remainingTwo > 0 ? "twoGun" : "fourGun";
    const guns = type === "twoGun" ? 2 : 4;
    if (scheduledSites[monthIndex].reduce((sum, site) => sum + site.guns, 0) + guns > targets[monthIndex]) {
      throw new Error(`monthly target cannot accommodate fixed city ${state.city}`);
    }
    if (type === "twoGun") state.remainingTwo -= 1;
    else state.remainingFour -= 1;
    scheduledSites[monthIndex].push({ city: state.city, allocationIndex: state.allocationIndex, type, guns });
  }

  const residualTargets = targets.map((target, monthIndex) => (
    target - scheduledSites[monthIndex].reduce((sum, site) => sum + site.guns, 0)
  ));
  if (residualTargets.some((target) => target < 0 || target % 2 !== 0)) {
    throw new Error("fixed-city reservations are incompatible with monthly targets");
  }

  const remainingTwo = states.reduce((sum, state) => sum + state.remainingTwo, 0);
  const remainingFour = states.reduce((sum, state) => sum + state.remainingFour, 0);
  const monthlyTwoCounts = residualTargets.map((target) => (target / 2) % 2);
  let twoSitesToPlace = remainingTwo - monthlyTwoCounts.reduce((sum, count) => sum + count, 0);
  if (twoSitesToPlace < 0 || twoSitesToPlace % 2 !== 0) {
    throw new Error("remaining station mix cannot satisfy monthly target parity");
  }
  for (let monthIndex = targets.length - 1; monthIndex >= 0 && twoSitesToPlace > 0; monthIndex -= 1) {
    const maximumTwoSites = residualTargets[monthIndex] / 2;
    const additionalCapacity = maximumTwoSites - monthlyTwoCounts[monthIndex];
    const additionalTwoSites = Math.min(twoSitesToPlace, additionalCapacity);
    monthlyTwoCounts[monthIndex] += additionalTwoSites;
    twoSitesToPlace -= additionalTwoSites;
  }
  if (twoSitesToPlace !== 0) throw new Error("monthly targets cannot absorb every two-gun site");

  const monthlyFourCounts = residualTargets.map((target, monthIndex) => (
    (target - (2 * monthlyTwoCounts[monthIndex])) / 4
  ));
  if (monthlyFourCounts.some((count) => !Number.isInteger(count) || count < 0)
    || monthlyFourCounts.reduce((sum, count) => sum + count, 0) !== remainingFour) {
    throw new Error("monthly targets cannot absorb every four-gun site");
  }

  const remainingTwoSites = states.flatMap((state) => Array.from({ length: state.remainingTwo }, () => ({
    city: state.city,
    allocationIndex: state.allocationIndex,
    type: "twoGun",
    guns: 2,
  })));
  const remainingFourSites = states.flatMap((state) => Array.from({ length: state.remainingFour }, () => ({
    city: state.city,
    allocationIndex: state.allocationIndex,
    type: "fourGun",
    guns: 4,
  })));
  let twoCursor = 0;
  let fourCursor = 0;
  for (const monthIndex of targets.keys()) {
    scheduledSites[monthIndex].push(
      ...remainingTwoSites.slice(twoCursor, twoCursor + monthlyTwoCounts[monthIndex]),
      ...remainingFourSites.slice(fourCursor, fourCursor + monthlyFourCounts[monthIndex]),
    );
    twoCursor += monthlyTwoCounts[monthIndex];
    fourCursor += monthlyFourCounts[monthIndex];
  }

  const cohorts = [];
  const firstOnlineMonthByCity = {};
  for (const [deploymentMonthIndex, sites] of scheduledSites.entries()) {
    const byCity = new Map();
    for (const site of sites) {
      const group = byCity.get(site.allocationIndex) ?? {
        city: site.city,
        twoGunSites: 0,
        fourGunSites: 0,
      };
      if (site.type === "twoGun") group.twoGunSites += 1;
      else group.fourGunSites += 1;
      byCity.set(site.allocationIndex, group);
    }
    for (const group of byCity.values()) {
      const onlineMonthIndex = startMonthIndex + deploymentMonthIndex;
      const selectionMonthIndex = onlineMonthIndex - 1;
      const stations = group.twoGunSites + group.fourGunSites;
      const guns = (2 * group.twoGunSites) + (4 * group.fourGunSites);
      const totalCapex = (group.twoGunSites * (twoGunCost.equipment + twoGunCost.engineering + twoGunCost.channel))
        + (group.fourGunSites * (fourGunCost.equipment + fourGunCost.engineering + fourGunCost.channel));
      const eligibleBasis = (group.twoGunSites * (twoGunCost.equipment + twoGunCost.engineering))
        + (group.fourGunSites * (fourGunCost.equipment + fourGunCost.engineering));
      const channelCost = (group.twoGunSites * twoGunCost.channel) + (group.fourGunSites * fourGunCost.channel);
      const onlineMonth = formatMonth(onlineMonthIndex);
      const cohort = {
        cohortId: `C${String(cohorts.length + 1).padStart(4, "0")}`,
        city: group.city,
        selectionMonth: formatMonth(selectionMonthIndex),
        onlineMonth,
        supplierPaymentMonth: formatMonth(selectionMonthIndex + supplierTermsMonths),
        financeDisbursementMonth: formatMonth(onlineMonthIndex + financeDelayMonths),
        twoGunSites: group.twoGunSites,
        fourGunSites: group.fourGunSites,
        stations,
        guns,
        totalCapex,
        eligibleBasis,
        channelCost,
      };
      cohorts.push(cohort);
      if (firstOnlineMonthByCity[group.city] === undefined || onlineMonth < firstOnlineMonthByCity[group.city]) {
        firstOnlineMonthByCity[group.city] = onlineMonth;
      }
    }
  }

  const monthlyGuns = targets.map((_, deploymentMonthIndex) => {
    const month = formatMonth(startMonthIndex + deploymentMonthIndex);
    return cohorts.filter((cohort) => cohort.onlineMonth === month).reduce((sum, cohort) => sum + cohort.guns, 0);
  });
  if (monthlyGuns.some((guns, index) => guns !== targets[index])) {
    throw new Error("site aggregation did not reproduce the monthly rollout targets");
  }
  if (expectedFixedCities) {
    const finalRequiredLaunchMonth = formatMonth(startMonthIndex + Math.min(5, targets.length - 1));
    for (const city of expectedFixedCities) {
      if (firstOnlineMonthByCity[city] === undefined || firstOnlineMonthByCity[city] > finalRequiredLaunchMonth) {
        throw new Error(`expected fixed city ${city} must launch within the first six months`);
      }
    }
  }
  return { cohorts, monthlyGuns, firstOnlineMonthByCity };
}
