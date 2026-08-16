import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { FIXED_CITIES } from "../model/constants.mjs";
import {
  loadJson,
  validateCityInputs,
  validateSeasonalityInputs,
} from "../model/input_validation.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const TOP_49_TIERS = [
  ["一线", ["上海", "北京", "深圳", "广州"]],
  ["新一线", ["成都", "杭州", "重庆", "武汉", "苏州", "西安", "南京", "长沙", "郑州", "天津", "合肥", "青岛", "东莞", "宁波", "佛山"]],
  ["二线", ["济南", "无锡", "沈阳", "昆明", "福州", "厦门", "温州", "石家庄", "大连", "哈尔滨", "金华", "泉州", "南宁", "长春", "常州", "南昌", "南通", "贵阳", "嘉兴", "徐州", "惠州", "太原", "烟台", "临沂", "保定", "台州", "绍兴", "珠海", "洛阳", "潍坊"]],
];

const EXPECTED_MONTHLY_SOURCES = new Map([
  ["2023-12", "https://www.evcipa.org.cn/newsinfo/8183139.html"],
  ["2024-01", "https://www.evcipa.org.cn/newsinfo/8183140.html"],
  ["2024-02", "https://www.evcipa.org.cn/newsinfo/8183135.html"],
  ["2024-03", "https://www.evcipa.org.cn/newsinfo/8183133.html"],
  ["2024-04", "https://www.evcipa.org.cn/newsinfo/8183136.html"],
  ["2024-05", "https://www.evcipa.org.cn/newsinfo/8183100.html"],
  ["2024-06", "https://www.evcipa.org.cn/newsinfo/8183099.html"],
  ["2024-07", "https://www.evcipa.org.cn/newsinfo/8182573.html"],
  ["2024-08", "https://www.evcipa.org.cn/newsinfo/8183095.html"],
  ["2024-09", "https://www.evcipa.org.cn/newsinfo/8182568.html"],
  ["2024-10", "https://www.evcipa.org.cn/newsinfo/8182570.html"],
  ["2024-11", "https://www.evcipa.org.cn/newsinfo/8182565.html"],
  ["2024-12", "https://www.evcipa.org.cn/newsinfo/8137834.html"],
]);

const TIER_SOURCE_NAME = "Yicai New First-Tier Cities Institute: 2025 Ranking of Cities' Business Attractiveness";
const TIER_SOURCE_URL = "https://www.smg.cn/review/mobile/news/202505/0166469.html";

const DIRECT_POPULATION_SOURCES = new Map([
  ["郑州", "https://tjj.zhengzhou.gov.cn/tjgb/5012681.jhtml"],
  ["洛阳", "https://lyrb.lyd.com.cn/images2/1/2021-05/21/010/20210521010_pdf.pdf"],
  ["合肥", "https://tjj.wuhu.gov.cn/tjxx/tjfx/8282011.html"],
  ["芜湖", "https://tjj.wuhu.gov.cn/tjxx/tjgb/8282562.html"],
  ["阜阳", "https://tjj.wuhu.gov.cn/tjxx/tjfx/8282011.html"],
  ["淮南", "https://tjj.huainan.gov.cn/tjsj/tjgb/551571618.html"],
  ["石家庄", "https://tjj.sjz.gov.cn/columns/940d701f-5e56-4f5d-9ece-7968f6354993/202105/31/d72c2a6d-f9f9-486d-b378-f566b9c7ed21.html"],
  ["保定", "https://www.baoding.gov.cn/content-173-312950.html"],
  ["太原", "https://www.taiyuan.gov.cn/doc/2021/06/01/1096237.shtml"],
]);

function validSeasonality() {
  return [
    {
      month: "2023-12",
      monthEndPublicGuns: 2726000,
      chargingKwh100m: null,
      gunSourceUrl: "https://evcipa.example/2023-12",
      volumeSourceUrl: "",
      accessedDate: "2026-08-16",
    },
    ...Array.from({ length: 12 }, (_, i) => ({
      month: `2024-${String(i + 1).padStart(2, "0")}`,
      monthEndPublicGuns: 2800000 + i,
      chargingKwh100m: 40 + i,
      gunSourceUrl: `https://evcipa.example/g/${i + 1}`,
      volumeSourceUrl: `https://evcipa.example/v/${i + 1}`,
      accessedDate: "2026-08-16",
    })),
  ];
}

function validCity(overrides = {}) {
  return {
    city: "合肥",
    province: "安徽",
    tier: "新一线",
    yicaiRank: 12,
    tierSourceName: TIER_SOURCE_NAME,
    tierSourceUrl: TIER_SOURCE_URL,
    isFixed: true,
    fixedOrder: 1,
    population10k: 1000,
    populationYear: 2024,
    urbanPopulation10k: null,
    builtAreaKm2: null,
    densityYear: null,
    pre2005HousingProxy: null,
    housingMetric: null,
    housingYear: null,
    publicChargingGuns: null,
    chargingYear: null,
    populationSourceUrl: "https://gov.example/population",
    densitySourceUrl: "",
    housingSourceUrl: "",
    chargingSourceUrl: "",
    accessedDate: "2026-08-16",
    notes: "建成区、老旧住房代理和公共充电枪数据待补充。",
    ...overrides,
  };
}

test("seasonality input contains 12 months plus prior December gun base", () => {
  assert.equal(validateSeasonalityInputs(validSeasonality()).length, 13);
});

test("seasonality rejects missing monthly volume provenance", () => {
  const rows = validSeasonality();
  rows[1].volumeSourceUrl = "";
  assert.throws(() => validateSeasonalityInputs(rows), /invalid volume input row 2/);
});

test("seasonality rejects coerced numeric strings", () => {
  const gunRows = validSeasonality();
  gunRows[1].monthEndPublicGuns = "2782000";
  assert.throws(() => validateSeasonalityInputs(gunRows), /invalid gun input row 2/);

  const volumeRows = validSeasonality();
  volumeRows[1].chargingKwh100m = "42.2";
  assert.throws(() => validateSeasonalityInputs(volumeRows), /invalid volume input row 2/);
});

test("URL validation rejects HTTP(S) prefixes without a hostname", () => {
  const seasonality = validSeasonality();
  seasonality[1].gunSourceUrl = "https://";
  assert.throws(() => validateSeasonalityInputs(seasonality), /invalid gun input row 2/);

  assert.throws(
    () => validateCityInputs([validCity({ populationSourceUrl: "https://" })], ["合肥"]),
    /non-HTTP source in populationSourceUrl/,
  );
});

test("city validation rejects duplicate names", () => {
  assert.throws(
    () => validateCityInputs([validCity(), validCity()], ["合肥"]),
    /duplicate city/,
  );
});

test("city validation rejects a missing fixed city", () => {
  assert.throws(() => validateCityInputs([validCity()], ["合肥", "淮南"]), /missing fixed cities: 淮南/);
});

test("city validation rejects illegal tiers and malformed provenance", () => {
  assert.throws(() => validateCityInputs([validCity({ tier: "四线" })], ["合肥"]), /invalid tier/);
  assert.throws(
    () => validateCityInputs([validCity({ populationSourceUrl: "ftp://invalid" })], ["合肥"]),
    /non-HTTP source/,
  );
});

test("city validation enforces fixed flags and fixed ordering", () => {
  assert.throws(
    () => validateCityInputs([validCity({ isFixed: false, fixedOrder: null })], ["合肥"]),
    /fixed city flag or order mismatch/,
  );
});

test("city validation requires population for automatic selection candidates", () => {
  assert.throws(
    () => validateCityInputs([validCity({ city: "成都", isFixed: false, fixedOrder: null, population10k: null, populationYear: null, populationSourceUrl: "", notes: "人口待补充。" })], []),
    /population required for automatic selection/,
  );
});

test("city validation requires year and source whenever an indicator has a value", () => {
  assert.throws(
    () => validateCityInputs([validCity({ builtAreaKm2: 500, densityYear: null, densitySourceUrl: "" })], ["合肥"]),
    /built-area indicator requires year and source/,
  );
});

test("city validation requires notes for missing optional indicators", () => {
  assert.throws(
    () => validateCityInputs([validCity({ notes: "" })], ["合肥"]),
    /notes must explain missing optional indicators/,
  );
});

test("city validation rejects records that omit contract fields", () => {
  const city = validCity();
  delete city.densityYear;
  assert.throws(() => validateCityInputs([city], ["合肥"]), /missing city field densityYear/);
});

test("city validation rejects non-positive population values", () => {
  assert.throws(
    () => validateCityInputs([validCity({ population10k: 0 })], ["合肥"]),
    /population must be positive/,
  );
});

test("city validation rejects malformed optional numeric indicators", () => {
  assert.throws(
    () => validateCityInputs([validCity({ builtAreaKm2: "garbage", densityYear: 2024, densitySourceUrl: "https://gov.example/density" })], ["合肥"]),
    /invalid built-area indicator/,
  );
  assert.throws(
    () => validateCityInputs([validCity({ publicChargingGuns: -1, chargingYear: 2024, chargingSourceUrl: "https://gov.example/charging" })], ["合肥"]),
    /invalid charging indicator/,
  );
  assert.equal(
    validateCityInputs([validCity({ publicChargingGuns: 0, chargingYear: 2024, chargingSourceUrl: "https://gov.example/charging" })], ["合肥"]).length,
    1,
  );
});

test("city validation rejects duplicate ranks and empty-string null substitutes", () => {
  const second = validCity({ city: "成都", isFixed: false, fixedOrder: null });
  assert.throws(() => validateCityInputs([validCity(), second], ["合肥"]), /duplicate Yicai ranks/);
  assert.throws(
    () => validateCityInputs([validCity({ builtAreaKm2: "", notes: "" })], ["合肥"]),
    /optional indicator builtAreaKm2 must be null or a valid value/,
  );
});

test("city validation requires row-level tier and rank provenance", () => {
  const missingName = validCity();
  delete missingName.tierSourceName;
  assert.throws(() => validateCityInputs([missingName], ["合肥"]), /missing city field tierSourceName/);

  assert.throws(
    () => validateCityInputs([validCity({ tierSourceName: "", tierSourceUrl: "https://" })], ["合肥"]),
    /invalid tier provenance/,
  );
});

test("source-backed input files satisfy the exact roster, provenance, and coverage contract", (t) => {
  const seasonality = loadJson(join(here, "../data/seasonality_2024.json"));
  const cities = loadJson(join(here, "../data/city_inputs.json"));
  assert.equal(validateSeasonalityInputs(seasonality).length, 13);
  assert.equal(validateCityInputs(cities, FIXED_CITIES).filter((row) => row.isFixed).length, 26);

  assert.deepEqual(
    seasonality.map((row) => [row.month, row.gunSourceUrl, row.volumeSourceUrl]),
    seasonality.map((row, i) => [
      row.month,
      EXPECTED_MONTHLY_SOURCES.get(row.month),
      i === 0 ? "" : EXPECTED_MONTHLY_SOURCES.get(row.month),
    ]),
  );

  const expectedTop49 = TOP_49_TIERS.flatMap(([tier, names]) => names.map((city) => ({ city, tier })));
  assert.deepEqual(
    cities.slice(0, 49).map(({ city, tier, yicaiRank }) => ({ city, tier, yicaiRank })),
    expectedTop49.map(({ city, tier }, i) => ({ city, tier, yicaiRank: i + 1 })),
  );
  assert.equal(cities.length, 56);
  assert.deepEqual(
    Object.fromEntries(["一线", "新一线", "二线", "三线"].map((tier) => [tier, cities.filter((row) => row.tier === tier).length])),
    { 一线: 4, 新一线: 15, 二线: 30, 三线: 7 },
  );
  assert.deepEqual(
    cities.slice(49).map(({ city, yicaiRank }) => ({ city, yicaiRank })),
    [
      { city: "海口", yicaiRank: 54 },
      { city: "湖州", yicaiRank: 57 },
      { city: "芜湖", yicaiRank: 62 },
      { city: "阜阳", yicaiRank: 63 },
      { city: "宿迁", yicaiRank: 83 },
      { city: "三亚", yicaiRank: 94 },
      { city: "淮南", yicaiRank: 158 },
    ],
  );
  assert.ok(cities.every((row) => row.tierSourceName === TIER_SOURCE_NAME));
  assert.ok(cities.every((row) => row.tierSourceUrl === TIER_SOURCE_URL));
  for (const [city, sourceUrl] of DIRECT_POPULATION_SOURCES) {
    assert.equal(cities.find((row) => row.city === city)?.populationSourceUrl, sourceUrl);
  }

  const coverage = {
    candidateCities: cities.length,
    fixedCities: cities.filter((row) => row.isFixed).length,
    population: cities.filter((row) => row.population10k !== null).length,
    urbanPopulation: cities.filter((row) => row.urbanPopulation10k !== null).length,
    builtArea: cities.filter((row) => row.builtAreaKm2 !== null).length,
    housingProxy: cities.filter((row) => row.pre2005HousingProxy !== null).length,
    publicCharging: cities.filter((row) => row.publicChargingGuns !== null).length,
    proxyCount: cities.filter((row) => row.pre2005HousingProxy !== null).length,
  };
  assert.deepEqual(coverage, {
    candidateCities: 56,
    fixedCities: 26,
    population: 56,
    urbanPopulation: 0,
    builtArea: 0,
    housingProxy: 0,
    publicCharging: 0,
    proxyCount: 0,
  });
  t.diagnostic(`coverage ${JSON.stringify(coverage)}`);
});
