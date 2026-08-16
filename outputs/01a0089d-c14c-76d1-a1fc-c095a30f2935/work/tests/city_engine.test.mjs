import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  allocateCityTargets,
  allocateStationMix,
  scoreCities,
} from "../model/city_engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cityInputs = JSON.parse(readFileSync(join(here, "../data/city_inputs.json"), "utf8"));

const WEIGHTS = Object.freeze({
  population: 0.30,
  density: 0.25,
  housing: 0.30,
  chargingScarcity: 0.15,
});

const CONFIG = Object.freeze({
  targetGuns: 30000,
  tierQuotas: Object.freeze({ "一线": 1000, "新一线": 800, "二线": 600, "三线": 400 }),
  fourGunSiteShareHigh: 0.70,
  fourGunSiteShareLow: 0.40,
});

function city(overrides = {}) {
  return {
    city: "完整高分",
    tier: "一线",
    yicaiRank: 1,
    isFixed: false,
    fixedOrder: null,
    population10k: 200,
    urbanPopulation10k: 200,
    builtAreaKm2: 100,
    pre2005HousingProxy: 20,
    housingMetric: "2005年底前住宅存量",
    publicChargingGuns: 2,
    ...overrides,
  };
}

test("station mix preserves exact gun targets", () => {
  assert.deepEqual(allocateStationMix(800, 0.70), { fourGunSites: 165, twoGunSites: 70, guns: 800 });
  assert.deepEqual(allocateStationMix(600, 0.40), { fourGunSites: 86, twoGunSites: 128, guns: 600 });
  assert.throws(() => allocateStationMix(601, 0.40), /even/);
});

test("scoring renormalizes the non-null weights and marks data quality", () => {
  const scored = scoreCities([
    city(),
    city({
      city: "缺失重算",
      yicaiRank: 2,
      population10k: 100,
      urbanPopulation10k: 100,
      builtAreaKm2: 100,
      pre2005HousingProxy: null,
      housingMetric: null,
      publicChargingGuns: null,
    }),
    city({
      city: "代理",
      yicaiRank: 3,
      population10k: 150,
      urbanPopulation10k: null,
      builtAreaKm2: 100,
      pre2005HousingProxy: 10,
      housingMetric: "老旧小区改造规模",
      publicChargingGuns: 0,
    }),
  ], WEIGHTS);

  const complete = scored.find((row) => row.city === "完整高分");
  const missing = scored.find((row) => row.city === "缺失重算");
  const proxy = scored.find((row) => row.city === "代理");
  assert.equal(complete.dataQuality, "完整");
  assert.equal(missing.dataQuality, "缺失重算");
  assert.equal(proxy.dataQuality, "代理");
  assert.ok(Math.abs(missing.score - (100 / 3)) < 1e-10);
  assert.equal(proxy.percentiles.chargingScarcity, 100);
});

test("allocation prioritizes the 26 fixed cities and exactly fills 30000 even guns", () => {
  const allocation = allocateCityTargets(scoreCities(cityInputs, WEIGHTS), CONFIG);
  const fixed = allocation.filter((row) => row.isFixed);
  const selected = allocation.filter((row) => row.targetGuns > 0);
  const lastSelected = selected.at(-1);

  assert.equal(fixed.length, 26);
  assert.ok(allocation.slice(0, 26).every((row) => row.isFixed));
  assert.ok(fixed.every((row) => row.targetGuns > 0));
  assert.deepEqual(
    selected.filter((row) => !row.isFixed).map((row) => row.tier).slice(0, 7),
    ["一线", "一线", "新一线", "新一线", "新一线", "新一线", "新一线"],
  );
  assert.equal(lastSelected.targetGuns, 400);
  assert.equal(selected.reduce((sum, row) => sum + row.targetGuns, 0), 30000);
  assert.ok(allocation.every((row) => row.targetGuns % 2 === 0));
  assert.ok(allocation.every((row) => Number.isInteger(row.fourGunSites) && row.fourGunSites >= 0));
  assert.ok(allocation.every((row) => Number.isInteger(row.twoGunSites) && row.twoGunSites >= 0));
});

test("allocation skips an automatic candidate without population", () => {
  const allocation = allocateCityTargets(scoreCities([
    city({ city: "固定", isFixed: true, fixedOrder: 1, population10k: null, urbanPopulation10k: null, builtAreaKm2: null }),
    city({ city: "无人口", yicaiRank: 2, population10k: null, urbanPopulation10k: null, builtAreaKm2: null }),
    city({ city: "可补充", yicaiRank: 3, population10k: 100, urbanPopulation10k: 100, builtAreaKm2: 100 }),
  ], WEIGHTS), {
    ...CONFIG,
    targetGuns: 2000,
    tierQuotas: { "一线": 1000, "新一线": 800, "二线": 600, "三线": 400 },
  });

  assert.equal(allocation.find((row) => row.city === "固定").targetGuns, 1000);
  assert.equal(allocation.find((row) => row.city === "无人口").targetGuns, 0);
  assert.equal(allocation.find((row) => row.city === "可补充").targetGuns, 1000);
});
