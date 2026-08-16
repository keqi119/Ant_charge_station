import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { allocateCityTargets, scoreCities } from "../model/city_engine.mjs";
import { FIXED_CITIES } from "../model/constants.mjs";
import { buildDeploymentPlan } from "../model/deployment_engine.mjs";
import { projectOperations } from "../model/operations_engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cityInputs = JSON.parse(readFileSync(join(here, "../data/city_inputs.json"), "utf8"));

const allocations = allocateCityTargets(scoreCities(cityInputs, {
  population: 0.30,
  density: 0.25,
  housing: 0.30,
  chargingScarcity: 0.15,
}), {
  targetGuns: 30000,
  tierQuotas: { "一线": 1000, "新一线": 800, "二线": 600, "三线": 400 },
  fourGunSiteShareHigh: 0.70,
  fourGunSiteShareLow: 0.40,
});

const BASE_CONFIG = Object.freeze({
  startMonth: "2026-09",
  shares: [5, 6, 7, 8, 9, 10, 11, 11, 10, 9, 8, 6].map((value) => value / 100),
  totalGuns: 30000,
  supplierTermsMonths: 2,
  financeDelayMonths: 1,
});

test("base rollout is exact and fixed cities launch in first six months", () => {
  const plan = buildDeploymentPlan(allocations, BASE_CONFIG);

  assert.deepEqual(plan.monthlyGuns, [1500, 1800, 2100, 2400, 2700, 3000, 3300, 3300, 3000, 2700, 2400, 1800]);
  assert.equal(plan.cohorts.reduce((sum, cohort) => sum + cohort.guns, 0), 30000);
  assert.equal(plan.cohorts[0].onlineMonth, "2026-09");
  for (const city of FIXED_CITIES) assert.ok(plan.firstOnlineMonthByCity[city] <= "2027-02");
});

test("deployment preserves whole city sites and derives one-month build and cost timing", () => {
  const plan = buildDeploymentPlan(allocations, BASE_CONFIG);

  for (const allocation of allocations) {
    const cityCohorts = plan.cohorts.filter((cohort) => cohort.city === allocation.city);
    assert.equal(cityCohorts.reduce((sum, cohort) => sum + cohort.twoGunSites, 0), allocation.twoGunSites);
    assert.equal(cityCohorts.reduce((sum, cohort) => sum + cohort.fourGunSites, 0), allocation.fourGunSites);
  }
  for (const cohort of plan.cohorts) {
    assert.equal(cohort.guns, (2 * cohort.twoGunSites) + (4 * cohort.fourGunSites));
    assert.equal(cohort.stations, cohort.twoGunSites + cohort.fourGunSites);
    assert.match(cohort.cohortId, /^C\d{4}$/);
  }

  const fourGunOnly = buildDeploymentPlan([{
    city: "测试城",
    isFixed: false,
    fixedOrder: null,
    twoGunSites: 0,
    fourGunSites: 1,
    targetGuns: 4,
  }], {
    startMonth: "2026-09",
    shares: [1],
    totalGuns: 4,
    supplierTermsMonths: 2,
    financeDelayMonths: 1,
  }).cohorts[0];

  assert.deepEqual(fourGunOnly, {
    cohortId: "C0001",
    city: "测试城",
    selectionMonth: "2026-08",
    onlineMonth: "2026-09",
    supplierPaymentMonth: "2026-10",
    financeDisbursementMonth: "2026-10",
    twoGunSites: 0,
    fourGunSites: 1,
    stations: 1,
    guns: 4,
    totalCapex: 71000,
    eligibleBasis: 61000,
    channelCost: 10000,
  });
});

test("slow rollout completes in month 18 without losing sites or the fixed-city launch window", () => {
  const slowShares = [3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 7, 7, 7, 6, 6, 5, 4, 4]
    .map((value) => value / 100);
  const plan = buildDeploymentPlan(allocations, { ...BASE_CONFIG, shares: slowShares });

  assert.equal(plan.monthlyGuns.length, 18);
  assert.equal(plan.monthlyGuns.reduce((sum, guns) => sum + guns, 0), 30000);
  assert.equal(plan.cohorts.at(-1).onlineMonth, "2028-02");
  assert.equal(plan.cohorts.filter((cohort) => cohort.onlineMonth === "2028-02").reduce((sum, cohort) => sum + cohort.guns, 0), 1200);
  assert.equal(plan.cohorts.reduce((sum, cohort) => sum + cohort.stations, 0), 9700);
  for (const city of FIXED_CITIES) assert.ok(plan.firstOnlineMonthByCity[city] <= "2027-02");
});

test("the actual slow plan flows through 60 months with no deployment omissions", () => {
  const slowShares = [3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 7, 7, 7, 6, 6, 5, 4, 4]
    .map((value) => value / 100);
  const plan = buildDeploymentPlan(allocations, { ...BASE_CONFIG, shares: slowShares });
  const operations = projectOperations(plan.cohorts, {
    startMonth: "2026-09",
    horizonMonths: 60,
    annualServicePerGunDay: 50,
    seasonalityByMonth: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [index + 1, 1])),
    ramp: [0.60, 0.75, 0.85, 0.92, 0.97, 1],
    propertyMode: "分成",
    propertyShare: 0.20,
    fixedRentPerStation: 200,
    otherOpexRate: 0.10,
    headquartersMonthly: 0,
    operatingTaxRate: 0,
    historicalServiceFeeRate: 556193.42 / 1758717.20,
  });

  assert.equal(operations.monthly.reduce((sum, month) => sum + month.newGuns, 0), 30000);
  assert.ok(operations.monthly.slice(18).every((month) => month.newGuns === 0));
  assert.equal(operations.monthly.at(-1).operatingGuns, 30000);
  assert.equal(operations.monthly.at(-1).weightedRamp, 1);
});
