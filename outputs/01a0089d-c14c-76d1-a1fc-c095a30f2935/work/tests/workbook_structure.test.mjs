import test from "node:test";
import assert from "node:assert/strict";
import { SHEET_NAMES } from "../model/constants.mjs";
import { buildModel, buildModelContext } from "../build_model.mjs";

const contextPromise = buildModelContext();
const workbookPromise = buildModel({ exportFile: false, renderPreviews: false });

test("builder creates the approved sheets in order", async () => {
  const workbook = await workbookPromise;
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
  const workbook = await workbookPromise;
  const context = await contextPromise;
  const raw = workbook.worksheets.getItem("历史原始数据").getRange("A1:P3050").values;
  assert.equal(raw.length, 3050);
  assert.ok(raw.every((row) => row.length === 16));
  assert.ok(raw[0].some((value) => value !== null && value !== ""));
  assert.ok(raw.at(-1).some((value) => value !== null && value !== ""));
  assert.deepEqual(raw, context.sourceMatrix);
});

test("critical cost, history, city, and deployment calculations remain formulas", async () => {
  const workbook = await workbookPromise;
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
  const workbook = await workbookPromise;
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
  const workbook = await workbookPromise;
  const checks = workbook.worksheets.getItem("情景分析、检查与来源");
  const statuses = checks.getRange("F5:F15").values.flat();
  assert.deepEqual(statuses, Array(11).fill("OK"));
});

test("workbook formula-error scan is clean", async () => {
  const workbook = await workbookPromise;
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "Task 8 formula error scan",
    maxChars: 6000,
  });
  assert.doesNotMatch(errors.ndjson, /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/);
});
