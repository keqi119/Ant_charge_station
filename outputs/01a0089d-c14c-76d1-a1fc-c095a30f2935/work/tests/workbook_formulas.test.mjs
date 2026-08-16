import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModel } from "../build_model.mjs";
import { buildOutputSheets } from "../model/workbook_outputs.mjs";
import { allocateCityTargets, scoreCities } from "../model/city_engine.mjs";
import { buildSeasonalityCurve } from "../model/seasonality_engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
let workbookPromise;

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
  for (let day = 0; day < 30; day += 1) {
    const date = new Date(Date.UTC(2026, 5, 16 + day));
    sourceMatrix[1 + day] = [date, "S1", "测试站1", 2, 0, 1, 10, 0, 0, 0, 0, 10, 200, 100, 100, null];
    sourceMatrix[31 + day] = [date, "S2", "测试站2", 2, 0, 1, 8, 0, 0, 0, 0, 10, 160, 80, 80, null];
  }
  sourceMatrix[3049][0] = new Date("2026-08-15T00:00:00Z");
  return {
    sourcePath: "D:/source.xlsx",
    sourceMatrix,
    historical: {
      stationProfiles: [{ stationId: "S1", stationName: "测试站1" }, { stationId: "S2", stationName: "测试站2" }],
      benchmarks: { matureP25: 42.5, matureMedian: 45, matureWeighted: 45 },
      matureStationCount: 2,
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

function getWorkbook() {
  return workbookPromise ??= buildModel({ context: buildFastContext() });
}

test("Task 9 exposes the output-sheet builder", () => {
  assert.equal(typeof buildOutputSheets, "function");
});

test("operating model is a formula-linked 60-month engine with a 36-month report boundary", async () => {
  const workbook = await getWorkbook();
  const sheet = workbook.worksheets.getItem("36月运营模型");
  assert.equal(sheet.getRange("B5:BI5").formulas[0].filter(Boolean).length, 60);
  assert.match(sheet.getRange("B5").formulas[0][0], /'核心假设'!\$B\$5/);
  assert.equal(sheet.getRange("C5").formulas[0][0], "=EDATE(B5,1)");
  assert.deepEqual(sheet.getRange("A7:A20").values.flat(), [
    "新增枪数", "运营枪数", "运营站数", "季节指数", "加权爬坡", "服务费收入", "充电交易额",
    "代收代付电费", "物业成本", "其他运营成本", "总部成本", "经营税费", "经营贡献", "CFADS",
  ]);
  assert.match(sheet.getRange("B12").formulas[0][0], /\$B\$23/);
  assert.match(sheet.getRange("B12").formulas[0][0], /DAY\(EOMONTH/);
  assert.match(sheet.getRange("B15").formulas[0][0], /'核心假设'!\$B\$33/);
  assert.match(sheet.getRange("B15").formulas[0][0], /'核心假设'!\$B\$34/);
  assert.match(sheet.getRange("B15").formulas[0][0], /'核心假设'!\$B\$35/);
  assert.equal(sheet.getRange("B20").formulas[0][0], "=B19-B17-B18");
  const reportStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "36月运营模型", range: "AK5", maxChars: 2000 });
  const tailStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "36月运营模型", range: "AL5", maxChars: 2000 });
  assert.doesNotMatch(reportStyle.ndjson, /E7E6E6/i);
  assert.match(tailStyle.ndjson, /E7E6E6/i);
});

test("lease page shows cohort assumptions, auditable rent, debt, DSCR, and cash curves", async () => {
  const workbook = await getWorkbook();
  const sheet = workbook.worksheets.getItem("融资租赁与资金缺口");
  assert.deepEqual(sheet.getRange("A4:O4").values[0], [
    "批次", "上线月", "选定月", "融资租赁原值", "融资额", "放款月", "期限", "年化成本", "月利率",
    "留购款", "月租金", "供应商付款月", "总投资", "渠道费用", "放款时点差",
  ]);
  const rent = sheet.getRange("K5").formulas[0][0];
  assert.match(rent, /^=IF\(I5=0,/);
  assert.match(rent, /\(E5-J5\)\/G5/);
  assert.match(rent, /J5\/\(1\+I5\)\^G5/);
  assert.match(rent, /I5\/\(1-\(1\+I5\)\^-G5\)/);
  assert.equal(sheet.getRange("A22").formulas[0][0], "=A5");
  assert.deepEqual(sheet.getRange("A102:A121").values.flat(), [
    "本月形成应付款", "供应商付款", "期末应付款", "融资放款", "等额租金", "融资成本", "本金偿还", "留购款",
    "债务支付", "期末租赁余额", "CFADS", "DSCR", "项目净现金（不含放款）", "项目累计现金", "股东注资前净现金",
    "股东注资前累计现金", "最低股东资金需求", "最低资金注入后累计现金", "最大资金缺口月份", "最大资金缺口",
  ]);
  assert.match(sheet.getRange("B105").formulas[0][0], /SUMIFS\(\$E\$5:\$E\$16,\$F\$5:\$F\$16,B\$101\)/);
  assert.match(sheet.getRange("B110").formulas[0][0], /SUM\(B38:B49\)/);
  assert.match(sheet.getRange("B113").formulas[0][0], /IF\(B110=0,"",B112\/B110\)/);
  assert.match(sheet.getRange("B118").formulas[0][0], /MIN\(B117:BI117\)/);
  assert.match(sheet.getRange("B120").formulas[0][0], /INDEX\(B101:BI101/);
  assert.ok(Math.abs(sheet.getRange("BI111").values[0][0]) <= 0.01);
  assert.equal(sheet.getRange("B113").values[0][0], "");
  const principal = sheet.getRange("B108:BI108").values.flat().reduce((sum, value) => sum + value, 0);
  const interest = sheet.getRange("B107:BI107").values.flat().reduce((sum, value) => sum + value, 0);
  const residual = sheet.getRange("B109:BI109").values.flat().reduce((sum, value) => sum + value, 0);
  const debtService = sheet.getRange("B110:BI110").values.flat().reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(debtService - principal - interest - residual) <= 0.01);
});

test("scenarios, term comparison, checks, sources, and scope notes are formula-backed", async () => {
  const workbook = await getWorkbook();
  const sheet = workbook.worksheets.getItem("情景分析、检查与来源");
  assert.deepEqual(sheet.getRange("A5:A10").values.flat(), ["基准", "保守收入", "融资收缩", "放款延迟", "慢建设", "综合压力"]);
  assert.deepEqual(sheet.getRange("A15:A17").values.flat(), [18, 24, 36]);
  assert.ok(sheet.getRange("I5:K10").formulas.flat().every((formula) => typeof formula === "string" && formula.startsWith("=")));
  assert.ok(sheet.getRange("B15:H17").formulas.flat().every((formula) => typeof formula === "string" && formula.startsWith("=")));
  assert.equal(sheet.getRange("AE9").values[0][0], "供应商付款");
  assert.match(sheet.getRange("AF9").formulas[0][0], /0-1\+'核心假设'!\$B\$31/);
  const baseInterest = workbook.worksheets.getItem("融资租赁与资金缺口").getRange("B107:BI107").values.flat().reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(sheet.getRange("G17").values[0][0] - baseInterest) <= 0.01);
  assert.deepEqual(sheet.getRange("A21:H21").values[0], ["检查项", "实际", "预期", "差额", "容差", "状态", "修复位置", "说明"]);
  assert.equal(sheet.getRange("F22:F38").formulas.flat().filter(Boolean).length, 17);
  assert.deepEqual(sheet.getRange("F22:F38").values.flat(), Array(17).fill("PASS"));
  assert.equal(sheet.getRange("B19").values[0][0], "PASS");
  assert.match(sheet.getRange("B19").formulas[0][0], /COUNTIF\(F22:F38/);
  assert.doesNotMatch(sheet.getRange("B19").formulas[0][0], /A22:H38/);
  assert.doesNotMatch(sheet.getRange("B19").formulas[0][0], /F39/);
  const fixedLaunchFormula = sheet.getRange("B25").formulas[0][0];
  assert.match(fixedLaunchFormula, /'月度投放计划'!\$AI\$28:\$AI\$83/);
  assert.doesNotMatch(fixedLaunchFormula, /'城市分配'!\$P/);
  const launchHelper = workbook.worksheets.getItem("月度投放计划").getRange("AI28").formulas[0][0];
  assert.match(launchHelper, /SUM\(\$J28:\$O28\)/);
  assert.match(launchHelper, /SUM\(\$V28:\$AA28\)/);
  assert.doesNotMatch(launchHelper, /'城市分配'!\$P/);
  assert.equal(sheet.getRange("A38").values[0][0], "六情景峰值资金缺口勾稽");
  const gapCheckFormula = sheet.getRange("B38").formulas[0][0];
  for (const [scenarioRow, cashRow] of [[5, 10], [6, 16], [7, 22], [8, 28], [9, 34], [10, 40]]) {
    assert.match(gapCheckFormula, new RegExp(`ABS\\(\\$K\\$${scenarioRow}-MAX\\(0,-MIN\\(\\$AF\\$${cashRow}:\\$CM\\$${cashRow}\\)\\)\\)`));
  }
  assert.match(sheet.getRange("A39").values[0][0], /外部构建门禁/);
  assert.deepEqual(sheet.getRange("A42:I42").values[0], ["Item", "Value", "Units", "Period/As-of", "Source Type", "Source Name", "Ref", "Notes", "Accessed"]);
  const notes = sheet.getRange("A42:I180").values.flat().filter(Boolean).join(" | ");
  assert.match(notes, /2005年12月31日前住宅物业/);
  assert.match(notes, /海口/);
  assert.match(notes, /三亚/);

  const crossSheetStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "情景分析、检查与来源", range: "B7", maxChars: 2000 });
  const constantStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "情景分析、检查与来源", range: "C7", maxChars: 2000 });
  assert.match(crossSheetStyle.ndjson, /008000/i);
  assert.doesNotMatch(constantStyle.ndjson, /008000/i);
  const comments = await workbook.inspect({ kind: "thread", sheetId: "情景分析、检查与来源", range: "C7:H10", maxChars: 6000 });
  assert.match(comments.ndjson, /Task 9 approved scenario constant/);
  assert.match(comments.ndjson, /2026-08-16-charge-station-financing-model-design/);
  const deploymentComments = await workbook.inspect({ kind: "thread", sheetId: "情景分析、检查与来源", range: "L4:M4", maxChars: 20000 });
  assert.match(deploymentComments.ndjson, /"target":"L4"/);
  assert.match(deploymentComments.ndjson, /"target":"M4"/);
  assert.match(deploymentComments.ndjson, /Task 9 approved deployment constant/);
  const deploymentMonthStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "情景分析、检查与来源", range: "L5", maxChars: 2000 });
  const slowRolloutStyle = await workbook.inspect({ kind: "computedStyle", sheetId: "情景分析、检查与来源", range: "M9", maxChars: 2000 });
  assert.doesNotMatch(deploymentMonthStyle.ndjson, /008000/i);
  assert.doesNotMatch(slowRolloutStyle.ndjson, /008000/i);
});

test("supplier terms move scenario payments and gaps with the main finance schedule", async () => {
  const workbook = await buildModel({ context: buildFastContext() });
  const assumptions = workbook.worksheets.getItem("核心假设");
  const deployment = workbook.worksheets.getItem("月度投放计划");
  const finance = workbook.worksheets.getItem("融资租赁与资金缺口");
  const scenarios = workbook.worksheets.getItem("情景分析、检查与来源");

  const reassign = (sheet, address) => {
    const formulas = sheet.getRange(address).formulas;
    sheet.getRange(address).formulas = formulas;
  };
  const nonzeroMonths = (values) => values.flatMap((value, index) => (Math.abs(Number(value) || 0) > 0.01 ? [index] : []));
  const gaps = [];
  const originalTerms = assumptions.getRange("B31").values[0][0];

  for (const terms of [0, 2, 3]) {
    assumptions.getRange("B31").values = [[terms]];
    reassign(deployment, "J23:U23");
    reassign(finance, "L5:L16");
    reassign(finance, "B103:BI103");
    for (const row of [9, 15, 21, 27, 33, 39]) reassign(scenarios, `AF${row}:CM${row}`);
    for (const row of [10, 16, 22, 28, 34, 40]) reassign(scenarios, `AF${row}:CM${row}`);
    reassign(scenarios, "K5:K10");

    assert.deepEqual(
      nonzeroMonths(scenarios.getRange("AF9:CM9").values[0]),
      nonzeroMonths(finance.getRange("B103:BI103").values[0]),
      `supplier payment months must agree when terms=${terms}`,
    );
    const gap = scenarios.getRange("K5").values[0][0];
    assert.ok(Number.isFinite(gap) && gap >= 0);
    gaps.push(Math.round(gap * 100) / 100);
  }
  assert.ok(new Set(gaps).size >= 2, `peak gap must respond to supplier terms: ${gaps.join(", ")}`);

  assumptions.getRange("B31").values = [[originalTerms]];
  reassign(deployment, "J23:U23");
  reassign(finance, "L5:L16");
  reassign(finance, "B103:BI119");
  for (const row of [9, 15, 21, 27, 33, 39, 10, 16, 22, 28, 34, 40]) reassign(scenarios, `AF${row}:CM${row}`);
  reassign(scenarios, "K5:K10");
  reassign(scenarios, "B22:B38");
  reassign(scenarios, "C22:C38");
  reassign(scenarios, "D22:D38");
  reassign(scenarios, "F22:F38");
  reassign(scenarios, "B19");
  assert.equal(scenarios.getRange("B19").values[0][0], "PASS");

  const k5Formula = scenarios.getRange("K5").formulas[0][0];
  const originalGap = scenarios.getRange("K5").values[0][0];
  scenarios.getRange("K5").values = [[originalGap + 100]];
  reassign(scenarios, "B38");
  reassign(scenarios, "D38:F38");
  reassign(scenarios, "B19");
  assert.equal(scenarios.getRange("F38").values[0][0], "FAIL");
  assert.equal(scenarios.getRange("B19").values[0][0], "FAIL");
  scenarios.getRange("K5").formulas = [[k5Formula]];
  reassign(scenarios, "B38");
  reassign(scenarios, "D38:F38");
  reassign(scenarios, "B19");
  assert.equal(scenarios.getRange("F38").values[0][0], "PASS");
  assert.equal(
    scenarios.getRange("B19").values[0][0],
    "PASS",
    `restored scenario checks: ${JSON.stringify(scenarios.getRange("A22:F38").values)}`,
  );

  const allocation = workbook.worksheets.getItem("城市分配");
  const fixedByCity = new Map(allocation.getRange("B6:D61").values.map((row) => [row[0], row[2]]));
  const monthlyCities = deployment.getRange("A28:A83").values.flat();
  const fixedRow = monthlyCities.findIndex((city) => fixedByCity.get(city) === "是") + 28;
  assert.ok(fixedRow >= 28);
  deployment.getRange(`J${fixedRow}:O${fixedRow}`).values = [Array(6).fill(0)];
  deployment.getRange(`V${fixedRow}:AA${fixedRow}`).values = [Array(6).fill(0)];
  reassign(deployment, `AI${fixedRow}`);
  reassign(scenarios, "B25");
  reassign(scenarios, "D25:F25");
  reassign(scenarios, "B19");
  assert.equal(scenarios.getRange("B25").values[0][0], 1);
  assert.equal(scenarios.getRange("F25").values[0][0], "FAIL");
  assert.equal(scenarios.getRange("B19").values[0][0], "FAIL");
});

test("visible checks reject pasted odd gun targets and residuals above financing", async () => {
  const workbook = await buildModel({ context: buildFastContext() });
  const assumptions = workbook.worksheets.getItem("核心假设");
  const finance = workbook.worksheets.getItem("融资租赁与资金缺口");
  const checks = workbook.worksheets.getItem("情景分析、检查与来源");
  const reassign = (sheet, address) => {
    const formulas = sheet.getRange(address).formulas;
    sheet.getRange(address).formulas = formulas;
  };
  const originalTarget = assumptions.getRange("B6").values[0][0];
  const originalFinanceRatio = assumptions.getRange("B27").values[0][0];
  const residualRate = assumptions.getRange("B32").values[0][0];

  assert.match(checks.getRange("B23").formulas[0][0], /MOD\('城市分配'!\$J\$6,2\)/);
  assert.match(checks.getRange("B23").formulas[0][0], /MOD\('城市分配'!\$L\$6,1\)/);
  assert.match(checks.getRange("B23").formulas[0][0], /MOD\('城市分配'!\$M\$61,1\)/);
  assert.match(checks.getRange("B29").formulas[0][0], /\$B\$27=80%/);
  assert.match(checks.getRange("B29").formulas[0][0], /\$B\$29=6%/);
  assert.match(checks.getRange("B29").formulas[0][0], /\$J\$5>'融资租赁与资金缺口'!\$E\$5/);

  assumptions.getRange("B6").values = [[30001]];
  reassign(checks, "B23");
  reassign(checks, "D23:F23");
  reassign(checks, "B19");
  assert.equal(checks.getRange("F23").values[0][0], "FAIL");
  assert.equal(checks.getRange("B19").values[0][0], "FAIL");

  assumptions.getRange("B6").values = [[originalTarget]];
  reassign(checks, "B23");
  reassign(checks, "D23:F23");
  reassign(checks, "B19");
  assert.equal(checks.getRange("F23").values[0][0], "PASS");
  assert.equal(checks.getRange("B19").values[0][0], "PASS");

  assumptions.getRange("B27").values = [[residualRate / 2]];
  reassign(finance, "E5:E16");
  reassign(checks, "B29");
  reassign(checks, "D29:F29");
  reassign(checks, "B19");
  assert.ok(finance.getRange("J5:J16").values.some((row, index) => row[0] > finance.getRange(`E${5 + index}`).values[0][0]));
  assert.equal(checks.getRange("F29").values[0][0], "FAIL");
  assert.equal(checks.getRange("B19").values[0][0], "FAIL");

  assumptions.getRange("B27").values = [[originalFinanceRatio]];
  reassign(finance, "E5:E16");
  reassign(checks, "B29");
  reassign(checks, "D29:F29");
  reassign(checks, "B19");
  assert.equal(checks.getRange("F29").values[0][0], "PASS");
  assert.equal(checks.getRange("B19").values[0][0], "PASS");
});

test("management summary is linked, warns on zero HQ and tax, and contains five native charts", async () => {
  const workbook = await getWorkbook();
  const sheet = workbook.worksheets.getItem("融资摘要");
  assert.match(sheet.getRange("B3").formulas[0][0], /'情景分析、检查与来源'!\$B\$19/);
  assert.match(sheet.getRange("D3").formulas[0][0], /'核心假设'!\$B\$37=0/);
  assert.match(sheet.getRange("D3").formulas[0][0], /'核心假设'!\$B\$38=0/);
  assert.equal(sheet.getRange("A13").values[0][0], "不可融资及自有资金承担");
  assert.match(sheet.getRange("B13").formulas[0][0], /SUM\('融资租赁与资金缺口'!\$M\$5:\$M\$16\)-SUM\('融资租赁与资金缺口'!\$E\$5:\$E\$16\)/);
  assert.match(sheet.getRange("T5").formulas[0][0], /'36月运营模型'!B5/);
  assert.ok(sheet.charts.items.length >= 5, `expected at least five charts, got ${sheet.charts.items.length}`);
});

test("Task 9 formula-error scan is clean", async () => {
  const workbook = await getWorkbook();
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "Task 9 formula error scan",
    maxChars: 6000,
  });
  assert.doesNotMatch(errors.ndjson, /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/);
});

test("real source completes the Task 9 workbook audit", { skip: process.env.TASK9_REAL_SOURCE !== "1" }, async () => {
  const workbook = await buildModel();
  const source = workbook.worksheets.getItem("历史原始数据");
  const checks = workbook.worksheets.getItem("情景分析、检查与来源");
  const summary = workbook.worksheets.getItem("融资摘要");
  assert.equal(source.getRange("A1:P3050").values.length, 3050);
  assert.deepEqual(checks.getRange("F22:F38").values.flat(), Array(17).fill("PASS"));
  assert.equal(checks.getRange("B19").values[0][0], "PASS");
  assert.ok(summary.charts.items.length >= 5);
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "Task 9 real-source formula error scan",
    maxChars: 6000,
  });
  assert.doesNotMatch(errors.ndjson, /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/);
});

test("renders Task 9 review previews", { skip: process.env.TASK9_RENDER !== "1" }, async () => {
  const workbook = await getWorkbook();
  const previews = [
    ["融资摘要", "A1:R66", "task9-financing-summary.png"],
    ["情景分析、检查与来源", "A1:O40", "task9-scenario-review.png"],
  ];
  for (const [sheetName, range, fileName] of previews) {
    const preview = await workbook.render({ sheetName, range, scale: 0.5, format: "png" });
    const bytes = new Uint8Array(await preview.arrayBuffer());
    const previewPath = join(tmpdir(), fileName);
    writeFileSync(previewPath, bytes);
    assert.ok(bytes.byteLength > 1000);
  }
});
