import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cities = JSON.parse(readFileSync(join(here, "../data/city_inputs.json"), "utf8"));

const DENSITY_SOURCE_URL =
  "https://www.mohurd.gov.cn/cms_files/filemanager/mohurdold/file/2023/20231011/4de09801-07f4-4273-97cb-1e1fc78704fd.xls";
const COMPARABLE_HOUSING_METRIC = "年度城镇老旧小区改造小区数（个）";

test("every populated city metric has a statistical year and direct source", () => {
  for (const city of cities) {
    assert.ok(city.population10k > 0, `${city.city}: population required`);
    assert.ok(Number.isInteger(city.populationYear), `${city.city}: population year required`);
    assert.match(city.populationSourceUrl, /^https?:\/\//, `${city.city}: population source required`);

    for (const [valueKey, yearKey, sourceKey] of [
      ["urbanPopulation10k", "densityYear", "densitySourceUrl"],
      ["builtAreaKm2", "densityYear", "densitySourceUrl"],
      ["pre2005HousingProxy", "housingYear", "housingSourceUrl"],
      ["publicChargingGuns", "chargingYear", "chargingSourceUrl"],
    ]) {
      if (city[valueKey] !== null) {
        assert.ok(Number.isInteger(city[yearKey]), `${city.city}: ${valueKey} year required`);
        assert.match(city[sourceKey], /^https?:\/\//, `${city.city}: ${valueKey} source required`);
      }
    }
  }
});

test("density inputs are paired values from the same official city table and scope", () => {
  for (const city of cities) {
    assert.equal(
      city.urbanPopulation10k === null,
      city.builtAreaKm2 === null,
      `${city.city}: urban population and built area must be present or absent together`,
    );
    if (city.urbanPopulation10k !== null) {
      assert.ok(city.urbanPopulation10k > 0, `${city.city}: urban population must be positive`);
      assert.ok(city.builtAreaKm2 > 0, `${city.city}: built area must be positive`);
      assert.equal(city.densityYear, 2022, `${city.city}: density year must match MOHURD table`);
      assert.equal(city.densitySourceUrl, DENSITY_SOURCE_URL, `${city.city}: density source drift`);
      assert.match(city.notes, /住建部2022年城市建设统计年鉴表2-2第\d+行/);
    }
  }

  assert.deepEqual(
    cities.filter((city) => city.urbanPopulation10k === null).map((city) => city.city),
    ["北京"],
  );
});

test("housing proxies never mix households, area, projects, and community counts", () => {
  for (const city of cities) {
    if (city.pre2005HousingProxy !== null) {
      assert.equal(city.housingMetric, COMPARABLE_HOUSING_METRIC, `${city.city}: incomparable housing unit`);
      assert.match(new URL(city.housingSourceUrl).hostname, /(?:^|\.)gov\.cn$/);
    } else {
      assert.equal(city.housingMetric, null, `${city.city}: housing label without a numeric proxy`);
      assert.match(city.notes, /住房代理.*口径不可比.*保留空值/);
    }
  }
});

test("charging data never substitutes a provincial count for a city count", () => {
  for (const city of cities) {
    if (city.publicChargingGuns !== null) {
      assert.match(city.notes, /市级口径/);
      assert.doesNotMatch(city.notes, /省级口径/);
    } else {
      assert.match(city.notes, /未找到可核查的市级公共充电枪数量/);
    }
  }
});

test("coverage and missing structure stay visible", (t) => {
  const coverage = {
    candidates: cities.length,
    population: cities.filter((city) => city.population10k !== null).length,
    densityPairs: cities.filter(
      (city) => city.urbanPopulation10k !== null && city.builtAreaKm2 !== null,
    ).length,
    housingProxy: cities.filter((city) => city.pre2005HousingProxy !== null).length,
    publicCharging: cities.filter((city) => city.publicChargingGuns !== null).length,
  };
  assert.deepEqual(coverage, {
    candidates: 56,
    population: 56,
    densityPairs: 55,
    housingProxy: 0,
    publicCharging: 0,
  });

  const missing = {
    density: cities.filter((city) => city.urbanPopulation10k === null).map((city) => city.city),
    housing: cities.filter((city) => city.pre2005HousingProxy === null).map((city) => city.city),
    publicCharging: cities.filter((city) => city.publicChargingGuns === null).map((city) => city.city),
  };
  t.diagnostic(`coverage ${JSON.stringify(coverage)}`);
  t.diagnostic(`missing ${JSON.stringify(missing)}`);
});
