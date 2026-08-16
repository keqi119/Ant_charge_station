import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHEET_NAMES } from "../model/constants.mjs";
import { buildModel, buildModelContext } from "../build_model.mjs";
import { allocateCityTargets, scoreCities } from "../model/city_engine.mjs";
import { buildSeasonalityCurve } from "../model/seasonality_engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
let contextPromise;
let workbookPromise;

function getRealContext() {
  return contextPromise ??= buildModelContext();
}

function getRealWorkbook() {
  return workbookPromise ??= buildModel({ exportFile: false, renderPreviews: false });
}

function buildFastContext() {
  const cityInputs = JSON.parse(readFileSync(join(here, "../data/city_inputs.json"), "utf8"));
  const seasonalityInputs = JSON.parse(readFileSync(join(here, "../data/seasonality_2024.json"), "utf8"));
  const scoredCities = scoreCities(cityInputs, {
    population: 0.30,
    density: 0.25,
    housing: 0.30,
    chargingScarcity: 0.15,
  });
  const allocations = allocateCityTargets(scoredCities, {
    targetGuns: 30000,
    tierQuotas: { "一线": 1000, "新一线": 800, "二线": 600, "三线": 400 },
    fourGunSiteShareHigh: 0.70,
    fourGunSiteShareLow: 0.40,
  });
  const sourceMatrix = Array.from({ length: 3050 }, () => Array(16).fill(null));
  sourceMatrix[0] = ["日期", "站点ID", "站点名称", "直流枪", "交流枪", "订单", "电量", "尖", "峰", "平", "谷", "分钟", "总额", "电费", "服务费", "备注"];
  sourceMatrix[1] = [new Date("2026-06-16T00:00:00Z"), "S1", "测试站", 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null];
  sourceMatrix[3049][0] = new Date("2026-08-15T00:00:00Z");
  return {
    sourcePath: "D:/source.xlsx",
    sourceMatrix,
    historical: {
      stationProfiles: [{ stationId: "S1", stationName: "测试站" }],
      benchmarks: { matureP25: 0, matureMedian: 0, matureWeighted: 0 },
      matureStationCount: 1,
      rowCount: 3049,
      reconciliations: { grossComponentsDifference: 0 },
    },
    seasonalityInputs,
    seasonality: buildSeasonalityCurve(seasonalityInputs),
    cityInputs,
    scoredCities,
    allocations,
    deployment: {},
    annualServicePerGunDay: 0,
  };
}

function cityRow(sheet, city) {
  const index = sheet.getRange("B6:B61").values.flat().indexOf(city);
  assert.notEqual(index, -1, `${city} must remain visible in city allocation`);
  return index + 6;
}

test("builder creates the approved sheets in order", async () => {
  const workbook = await getRealWorkbook();
  const info = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 6000 });
  const names = info.ndjson
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse)
    .map((row) => row.name)
    .filter(Boolean);
  assert.deepEqual([...new Set(names)], SHEET_NAMES);
});

test("builder preserves the complete 3050 by 16 source matrix", async () => {
  const workbook = await getRealWorkbook();
  const context = await getRealContext();
  const raw = workbook.worksheets.getItem("历史原始数据").getRange("A1:P3050").values;
  assert.equal(raw.length, 3050);
  assert.ok(raw.every((row) => row.length === 16));
  assert.ok(raw[0].some((value) => value !== null && value !== ""));
  assert.ok(raw.at(-1).some((value) => value !== null && value !== ""));
  assert.deepEqual(raw, context.sourceMatrix);
});

test("critical cost, history, city, and deployment calculations remain formulas", async () => {
  const workbook = await getRealWorkbook();
  const cost = workbook.worksheets.getItem("单站成本");
  assert.deepEqual(cost.getRange("E5:F5").formulas, [[
    "='核心假设'!B15+'核心假设'!B16+'核心假设'!B17",
    "='核心假设'!B15+'核心假设'!B16",
  ]]);

  const history = workbook.worksheets.getItem("历史单枪模型");
  assert.match(history.getRange("C6").formulas[0][0], /^=MAXIFS\('历史原始数据'!/);
  assert.match(history.getRange("H6").formulas[0][0], /'核心假设'!\$B\$40/);
  assert.match(history.getRange("M5").formulas[0][0], /^=PERCENTILE\.INC/);

  const city = workbook.worksheets.getItem("城市分配");
  assert.match(city.getRange("J6").formulas[0][0], /'核心假设'!\$B\$6/);
  assert.match(city.getRange("L6").formulas[0][0], /^=ROUND/);
  assert.match(city.getRange("O6").formulas[0][0], /^=4\*L6\+2\*M6-J6$/);

  const deployment = workbook.worksheets.getItem("月度投放计划");
  assert.match(deployment.getRange("J28").formulas[0][0], /^=MAX\(0,MIN\(/);
  assert.match(deployment.getRange("V28").formulas[0][0], /^=MAX\(0,MIN\(/);
  assert.match(deployment.getRange("J17").formulas[0][0], /^=4\*J16\+2\*J15-J5$/);
});

test("selectors, source comments, and finance color conventions are present", async () => {
  const workbook = await getRealWorkbook();
  const assumptions = workbook.worksheets.getItem("核心假设");
  assert.equal(assumptions.getRange("B33").dataValidation.rule.type, "list");
  assert.deepEqual(assumptions.getRange("B33").dataValidation.rule.values, ["分成", "固定租金"]);

  const inputStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "核心假设", range: "B15", maxChars: 2000 });
  assert.match(inputStyle.ndjson, /0000FF/i);
  const formulaStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "单站成本", range: "E5", maxChars: 2000 });
  assert.match(formulaStyle.ndjson, /008000/i);
  const deploymentStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "月度投放计划", range: "J28", maxChars: 2000 });
  assert.match(deploymentStyle.ndjson, /008000/i);
  const threads = await workbook.inspect({ kind: "thread", maxChars: 12000 });
  assert.match(threads.ndjson, /Source:/);
  assert.match(threads.ndjson, /Accessed: 2026-08-16/);
});

test("visible Task 8 checks calculate to OK", async () => {
  const workbook = await getRealWorkbook();
  const checks = workbook.worksheets.getItem("情景分析、检查与来源");
  const statuses = checks.getRange("F5:F15").values.flat();
  assert.deepEqual(statuses, Array(11).fill("OK"));
});

test("workbook formula-error scan is clean", async () => {
  const workbook = await getRealWorkbook();
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "Task 8 formula error scan",
    maxChars: 6000,
  });
  assert.doesNotMatch(errors.ndjson, /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/);
});

test("editing city weights reorders candidates and recalculates formula-linked J and K", async () => {
  const workbook = await buildModel({ context: buildFastContext() });
  const allocation = workbook.worksheets.getItem("城市分配");
  const assumptions = workbook.worksheets.getItem("核心假设");

  assert.ok(cityRow(allocation, "成都") < cityRow(allocation, "重庆"));
  assert.equal(allocation.getRange(`J${cityRow(allocation, "洛阳")}`).values[0][0], 400);
  assert.equal(allocation.getRange(`J${cityRow(allocation, "泉州")}`).values[0][0], 0);
  assert.equal(allocation.getRange(`K${cityRow(allocation, "徐州")}`).values[0][0], 0.40);

  assumptions.getRange("B11:B13").values = [[0], [0], [0]];
  assumptions.getRange("B10").values = [[1]];

  assert.ok(cityRow(allocation, "重庆") < cityRow(allocation, "成都"));
  assert.equal(allocation.getRange(`J${cityRow(allocation, "洛阳")}`).values[0][0], 0);
  assert.equal(allocation.getRange(`J${cityRow(allocation, "泉州")}`).values[0][0], 600);
  assert.equal(allocation.getRange(`J${cityRow(allocation, "福州")}`).values[0][0], 400);

  const xuzhouRow = cityRow(allocation, "徐州");
  assert.match(allocation.getRange(`K${xuzhouRow}`).formulas[0][0], new RegExp(`F${xuzhouRow}>=S${xuzhouRow}`));
  assert.match(allocation.getRange(`S${xuzhouRow}`).formulas[0][0], /SUMIFS/);
  // artifact-tool does not transitively invalidate cached aggregate formulas after an input write.
  // Reassigning the unchanged formulas evaluates the same workbook formulas without rebuilding it.
  const medianFormulas = allocation.getRange("Q6:S61").formulas;
  allocation.getRange("Q6:S61").formulas = medianFormulas;
  const shareFormulas = allocation.getRange("K6:K61").formulas;
  allocation.getRange("K6:K61").formulas = shareFormulas;
  assert.equal(allocation.getRange(`Q${xuzhouRow}`).values[0][0], 8);
  assert.equal(allocation.getRange(`R${xuzhouRow}`).values[0][0], 19);
  assert.equal(allocation.getRange(`S${xuzhouRow}`).values[0][0], 0.70);
  assert.equal(allocation.getRange(`K${xuzhouRow}`).values[0][0], 0.70);
  assert.equal(allocation.getRange("J6:J61").values.flat().reduce((sum, value) => sum + value, 0), 30000);
  assert.deepEqual(
    workbook.worksheets.getItem("情景分析、检查与来源").getRange("F11:F15").values.flat(),
    Array(5).fill("OK"),
  );
  const dynamicRanges = JSON.stringify([
    workbook.worksheets.getItem("城市数据库").getRange("AD6:AG61").values,
    allocation.getRange("A6:S61").values,
    workbook.worksheets.getItem("月度投放计划").getRange("J5:AH83").values,
  ]);
  assert.doesNotMatch(dynamicRanges, /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/);
});

test("rollout month count is a formula and the raw header keeps white bold text", async () => {
  const workbook = await buildModel({ context: buildFastContext() });
  const assumptions = workbook.worksheets.getItem("核心假设");
  assert.equal(assumptions.getRange("B9").formulas[0][0], '=COUNTIF(B55:M55,">0")');
  const assumptionStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "核心假设", range: "B9", maxChars: 2000 });
  assert.doesNotMatch(assumptionStyle.ndjson, /0000FF/i);

  const headerStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "历史原始数据", range: "A1", maxChars: 2000 });
  assert.match(headerStyle.ndjson, /FFFFFF/i);
  assert.match(headerStyle.ndjson, /"bold":true/i);
});
