import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateModel, createBaselineState } from "../../src/model/calculator.mjs";

function readJson(relativeUrl) {
  return JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), "utf8"));
}

function loadEmbeddedFixture() {
  return {
    metadata: { modelVersion: "html-model-2" },
    historyRows: readJson("../../data/historical-baseline.json"),
    cityInputs: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/city_inputs.json"),
    seasonalityInputs: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/seasonality_2024.json"),
    cityAuditManifest: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/city_metric_audit_manifest.json"),
  };
}

const golden = readJson("../../data/golden-baseline.json");
const embedded = loadEmbeddedFixture();
const assertMoney = (actual, expected) => assert.ok(
  Math.abs(actual - expected) <= golden.moneyTolerance,
  `${actual} should be within ${golden.moneyTolerance} of ${expected}`,
);
const assertRatio = (actual, expected) => assert.ok(
  Math.abs(actual - expected) <= golden.ratioTolerance,
  `${actual} should be within ${golden.ratioTolerance} of ${expected}`,
);

test("baseline state restores dates and owns independent mutable copies", () => {
  const first = createBaselineState(embedded);
  const second = createBaselineState(embedded);

  assert.equal(first.modelVersion, "html-model-2");
  assert.ok(first.history.rows[0].date instanceof Date);
  assert.equal(first.history.sourceStart, "2026-06-16");
  assert.equal(first.history.sourceEnd, "2026-08-15");
  assert.equal(first.fixedCities.length, 26);

  first.assumptions.cityWeights.population = 1;
  first.cityInputs[0].city = "已修改";
  assert.equal(second.assumptions.cityWeights.population, 0.30);
  assert.notEqual(second.cityInputs[0].city, "已修改");
});

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
  assert.equal(result.status, "WARN");
  assert.equal(result.warnings.length, 2);
});

test("complete result contains the approved scenario and term matrices", () => {
  const result = calculateModel(createBaselineState(embedded));

  assert.deepEqual(
    result.scenarios.map((scenario) => scenario.name),
    ["基准", "保守收入", "融资收缩", "放款延迟", "慢建设", "综合压力"],
  );
  assert.ok(result.scenarios.every((scenario) => scenario.waterfall.monthly.length === 60));
  assert.deepEqual(result.termComparison.map((row) => row.termMonths), [18, 24, 36]);
  assert.equal(result.deployment.monthlyGuns.reduce((sum, value) => sum + value, 0), 30000);
  assert.equal(result.finance.waterfall.monthly.length, 60);
});

test("editable operating and lease assumptions drive the base calculation", () => {
  const state = createBaselineState(embedded);
  state.assumptions.propertyMode = "固定";
  state.assumptions.fixedRentPerStation = 260;
  state.assumptions.otherOpexRate = 0.12;
  state.assumptions.leaseAdvanceRate = 0.9;
  state.assumptions.annualLeaseRate = 0.10;
  state.assumptions.leaseTermMonths = 24;
  state.assumptions.leaseDelayMonths = 2;

  const result = calculateModel(state);
  const firstMonth = result.operations.monthly[0];
  assert.equal(firstMonth.propertyCost, firstMonth.operatingStations * 260);
  assert.equal(result.finance.leases[0].financeRatio, 0.9);
  assert.equal(result.finance.leases[0].annualRate, 0.10);
  assert.equal(result.finance.leases[0].termMonths, 24);
  assert.equal(
    result.finance.leases[0].disbursementMonth,
    "2026-11",
  );
  assert.deepEqual(result.termComparison.map((row) => row.termMonths), [18, 24, 36]);
});

test("city weights must be finite non-negative percentages totaling 100 percent", () => {
  const state = createBaselineState(loadEmbeddedFixture());
  state.assumptions.cityWeights.population = -0.1;
  assert.throws(() => calculateModel(state), /城市权重/);

  const overTotal = createBaselineState(loadEmbeddedFixture());
  overTotal.assumptions.cityWeights.population = 0.5;
  assert.throws(() => calculateModel(overTotal), /100%/);
});

test("baseline applies a ten-percent one-time demolition and relocation program", () => {
  const state = createBaselineState(loadEmbeddedFixture());
  const result = calculateModel(state);

  assert.equal(state.assumptions.demolitionRate, 0.10);
  assert.equal(state.assumptions.operatingMonthsBeforeDemolition, 2);
  assert.equal(result.deployment.demolitionSummary.expectedDemolishedStations, 970);
  assert.equal(result.deployment.demolitionSummary.expectedDemolishedGuns, 3000);
  assert.equal(result.deployment.demolitionSummary.reusableEquipmentValue, 30080000);
  assert.equal(result.deployment.demolitionSummary.relocationCapex, 33950000);
  assert.equal(result.kpis.totalInvestment, 674250000);
  assert.equal(result.kpis.expectedDemolishedGuns, 3000);
  assert.equal(result.kpis.relocationCapex, 33950000);
  assert.ok(result.kpis.threeYearServiceFee < 1547192645.96);
  assert.ok(result.scenarios.every((scenario) => scenario.assumptions.demolitionRate === 0.10));
});

test("zero demolition probability preserves the pre-v2 financial baseline", () => {
  const state = createBaselineState(loadEmbeddedFixture());
  state.assumptions.demolitionRate = 0;
  const result = calculateModel(state);

  assert.equal(result.deployment.demolitionSummary.expectedDemolishedStations, 0);
  assert.equal(result.deployment.demolitionSummary.relocationCapex, 0);
  assert.ok(result.deployment.cohorts.every((cohort) => (
    cohort.demolitionMonth === null
    && cohort.redeploymentOnlineMonth === null
    && cohort.relocationSupplierPaymentMonth === null
  )));
  assertMoney(result.kpis.totalInvestment, 640300000);
  assertMoney(result.kpis.threeYearServiceFee, 1547192645.96);
  assertMoney(result.kpis.threeYearCfads, 1083034852.17);
  assertMoney(result.kpis.peakFundingGap, 229020.49);
});

test("the visible investment audit reconciles original and relocation investment", () => {
  const result = calculateModel(createBaselineState(loadEmbeddedFixture()));
  const check = result.checks.find((row) => row.id === "capex-and-eligible-basis");

  assert.equal(check.status, "PASS");
  assert.match(check.detail, /总投资 674,250,000 元/);
  assert.match(check.detail, /原始建站投入 640,300,000 元/);
  assert.match(check.detail, /迁建追加投入 33,950,000 元/);
});

test("demolition probability and operating months reject values outside the approved domain", () => {
  for (const [path, value] of [
    ["demolitionRate", -0.01],
    ["demolitionRate", 1.01],
    ["operatingMonthsBeforeDemolition", -1],
    ["operatingMonthsBeforeDemolition", 1.5],
    ["operatingMonthsBeforeDemolition", 61],
  ]) {
    const state = createBaselineState(loadEmbeddedFixture());
    state.assumptions[path] = value;
    assert.throws(() => calculateModel(state), /拆站|运营月数|demolition/i, `${path}=${value}`);
  }
});

test("a demolition after the sixty-month calculation horizon does not create an in-horizon payment", () => {
  const state = createBaselineState(loadEmbeddedFixture());
  state.assumptions.operatingMonthsBeforeDemolition = 60;
  const result = calculateModel(state);

  assert.equal(result.deployment.demolitionSummary.expectedDemolishedGuns, 3000);
  assert.equal(
    result.finance.waterfall.monthly.reduce((sum, row) => sum + row.relocationSupplierPayment, 0),
    0,
  );
  assert.ok(result.checks.every((row) => row.status === "PASS"));
});
