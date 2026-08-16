# 便民充电站 HTML 融资测算表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成一个可在 Chrome 或 Edge 中双击打开、完全离线运行、覆盖现有 12 个模型模块并支持 Excel 重导入和方案保存的单文件 HTML 测算表。

**Architecture:** 在仓库根目录新增 `html-calculator/` 可维护源码，使用原生 HTML/CSS/JavaScript 构建专用投融资界面，并直接导入现有纯计算引擎，避免复制业务公式。构建脚本使用 esbuild 将应用、SheetJS、Chart.js、基准历史数据、城市数据和季节数据内联成单个 HTML；Node 单元测试、黄金基准对照和 Playwright 离线浏览器测试共同作为发布门禁。

**Tech Stack:** Node.js 24、原生 ES modules、esbuild 0.28.2、SheetJS `xlsx` 0.18.5、Chart.js 4.5.1、Playwright 1.62.1、fake-indexeddb 6.2.5、Node `node:test`、本机稳定版 Chrome 和 Edge。

## Global Constraints

- 正式成品必须是单个 `便民充电站单枪收入与融资租赁测算.html`，运行时不请求 CDN、API、字体或统计服务。
- 正式浏览器为当前稳定版 Chrome 和 Edge；编辑以电脑宽屏为主。
- 完整覆盖现有 Excel 的 12 个模块，模块顺序和名称保持一致。
- 基准目标为 30,000 枪，目标枪数必须为正偶数；2 枪站和 4 枪站必须是非负整数。
- 首批 26 城必须在部署前 6 个月首次上线；基准部署 12 个月，慢建设 18 个月。
- 计算轴为 60 个月，前 36 个月是正式报告期，第 37 至 60 个月是债务尾期。
- 物业成本严格采用固定月租或服务费分成二选一。
- 总部费用或经营税为 0 时必须保留黄色警示。
- 导入校验失败不得覆盖当前数据；计算失败不得覆盖最近一次有效结果。
- 所有数据只保存在本机；方案 JSON 包含版本、输入、城市设置、历史摘要和完整历史记录。
- 首次打开原则上不超过 5 秒，单个核心参数修改后原则上 1 秒内更新，3,049 行导入原则上 10 秒内完成。
- 最终成品、生成源码、测试和使用说明全部纳入现有 GitHub 仓库。

---

## File Structure

```text
html-calculator/
  package.json                         # 固定依赖和构建/测试命令
  package-lock.json                    # 可重复安装锁文件
  playwright.config.mjs                # Chromium 与本机 Edge 验收配置
  README.md                            # 离线使用、导入、方案文件和风险说明
  data/
    historical-baseline.json           # 当前 3,049 行标准化历史记录
    golden-baseline.json               # Excel 基准 KPI 和容差
    third-party-notices.txt            # xlsx、Chart.js、esbuild 许可说明
  scripts/
    extract-baseline.mjs               # 从源 Excel 生成标准化历史 JSON
    build-single-file.mjs              # 构建并验证单文件 HTML
    verify-release.mjs                 # 对成品执行结构、离线和哈希门禁
  src/
    index.template.html                # 单文件外壳和嵌入点
    styles.css                         # 屏幕与打印样式
    main.mjs                            # 启动、计算、事件和页面切换
    app-state.mjs                      # 有效状态、草稿状态和错误状态
    model/
      source-contract.mjs              # 16 列历史源标准化与导入校验
      calculator.mjs                   # 组合现有纯引擎形成完整 ModelResult
      checks.mjs                       # 17 项可见检查和总状态
      view-model.mjs                   # 12 模块需要的格式化只读数据
    io/
      excel-import.mjs                 # 浏览器 SheetJS 文件解析
      solution-file.mjs                # 方案 JSON 导入导出与版本校验
      solution-store.mjs               # IndexedDB 自动保存和恢复
    ui/
      shell.mjs                        # 顶栏、侧栏、主工作区和全局状态
      controls.mjs                     # 数字、比例、月份、选择器和错误提示
      data-table.mjs                   # 分页、搜索、筛选、冻结表头
      charts.mjs                       # 五类 Chart.js 图表及销毁/重建
      pages/
        summary.mjs
        assumptions.mjs
        city-database.mjs
        city-allocation.mjs
        deployment.mjs
        station-cost.mjs
        historical-raw.mjs
        historical-model.mjs
        seasonality.mjs
        operations.mjs
        lease.mjs
        scenarios-checks-sources.mjs
  tests/
    unit/
      source-contract.test.mjs
      calculator.test.mjs
      checks.test.mjs
      app-state.test.mjs
      solution-file.test.mjs
      solution-store.test.mjs
      build-single-file.test.mjs
    e2e/
      offline-calculator.spec.mjs
      import-and-persistence.spec.mjs
      visual-and-print.spec.mjs
    fixtures/
      invalid-gross.xlsx
      invalid-schema.xlsx
      valid-update.xlsx
    e2e/helpers.mjs                   # 成品 file URL 和浏览器错误收集
outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/
  便民充电站单枪收入与融资租赁测算.html
```

The existing pure engines remain at `outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/`; the HTML calculator imports `city_engine.mjs`, `deployment_engine.mjs`, `historical_engine.mjs`, `seasonality_engine.mjs`, `operations_engine.mjs`, and `lease_engine.mjs` directly.

---

### Task 1: Scaffold the Offline Web Build and Lock the Public Contracts

**Files:**
- Create: `html-calculator/package.json`
- Create: `html-calculator/package-lock.json`
- Create: `html-calculator/src/index.template.html`
- Create: `html-calculator/src/main.mjs`
- Create: `html-calculator/src/styles.css`
- Create: `html-calculator/scripts/build-single-file.mjs`
- Create: `html-calculator/data/golden-baseline.json`
- Create: `html-calculator/tests/unit/build-single-file.test.mjs`

**Interfaces:**
- Consumes: existing repository paths and final Excel KPI evidence.
- Produces: npm scripts `test:unit`, `build`, `test:e2e`, and `verify`; template markers `<!-- INLINE_STYLE -->`, `<!-- EMBEDDED_DATA -->`, and `<!-- INLINE_SCRIPT -->`.

- [ ] **Step 1: Write the failing build-contract test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("template exposes all single-file injection points", () => {
  const html = readFileSync(new URL("../../src/index.template.html", import.meta.url), "utf8");
  assert.match(html, /<!-- INLINE_STYLE -->/);
  assert.match(html, /<!-- EMBEDDED_DATA -->/);
  assert.match(html, /<!-- INLINE_SCRIPT -->/);
  assert.match(html, /lang="zh-CN"/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd html-calculator && node --test tests/unit/build-single-file.test.mjs`
Expected: FAIL because `src/index.template.html` does not exist.

- [ ] **Step 3: Create the package and template**

Use this script contract in `package.json`:

```json
{
  "name": "ant-charge-station-html-calculator",
  "private": true,
  "type": "module",
  "scripts": {
    "test:unit": "node --test tests/unit/*.test.mjs",
    "build": "node scripts/build-single-file.mjs",
    "test:e2e": "playwright test",
    "verify": "npm run test:unit && npm run build && npm run test:e2e"
  },
  "dependencies": {
    "chart.js": "4.5.1",
    "xlsx": "0.18.5"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "esbuild": "0.28.2",
    "fake-indexeddb": "6.2.5"
  }
}
```

The template must contain a UTF-8 meta tag, a viewport tag, an empty `#app`, the three injection markers, and no external resource tag. Create the initial builder now: it bundles `src/main.mjs` with esbuild, reads `src/styles.css`, reads the embedded data files once they exist, replaces the three markers, and writes the approved output path. Task 9 will add strict packaging, license, and release-verification gates to this same builder.

- [ ] **Step 4: Record the approved golden KPI fixture**

```json
{
  "targetGuns": 30000,
  "totalInvestment": 640300000,
  "threeYearServiceFee": 1547192645.96,
  "threeYearCfads": 1083034852.17,
  "leaseDisbursement": 543300000,
  "peakFundingGap": 229020.49,
  "peakFundingGapMonth": "2026-11",
  "fullCycleDscr": 3.2105203463,
  "minimumMonthlyDscr": 1.8550933515,
  "threeYearLeaseBalance": 141715483.68,
  "moneyTolerance": 0.02,
  "ratioTolerance": 0.000001
}
```

- [ ] **Step 5: Install exact dependencies and run GREEN**

Run: `cd html-calculator && npm install`
Run: `node --test tests/unit/build-single-file.test.mjs`
Expected: 1 test PASS and `package-lock.json` records the exact dependency graph.

- [ ] **Step 6: Commit the scaffold**

```powershell
git add -- html-calculator/package.json html-calculator/package-lock.json html-calculator/src/index.template.html html-calculator/src/main.mjs html-calculator/src/styles.css html-calculator/scripts/build-single-file.mjs html-calculator/data/golden-baseline.json html-calculator/tests/unit/build-single-file.test.mjs
git diff --cached --check
git commit -m "build(html): scaffold offline calculator"
```

---

### Task 2: Implement the Historical Source Contract and Baseline Extraction

**Files:**
- Create: `html-calculator/src/model/source-contract.mjs`
- Create: `html-calculator/src/io/excel-import.mjs`
- Create: `html-calculator/scripts/extract-baseline.mjs`
- Create: `html-calculator/data/historical-baseline.json`
- Create: `html-calculator/tests/unit/source-contract.test.mjs`
- Create: `html-calculator/tests/fixtures/invalid-gross.xlsx`
- Create: `html-calculator/tests/fixtures/invalid-schema.xlsx`
- Create: `html-calculator/tests/fixtures/valid-update.xlsx`

**Interfaces:**
- Consumes: `Array<Array<unknown>>` read from `Data List`.
- Produces: `normalizeSourceMatrix(matrix) -> HistoricalRow[]`, `validateHistoricalRows(rows) -> { reconciliations }`, and `parseSourceWorkbook(arrayBuffer) -> { rows, sheetName, sourcePeriod }`.

- [ ] **Step 1: Write source normalization and rejection tests**

```js
const APPROVED_HEADERS = Object.freeze([
  "订单创建日期", "站点ID", "站点名称", "直流桩数", "交流桩数", "充电单量",
  "充电电量（度）", "尖时电量（度）", "峰时电量（度）", "平时电量（度）",
  "谷时电量（度）", "充电时长（分钟）", "订单总额（元）", "充电电费（元）",
  "充电服务费（元）", "报表更新日期"
]);

function historicalRow(overrides = {}) {
  return {
    date: new Date("2026-06-16T00:00:00Z"), stationId: "S1", stationName: "测试站",
    dcGuns: 2, acGuns: 0, orders: 3, kwh: 20, sharpKwh: 1, peakKwh: 2,
    flatKwh: 7, valleyKwh: 10, minutes: 60, gross: 18,
    electricityFee: 12, serviceFee: 6, rawRowNumber: 2, ...overrides
  };
}

test("normalizes the approved 16-column matrix", () => {
  const rows = normalizeSourceMatrix([
    APPROVED_HEADERS,
    ["2026-06-16", "S1", "测试站", 2, 0, 3, 20, 1, 2, 7, 10, 60, 18, 12, 6, ""],
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rawRowNumber, 2);
  assert.equal(rows[0].date.toISOString().slice(0, 10), "2026-06-16");
  assert.equal(validateHistoricalRows(rows).reconciliations.grossComponentsDifference, 0);
});

test("rejects a cumulative gross split difference above one yuan", () => {
  const rows = [historicalRow({ gross: 20, electricityFee: 10, serviceFee: 8 })];
  assert.throws(() => validateHistoricalRows(rows), /订单总金额.*电费.*服务费/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd html-calculator && node --test tests/unit/source-contract.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `source-contract.mjs`.

- [ ] **Step 3: Implement the exact 16-column contract**

`normalizeSourceMatrix` must preserve `rawRowNumber`, convert Excel dates and `YYYY-MM-DD` strings to valid local calendar dates, convert blank numeric cells to zero, exclude fully blank rows, and produce the same fields as the existing `normalizeSourceMatrix`:

```js
{
  date, stationId, stationName, dcGuns, acGuns, orders, kwh,
  sharpKwh, peakKwh, flatKwh, valleyKwh, minutes,
  gross, electricityFee, serviceFee, rawRowNumber
}
```

`validateHistoricalRows` must reject invalid dates, blank station IDs, non-finite numbers, negative gun counts, zero total guns, and cumulative gross-component absolute difference above `1`.

- [ ] **Step 4: Implement the browser Excel parser**

```js
import * as XLSX from "xlsx";
import { normalizeSourceMatrix, validateHistoricalRows } from "../model/source-contract.mjs";

export function parseSourceWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  if (!workbook.SheetNames.includes("Data List")) throw new Error("缺少 Data List 工作表");
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets["Data List"], { header: 1, raw: true, defval: null });
  const rows = normalizeSourceMatrix(matrix);
  const validation = validateHistoricalRows(rows);
  return { rows, sheetName: "Data List", sourcePeriod: validation.sourcePeriod };
}
```

- [ ] **Step 5: Generate and verify the committed baseline**

Run: `cd html-calculator && node scripts/extract-baseline.mjs "D:/工作资料/蚂蚁站/站点报表-导出项 (2).xlsx"`
Assert in the script before writing:

```js
assert.equal(rows.length, 3049);
assert.equal(profile.totals.orders, 84356);
assert.ok(Math.abs(profile.totals.gross - 1758717.20) <= 0.01);
assert.ok(Math.abs(profile.totals.electricityFee - 1202523.78) <= 0.01);
assert.ok(Math.abs(profile.totals.serviceFee - 556193.42) <= 0.01);
```

The generated JSON stores dates as `YYYY-MM-DD`; runtime restoration converts them back to `Date` objects.

- [ ] **Step 6: Generate the three fixture workbooks and run GREEN**

Use SheetJS in the test setup to create one valid two-station workbook, one workbook missing `Data List`, and one workbook with a gross split difference above 1 yuan.
Run: `cd html-calculator && node --test tests/unit/source-contract.test.mjs`
Expected: all import, normalization, and failure-atomicity tests PASS.

- [ ] **Step 7: Commit source import support**

```powershell
git add -- html-calculator/src/model/source-contract.mjs html-calculator/src/io/excel-import.mjs html-calculator/scripts/extract-baseline.mjs html-calculator/data/historical-baseline.json html-calculator/tests/unit/source-contract.test.mjs html-calculator/tests/fixtures
git diff --cached --check
git commit -m "feat(html): import and validate historical workbooks"
```

---

### Task 3: Compose the Existing Engines into One Browser Model Result

**Files:**
- Create: `html-calculator/src/model/calculator.mjs`
- Create: `html-calculator/src/model/checks.mjs`
- Create: `html-calculator/src/model/view-model.mjs`
- Create: `html-calculator/tests/unit/calculator.test.mjs`
- Create: `html-calculator/tests/unit/checks.test.mjs`

**Interfaces:**
- Consumes: `EmbeddedData = { metadata, historyRows, cityInputs, seasonalityInputs, cityAuditManifest }` and `ModelState` with `assumptions`, `history.rows`, `cityInputs`, and `seasonalityInputs`.
- Produces: `createBaselineState(embeddedData) -> ModelState` and `calculateModel(state) -> ModelResult` with `historical`, `seasonality`, `cities`, `deployment`, `operations`, `finance`, `scenarios`, `termComparison`, `checks`, `status`, `warnings`, and `kpis`.

- [ ] **Step 1: Write the golden parity test**

```js
function readJson(relativeUrl) {
  return JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), "utf8"));
}

function loadEmbeddedFixture() {
  return {
    metadata: { modelVersion: "html-model-1" },
    historyRows: readJson("../../data/historical-baseline.json"),
    cityInputs: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/city_inputs.json"),
    seasonalityInputs: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/seasonality_2024.json"),
    cityAuditManifest: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/city_metric_audit_manifest.json")
  };
}

const golden = JSON.parse(readFileSync(new URL("../../data/golden-baseline.json", import.meta.url), "utf8"));
const embedded = loadEmbeddedFixture();
const assertMoney = (actual, expected) => assert.ok(Math.abs(actual - expected) <= golden.moneyTolerance);
const assertRatio = (actual, expected) => assert.ok(Math.abs(actual - expected) <= golden.ratioTolerance);

test("baseline model reconciles to the approved Excel KPIs", () => {
  const result = calculateModel(createBaselineState(embedded));
  assert.equal(result.kpis.targetGuns, golden.targetGuns);
  assertMoney(result.kpis.totalInvestment, golden.totalInvestment);
  assertMoney(result.kpis.threeYearServiceFee, golden.threeYearServiceFee);
  assertMoney(result.kpis.threeYearCfads, golden.threeYearCfads);
  assertMoney(result.kpis.leaseDisbursement, golden.leaseDisbursement);
  assertMoney(result.kpis.peakFundingGap, golden.peakFundingGap);
  assert.equal(result.kpis.peakFundingGapMonth, golden.peakFundingGapMonth);
  assertRatio(result.kpis.fullCycleDscr, golden.fullCycleDscr);
  assertRatio(result.kpis.minimumMonthlyDscr, golden.minimumMonthlyDscr);
  assertMoney(result.kpis.threeYearLeaseBalance, golden.threeYearLeaseBalance);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd html-calculator && node --test tests/unit/calculator.test.mjs`
Expected: FAIL because `calculateModel` does not exist.

- [ ] **Step 3: Implement `calculateModel` by importing the existing engines**

Use direct relative imports from the existing model directory. The composition order is fixed:

```js
const historical = profileHistoricalRows(state.history.rows, { matureOperatingDays: 30 });
const seasonality = buildSeasonalityCurve(state.seasonalityInputs);
const annualServicePerGunDay = annualizePeakBenchmark(
  historical.benchmarks.matureMedian,
  seasonality,
  state.history.sourceStart,
  state.history.sourceEnd,
);
const scoredCities = scoreCities(state.cityInputs, state.assumptions.cityWeights);
const allocations = allocateCityTargets(scoredCities, allocationConfig(state.assumptions));
const inputs = scenarioInputs(state, allocations, seasonality, annualServicePerGunDay, historical);
const base = runScenario("基准", inputs);
const scenarios = SCENARIO_NAMES.map((name) => runScenario(name, inputs));
```

Define the two adapter helpers with these exact fields:

```js
function allocationConfig(a) {
  return {
    targetGuns: a.targetGuns,
    tierQuotas: a.tierQuotas,
    fourGunSiteShareHigh: a.fourGunSiteShareHigh,
    fourGunSiteShareLow: a.fourGunSiteShareLow
  };
}

function scenarioInputs(state, allocations, seasonality, annualServicePerGunDay, historical) {
  const a = state.assumptions;
  return {
    allocations,
    deploymentConfig: {
      startMonth: a.modelStartMonth, shares: a.rolloutShares, totalGuns: a.targetGuns,
      supplierTermsMonths: a.supplierTermsMonths, financeDelayMonths: a.leaseDelayMonths,
      expectedFixedCities: state.fixedCities
    },
    operationsConfig: {
      startMonth: a.modelStartMonth, horizonMonths: 60, annualServicePerGunDay,
      seasonalityByMonth: seasonality, ramp: a.ramp, propertyMode: a.propertyMode,
      propertyShare: a.propertyShare, fixedRentPerStation: a.fixedRentPerStation,
      otherOpexRate: a.otherOpexRate, headquartersMonthly: a.headquartersMonthly,
      operatingTaxRate: a.operatingTaxRate,
      historicalServiceFeeRate: historical.totals.serviceFee / historical.totals.gross
    },
    leaseConfig: {
      financeRatio: a.leaseAdvanceRate, annualRate: a.annualLeaseRate,
      termMonths: a.leaseTermMonths, residualRate: a.residualRate
    },
    cashConfig: { initialCash: a.initialCash, shareholderFunding: a.shareholderFunding, reportMonths: 36 },
    revenueBenchmarks: {
      p50: annualServicePerGunDay,
      p25: annualizePeakBenchmark(historical.benchmarks.matureP25, seasonality, state.history.sourceStart, state.history.sourceEnd)
    },
    slowDeploymentShares: a.slowDeploymentShares
  };
}
```

`createBaselineState` and the test fixture loader must restore every serialized historical date to a `Date` object before `profileHistoricalRows` runs.

Do not duplicate the formulas already owned by the six existing engines. Add adapter code only for input shapes, totals, warnings, and presentation-ready KPI extraction.

- [ ] **Step 4: Implement the 17 visible checks**

Create these stable check IDs and return `{ id, label, status, detail }`:

```js
export const CHECK_IDS = Object.freeze([
  "history-gross-split", "city-even-and-sites-integer", "target-guns-total",
  "fixed-cities-first-six-months", "deployment-total-and-horizon",
  "station-cost-components", "capex-and-eligible-basis", "supplier-payable-rollforward",
  "finance-disbursement-timing", "approved-lease-inputs", "lease-cohorts-end-at-zero",
  "debt-service-components", "service-fee-rollforward", "cfads-rollforward",
  "cash-rollforward", "dscr-ratio-of-sums", "scenario-gap-reconciliation"
]);
```

`status` is `PASS` or `FAIL`; warnings are separate and do not change a mathematically valid check to FAIL. `ModelResult.status` is FAIL if any check fails, WARN if all pass but warnings exist, otherwise PASS.

- [ ] **Step 5: Add controlled failure tests**

Test that target guns `30001`, residual above financed principal, a broken gross split, and a fixed city with no first-six-month activity each make the expected check and total status FAIL. Restore the baseline state in each test and assert all 17 checks return PASS.

- [ ] **Step 6: Run model and existing engine regression suites**

Run: `cd html-calculator && node --test tests/unit/calculator.test.mjs tests/unit/checks.test.mjs`
Run from repository root with the loader Node: `node --test outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/tests/city_engine.test.mjs outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/tests/deployment_engine.test.mjs outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/tests/operations_engine.test.mjs outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/tests/lease_engine.test.mjs outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/tests/seasonality_engine.test.mjs`
Expected: HTML tests and existing pure-engine regression tests PASS.

- [ ] **Step 7: Commit the browser calculation adapter**

```powershell
git add -- html-calculator/src/model/calculator.mjs html-calculator/src/model/checks.mjs html-calculator/src/model/view-model.mjs html-calculator/tests/unit/calculator.test.mjs html-calculator/tests/unit/checks.test.mjs
git diff --cached --check
git commit -m "feat(html): compose the financing calculation engine"
```

---

### Task 4: Add Valid-State Management, Auto-Save, and Portable Solution Files

**Files:**
- Create: `html-calculator/src/app-state.mjs`
- Create: `html-calculator/src/io/solution-store.mjs`
- Create: `html-calculator/src/io/solution-file.mjs`
- Create: `html-calculator/tests/unit/app-state.test.mjs`
- Create: `html-calculator/tests/unit/solution-store.test.mjs`
- Create: `html-calculator/tests/unit/solution-file.test.mjs`

**Interfaces:**
- Produces: `createAppState(initialState, calculate)`, `createSolutionStore(indexedDB)`, `serializeSolution(state)`, and `parseSolution(text)`.
- State events: `subscribe(listener)`, `update(path, value)`, `replaceHistory(history)`, `restoreBaseline()`, `getSnapshot()`.

- [ ] **Step 1: Write failure-atomic state tests**

```js
test("invalid edits keep the last valid result", () => {
  const app = createAppState(validState, calculateModel);
  const before = app.getSnapshot().result;
  const after = app.update("assumptions.targetGuns", 30001);
  assert.equal(after.validation.status, "FAIL");
  assert.deepEqual(after.result, before);
  assert.equal(after.draft.assumptions.targetGuns, 30001);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd html-calculator && node --test tests/unit/app-state.test.mjs tests/unit/solution-store.test.mjs tests/unit/solution-file.test.mjs`
Expected: FAIL because state and IO modules do not exist.

- [ ] **Step 3: Implement draft-versus-valid state**

`createAppState` keeps `draft`, `validState`, `result`, `validation`, `activePage`, and `lastCalculatedAt`. An edit first changes `draft`; calculation success promotes it to `validState`, while failure stores field errors and preserves the previous `result`.

- [ ] **Step 4: Implement IndexedDB storage**

Use database name `ant-charge-station-calculator`, store name `solutions`, key `current`, and schema version `1`. Save only a complete valid state. Store history rows with dates serialized as `YYYY-MM-DD`; restore dates before calculation. Unit tests use `fake-indexeddb` and verify 3,049 rows survive a save/load round trip.

- [ ] **Step 5: Implement portable JSON solution files**

The file envelope is exact:

```js
{
  format: "ant-charge-station-solution",
  version: 1,
  savedAt: "2026-08-17T00:00:00.000Z",
  modelVersion: "html-model-1",
  name: "基准方案",
  state: { assumptions, cityInputs, seasonalityInputs, history }
}
```

`parseSolution` rejects a wrong format, unsupported version, missing arrays, invalid dates, invalid core financing domains, and any history that fails `validateHistoricalRows`.

- [ ] **Step 6: Run GREEN and commit**

Run: `cd html-calculator && node --test tests/unit/app-state.test.mjs tests/unit/solution-store.test.mjs tests/unit/solution-file.test.mjs`
Expected: all state, IndexedDB, JSON round-trip, version rejection, and failure-atomicity tests PASS.

```powershell
git add -- html-calculator/src/app-state.mjs html-calculator/src/io/solution-store.mjs html-calculator/src/io/solution-file.mjs html-calculator/tests/unit/app-state.test.mjs html-calculator/tests/unit/solution-store.test.mjs html-calculator/tests/unit/solution-file.test.mjs
git diff --cached --check
git commit -m "feat(html): save and restore financing scenarios"
```

---

### Task 5: Build the Left-Navigation Shell and Reusable Controls

**Files:**
- Modify: `html-calculator/src/main.mjs`
- Modify: `html-calculator/src/styles.css`
- Create: `html-calculator/src/ui/shell.mjs`
- Create: `html-calculator/src/ui/controls.mjs`
- Create: `html-calculator/src/ui/data-table.mjs`
- Create: `html-calculator/tests/e2e/helpers.mjs`
- Create: `html-calculator/tests/e2e/offline-calculator.spec.mjs`
- Create: `html-calculator/playwright.config.mjs`

**Interfaces:**
- Produces: `mountShell(root, appState) -> ShellController`, `renderControl(config)`, and `renderDataTable(config)`.
- `ShellController` exposes `showPage(pageId)`, `setModelStatus(status)`, `setBusy(boolean)`, and `destroy()`.

- [ ] **Step 1: Write the shell E2E test**

```js
import { releaseFileUrl } from "./helpers.mjs";

test("shows the approved twelve-page navigation in order", async ({ page }) => {
  await page.goto(releaseFileUrl);
  await expect(page.locator("[data-page-id]")).toHaveCount(12);
  await expect(page.locator("[data-page-id]").allTextContents()).resolves.toEqual([
    "融资摘要", "核心假设", "城市数据库", "城市分配", "月度投放计划", "单站成本",
    "历史原始数据", "历史单枪模型", "年度季节曲线", "36月运营模型",
    "融资租赁与资金缺口", "情景分析、检查与来源"
  ]);
});
```

Implement the helper without starting a server:

```js
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const releasePath = resolve(
  import.meta.dirname,
  "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁测算.html"
);
export const releaseFileUrl = pathToFileURL(releasePath).href;
```

- [ ] **Step 2: Run the focused E2E test and confirm RED**

Run: `cd html-calculator && npm run build && npx playwright test tests/e2e/offline-calculator.spec.mjs --grep "twelve-page"`
Expected: FAIL because the shell and release HTML are not implemented.

- [ ] **Step 3: Implement the approved A layout**

Create a dark header, fixed 220-pixel left navigation, flexible main workspace, status text plus icon, and buttons for Excel import, save scenario, open scenario, restore baseline, and print. Every navigation item is a `<button>` with `aria-current`, keyboard focus styling, and a visible PASS/WARN/FAIL badge.

- [ ] **Step 4: Implement reusable controls and tables**

`renderControl` supports `number`, `percent`, `month`, and `select`, always renders a `<label>`, unit, permitted range, and inline error. `renderDataTable` supports client-side search, declared filters, page sizes 50/100/200, sticky headers, and horizontal scrolling; it must never render more than the selected page size.

- [ ] **Step 5: Implement responsive and print foundations**

At widths below 900 pixels, collapse the side navigation behind a menu button and make the summary readable. In `@media print`, hide `.app-header`, `.app-sidebar`, `.no-print`, inputs, and action buttons; preserve table headers and avoid splitting KPI cards.

- [ ] **Step 6: Run the shell test and commit**

Run: `cd html-calculator && npm run build && npx playwright test tests/e2e/offline-calculator.spec.mjs --grep "twelve-page"`
Expected: PASS with zero page errors.

```powershell
git add -- html-calculator/src/main.mjs html-calculator/src/styles.css html-calculator/src/ui/shell.mjs html-calculator/src/ui/controls.mjs html-calculator/src/ui/data-table.mjs html-calculator/tests/e2e/helpers.mjs html-calculator/tests/e2e/offline-calculator.spec.mjs html-calculator/playwright.config.mjs
git diff --cached --check
git commit -m "feat(html): add the twelve-module calculator shell"
```

---

### Task 6: Implement the Eight Input and Historical Detail Pages

**Files:**
- Create: `html-calculator/src/ui/pages/assumptions.mjs`
- Create: `html-calculator/src/ui/pages/city-database.mjs`
- Create: `html-calculator/src/ui/pages/city-allocation.mjs`
- Create: `html-calculator/src/ui/pages/deployment.mjs`
- Create: `html-calculator/src/ui/pages/station-cost.mjs`
- Create: `html-calculator/src/ui/pages/historical-raw.mjs`
- Create: `html-calculator/src/ui/pages/historical-model.mjs`
- Create: `html-calculator/src/ui/pages/seasonality.mjs`
- Modify: `html-calculator/src/main.mjs`
- Modify: `html-calculator/tests/e2e/offline-calculator.spec.mjs`

**Interfaces:**
- Each page exports `render(container, { snapshot, actions })` and returns a cleanup function.
- `actions.update(path, value)` is the only page-level write path.

- [ ] **Step 1: Write E2E assertions for linked input pages**

Test that the assumptions page shows target guns `30000`, lease term `36`, annual rate `8%`, and property mode `分成`; the city allocation page totals exactly 30,000 guns; the raw history page reports 3,049 rows and renders at most 100 body rows; and the historical model shows mature P25/P50 values without `NaN`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cd html-calculator && npm run build && npx playwright test tests/e2e/offline-calculator.spec.mjs --grep "input pages"`
Expected: FAIL because page renderers do not exist.

- [ ] **Step 3: Build the core assumptions and station-cost pages**

Expose all approved editable assumptions: model start month, target guns, 12 rollout shares, six ramp factors, four city weights, four tier quotas, high/low 4-gun site shares, 2/4-gun equipment/engineering/channel costs, property mode and rate, other OPEX, HQ monthly cost, tax rate, finance ratio, term, annual rate, delay, supplier terms, residual, initial cash, and shareholder input. Display the B14-equivalent city-weight total as a calculated value, not a second editable input.

- [ ] **Step 4: Build city database, allocation, and deployment pages**

Show all 56 cities with source year, URL, quality note, effective score, fixed-city marker, target guns, 2-gun sites, 4-gun sites, first online month, supplier payment month, and finance disbursement month. Fixed-city and total allocation failures must be visible in page status.

- [ ] **Step 5: Build history and seasonality pages**

The raw page supports search by station ID/name and pagination. The historical model shows station profiles, operating days, gun-days, P25, P50, weighted benchmark, source dates, and historical reconciliations. The seasonality page displays all 13 source records, 12 calculated indices, their mean of 1.0000, and clickable source URLs.

- [ ] **Step 6: Run linked-edit tests**

Change target guns to `30001` and assert the field error and total FAIL appear while the previous valid result remains. Restore `30000` and assert PASS. Change city weights to population 100% and others 0%, then assert candidate order and downstream city targets change without losing the total.

- [ ] **Step 7: Run GREEN and commit**

Run: `cd html-calculator && npm run test:unit && npm run build && npx playwright test tests/e2e/offline-calculator.spec.mjs --grep "input pages|linked edits"`
Expected: unit tests and focused browser tests PASS.

```powershell
git add -- html-calculator/src/ui/pages html-calculator/src/main.mjs html-calculator/tests/e2e/offline-calculator.spec.mjs
git diff --cached --check
git commit -m "feat(html): add model inputs and audit tables"
```

---

### Task 7: Implement the Four Financing Output Pages and Native Charts

**Files:**
- Create: `html-calculator/src/ui/pages/summary.mjs`
- Create: `html-calculator/src/ui/pages/operations.mjs`
- Create: `html-calculator/src/ui/pages/lease.mjs`
- Create: `html-calculator/src/ui/pages/scenarios-checks-sources.mjs`
- Create: `html-calculator/src/ui/charts.mjs`
- Modify: `html-calculator/src/main.mjs`
- Create: `html-calculator/tests/e2e/visual-and-print.spec.mjs`

**Interfaces:**
- Produces exactly five chart instances registered by IDs: `service-cfads`, `funding-balance`, `monthly-dscr`, `scenario-gap`, and `term-comparison`.
- `destroyCharts()` must release all existing Chart.js instances before recalculation or page unmount.

- [ ] **Step 1: Write output and chart tests**

```js
test("summary reconciles and owns exactly five charts", async ({ page }) => {
  const { releaseFileUrl } = await import("./helpers.mjs");
  await page.goto(releaseFileUrl);
  await expect(page.locator("[data-kpi=targetGuns]")).toHaveText("30,000");
  await expect(page.locator("[data-kpi=totalInvestment]")).toContainText("6.40");
  await expect(page.locator("canvas[data-chart-id]")).toHaveCount(5);
  await expect(page.locator("[data-model-status]")).toHaveText(/通过/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd html-calculator && npm run build && npx playwright test tests/e2e/visual-and-print.spec.mjs --grep "five charts"`
Expected: FAIL because summary and charts are absent.

- [ ] **Step 3: Build the financing summary**

Render KPI cards for target guns, total investment, three-year service fee, three-year CFADS, lease disbursement, peak gap and month, full-cycle DSCR, minimum monthly DSCR and month, and three-year lease balance. Show a yellow underwriting warning whenever HQ or tax is zero.

- [ ] **Step 4: Build five charts**

- `service-cfads`: monthly service fee and CFADS lines.
- `funding-balance`: cumulative cash before shareholder funding and lease balance.
- `monthly-dscr`: debt-active monthly DSCR with a 1.0x reference line.
- `scenario-gap`: six scenarios' peak funding gaps.
- `term-comparison`: indexed 18/24/36-month comparison with the exact amounts retained in the table.

All axes, legends, and tooltips use Chinese labels; money tooltips use RMB formatting and DSCR uses `0.00x`.

- [ ] **Step 5: Build operations, lease, and scenario pages**

Operations must show 60 months and visually distinguish months 1–36 from 37–60. Lease must show 12 cohort summaries, aggregate disbursement/debt/cash rows, opening balance, interest, principal, residual, and ending balance. Scenarios must show six scenarios, 18/24/36 terms, all 17 visible checks, total status, sources, model scope, and warning notes.

- [ ] **Step 6: Test debt and risk visibility**

Set a low revenue benchmark and fixed property rent so CFADS becomes negative; assert negative values and DSCR remain visible. Set HQ and tax to zero and assert the yellow warning appears. Assert debt-free months display blank DSCR, not `0` or `Infinity`.

- [ ] **Step 7: Run GREEN and commit**

Run: `cd html-calculator && npm run test:unit && npm run build && npx playwright test tests/e2e/visual-and-print.spec.mjs --grep "five charts|debt and risk"`
Expected: all focused output and chart tests PASS with no console errors.

```powershell
git add -- html-calculator/src/ui/pages/summary.mjs html-calculator/src/ui/pages/operations.mjs html-calculator/src/ui/pages/lease.mjs html-calculator/src/ui/pages/scenarios-checks-sources.mjs html-calculator/src/ui/charts.mjs html-calculator/src/main.mjs html-calculator/tests/e2e/visual-and-print.spec.mjs
git diff --cached --check
git commit -m "feat(html): add financing outputs and charts"
```

---

### Task 8: Wire Excel Import, Auto-Save, Scenario Files, Reset, and Print

**Files:**
- Modify: `html-calculator/src/main.mjs`
- Modify: `html-calculator/src/ui/shell.mjs`
- Create: `html-calculator/tests/e2e/import-and-persistence.spec.mjs`
- Modify: `html-calculator/tests/e2e/visual-and-print.spec.mjs`

**Interfaces:**
- Toolbar actions call `importExcel(file)`, `downloadSolution(name)`, `openSolution(file)`, `restoreBaseline()`, and `printActivePage()`.
- Import progress states are `读取文件`, `校验数据`, `重新测算`, and `完成`.

- [ ] **Step 1: Write import and persistence E2E tests**

Test these exact workflows:

1. Upload `valid-update.xlsx`, confirm the displayed data period and historical benchmark change, reload the file URL, and confirm the valid update auto-restores.
2. Upload `invalid-schema.xlsx` and `invalid-gross.xlsx`, confirm the row/file error message, and assert the previous valid KPI remains unchanged.
3. Download a solution JSON, restore baseline, reopen the downloaded solution, and assert the edited finance term and historical row count return.
4. Click restore baseline, cancel the confirmation, and assert no state change; confirm it and assert approved baseline KPIs return.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `cd html-calculator && npm run build && npx playwright test tests/e2e/import-and-persistence.spec.mjs`
Expected: FAIL because toolbar actions are not wired.

- [ ] **Step 3: Wire failure-atomic Excel import**

Read `file.arrayBuffer()`, parse and validate in memory, show all errors without changing state, then call `replaceHistory` only after the complete calculation succeeds. Announce the four progress states through a visible live region.

- [ ] **Step 4: Wire auto-save and portable files**

Debounce IndexedDB saves by 300 ms after successful calculation. Name downloads as `充电站融资测算方案-<方案名>-YYYYMMDD-HHmm.json`. Refuse to open a solution until version and business validation both pass.

- [ ] **Step 5: Wire reset and print**

Use a modal confirmation for restore baseline. `printActivePage()` adds the active page ID to `<body data-print-page>`, calls `window.print()`, and removes the attribute on `afterprint`. The summary print layout includes KPI cards, key charts, term comparison, and warnings.

- [ ] **Step 6: Run GREEN and commit**

Run: `cd html-calculator && npm run test:unit && npm run build && npx playwright test tests/e2e/import-and-persistence.spec.mjs tests/e2e/visual-and-print.spec.mjs`
Expected: import, invalid-file rollback, persistence, JSON round-trip, reset, and print tests PASS.

```powershell
git add -- html-calculator/src/main.mjs html-calculator/src/ui/shell.mjs html-calculator/tests/e2e/import-and-persistence.spec.mjs html-calculator/tests/e2e/visual-and-print.spec.mjs
git diff --cached --check
git commit -m "feat(html): add offline data and scenario workflows"
```

---

### Task 9: Build the Self-Contained HTML and Enforce Offline Packaging

**Files:**
- Modify: `html-calculator/scripts/build-single-file.mjs`
- Create: `html-calculator/scripts/verify-release.mjs`
- Create: `html-calculator/data/third-party-notices.txt`
- Modify: `html-calculator/tests/unit/build-single-file.test.mjs`
- Create: `outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁测算.html`

**Interfaces:**
- `build-single-file.mjs` writes one HTML file to the approved output path.
- `verify-release.mjs <path>` exits nonzero on missing embedded data, external resource tags, missing pages, missing license notices, or a trivial output file.

- [ ] **Step 1: Write packaging tests**

```js
import { fileURLToPath } from "node:url";

const RELEASE = fileURLToPath(new URL(
  "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁测算.html",
  import.meta.url
));

test("release is one self-contained offline HTML", () => {
  const html = readFileSync(RELEASE, "utf8");
  assert.ok(Buffer.byteLength(html) > 500_000);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(?:src|href)=["']https?:/i);
  assert.match(html, /id="embedded-model-data"/);
  assert.match(html, /SheetJS.*Apache-2\.0/s);
  assert.match(html, /Chart\.js.*MIT/s);
  const payload = html.match(/<script type="application\/json" id="embedded-model-data">([\s\S]*?)<\/script>/);
  assert.ok(payload);
  assert.equal(JSON.parse(payload[1]).metadata.pages.length, 12);
});
```

- [ ] **Step 2: Run the packaging test and confirm RED**

Run: `cd html-calculator && node --test tests/unit/build-single-file.test.mjs`
Expected: FAIL because the build script and release file do not exist.

- [ ] **Step 3: Implement the single-file builder**

Use esbuild with `bundle: true`, `format: "iife"`, `platform: "browser"`, `minify: true`, and no sourcemap in the release. Read `historical-baseline.json`, existing `city_inputs.json`, existing `seasonality_2024.json`, and the city audit manifest; escape `<`, U+2028, and U+2029 before inserting JSON into `<script type="application/json" id="embedded-model-data">`.

Inline the bundled CSS and JavaScript into the three template markers. Append `third-party-notices.txt` in a non-executing HTML section. Reject any `<script src>`, `<link href>`, or network image reference before writing the file.

- [ ] **Step 4: Implement release verification**

`build-single-file.mjs` must add `metadata: { modelVersion: "html-model-1", pages: [the twelve approved labels] }` to the embedded payload. `verify-release.mjs` must parse the built text and assert: one HTML file, UTF-8 title, exactly 12 embedded page definitions, embedded 3,049 rows, embedded 56 cities, embedded 13 seasonality rows, no external resource tags, all three license notices, no source map URL, and file size below 20 MB. Before bundling, the Node build path must call the existing `validateCityInputs` and `validateCityMetricAuditManifest` functions against the embedded city files.

- [ ] **Step 5: Run GREEN and commit**

Run: `cd html-calculator && npm run build`
Run: `node scripts/verify-release.mjs "../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁测算.html"`
Run: `node --test tests/unit/build-single-file.test.mjs`
Expected: build, release verification, and packaging tests PASS.

```powershell
git add -- html-calculator/scripts/build-single-file.mjs html-calculator/scripts/verify-release.mjs html-calculator/data/third-party-notices.txt html-calculator/tests/unit/build-single-file.test.mjs outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁测算.html
git diff --cached --check
git commit -m "build(html): publish the offline calculator"
```

---

### Task 10: Complete Cross-Browser, Visual, Performance, and Release Verification

**Files:**
- Modify: `html-calculator/playwright.config.mjs`
- Modify: `html-calculator/tests/e2e/offline-calculator.spec.mjs`
- Modify: `html-calculator/tests/e2e/import-and-persistence.spec.mjs`
- Modify: `html-calculator/tests/e2e/visual-and-print.spec.mjs`
- Create: `html-calculator/README.md`
- Create: `html-calculator/release-checkpoints.md`

**Interfaces:**
- Final command: `npm run verify`.
- Release evidence records HTML byte size, SHA-256, tests, baseline KPIs, performance timings, browser projects, screenshots, and remaining warnings.

- [ ] **Step 1: Configure installed Chrome and Edge projects**

```js
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: { viewport: { width: 1440, height: 1000 }, locale: "zh-CN" },
  projects: [
    { name: "chrome", use: { browserName: "chromium", channel: "chrome" } },
    { name: "edge", use: { browserName: "chromium", channel: "msedge" } }
  ]
});
```

- [ ] **Step 2: Add complete offline and performance assertions**

Load the built file with a `file:///` URL, block all `http:` and `https:` requests, and fail on any console error or page error. Measure from navigation start to the first valid summary, one target-gun edit and recalculation, and a 3,049-row import; assert 5,000 ms, 1,000 ms, and 10,000 ms limits on the designated release machine.

- [ ] **Step 3: Add complete visual and print assertions**

Capture one 1440×1000 screenshot for each of the 12 modules plus a print-emulated financing summary. Assert the sidebar does not overlap the main area, KPI values are not clipped, tables remain inside their scroll containers, chart canvases have nonzero dimensions, and print mode hides navigation and buttons.

- [ ] **Step 4: Write the user README**

Document: browser requirement; double-click launch; current embedded data period; Excel `Data List` import requirement; blue input convention; save/open solution workflow; reset behavior; print/PDF; 17 checks; HQ/tax zero warning; local-data privacy; and the distinction between a financing model and legal accounting/tax advice.

- [ ] **Step 5: Run the full current-head verification**

Run: `cd html-calculator && npm ci`
Run: `npm run verify`
Run from repository root: `git diff --check`
Expected: all Node unit tests PASS; the single-file build and release verifier PASS; Chrome and Edge E2E tests PASS; no network request, console error, page error, failed visible check, or KPI mismatch.

- [ ] **Step 6: Inspect all screenshots manually**

Open all 13 screenshots with the local image viewer. Verify Chinese text, input units, warning contrast, long-table headers, 36/60-month separation, lease tables, five charts, no overlap, and printable summary. Record each page as PASS or describe the exact defect and fix it before proceeding.

- [ ] **Step 7: Record release evidence**

Write `release-checkpoints.md` with:

- current Git commit;
- HTML relative path, byte size, and SHA-256;
- unit and E2E pass counts by browser;
- 10 golden KPI comparisons;
- opening, recalculation, and import timings;
- 12-screen and print-screen visual review results;
- embedded source data period;
- remaining yellow warning that HQ and tax default to zero.

- [ ] **Step 8: Commit the verified release documentation**

```powershell
git add -- html-calculator/playwright.config.mjs html-calculator/tests/e2e html-calculator/README.md html-calculator/release-checkpoints.md
git diff --cached --check
git commit -m "test(html): verify the offline financing calculator"
```

- [ ] **Step 9: Perform post-commit verification and publish**

Run: `cd html-calculator && npm run verify`
Run: `git status --short` and confirm only the pre-existing inspection helpers and any open Excel lock file remain untracked.
Push the verified branch only after an independent code and artifact review reports no Critical or Important findings.
