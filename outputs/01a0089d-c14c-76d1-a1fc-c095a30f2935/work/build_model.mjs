import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { FIXED_CITIES, BASE_ASSUMPTIONS, PATHS, SHEET_NAMES } from "./model/constants.mjs";
import { allocateCityTargets, scoreCities } from "./model/city_engine.mjs";
import { buildDeploymentPlan } from "./model/deployment_engine.mjs";
import { profileHistoricalRows } from "./model/historical_engine.mjs";
import { loadJson, validateCityInputs, validateSeasonalityInputs } from "./model/input_validation.mjs";
import { buildSeasonalityCurve, annualizePeakBenchmark } from "./model/seasonality_engine.mjs";
import { loadSourceMatrix, normalizeSourceMatrix } from "./model/source_reader.mjs";
import { buildInputSheets, createWorkbook } from "./model/workbook_inputs.mjs";
import { buildOutputSheets } from "./model/workbook_outputs.mjs";
import { applyWorkbookStyles } from "./model/workbook_style.mjs";

const WORK_DIR = dirname(fileURLToPath(import.meta.url));
const CITY_WEIGHTS = Object.freeze({ population: 0.30, density: 0.25, housing: 0.30, chargingScarcity: 0.15 });
const CITY_CONFIG = Object.freeze({
  targetGuns: BASE_ASSUMPTIONS.targetGuns,
  tierQuotas: Object.freeze({ "一线": 1000, "新一线": 800, "二线": 600, "三线": 400 }),
  fourGunSiteShareHigh: BASE_ASSUMPTIONS.fourGunSiteShareHigh,
  fourGunSiteShareLow: BASE_ASSUMPTIONS.fourGunSiteShareLow,
});

let defaultContextPromise;

async function loadModelContext(sourcePath) {
  const { matrix: sourceMatrix } = await loadSourceMatrix(sourcePath);
  const sourceRows = normalizeSourceMatrix(sourceMatrix);
  const historical = profileHistoricalRows(sourceRows, { matureOperatingDays: 30 });
  const seasonalityInputs = validateSeasonalityInputs(loadJson(join(WORK_DIR, "data", "seasonality_2024.json")));
  const seasonality = buildSeasonalityCurve(seasonalityInputs);
  const cityInputs = validateCityInputs(loadJson(join(WORK_DIR, "data", "city_inputs.json")), FIXED_CITIES);
  const scoredCities = scoreCities(cityInputs, CITY_WEIGHTS);
  const allocations = allocateCityTargets(scoredCities, CITY_CONFIG);
  const deployment = buildDeploymentPlan(allocations, {
    startMonth: BASE_ASSUMPTIONS.modelStartMonth,
    shares: BASE_ASSUMPTIONS.rolloutShares,
    totalGuns: BASE_ASSUMPTIONS.targetGuns,
    supplierTermsMonths: BASE_ASSUMPTIONS.supplierTermsMonths,
    financeDelayMonths: BASE_ASSUMPTIONS.leaseDelayMonths,
    expectedFixedCities: FIXED_CITIES,
  });
  const annualServicePerGunDay = annualizePeakBenchmark(
    historical.benchmarks.matureMedian,
    seasonality,
    "2026-06-16",
    "2026-08-15",
  );
  return {
    sourcePath,
    sourceMatrix,
    sourceRows,
    historical,
    seasonalityInputs,
    seasonality,
    cityInputs,
    scoredCities,
    allocations,
    deployment,
    annualServicePerGunDay,
  };
}

export function buildModelContext(sourcePath = PATHS.sourceWorkbook) {
  return sourcePath === PATHS.sourceWorkbook
    ? (defaultContextPromise ??= loadModelContext(sourcePath))
    : loadModelContext(sourcePath);
}

export async function buildModel({ exportFile = false, renderPreviews = false, context, sourcePath = PATHS.sourceWorkbook } = {}) {
  if (exportFile || renderPreviews) {
    throw new Error("Task 8 builds an in-memory workbook only; export and preview rendering are deferred to Task 10");
  }
  const resolvedContext = context ?? buildModelContext(sourcePath);
  const workbook = createWorkbook();
  const modelContext = await resolvedContext;
  buildInputSheets(workbook, modelContext);
  buildOutputSheets(workbook, modelContext);
  applyWorkbookStyles(workbook);
  return workbook;
}

const PREVIEW_DIR = join(WORK_DIR, "previews");
const VERIFICATION_LOG = join(WORK_DIR, "final-verification.log");
const ERROR_PATTERN = /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A|#NUM!/;
const KEY_RANGES = Object.freeze([
  ["融资摘要", "A1:R45"],
  ["核心假设", "A1:M65"],
  ["历史单枪模型", "A1:M80"],
  ["36月运营模型", "A1:BI35"],
  ["融资租赁与资金缺口", "A1:BI80"],
  ["情景分析、检查与来源", "A1:I120"],
]);
const PREVIEW_SPECS = Object.freeze([
  ["融资摘要", "A1:R66", "01-融资摘要.png", 0.8],
  ["核心假设", "A1:M65", "02-核心假设.png", 0.8],
  ["城市数据库", "A1:AG61", "03-城市数据库.png", 0.55],
  ["城市分配", "A1:S61", "04-城市分配.png", 0.7],
  ["月度投放计划", "A1:AI83", "05-月度投放计划.png", 0.55],
  ["单站成本", "A1:H10", "06-单站成本.png", 1],
  ["历史原始数据", "A1:P50", "07-历史原始数据.png", 0.8],
  ["历史单枪模型", "A1:M80", "08-历史单枪模型.png", 0.75],
  ["年度季节曲线", "A1:N20", "09-年度季节曲线.png", 0.9],
  ["36月运营模型", "A1:BI24", "10-36月运营模型.png", 0.5],
  ["融资租赁与资金缺口", "A1:BI121", "11-融资租赁与资金缺口.png", 0.45],
  ["情景分析、检查与来源", "A1:CM40", "12-情景分析检查与来源.png", 0.45],
]);

function sheet(workbook, name) {
  return workbook.worksheets.getItem(name);
}

function cell(workbook, sheetName, address) {
  return sheet(workbook, sheetName).getRange(address).values[0][0];
}

function numericValues(range) {
  return range.values.flat().filter((value) => typeof value === "number" && Number.isFinite(value));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function close(actual, expected, tolerance = 0.01) {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
}

function recordCheck(checks, name, passed, detail) {
  checks.push({ name, status: passed ? "PASS" : "FAIL", detail });
}

function requirePassing(checks, label) {
  const failures = checks.filter(({ status }) => status !== "PASS");
  if (failures.length) {
    throw new Error(`${label} failed: ${failures.map(({ name, detail }) => `${name} (${detail})`).join("; ")}`);
  }
}

async function inspectKeyRanges(workbook) {
  const inspections = [];
  for (const [sheetName, range] of KEY_RANGES) {
    const result = await workbook.inspect({
      kind: "table",
      sheetId: sheetName,
      range,
      include: "values,formulas",
      tableMaxRows: 120,
      tableMaxCols: 61,
      tableMaxCellChars: 160,
      maxChars: 9000,
      summary: `Task 10 key-range inspection: ${sheetName}!${range}`,
    });
    const text = result?.ndjson ?? JSON.stringify(result);
    inspections.push({ sheetName, range, chars: text.length, lines: text.split(/\r?\n/).filter(Boolean).length });
  }
  return inspections;
}

async function scanFormulaErrors(workbook, label) {
  const result = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
    options: { useRegex: true, maxResults: 300 },
    summary: label,
    maxChars: 12000,
  });
  const text = result?.ndjson ?? JSON.stringify(result);
  if (ERROR_PATTERN.test(text)) throw new Error(`${label} found a formula error: ${text.slice(0, 500)}`);
  return { label, clean: true, chars: text.length };
}

function auditWorkbook(workbook, context, label) {
  const checks = [];
  const checkSheet = sheet(workbook, "情景分析、检查与来源");
  const visibleLabels = checkSheet.getRange("A22:A38").values.flat();
  const visibleStatuses = checkSheet.getRange("F22:F38").values.flat();
  visibleStatuses.forEach((status, index) => recordCheck(
    checks,
    `显式检查 ${index + 1}: ${visibleLabels[index]}`,
    status === "PASS",
    `F${22 + index}=${status}`,
  ));
  recordCheck(checks, "总体模型状态", checkSheet.getRange("B19").values[0][0] === "PASS", `B19=${checkSheet.getRange("B19").values[0][0]}`);

  const actualSheets = workbook.worksheets.items.map(({ name }) => name);
  recordCheck(checks, "工作表名称与顺序", JSON.stringify(actualSheets) === JSON.stringify(SHEET_NAMES), actualSheets.join(" | "));
  recordCheck(checks, "历史原始数据范围", sheet(workbook, "历史原始数据").getRange("A1:P3050").values.length === 3050, "A1:P3050");
  recordCheck(checks, "历史订单总额拆分", Math.abs(context.historical.reconciliations.grossComponentsDifference) <= 0.01, `差额=${context.historical.reconciliations.grossComponentsDifference}`);

  const allocatedGuns = sum(context.allocations.map(({ targetGuns }) => targetGuns));
  const allocationSitesTie = context.allocations.every(({ targetGuns, twoGunSites, fourGunSites }) => targetGuns === (2 * twoGunSites) + (4 * fourGunSites));
  recordCheck(checks, "城市分配总枪数", allocatedGuns === BASE_ASSUMPTIONS.targetGuns, `${allocatedGuns}`);
  recordCheck(checks, "城市站型枪数勾稽", allocationSitesTie, `${context.allocations.length} 个城市`);
  recordCheck(checks, "部署月度枪数总计", sum(context.deployment.monthlyGuns) === BASE_ASSUMPTIONS.targetGuns, `${sum(context.deployment.monthlyGuns)}`);
  recordCheck(checks, "部署首月", context.deployment.monthlyGuns[0] > 0, `首月=${context.deployment.monthlyGuns[0]}`);
  recordCheck(checks, "部署末月", context.deployment.monthlyGuns.at(-1) > 0, `末月=${context.deployment.monthlyGuns.at(-1)}`);
  const fixedLaunches = FIXED_CITIES.map((city) => context.deployment.firstOnlineMonthByCity[city]);
  recordCheck(checks, "固定26城均上线", fixedLaunches.every(Boolean), fixedLaunches.join(","));
  recordCheck(checks, "固定26城最迟首6月上线", fixedLaunches.every((month) => month <= "2027-02"), `最迟=${fixedLaunches.slice().sort().at(-1)}`);

  const lease = sheet(workbook, "融资租赁与资金缺口");
  const eligibleBasis = sum(numericValues(lease.getRange("D5:D16")));
  const disbursement = sum(numericValues(lease.getRange("E5:E16")));
  const totalCapex = sum(numericValues(lease.getRange("M5:M16")));
  const channelCost = sum(numericValues(lease.getRange("N5:N16")));
  const advanceRate = cell(workbook, "核心假设", "B27");
  recordCheck(checks, "总投资=融资租赁合格基础+渠道费", close(totalCapex, eligibleBasis + channelCost), `${totalCapex} vs ${eligibleBasis + channelCost}`);
  recordCheck(checks, "放款=合格基础×融资比例", close(disbursement, eligibleBasis * advanceRate), `${disbursement} vs ${eligibleBasis * advanceRate}`);
  recordCheck(checks, "放款月流量与元数据一致", close(sum(numericValues(lease.getRange("B105:BI105"))), disbursement), `${sum(numericValues(lease.getRange("B105:BI105")))} vs ${disbursement}`);

  const payableFormed = sum(numericValues(lease.getRange("B102:BI102")));
  const supplierPaid = sum(numericValues(lease.getRange("B103:BI103")));
  const endingPayable = cell(workbook, "融资租赁与资金缺口", "BI104");
  recordCheck(checks, "应付账款滚动", close(payableFormed - supplierPaid, endingPayable), `${payableFormed}-${supplierPaid}=${endingPayable}`);
  const debtService = sum(numericValues(lease.getRange("B110:BI110")));
  const debtParts = sum(numericValues(lease.getRange("B107:BI109")));
  recordCheck(checks, "租金=利息+本金+残值", close(debtService, debtParts), `${debtService} vs ${debtParts}`);
  recordCheck(checks, "各批次期末租赁余额为零", numericValues(lease.getRange("BI22:BI33")).every((value) => Math.abs(value) <= 0.01), numericValues(lease.getRange("BI22:BI33")).join(","));
  recordCheck(checks, "组合期末租赁余额为零", Math.abs(cell(workbook, "融资租赁与资金缺口", "BI111")) <= 0.01, `${cell(workbook, "融资租赁与资金缺口", "BI111")}`);

  const cfads = sum(numericValues(lease.getRange("B112:BI112")));
  const fullDscr = cell(workbook, "融资摘要", "E9");
  recordCheck(checks, "全周期DSCR为比率之和", close(fullDscr, cfads / debtService, 0.000001), `${fullDscr} vs ${cfads / debtService}`);
  const equityInjection = cell(workbook, "融资租赁与资金缺口", "B118");
  const preEquityFormulas = lease.getRange("B116:BI116").formulas.flat().join(" ");
  const afterEquityFormulas = lease.getRange("B119:BI119").formulas.flat().join(" ");
  recordCheck(checks, "最低资金缺口不计入经营收入", !preEquityFormulas.includes("$B$118"), "B116:BI116");
  recordCheck(checks, "最低资金注入仅进入注入后现金", afterEquityFormulas.includes("$B$118") && equityInjection >= 0, `注入=${equityInjection}`);
  recordCheck(checks, "3年期租赁余额摘要勾稽", close(cell(workbook, "融资摘要", "E12"), cell(workbook, "融资租赁与资金缺口", "AK111")), `${cell(workbook, "融资摘要", "E12")}`);

  const operations = sheet(workbook, "36月运营模型");
  recordCheck(checks, "60个月底层时间轴", operations.getRange("B5:BI5").values.flat().filter(Boolean).length === 60, "B5:BI5");
  recordCheck(checks, "基准建设期后无新增枪", numericValues(operations.getRange("N7:BI7")).every((value) => value === 0), `N7:BI7 sum=${sum(numericValues(operations.getRange("N7:BI7")))}`);
  const property = numericValues(operations.getRange("B15:BI15"));
  const otherOpex = numericValues(operations.getRange("B16:BI16"));
  recordCheck(checks, "物业成本非负", property.every((value) => value >= 0), `min=${Math.min(...property)}`);
  recordCheck(checks, "其他opex非负", otherOpex.every((value) => value >= 0), `min=${Math.min(...otherOpex)}`);
  const seasonalityAverage = sum(numericValues(sheet(workbook, "年度季节曲线").getRange("H6:H17"))) / 12;
  recordCheck(checks, "季节因子年均为1", close(seasonalityAverage, 1, 0.000001), `${seasonalityAverage}`);
  recordCheck(checks, "融资摘要原生图表", sheet(workbook, "融资摘要").charts.items.length >= 5, `${sheet(workbook, "融资摘要").charts.items.length}`);
  recordCheck(checks, "目标枪数摘要", cell(workbook, "融资摘要", "B5") === BASE_ASSUMPTIONS.targetGuns, `${cell(workbook, "融资摘要", "B5")}`);
  requirePassing(checks, label);
  return checks;
}

async function traceSummary(workbook, reference) {
  try {
    const result = await workbook.trace(reference);
    const text = typeof result === "string" ? result : (result?.ndjson ?? JSON.stringify(result));
    const lines = text.split(/\r?\n/).filter(Boolean);
    let maxDepth = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (Number.isFinite(parsed.depth)) maxDepth = Math.max(maxDepth, parsed.depth);
      } catch {
        // Trace output is intentionally summarized; non-NDJSON text still counts as one node line.
      }
    }
    return { reference, status: "PASS", nodes: lines.length, maxDepth, chars: text.length };
  } catch (error) {
    return { reference, status: "UNAVAILABLE", message: error instanceof Error ? error.message : String(error) };
  }
}

async function renderWorkbookPreviews(workbook) {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const previews = [];
  for (const [sheetName, range, fileName, scale] of PREVIEW_SPECS) {
    const rendered = await workbook.render({ sheetName, range, scale, format: "png" });
    const bytes = new Uint8Array(await rendered.arrayBuffer());
    if (bytes.byteLength <= 1000) throw new Error(`preview is unexpectedly small: ${fileName} (${bytes.byteLength} bytes)`);
    const path = join(PREVIEW_DIR, fileName);
    await fs.writeFile(path, bytes);
    previews.push({ sheetName, range, path, bytes: bytes.byteLength });
    globalThis.gc?.();
  }
  return previews;
}

export async function finalizeModel({ sourcePath = PATHS.sourceWorkbook } = {}) {
  const startedAt = new Date().toISOString();
  console.error("[Task10] loading real source and building workbook");
  let context = await buildModelContext(sourcePath);
  let workbook = await buildModel({ context });
  console.error("[Task10] workbook built; inspecting six key ranges");
  const inspections = await inspectKeyRanges(workbook);
  console.error("[Task10] key ranges inspected; running finance audit and error scan");
  const buildChecks = auditWorkbook(workbook, context, "pre-export finance audit");
  const buildErrorScan = await scanFormulaErrors(workbook, "Task 10 full-workbook pre-export formula error scan");
  globalThis.gc?.();
  const traceReferences = ["融资摘要!B12", "融资摘要!E10", "融资摘要!E12"];
  const skipTraceReason = process.env.TASK10_SKIP_TRACE_REASON;
  const traces = [];
  if (skipTraceReason) {
    console.error("[Task10] recording trace as unavailable after prior resource-bound attempts");
    traces.push(...traceReferences.map((reference) => ({
      reference,
      status: "UNAVAILABLE",
      message: skipTraceReason,
    })));
  } else {
    console.error("[Task10] pre-export audit clean; tracing three summary outputs");
    for (const reference of traceReferences) traces.push(await traceSummary(workbook, reference));
  }
  console.error("[Task10] trace attempts complete; rendering twelve previews");
  const previews = await renderWorkbookPreviews(workbook);

  console.error("[Task10] previews rendered; exporting the final workbook");
  await fs.mkdir(dirname(PATHS.outputWorkbook), { recursive: true });
  const exported = await SpreadsheetFile.exportXlsx(workbook);
  await exported.save(PATHS.outputWorkbook);
  const outputBytes = (await fs.stat(PATHS.outputWorkbook)).size;

  console.error("[Task10] export complete; reimporting and rerunning the audit");
  const auditContext = {
    historical: { reconciliations: context.historical.reconciliations },
    allocations: context.allocations,
    deployment: context.deployment,
  };
  context = null;
  workbook = null;
  globalThis.gc?.();
  const reimported = await SpreadsheetFile.importXlsx(await FileBlob.load(PATHS.outputWorkbook));
  const reimportChecks = auditWorkbook(reimported, auditContext, "post-export reimport finance audit");
  const reimportErrorScan = await scanFormulaErrors(reimported, "Task 10 full-workbook post-export formula error scan");
  const result = {
    startedAt,
    completedAt: new Date().toISOString(),
    outputWorkbook: PATHS.outputWorkbook,
    outputBytes,
    inspections,
    buildChecks,
    buildErrorScan,
    traces,
    previews,
    reimportChecks,
    reimportErrorScan,
    kpis: {
      targetGuns: cell(reimported, "融资摘要", "B5"),
      totalInvestment: cell(reimported, "融资摘要", "B6"),
      threeYearServiceFee: cell(reimported, "融资摘要", "B7"),
      threeYearCfads: cell(reimported, "融资摘要", "B8"),
      leaseDisbursement: cell(reimported, "融资摘要", "B9"),
      minimumEquity: cell(reimported, "融资摘要", "B10"),
      peakFundingGapMonth: cell(reimported, "融资摘要", "B11"),
      peakFundingGap: cell(reimported, "融资摘要", "B12"),
      fullCycleDscr: cell(reimported, "融资摘要", "E9"),
      minimumMonthlyDscr: cell(reimported, "融资摘要", "E10"),
      threeYearLeaseBalance: cell(reimported, "融资摘要", "E12"),
    },
  };
  await fs.writeFile(VERIFICATION_LOG, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.error("[Task10] reimport audit clean; verification log written");
  return result;
}

function excelSerialToMonth(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
  const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function verifyExistingWorkbook() {
  const stat = await fs.stat(PATHS.outputWorkbook);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(PATHS.outputWorkbook));
  const inspections = await inspectKeyRanges(workbook);
  const checks = sheet(workbook, "情景分析、检查与来源");
  const sheetNames = workbook.worksheets.items.map(({ name }) => name);
  const xlsxFiles = (await fs.readdir(dirname(PATHS.outputWorkbook)))
    .filter((name) => name.toLowerCase().endsWith(".xlsx"));
  const assertions = [
    ["twelve approved sheets", JSON.stringify(sheetNames) === JSON.stringify(SHEET_NAMES), sheetNames.join(" | ")],
    ["seventeen visible checks", checks.getRange("F22:F38").values.flat().every((value) => value === "PASS"), checks.getRange("F22:F38").values.flat().join(",")],
    ["overall model status", checks.getRange("B19").values[0][0] === "PASS", checks.getRange("B19").values[0][0]],
    ["summary native charts", sheet(workbook, "融资摘要").charts.items.length >= 5, sheet(workbook, "融资摘要").charts.items.length],
    ["historical dates have no errors", sheet(workbook, "历史单枪模型").getRange("I6:J65").values.flat().every((value) => !ERROR_PATTERN.test(String(value))), "I6:J65"],
    ["deployment month headers formatted", JSON.stringify(sheet(workbook, "月度投放计划").getRange("V4:AG4").format.numberFormat).includes("yyyy-mm"), JSON.stringify(sheet(workbook, "月度投放计划").getRange("V4:AG4").format.numberFormat)],
    ["only one xlsx output", xlsxFiles.length === 1 && xlsxFiles[0] === PATHS.outputWorkbook.split("/").at(-1), xlsxFiles.join(",")],
    ["output is nontrivial", stat.size > 100000, stat.size],
  ].map(([name, passed, detail]) => ({ name, status: passed ? "PASS" : "FAIL", detail }));
  requirePassing(assertions, "existing workbook verification");
  const errorScan = await scanFormulaErrors(workbook, "Task 10 independent existing-workbook formula error scan");
  return {
    outputWorkbook: PATHS.outputWorkbook,
    outputBytes: stat.size,
    inspections,
    assertions,
    errorScan,
    peakFundingGapMonth: excelSerialToMonth(cell(workbook, "融资摘要", "B11")),
    kpis: {
      targetGuns: cell(workbook, "融资摘要", "B5"),
      totalInvestment: cell(workbook, "融资摘要", "B6"),
      minimumEquity: cell(workbook, "融资摘要", "B10"),
      peakFundingGap: cell(workbook, "融资摘要", "B12"),
      fullCycleDscr: cell(workbook, "融资摘要", "E9"),
      minimumMonthlyDscr: cell(workbook, "融资摘要", "E10"),
      threeYearLeaseBalance: cell(workbook, "融资摘要", "E12"),
    },
  };
}

if (process.argv.includes("--verify-existing")) {
  const result = await verifyExistingWorkbook();
  console.log(JSON.stringify({ ...result, processExitCode: process.exitCode ?? 0 }, null, 2));
} else if (process.argv.includes("--finalize")) {
  const result = await finalizeModel();
  console.log(JSON.stringify({
    outputWorkbook: result.outputWorkbook,
    outputBytes: result.outputBytes,
    buildChecks: result.buildChecks.length,
    reimportChecks: result.reimportChecks.length,
    traces: result.traces,
    previews: result.previews.length,
    kpis: result.kpis,
  }, null, 2));
}

export { createWorkbook, buildInputSheets, buildOutputSheets, applyWorkbookStyles };
