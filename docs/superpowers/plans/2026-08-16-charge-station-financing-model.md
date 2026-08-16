# 便民充电站单枪收入与融资租赁模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以现有站点日数据和公开城市/行业数据为基础，交付一个可编辑、公式联动、可审计的30,000枪三年经营及融资租赁Excel模型。

**Architecture:** 使用纯JavaScript模块实现历史数据归一、城市评分分配、上线批次、经营预测、租赁批次和资金缺口的参考计算，并以Node内置测试锁定边界行为。唯一工作簿构建入口使用`@oai/artifact-tool`创建12张可见工作表，把核心业务逻辑同时落为工作簿内可追溯公式；构建完成后重新导入、检查、渲染并做融资模型专项审计。

**Tech Stack:** loader提供的Node.js、`@oai/artifact-tool` 2.8.6+、Node `node:test`、JSON输入文件、Excel公式与原生图表。

## Global Constraints

- 规格基准：`docs/superpowers/specs/2026-08-16-charge-station-financing-model-design.md`。
- 源工作簿`D:/工作资料/蚂蚁站/站点报表-导出项 (2).xlsx`只读，不能覆盖或改名。
- 所有工作簿读取、创建、公式写入、格式、图表、检查、渲染和导出均使用loader提供的`@oai/artifact-tool`；不得使用`openpyxl`、`xlsxwriter`、`pandas.ExcelWriter`或系统安装的表格库。
- 使用loader提供的Node：`C:/Users/keqi_119/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。
- 使用现有会话工作目录及其`node_modules` junction：`outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/`。
- 最终只导出一个工作簿：`outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁模型.xlsx`。
- `1桩=1枪`；站型仅为2枪或4枪；新增目标30,000枪；首批实际为26城。
- 基准上线期2026-09至2027-08；正式报告36个月；底层计算60个月；18个月慢建设情景也必须在60个月内完成租赁尾期。
- 服务费为核心经营收入；电费代收代付不进入基准CFADS。
- 融资租赁原值为设备加工程，渠道费用不融资；基准融资比例100%，期限36个月，年化综合资金成本8%，放款延迟1个月，留购款为原值1%。
- 物业基准为服务费20%分成，固定200元/站/月为替代；二者互斥。
- 手工输入蓝字、公式黑字、跨表公式绿字、错误红字；所有外部来源在工作簿内保留纯文本URL和访问日期。
- 项目仓库为`https://github.com/keqi119/Ant_charge_station.git`；每个任务通过测试和独立审查后创建范围明确的Git提交，最终模型通过审查后推送至该仓库。

---

## File Structure

所有实现支持文件位于会话工作目录，最终回复只引用成品工作簿。

| 文件 | 责任 |
|---|---|
| `outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/constants.mjs` | 路径、12张表名、固定26城、基准假设和颜色/格式常量 |
| `.../work/model/source_reader.mjs` | 用artifact-tool导入源工作簿并把A:P矩阵转换为规范化站点日记录 |
| `.../work/model/input_validation.mjs` | 校验城市与季节性JSON的结构、来源、年份、空值和唯一性 |
| `.../work/model/historical_engine.mjs` | 历史总计、枪日、成熟站、P25/P50/加权指标 |
| `.../work/model/seasonality_engine.mjs` | 2024月度公共充电量、平均在运枪数、单枪日均值及归一指数 |
| `.../work/model/city_engine.mjs` | 同等级百分位、缺失权重重算、城市顺序、精确30,000枪及站型整数分配 |
| `.../work/model/deployment_engine.mjs` | 12/18个月上线曲线、首批26城首次上线约束、选址/上线/付款/放款日期 |
| `.../work/model/operations_engine.mjs` | 60个月服务费、GMV、电费代收代付、物业成本、其他运营成本和CFADS |
| `.../work/model/lease_engine.mjs` | 月租、留购款、批次本金滚动、债务服务、DSCR、现金瀑布和情景 |
| `.../work/model/workbook_style.mjs` | 通用标题、分区、输入、公式、链接、检查、数值格式和列宽样式 |
| `.../work/model/workbook_inputs.mjs` | 构建核心假设、城市、投放、成本、历史和季节性工作表 |
| `.../work/model/workbook_outputs.mjs` | 构建运营、租赁、情景检查、摘要和图表工作表 |
| `.../work/data/seasonality_2024.json` | 2023-12至2024-12月末公共枪数及2024年12个月充电量、来源和日期 |
| `.../work/data/city_inputs.json` | 首批26城、全部一线/新一线/二线候选及必要三线城市的公开指标和来源 |
| `.../work/tests/*.test.mjs` | 纯函数、源数据、分配、预测、租赁和工作簿集成测试 |
| `.../work/build_model.mjs` | 唯一可执行构建入口：读取、计算、建表、校验、渲染、导出和复检 |
| `.../work/checkpoints.md` | 非Git环境下记录每项测试命令、时间和结果 |

---

### Task 1: 固定运行环境并建立源数据读取契约

**Files:**
- Create: `outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/constants.mjs`
- Create: `outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/source_reader.mjs`
- Create: `outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/tests/source_reader.test.mjs`
- Create: `outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/checkpoints.md`

**Interfaces:**
- Consumes: 源工作簿路径和`Data List!A1:P3050`。
- Produces: `PATHS`, `SHEET_NAMES`, `BASE_ASSUMPTIONS`, `FIXED_CITIES`, `loadSourceMatrix(path)`, `normalizeSourceMatrix(matrix)`。
- `normalizeSourceMatrix(matrix)`返回`RawRecord[]`，字段固定为`date`, `stationId`, `stationName`, `dcGuns`, `acGuns`, `orders`, `kwh`, `sharpKwh`, `peakKwh`, `flatKwh`, `valleyKwh`, `minutes`, `gross`, `electricityFee`, `serviceFee`, `rawRowNumber`。

- [ ] **Step 1: 写入常量文件和26城断言测试**

```js
// tests/source_reader.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { FIXED_CITIES, SHEET_NAMES } from "../model/constants.mjs";

test("fixed city list is the approved 26-city set", () => {
  assert.equal(FIXED_CITIES.length, 26);
  assert.equal(new Set(FIXED_CITIES).size, 26);
  assert.deepEqual(FIXED_CITIES.slice(-4), ["西安", "无锡", "济南", "郑州"]);
});

test("workbook exposes exactly the approved 12 visible sheet names", () => {
  assert.equal(SHEET_NAMES.length, 12);
  assert.equal(SHEET_NAMES[0], "融资摘要");
  assert.equal(SHEET_NAMES[11], "情景分析、检查与来源");
});
```

- [ ] **Step 2: 运行测试确认缺少实现**

Run from `.../work`:

```powershell
& 'C:\Users\keqi_119\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/source_reader.test.mjs
```

Expected: FAIL，提示`model/constants.mjs`不存在。

- [ ] **Step 3: 实现常量与源数据规范化**

```js
// model/source_reader.mjs
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const num = (value) => value === null || value === "" ? 0 : Number(value);

export async function loadSourceMatrix(path) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
  const sheet = workbook.worksheets.getItem("Data List");
  return { workbook, matrix: sheet.getRange("A1:P3050").values };
}

export function normalizeSourceMatrix(matrix) {
  return matrix.slice(1).filter((row) => row.some((v) => v !== null && v !== "")).map((row, i) => ({
    date: row[0] instanceof Date ? row[0] : new Date(`${row[0]}T00:00:00+08:00`),
    stationId: String(row[1]), stationName: String(row[2]),
    dcGuns: num(row[3]), acGuns: num(row[4]), orders: num(row[5]), kwh: num(row[6]),
    sharpKwh: num(row[7]), peakKwh: num(row[8]), flatKwh: num(row[9]), valleyKwh: num(row[10]),
    minutes: num(row[11]), gross: num(row[12]), electricityFee: num(row[13]), serviceFee: num(row[14]),
    rawRowNumber: i + 2,
  }));
}
```

- [ ] **Step 4: 添加样本矩阵测试并运行**

样本须断言空行被排除、数值空白转0、枪数为DC+AC、原始行号从2开始。再次运行Task 1测试，Expected: 4 tests PASS。

- [ ] **Step 5: 用artifact-tool渲染源工作簿并核对视觉基线**

在构建入口的源检查阶段执行：

```js
const preview = await sourceWorkbook.render({
  sheetName: "Data List", range: "A1:P40", scale: 1.5, format: "png",
});
await fs.writeFile("previews/source-data-list.png", new Uint8Array(await preview.arrayBuffer()));
```

使用本地图片查看工具确认源表为单层原始数据表、没有需要沿用的复杂模型样式；将检查结果写入`checkpoints.md`。

---

### Task 2: 建立可追溯的季节性和城市等级输入

**Files:**
- Create: `.../work/data/seasonality_2024.json`
- Create: `.../work/data/city_inputs.json`
- Create: `.../work/model/input_validation.mjs`
- Create: `.../work/tests/input_validation.test.mjs`

**Interfaces:**
- Consumes: EVCIPA 2024月度报告、2024年度报告、第一财经2025城市等级名单、国家统计局及地方政府公开数据。
- Produces: `loadJson(path)`, `validateSeasonalityInputs(records)`, `validateCityInputs(records, fixedCities)`。
- `SeasonalityInput`字段：`month`, `monthEndPublicGuns`, `chargingKwh100m`, `gunSourceUrl`, `volumeSourceUrl`, `accessedDate`。
- `CityInput`字段：`city`, `province`, `tier`, `yicaiRank`, `isFixed`, `fixedOrder`, `population10k`, `populationYear`, `urbanPopulation10k`, `builtAreaKm2`, `densityYear`, `pre2005HousingProxy`, `housingMetric`, `housingYear`, `publicChargingGuns`, `chargingYear`, `populationSourceUrl`, `densitySourceUrl`, `housingSourceUrl`, `chargingSourceUrl`, `accessedDate`, `notes`。

- [ ] **Step 1: 写入输入校验的失败测试**

```js
// tests/input_validation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { validateSeasonalityInputs, validateCityInputs } from "../model/input_validation.mjs";

test("seasonality input contains 12 months plus prior December gun base", () => {
  const result = validateSeasonalityInputs([
    { month: "2023-12", monthEndPublicGuns: 2726000, chargingKwh100m: null, gunSourceUrl: "https://evcipa.example/2023-12", volumeSourceUrl: "", accessedDate: "2026-08-16" },
    ...Array.from({ length: 12 }, (_, i) => ({
      month: `2024-${String(i + 1).padStart(2, "0")}`, monthEndPublicGuns: 2800000 + i,
      chargingKwh100m: 40 + i, gunSourceUrl: `https://evcipa.example/g/${i + 1}`,
      volumeSourceUrl: `https://evcipa.example/v/${i + 1}`, accessedDate: "2026-08-16",
    })),
  ]);
  assert.equal(result.length, 13);
});

test("city validation rejects duplicate names and missing fixed cities", () => {
  assert.throws(() => validateCityInputs([{ city: "合肥" }, { city: "合肥" }], ["合肥", "淮南"]));
});
```

- [ ] **Step 2: 运行测试确认缺少校验模块**

Expected: FAIL，提示`input_validation.mjs`不存在。

- [ ] **Step 3: 录入2024季节性原始值**

`seasonality_2024.json`必须包含2023-12月末公共枪数作为2024-01月平均枪数的期初值，以及2024-01至2024-12每月月末公共枪数和当月充电量。每条记录必须有官方或联盟报告URL和`2026-08-16`访问日期；充电量单位统一为亿kWh，枪数统一为枪。

- [ ] **Step 4: 录入2025城市等级候选池**

`city_inputs.json`至少包含完整一线、新一线、二线名单，以及首批26城中不在前三档的城市。`tier`只允许`一线`、`新一线`、`二线`、`三线`；首批26城逐一标记`isFixed=true`并保存1至26的`fixedOrder`。

- [ ] **Step 5: 实现严格校验**

```js
export function validateSeasonalityInputs(records) {
  if (records.length !== 13) throw new Error("seasonality rows must equal 13");
  const months = records.map((r) => r.month);
  if (new Set(months).size !== 13 || months[0] !== "2023-12" || months.at(-1) !== "2024-12") {
    throw new Error("seasonality months must run 2023-12 through 2024-12");
  }
  for (const [i, r] of records.entries()) {
    if (!(r.monthEndPublicGuns > 0) || !r.gunSourceUrl?.startsWith("http")) throw new Error(`invalid gun input row ${i + 1}`);
    if (i > 0 && (!(r.chargingKwh100m > 0) || !r.volumeSourceUrl?.startsWith("http"))) throw new Error(`invalid volume input row ${i + 1}`);
  }
  return records;
}
```

城市校验必须拒绝重复城市、非法等级、首批标志遗漏、非HTTP来源字符串、常住人口缺失但参与自动补选、指标有值却无年份或来源的记录；允许非人口指标为`null`，但要求`notes`说明缺失。

- [ ] **Step 6: 运行输入校验测试并记录数据覆盖率**

Expected: tests PASS；额外输出候选城市总数、首批城市数、每项指标非空率和代理口径数量。任何首批城市缺失时测试失败。

---

### Task 3: 完成城市公开指标和来源审计

**Files:**
- Modify: `.../work/data/city_inputs.json`
- Create: `.../work/tests/city_data_audit.test.mjs`

**Interfaces:**
- Consumes: Task 2的`CityInput[]`。
- Produces: 可用于同等级评分的完整候选池；每个非空指标均可追溯至公开URL和统计年份。

- [ ] **Step 1: 为首批26城填入公开指标**

按常住人口、城区人口/建成区面积、2005年前住宅或老旧小区代理、公共充电枪四类逐城记录。优先使用统计公报、统计年鉴、住建部门和发改/能源部门；无法获得精确房龄时，将`housingMetric`写为`2000年前老旧小区`或`老旧小区改造规模`并在`notes`标明代理关系。

- [ ] **Step 2: 为剩余一线和新一线候选填入指标**

保证全部一线和新一线城市具备常住人口；其他指标允许按规格重算有效权重。不同统计年度保持原年份，不做虚假同年化。

- [ ] **Step 3: 为全部二线候选填入指标**

至少保证人口、城市等级和排名完整。公共充电枪没有可核查市级口径时保留`null`，不得用省级数值冒充市级数值；如使用省级稀缺度作补充展示，字段和备注必须明确标为省级，不进入城市基准评分。

- [ ] **Step 4: 写入数据审计测试**

```js
test("every populated metric has year and source", () => {
  for (const city of cities) {
    assert.ok(city.population10k > 0, `${city.city}: population required`);
    assert.match(city.populationSourceUrl, /^https?:\/\//);
    for (const [valueKey, yearKey, sourceKey] of [
      ["urbanPopulation10k", "densityYear", "densitySourceUrl"],
      ["pre2005HousingProxy", "housingYear", "housingSourceUrl"],
      ["publicChargingGuns", "chargingYear", "chargingSourceUrl"],
    ]) {
      if (city[valueKey] !== null) {
        assert.ok(city[yearKey]);
        assert.match(city[sourceKey], /^https?:\/\//);
      }
    }
  }
});
```

- [ ] **Step 5: 运行数据审计并记录缺失结构**

Expected: PASS。检查点记录各指标完整率，并列出因缺失而会采用权重重算的城市；不得将缺失率隐藏在总体平均中。

---

### Task 4: 锁定历史单枪基准和季节性还原

**Files:**
- Create: `.../work/model/historical_engine.mjs`
- Create: `.../work/model/seasonality_engine.mjs`
- Create: `.../work/tests/historical_engine.test.mjs`
- Create: `.../work/tests/seasonality_engine.test.mjs`

**Interfaces:**
- Consumes: `RawRecord[]`, `SeasonalityInput[]`。
- Produces: `profileHistoricalRows(rows) -> HistoricalProfile`；`buildSeasonalityCurve(inputs) -> SeasonalityMonth[]`；`annualizePeakBenchmark(value, curve, startDate, endDate) -> number`。

- [ ] **Step 1: 写入历史实数回归测试**

```js
test("source workbook reconciles to approved historical totals", async () => {
  const { matrix } = await loadSourceMatrix(PATHS.sourceWorkbook);
  const p = profileHistoricalRows(normalizeSourceMatrix(matrix));
  assert.equal(p.rowCount, 3049);
  assert.equal(p.stationCount, 60);
  assert.equal(p.matureStationCount, 52);
  assert.ok(Math.abs(p.totals.orders - 84356) < 0.001);
  assert.ok(Math.abs(p.totals.kwh - 2013192.36) < 0.01);
  assert.ok(Math.abs(p.totals.gross - 1758717.20) < 0.01);
  assert.ok(Math.abs(p.totals.electricityFee - 1202523.78) < 0.01);
  assert.ok(Math.abs(p.totals.serviceFee - 556193.42) < 0.01);
  assert.ok(Math.abs(p.benchmarks.matureP25 - 28.3617) < 0.0001);
  assert.ok(Math.abs(p.benchmarks.matureMedian - 60.7750) < 0.0001);
  assert.ok(Math.abs(p.benchmarks.matureWeighted - 62.7329) < 0.0001);
});
```

- [ ] **Step 2: 写入季节曲线测试**

断言12个月指数算术平均值在`1e-10`内等于1、每月平均在运枪数等于前后月末枪数平均、每月单枪日充电量为正、源期间覆盖61个自然日、旺季还原后的年均基准低于未还原的60.7750元。

- [ ] **Step 3: 运行测试确认缺少引擎实现**

Expected: FAIL，提示`profileHistoricalRows`或`buildSeasonalityCurve`不存在。

- [ ] **Step 4: 实现历史聚合和分位数**

成熟站按有效日期去重计日，站点枪数取有效期内最大`dcGuns+acGuns`，枪日为站点枪数乘有效运营日。P25按线性插值位置`0.25*(n-1)`计算；站级中位数不能被全组合计替代。输出同时包含总金额核对差额和分时电量核对差额。

- [ ] **Step 5: 实现季节指数和源期间加权系数**

```js
export function buildSeasonalityCurve(inputs) {
  const months = inputs.slice(1).map((r, i) => {
    const days = new Date(2024, i + 1, 0).getDate();
    const avgGuns = (inputs[i].monthEndPublicGuns + r.monthEndPublicGuns) / 2;
    const kwhPerGunDay = r.chargingKwh100m * 1e8 / days / avgGuns;
    return { monthNumber: i + 1, days, avgGuns, chargingKwh100m: r.chargingKwh100m, kwhPerGunDay };
  });
  const mean = months.reduce((s, m) => s + m.kwhPerGunDay, 0) / 12;
  return months.map((m) => ({ ...m, index: m.kwhPerGunDay / mean }));
}
```

- [ ] **Step 6: 运行两组测试并记录回归结果**

Expected: 所有历史总计、成熟站指标、曲线均值和旺季还原断言PASS。

---

### Task 5: 实现城市评分、精确配额和站型整数分配

**Files:**
- Create: `.../work/model/city_engine.mjs`
- Create: `.../work/tests/city_engine.test.mjs`

**Interfaces:**
- Consumes: `CityInput[]`, 权重、等级标准配额、总目标枪数。
- Produces: `scoreCities(cities, weights)`, `allocateCityTargets(scoredCities, config)`, `allocateStationMix(guns, fourGunSiteShare)`。

- [ ] **Step 1: 写入站型整数测试**

```js
test("station mix preserves exact gun targets", () => {
  assert.deepEqual(allocateStationMix(800, 0.70), { fourGunSites: 165, twoGunSites: 70, guns: 800 });
  assert.deepEqual(allocateStationMix(600, 0.40), { fourGunSites: 86, twoGunSites: 128, guns: 600 });
  assert.throws(() => allocateStationMix(601, 0.40), /even/);
});
```

- [ ] **Step 2: 写入城市配额和缺失权重测试**

断言首批26城全部先于补充城市；等级顺序为一线、新一线、二线、三线；最后城市只取得剩余偶数枪；合计精确30,000；缺少非人口指标时有效权重重新归一；人口缺失的非首批城市不能自动入选。

- [ ] **Step 3: 运行测试确认缺少实现**

Expected: FAIL。

- [ ] **Step 4: 实现同等级百分位和综合得分**

高方向指标使用同等级经验百分位，公共枪/万人的稀缺度使用反向百分位。综合得分分母只包含非空指标权重；输出`dataQuality`为`完整`、`代理`或`缺失重算`。

- [ ] **Step 5: 实现30,000枪顺序分配**

排序键为`isFixed desc`、`fixedOrder asc`、`tierPriority asc`、`score desc`、`yicaiRank asc`。逐城取`min(等级标准配额, 剩余目标)`，剩余为0后目标枪数写0。站型组合以同等级已选城市得分中位数为阈值，高分采用70%四枪站，低分采用40%。

- [ ] **Step 6: 运行测试并输出选中城市摘要**

Expected: 总枪数30,000；所有目标为偶数；所有站数为非负整数；首批26城全部选中。

---

### Task 6: 实现上线批次和60个月经营预测

**Files:**
- Create: `.../work/model/deployment_engine.mjs`
- Create: `.../work/model/operations_engine.mjs`
- Create: `.../work/tests/deployment_engine.test.mjs`
- Create: `.../work/tests/operations_engine.test.mjs`

**Interfaces:**
- Consumes: 城市目标/站型、上线曲线、起始月、季节曲线、单枪年均基准、爬坡、物业和运营成本假设。
- Produces: `buildDeploymentPlan(allocations, config) -> Cohort[]`；`projectOperations(cohorts, config) -> { cohortMonths, monthly }`。
- `Cohort`字段：`cohortId`, `city`, `selectionMonth`, `onlineMonth`, `supplierPaymentMonth`, `financeDisbursementMonth`, `twoGunSites`, `fourGunSites`, `stations`, `guns`, `totalCapex`, `eligibleBasis`, `channelCost`。

- [ ] **Step 1: 写入基准上线曲线测试**

```js
test("base rollout is exact and fixed cities launch in first six months", () => {
  const plan = buildDeploymentPlan(allocations, { startMonth: "2026-09", shares: [5,6,7,8,9,10,11,11,10,9,8,6].map((x) => x / 100), totalGuns: 30000, supplierTermsMonths: 2, financeDelayMonths: 1 });
  assert.deepEqual(plan.monthlyGuns, [1500,1800,2100,2400,2700,3000,3300,3300,3000,2700,2400,1800]);
  assert.equal(plan.cohorts.reduce((s, c) => s + c.guns, 0), 30000);
  for (const city of FIXED_CITIES) assert.ok(plan.firstOnlineMonthByCity[city] <= "2027-02");
});
```

- [ ] **Step 2: 写入单批次经营测试**

```js
test("two-gun cohort applies seasonality, ramp and percentage property cost", () => {
  const out = projectOperations([{ cohortId: "C1", city: "测试城", onlineMonth: "2027-01", stations: 1, guns: 2 }], {
    startMonth: "2027-01", horizonMonths: 1, annualServicePerGunDay: 50,
    seasonalityByMonth: { 1: 0.8 }, ramp: [0.60,0.75,0.85,0.92,0.97,1],
    propertyMode: "分成", propertyShare: 0.20, fixedRentPerStation: 200,
    otherOpexRate: 0.10, headquartersMonthly: 0, operatingTaxRate: 0,
    historicalServiceFeeRate: 556193.42 / 1758717.20,
  });
  assert.ok(Math.abs(out.monthly[0].serviceFee - 1488.0) < 0.01);
  assert.ok(Math.abs(out.monthly[0].cfads - 1041.6) < 0.01);
});
```

- [ ] **Step 3: 运行测试确认缺少实现**

Expected: FAIL。

- [ ] **Step 4: 实现站点级整数上线批次**

先把每城2枪站和4枪站展开为站点单位，再按月度目标分箱。每个偶数月度枪数优先满足`target mod 4`所需的2枪站，再填4枪站；首批26城各预留一个站点并按`fixedOrder`轮转到前6个月。每月、每城和总计都必须从站点单位汇总，不能拆分4枪站。

- [ ] **Step 5: 实现60个月运营预测**

逐批次按上线月计算运营月龄、爬坡、当月天数和季节指数。物业成本使用严格互斥分支；GMV由历史服务费率反推，仅作辅助。第37至60月新增枪数为0，既有站点继续成熟运营。

- [ ] **Step 6: 增加慢建设测试并运行全部测试**

18个月曲线合计100%，首批26城仍在前6个月首次上线，最后批次在第18个月上线，60个月内没有新增站点遗漏。Expected: PASS。

---

### Task 7: 实现融资租赁批次、现金瀑布和情景

**Files:**
- Create: `.../work/model/lease_engine.mjs`
- Create: `.../work/tests/lease_engine.test.mjs`

**Interfaces:**
- Consumes: `Cohort[]`, 60个月运营结果和融资假设。
- Produces: `calculateLeasePayment(principal, originalValue, annualRate, termMonths, residualRate)`, `buildSingleLease(config)`, `buildLeaseCohorts(cohorts, config)`, `buildCashWaterfall(operations, cohorts, leases, config)`, `summarizeDscr(monthly)`, `runScenario(name, inputs)`。

- [ ] **Step 1: 写入月租和尾款测试**

```js
test("four-gun base lease amortizes to zero", () => {
  const lease = buildSingleLease({ principal: 61000, originalValue: 61000, annualRate: 0.08, termMonths: 36, residualRate: 0.01, disbursementMonthIndex: 1 });
  assert.ok(Math.abs(lease.levelRent - 1896.46977688249) < 1e-8);
  assert.ok(Math.abs(lease.payments.at(-1).residual - 610) < 1e-8);
  assert.ok(Math.abs(lease.payments.at(-1).endingBalance) < 0.01);
  assert.ok(Math.abs(lease.totalFinanceCost - 7882.91196776973) < 0.01);
});
```

- [ ] **Step 2: 写入现金缺口和DSCR测试**

用一个4枪站批次断言：总投资71,000、可融资原值61,000、渠道自筹10,000；付款月为选址后2个月；基准放款月为上线后1个月；首期租金为放款后1个月；无债务服务月份DSCR为`null`；最低股东资金等于包含租赁放款但不含股东投入的累计现金最低值绝对数。

- [ ] **Step 3: 运行测试确认缺少实现**

Expected: FAIL。

- [ ] **Step 4: 实现租赁本金滚动**

每期融资成本为期初本金乘月利率；普通月份本金偿还为月租减融资成本；最后一期现金债务服务为月租加留购款。浮点尾差小于0.01时归零，大于0.01时测试失败。

- [ ] **Step 5: 实现两条现金曲线和DSCR汇总**

输出不含租赁放款的项目总资金曲线，以及包含租赁放款但不含股东投入的实际缺口曲线。项目年度按起始月每12个月分组；全期限DSCR为总CFADS除以总债务服务，不取月度DSCR平均值。

- [ ] **Step 6: 实现六个情景和18/24/36期限对比**

六个情景严格使用设计规格的收入、融资比例、延迟、部署、利率和运营成本组合。期限对比使用同一资产批次和经营现金流，只改变期限并重新计算租金、本金、融资成本和DSCR。

- [ ] **Step 7: 运行租赁及全套纯函数测试**

Expected: 36期末余额归零；最晚18个月建设、2个月放款延迟、36个月租期在60个月窗口内完全偿付；全部测试PASS。

---

### Task 8: 构建输入、历史和驱动工作表

**Files:**
- Create: `.../work/model/workbook_style.mjs`
- Create: `.../work/model/workbook_inputs.mjs`
- Create: `.../work/build_model.mjs`
- Create: `.../work/tests/workbook_structure.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-7所有输入和参考计算结果。
- Produces: `createWorkbook()`, `buildInputSheets(workbook, context)`, `applyWorkbookStyles(workbook)`, `buildModel() -> Workbook`。

- [ ] **Step 1: 写入工作簿结构失败测试**

```js
test("builder creates the approved sheets in order", async () => {
  const workbook = await buildModel({ exportFile: false, renderPreviews: false });
  const info = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 6000 });
  const names = info.ndjson.split(/\r?\n/).filter(Boolean).map(JSON.parse).map((r) => r.name).filter(Boolean);
  assert.deepEqual([...new Set(names)], SHEET_NAMES);
});
```

- [ ] **Step 2: 运行测试确认构建入口不存在**

Expected: FAIL。

- [ ] **Step 3: 创建12张空表和统一样式助手**

```js
export function createWorkbook() {
  const workbook = Workbook.create();
  for (const name of SHEET_NAMES) workbook.worksheets.add(name);
  workbook.comments.setSelf({ displayName: "User" });
  return workbook;
}
```

样式助手必须提供`styleTitle`, `styleSection`, `styleInput`, `styleFormula`, `styleCrossSheet`, `styleCheck`, `formatFinancial`, `formatPercent`, `formatCount`，颜色与全局约束一致。

- [ ] **Step 4: 构建`核心假设`和`单站成本`**

固定布局：`核心假设!B5:B50`为纵向假设，`B55:M55`为12个月上线比例，`B60:G60`为6个月爬坡。所有选择器设置数据验证；站型成本用公式：

```excel
='核心假设'!B15+'核心假设'!B16+'核心假设'!B17
='核心假设'!B15+'核心假设'!B16
```

融资比例、期限、利率、放款延迟、物业方式、其他运营成本、总部成本、税费和初始现金均在此表有独立输入。

- [ ] **Step 5: 构建`历史原始数据`、`历史单枪模型`和`年度季节曲线`**

源矩阵逐值写入`历史原始数据!A1:P3050`；不得改变原数值。历史模型用可见辅助列计算枪数、有效日、枪日、站级服务费/枪日和成熟标志；季节表包含月初枪、月末枪、平均枪、天数、充电量、单枪日充电量、指数、来源。核心结果必须用工作簿公式复算，并与纯函数参考值在检查页对比。

- [ ] **Step 6: 构建`城市数据库`、`城市分配`和`月度投放计划`**

城市数据库保留原始指标、年份、来源、代理标志和按同等级计算的百分位公式。城市分配公式展示排序、标准配额、累计前值、目标枪数、4枪站占比及整数站数。月度投放计划采用公式驱动的两阶段分配：先为首批26城按固定顺序在前6个月各预留一个2枪站（该城无2枪站时预留一个4枪站），再分别对剩余2枪站池和4枪站池使用城市累计区间与月份累计区间的重叠公式分配。单元格结构为：

```excel
=MAX(0,MIN(城市剩余累计终点,月份剩余累计终点)-MAX(城市剩余累计起点,月份剩余累计起点))+预留站数
```

每月2枪/4枪站组合先按当月目标枪数、剩余站型库存和剩余总枪数顺序计算，保证`4×当月4枪站+2×当月2枪站=当月目标枪数`。因此修改城市配额、站型比例或上线曲线后，城市分配、月度批次、运营和融资均自动重算，不依赖重新运行构建程序。

- [ ] **Step 7: 为所有外部硬编码输入添加来源评论**

在写入评论前调用`setSelf`；评论格式固定为`Source: <名称> | As-of: <统计期> | URL: <链接> | Accessed: 2026-08-16 | Notes: <口径>`。长URL集中放在来源页，工作区可用短来源ID。

- [ ] **Step 8: 运行结构测试并做内存检查**

使用`workbook.inspect()`确认12表顺序、原始数据总行数和关键公式存在。正常流程不导出阶段工作簿；只有最终导出报错时，才按artifact-tool故障定位规则临时分段导出并在问题修复后移除临时文件。

---

### Task 9: 构建运营、融资、情景检查和摘要图表

**Files:**
- Create: `.../work/model/workbook_outputs.mjs`
- Create: `.../work/tests/workbook_formulas.test.mjs`
- Modify: `.../work/build_model.mjs`

**Interfaces:**
- Consumes: Task 8工作簿和Task 4-7参考结果。
- Produces: `buildOutputSheets(workbook, context)`和完整的12表工作簿。

- [ ] **Step 1: 写入关键公式与检查表测试**

断言`36月运营模型!B:BI`包含60个月、前36月和尾期有不同底色；`融资租赁与资金缺口`含应付、放款、月租、本金、利息、留购、现金和DSCR行；检查页至少17条检查；摘要模型状态引用检查页而不是硬编码。

- [ ] **Step 2: 运行测试确认输出表尚未完成**

Expected: FAIL。

- [ ] **Step 3: 构建60个月运营工作表**

月份从`36月运营模型!B5:BI5`连续递增。逐月行包括新增/运营枪数、运营站数、季节指数、加权爬坡、服务费、GMV、电费代收代付、物业成本、其他运营成本、总部及税费、经营贡献和CFADS。示例公式结构：

```excel
=运营枪数*年均单枪日服务费*DAY(EOMONTH(月份,0))*季节指数*加权爬坡
=IF(物业方式="固定租金",运营站数*固定租金,服务费*物业分成比例)
=服务费-物业成本-其他运营成本-总部成本-经营税费
```

所有数字参数必须引用`核心假设`，不得把200、20%、10%等数字写入预测公式。

- [ ] **Step 4: 构建租赁批次和资金缺口工作表**

每个上线月为独立资产批次，纵向列出原值、融资额、放款月、期限、利率、月租、留购；横向60个月滚动本金和债务服务。月租公式使用可见单元格并守护零利率：

```excel
=IF(月利率=0,(融资额-留购款)/期限,(融资额-留购款/(1+月利率)^期限)*月利率/(1-(1+月利率)^-期限))
```

现金区展示无租赁放款曲线、含租赁放款但不含股东投入曲线、最低股东资金、注资后现金和峰值缺口月份。

- [ ] **Step 5: 构建情景、检查与来源工作表**

检查表列固定为`检查项 | 实际 | 预期 | 差额 | 容差 | 状态 | 修复位置 | 说明`。总状态公式仅统计状态列。公式错误扫描是构建程序检查，不以吞错公式代替。来源区采用`Item | Value | Units | Period/As-of | Source Type | Source Name | Ref | Notes | Accessed`。

- [ ] **Step 6: 构建融资摘要和五张原生图表**

摘要使用公式链接核心输出，包含三年服务费、CFADS、总投资、租赁放款、自有资金、峰值缺口、年度DSCR、最低月度DSCR、三年末余额和全期限融资成本。图表数据区必须是公式链接：

1. 12个月新增/累计枪数——组合柱线图无法稳定渲染时改为两张紧凑线图；
2. 60个月服务费、CFADS、债务服务——线图；
3. 股东投入前累计现金——线图，保留0轴；
4. 月度DSCR和1.0x参考线——线图；
5. 18/24/36月最低DSCR、峰值缺口和融资成本——分组柱图或三个紧凑指标表，选择渲染更清晰者。

- [ ] **Step 7: 应用投行/FP&A格式并运行公式测试**

摘要与计算表隐藏网格线；冻结月份/标签；总计上方加横线；标题深蓝白字；第37至60月使用浅灰尾期底色；负数红色括号；DSCR为`0.00x`；来源文本列自动换行并限制列宽。Expected: 工作簿结构和公式测试PASS。

---

### Task 10: 全面验证、视觉修复和最终导出

**Files:**
- Modify: `.../work/build_model.mjs`
- Modify: `.../work/checkpoints.md`
- Create during build: `.../work/previews/*.png`
- Create final: `outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁模型.xlsx`

**Interfaces:**
- Consumes: 完整工作簿。
- Produces: 公式、财务、来源和视觉检查均通过的唯一最终`.xlsx`。

- [ ] **Step 1: 运行全部自动测试**

```powershell
& 'C:\Users\keqi_119\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/*.test.mjs
```

Expected: 0 failed。

- [ ] **Step 2: 执行关键范围检查**

```js
for (const [sheetName, range] of [
  ["融资摘要", "A1:R45"], ["核心假设", "A1:M65"],
  ["历史单枪模型", "A1:M80"], ["36月运营模型", "A1:BI35"],
  ["融资租赁与资金缺口", "A1:BI80"], ["情景分析、检查与来源", "A1:I120"],
]) {
  console.log((await workbook.inspect({ kind: "table", range: `${sheetName}!${range}`, include: "values,formulas", tableMaxRows: 120, tableMaxCols: 61, maxChars: 9000 })).ndjson);
}
```

人工抽查历史服务费、年均单枪基准、城市目标、首批首次上线、4枪站61,000原值、基准月租、最低股东资金、年度DSCR和三年末余额。

- [ ] **Step 3: 扫描公式错误和强制检查状态**

```js
const errors = await workbook.inspect({
  kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan",
});
if (errors.ndjson.trim()) throw new Error(errors.ndjson);
```

读取检查页全部状态，任一`FAIL`即停止导出。

- [ ] **Step 4: 执行融资模型专项审计**

逐项核对：历史总金额=电费+服务费；30,000枪和站型配平；Capex=设备+工程+渠道；融资原值=设备+工程；放款=原值×比例；供应商应付和现金滚动；每批租赁本金归零；全期限DSCR按合计计算；最低股东资金不是现金流量表中的普通收入。对摘要峰值缺口、最低DSCR和三年末未偿余额各执行一次`workbook.trace()`并记录节点摘要。

- [ ] **Step 5: 渲染12张工作表并逐张查看**

每张表渲染使用实际使用区或分段关键区；摘要、运营、租赁和检查表必须包含图表/长时间轴。使用图片查看工具检查标题、数字、来源、图表、列宽、尾期底色、警示和打印可读性。发现截断或遮挡时只修改受影响范围并重新渲染。

- [ ] **Step 6: 导出后重新导入复检**

```js
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(PATHS.outputWorkbook);
const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(PATHS.outputWorkbook));
```

对`reopened`重新执行表名、关键范围、公式错误和图表对象检查，防止导出过程中丢失公式或对象。

- [ ] **Step 7: 完成检查点并交付**

`checkpoints.md`记录测试通过、17项以上工作簿检查、12表视觉检查和最终文件大小。最终回复只引用成品工作簿一次，并简述基准假设、资金缺口和DSCR输出位置；不引用构建脚本、测试或预览图。

---

## Plan Self-Review Checklist

- [ ] 设计规格17节均能映射到Tasks 1-10中的实施或验证步骤。
- [ ] 所有函数名称在首次产生后保持一致：`loadSourceMatrix`, `normalizeSourceMatrix`, `profileHistoricalRows`, `buildSeasonalityCurve`, `scoreCities`, `allocateCityTargets`, `allocateStationMix`, `buildDeploymentPlan`, `projectOperations`, `buildLeaseCohorts`, `buildCashWaterfall`, `buildModel`。
- [ ] 城市数据允许真实缺失但不允许伪造，缺失权重重算和来源警示均有测试。
- [ ] 三年报告、60个月尾期、18个月慢建设和36个月租赁最晚批次同时受测试覆盖。
- [ ] 工作簿内公式是用户可审计的正式结果；纯函数只做参考计算和自动核验。
- [ ] 最终导出前包含源数据核对、公式错误扫描、财务专项审计、12表视觉检查和导出后复检。
