import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateModel, createBaselineState } from "../../src/model/calculator.mjs";

function readJson(relativeUrl) {
  return JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), "utf8"));
}

function loadEmbeddedFixture() {
  return {
    metadata: { modelVersion: "html-model-1" },
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

  assert.equal(first.modelVersion, "html-model-1");
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
