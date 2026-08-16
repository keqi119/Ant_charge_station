const TIER_PRIORITY = Object.freeze({
  "一线": 1,
  "新一线": 2,
  "二线": 3,
  "三线": 4,
});

const METRICS = Object.freeze(["population", "density", "housing", "chargingScarcity"]);

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function percentile(values, value, reverse = false) {
  if (!isNumber(value)) return null;
  const count = values.filter((candidate) => reverse ? candidate >= value : candidate <= value).length;
  return (count / values.length) * 100;
}

function median(values) {
  const sorted = values.filter(isNumber).toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getMetricValues(city) {
  const hasDirectDensity = isNumber(city.urbanPopulation10k) && isNumber(city.builtAreaKm2);
  const hasDensityProxy = !hasDirectDensity && isNumber(city.population10k) && isNumber(city.builtAreaKm2);
  const densityPopulation = hasDirectDensity ? city.urbanPopulation10k : city.population10k;
  const hasHousingProxy = isNumber(city.pre2005HousingProxy) && /代理|老旧/.test(city.housingMetric ?? "");
  const hasChargingScarcity = isNumber(city.publicChargingGuns) && isNumber(city.population10k) && city.population10k > 0;

  return {
    values: {
      population: isNumber(city.population10k) ? city.population10k : null,
      density: isNumber(densityPopulation) && isNumber(city.builtAreaKm2) && city.builtAreaKm2 > 0
        ? densityPopulation / city.builtAreaKm2
        : null,
      housing: isNumber(city.pre2005HousingProxy) ? city.pre2005HousingProxy : null,
      chargingScarcity: hasChargingScarcity ? city.publicChargingGuns / city.population10k : null,
    },
    usesProxy: hasDensityProxy || hasHousingProxy,
  };
}

function qualityFor(metricValues, usesProxy) {
  if (METRICS.some((metric) => !isNumber(metricValues[metric]))) return "缺失重算";
  return usesProxy ? "代理" : "完整";
}

/**
 * Scores cities against peers in the same tier. Percentiles are empirical CDF
 * percentiles, so tied values receive the same score and the top observation
 * receives 100. Charging-gun scarcity reverses the direction.
 */
export function scoreCities(cities, weights) {
  const rows = cities.map((city) => {
    const { values, usesProxy } = getMetricValues(city);
    return { ...city, metricValues: values, usesProxy };
  });

  return rows.map((row) => {
    const peers = rows.filter((candidate) => candidate.tier === row.tier);
    const percentiles = Object.fromEntries(METRICS.map((metric) => {
      const values = peers.map((peer) => peer.metricValues[metric]).filter(isNumber);
      return [metric, values.length === 0 ? null : percentile(values, row.metricValues[metric], metric === "chargingScarcity")];
    }));
    const effectiveWeight = METRICS.reduce(
      (sum, metric) => isNumber(percentiles[metric]) ? sum + (weights[metric] ?? 0) : sum,
      0,
    );
    const score = effectiveWeight === 0
      ? null
      : METRICS.reduce(
        (sum, metric) => sum + (isNumber(percentiles[metric]) ? percentiles[metric] * (weights[metric] ?? 0) : 0),
        0,
      ) / effectiveWeight;

    return {
      ...row,
      percentiles,
      score,
      eligibleForAutoSelection: isNumber(row.metricValues.population),
      dataQuality: qualityFor(row.metricValues, row.usesProxy),
    };
  });
}

/** Converts an even gun target into non-negative, integer 2/4-gun site counts. */
export function allocateStationMix(guns, fourGunSiteShare) {
  if (!Number.isInteger(guns) || guns < 0 || guns % 2 !== 0) {
    throw new Error("guns must be a non-negative even integer");
  }
  if (!isNumber(fourGunSiteShare) || fourGunSiteShare < 0 || fourGunSiteShare > 1) {
    throw new Error("fourGunSiteShare must be between 0 and 1");
  }

  const fourGunSites = Math.round((guns * fourGunSiteShare) / (2 + (2 * fourGunSiteShare)));
  const twoGunSites = (guns - (4 * fourGunSites)) / 2;
  if (!Number.isInteger(twoGunSites) || twoGunSites < 0) {
    throw new Error("gun target cannot be represented by the requested station mix");
  }
  return { fourGunSites, twoGunSites, guns };
}

function compareCities(left, right) {
  if (left.isFixed !== right.isFixed) return left.isFixed ? -1 : 1;
  if (left.isFixed && left.fixedOrder !== right.fixedOrder) return left.fixedOrder - right.fixedOrder;
  if (TIER_PRIORITY[left.tier] !== TIER_PRIORITY[right.tier]) {
    return TIER_PRIORITY[left.tier] - TIER_PRIORITY[right.tier];
  }
  if (left.score !== right.score) return (right.score ?? -Infinity) - (left.score ?? -Infinity);
  return left.yicaiRank - right.yicaiRank;
}

/**
 * Allocates city targets in the required fixed-city, tier, score, and rank
 * order. Ineligible non-fixed cities stay visible with a zero allocation.
 */
export function allocateCityTargets(scoredCities, config) {
  const { targetGuns, tierQuotas, fourGunSiteShareHigh, fourGunSiteShareLow } = config;
  if (!Number.isInteger(targetGuns) || targetGuns < 0 || targetGuns % 2 !== 0) {
    throw new Error("targetGuns must be a non-negative even integer");
  }
  for (const tier of Object.keys(TIER_PRIORITY)) {
    if (!Number.isInteger(tierQuotas[tier]) || tierQuotas[tier] < 0 || tierQuotas[tier] % 2 !== 0) {
      throw new Error(`tier quota for ${tier} must be a non-negative even integer`);
    }
  }

  const ranked = scoredCities.toSorted(compareCities);
  const fixedCities = ranked.filter((city) => city.isFixed);
  const fixedTargetGuns = fixedCities.reduce((sum, city) => sum + tierQuotas[city.tier], 0);
  if (targetGuns < fixedTargetGuns) {
    throw new Error("targetGuns cannot cover every fixed city quota");
  }

  let remaining = targetGuns - fixedTargetGuns;
  const targetsByCity = new Map(fixedCities.map((city) => [city.city, tierQuotas[city.tier]]));
  for (const city of ranked) {
    if (city.isFixed || !city.eligibleForAutoSelection || remaining === 0) continue;
    const targetGunsForCity = Math.min(tierQuotas[city.tier], remaining);
    targetsByCity.set(city.city, targetGunsForCity);
    remaining -= targetGunsForCity;
  }
  if (remaining !== 0) throw new Error("candidate capacity cannot satisfy targetGuns");

  const allocated = ranked.map((city) => ({ ...city, targetGuns: targetsByCity.get(city.city) ?? 0 }));

  const medianByTier = new Map(Object.entries(TIER_PRIORITY).map(([tier]) => [
    tier,
    median(allocated.filter((city) => city.tier === tier && city.targetGuns > 0).map((city) => city.score)),
  ]));

  return allocated.map((city) => {
    const threshold = medianByTier.get(city.tier);
    const fourGunSiteShare = city.targetGuns > 0 && isNumber(threshold) && isNumber(city.score) && city.score >= threshold
      ? fourGunSiteShareHigh
      : fourGunSiteShareLow;
    return {
      ...city,
      fourGunSiteShare,
      ...allocateStationMix(city.targetGuns, fourGunSiteShare),
    };
  });
}
