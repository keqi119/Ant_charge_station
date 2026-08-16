import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import * as modelBuilder from "../build_model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cities = JSON.parse(readFileSync(join(here, "../data/city_inputs.json"), "utf8"));
const manifestPath = join(here, "../data/city_metric_audit_manifest.json");

function loadManifest() {
  assert.ok(existsSync(manifestPath), "committed city metric audit manifest is required");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

const DENSITY_SOURCE_URL =
  "https://www.mohurd.gov.cn/cms_files/filemanager/mohurdold/file/2023/20231011/4de09801-07f4-4273-97cb-1e1fc78704fd.xls";
const DENSITY_SOURCE_SHA256 =
  "2b202bdced79b66d6a893d6060755ef5f62ea3790684c749363279e3f80d8552";
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

test("audit manifest pins every official MOHURD row and independently reproduces density values", () => {
  const manifest = loadManifest();
  const source = manifest.sources.mohurd2022CityConstruction;
  assert.equal(source.directUrl, DENSITY_SOURCE_URL);
  assert.equal(source.sha256, DENSITY_SOURCE_SHA256);
  assert.equal(source.sheet, "2-2");
  assert.equal(source.workbookYear, 2022);
  assert.equal(source.rowNumberBasis, "Excel worksheet row, 1-based");

  assert.equal(manifest.cities.length, cities.length);
  const byCity = new Map(manifest.cities.map((entry) => [entry.city, entry]));
  assert.equal(byCity.size, cities.length);
  assert.equal(new Set(manifest.cities.map((entry) => entry.density.officialRow)).size, cities.length);

  for (const city of cities) {
    const audit = byCity.get(city.city);
    assert.ok(audit, `${city.city}: missing manifest row`);
    const density = audit.density;
    assert.equal(density.sheet, "2-2", `${city.city}: wrong sheet`);
    assert.ok(Number.isInteger(density.officialRow) && density.officialRow > 0, `${city.city}: row required`);
    assert.equal(density.directSourceUrl, DENSITY_SOURCE_URL, `${city.city}: source drift`);
    assert.equal(density.year, 2022, `${city.city}: year drift`);
    assert.equal(typeof density.rawUrbanPopulation10k, "number", `${city.city}: raw urban population missing`);
    assert.ok(
      density.rawTemporaryPopulation10k === null || typeof density.rawTemporaryPopulation10k === "number",
      `${city.city}: invalid temporary population raw cell`,
    );
    const computed = Number(
      (density.rawUrbanPopulation10k + (density.rawTemporaryPopulation10k ?? 0)).toFixed(10),
    );
    assert.equal(density.computedUrbanPopulation10k, computed, `${city.city}: raw population computation drift`);
    assert.equal(
      density.rawBuiltAreaKm2,
      density.rawBuiltAreaComponentsKm2.builtArea,
      `${city.city}: raw built-area component drift`,
    );
    assert.equal(
      density.computedBuiltAreaKm2,
      density.rawBuiltAreaComponentsKm2.builtArea,
      `${city.city}: built-area computation drift`,
    );
    assert.equal(density.expectedUrbanPopulation10k, city.urbanPopulation10k, `${city.city}: population row/value drift`);
    assert.equal(density.expectedBuiltAreaKm2, city.builtAreaKm2, `${city.city}: built-area row/value drift`);
    if (city.urbanPopulation10k !== null) {
      assert.equal(city.urbanPopulation10k, computed, `${city.city}: density population not reproduced`);
      assert.equal(city.builtAreaKm2, density.rawBuiltAreaKm2, `${city.city}: raw built area drift`);
    }
  }

  const beijing = byCity.get("北京").density;
  assert.equal(beijing.rawUrbanPopulation10k, 1912.8);
  assert.equal(beijing.rawTemporaryPopulation10k, null);
  assert.equal(beijing.rawBuiltAreaKm2, null);
  assert.equal(beijing.expectedUrbanPopulation10k, null);
  assert.equal(beijing.expectedBuiltAreaKm2, null);
  assert.match(beijing.missingReason, /blank/i);
});

test("audit manifest covers population and all optional metric provenance states", () => {
  const manifest = loadManifest();
  const byCity = new Map(manifest.cities.map((entry) => [entry.city, entry]));
  for (const city of cities) {
    const audit = byCity.get(city.city);
    assert.deepEqual(audit.population, {
      expectedValue10k: city.population10k,
      year: city.populationYear,
      directSourceUrl: city.populationSourceUrl,
    });
    assert.equal(audit.housing.expectedValue, city.pre2005HousingProxy);
    assert.equal(audit.housing.year, city.housingYear);
    assert.equal(audit.housing.directSourceUrl, city.housingSourceUrl);
    assert.equal(audit.housing.proxyMetric, city.housingMetric);
    assert.equal(audit.charging.expectedValue, city.publicChargingGuns);
    assert.equal(audit.charging.year, city.chargingYear);
    assert.equal(audit.charging.directSourceUrl, city.chargingSourceUrl);
    if (city.pre2005HousingProxy === null) assert.ok(audit.housing.missingReason);
    if (city.publicChargingGuns === null) assert.ok(audit.charging.missingReason);
  }
});

test("production city loading rejects manifest drift and city-input drift", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "city-audit-gate-"));
  const cityInputsPath = join(tempDir, "city_inputs.json");
  const auditManifestPath = join(tempDir, "city_metric_audit_manifest.json");
  const manifest = loadManifest();
  try {
    writeFileSync(cityInputsPath, JSON.stringify(cities), "utf8");
    writeFileSync(auditManifestPath, JSON.stringify(manifest), "utf8");
    assert.equal(
      modelBuilder.loadValidatedCityInputs({ cityInputsPath, auditManifestPath }).length,
      56,
    );

    const driftedManifest = structuredClone(manifest);
    driftedManifest.cities[0].population.expectedValue10k += 1;
    writeFileSync(auditManifestPath, JSON.stringify(driftedManifest), "utf8");
    assert.throws(
      () => modelBuilder.loadValidatedCityInputs({ cityInputsPath, auditManifestPath }),
      /population manifest drift/,
    );

    const driftedCities = structuredClone(cities);
    driftedCities[0].population10k += 1;
    writeFileSync(cityInputsPath, JSON.stringify(driftedCities), "utf8");
    writeFileSync(auditManifestPath, JSON.stringify(manifest), "utf8");
    assert.throws(
      () => modelBuilder.loadValidatedCityInputs({ cityInputsPath, auditManifestPath }),
      /population manifest drift/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
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
