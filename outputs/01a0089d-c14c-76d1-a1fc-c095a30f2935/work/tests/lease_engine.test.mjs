import test from "node:test";
import assert from "node:assert/strict";

import {
  BASE_DEPLOYMENT_SHARES,
  SCENARIO_NAMES,
  SLOW_DEPLOYMENT_SHARES,
  buildCashWaterfall,
  buildLeaseCohorts,
  buildSingleLease,
  calculateLeasePayment,
  runScenario,
  summarizeDscr,
} from "../model/lease_engine.mjs";

const START_MONTH = "2026-09";

function addMonths(month, offset) {
  const [year, monthNumber] = month.split("-").map(Number);
  const index = (year * 12) + monthNumber - 1 + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function operationsFixture(cfadsByMonth = () => 0) {
  return Array.from({ length: 60 }, (_, index) => {
    const cfads = cfadsByMonth(index + 1);
    return {
      month: addMonths(START_MONTH, index),
      monthIndex: index + 1,
      serviceFee: cfads,
      propertyCost: 0,
      otherOpex: 0,
      headquartersCost: 0,
      operatingTax: 0,
      cfads,
    };
  });
}

const FOUR_GUN_COHORT = Object.freeze({
  cohortId: "C0001",
  city: "测试城",
  selectionMonth: "2026-08",
  onlineMonth: "2026-09",
  supplierPaymentMonth: "2026-10",
  financeDisbursementMonth: "2026-10",
  twoGunSites: 0,
  fourGunSites: 1,
  stations: 1,
  guns: 4,
  totalCapex: 71000,
  eligibleBasis: 61000,
  channelCost: 10000,
});

test("four-gun base lease amortizes to zero after level rents and residual", () => {
  const levelRent = calculateLeasePayment(61000, 61000, 0.08, 36, 0.01);
  const lease = buildSingleLease({
    principal: 61000,
    originalValue: 61000,
    annualRate: 0.08,
    termMonths: 36,
    residualRate: 0.01,
    disbursementMonthIndex: 1,
  });

  assert.ok(Math.abs(levelRent - 1896.46977688249) < 1e-8);
  assert.equal(lease.levelRent, levelRent);
  assert.equal(lease.payments[0].paymentMonthIndex, 2);
  assert.ok(Math.abs(lease.payments.at(-1).residual - 610) < 1e-8);
  assert.ok(Math.abs(lease.payments.at(-1).endingBalance) < 0.01);
  assert.ok(Math.abs(lease.totalFinanceCost - 7882.91196776973) < 0.01);
  assert.ok(Math.abs(lease.payments.reduce((sum, row) => sum + row.principalRepayment, 0) - 61000) < 0.01);
});

test("zero-rate lease spreads financed principal net of residual evenly", () => {
  const lease = buildSingleLease({
    principal: 50000,
    originalValue: 50000,
    annualRate: 0,
    termMonths: 24,
    residualRate: 0.01,
    disbursementMonthIndex: 0,
  });

  assert.equal(lease.levelRent, 2062.5);
  assert.equal(lease.payments[0].financeCost, 0);
  assert.equal(lease.payments.at(-1).debtService, 2562.5);
  assert.equal(lease.payments.at(-1).endingBalance, 0);
  assert.equal(lease.totalFinanceCost, 0);
});

test("lease cohorts finance eligible basis only and preserve Task 6 inputs", () => {
  const cohorts = [structuredClone(FOUR_GUN_COHORT)];
  const before = structuredClone(cohorts);

  const [lease] = buildLeaseCohorts(cohorts, {
    startMonth: START_MONTH,
    financeRatio: 0.8,
    annualRate: 0.08,
    termMonths: 36,
    residualRate: 0.01,
  });

  assert.equal(lease.principal, 48800);
  assert.equal(lease.originalValue, 61000);
  assert.equal(lease.disbursementMonthIndex, 2);
  assert.equal(lease.payments[0].paymentMonthIndex, 3);
  assert.equal(lease.channelCost, 10000);
  assert.equal(lease.unfinancedEligibleBasis, 12200);
  assert.deepEqual(cohorts, before);
});

test("0/1/2-month disbursement delay is derived from online month when requested", () => {
  const monthIndexes = [0, 1, 2].map((financeDelayMonths) => buildLeaseCohorts(
    [FOUR_GUN_COHORT],
    {
      startMonth: START_MONTH,
      financeRatio: 1,
      annualRate: 0.08,
      termMonths: 36,
      residualRate: 0.01,
      financeDelayMonths,
    },
  )[0].disbursementMonthIndex);

  assert.deepEqual(monthIndexes, [1, 2, 3]);
});

test("cash waterfall pays suppliers at t+2, starts rent one month after disbursement, and sizes equity gap", () => {
  const leases = buildLeaseCohorts([FOUR_GUN_COHORT], {
    startMonth: START_MONTH,
    financeRatio: 1,
    annualRate: 0.08,
    termMonths: 36,
    residualRate: 0.01,
  });
  const operations = operationsFixture((monthIndex) => (monthIndex >= 3 ? 3000 : 0));
  const waterfall = buildCashWaterfall(operations, [FOUR_GUN_COHORT], leases, {
    initialCash: 0,
    shareholderFunding: 0,
    reportMonths: 36,
  });

  assert.equal(waterfall.monthly[0].supplierPayment, 0);
  assert.equal(waterfall.monthly[0].leaseDisbursement, 0);
  assert.equal(waterfall.monthly[0].debtService, 0);
  assert.equal(waterfall.monthly[0].dscr, null);
  assert.equal(waterfall.monthly[1].supplierPayment, 71000);
  assert.equal(waterfall.monthly[1].leaseDisbursement, 61000);
  assert.equal(waterfall.monthly[1].preEquityNetCash, -10000);
  assert.equal(waterfall.monthly[1].preEquityCumulativeCash, -10000);
  assert.equal(waterfall.monthly[2].levelRent, leases[0].levelRent);
  assert.equal(waterfall.monthly[2].debtService, leases[0].levelRent);
  assert.equal(waterfall.minimumShareholderFunding, 10000);
  assert.equal(waterfall.peakFundingGap.amount, 10000);
  assert.equal(waterfall.peakFundingGap.month, "2026-10");
  assert.ok(waterfall.monthly.every((row) => row.minimumFundedCumulativeCash >= -1e-8));
  assert.ok(waterfall.monthly.slice(0, 36).every((row) => row.period === "report"));
  assert.ok(waterfall.monthly.slice(36).every((row) => row.period === "debtTail"));
  assert.equal(waterfall.monthly[37].residualPayment, 610);
  assert.equal(waterfall.monthly[37].endingLeaseBalance, 0);
});

test("initial cash reduces the financing gap and total-funding curve excludes lease proceeds", () => {
  const leases = buildLeaseCohorts([FOUR_GUN_COHORT], {
    startMonth: START_MONTH,
    financeRatio: 0.8,
    annualRate: 0,
    termMonths: 18,
    residualRate: 0.01,
  });
  const waterfall = buildCashWaterfall(operationsFixture(() => 0), [FOUR_GUN_COHORT], leases, {
    initialCash: 1000,
    shareholderFunding: 5000,
    reportMonths: 36,
  });

  assert.equal(waterfall.monthly[1].projectCumulativeCash, 1000 - 71000);
  assert.equal(waterfall.monthly[1].preEquityCumulativeCash, 1000 - 71000 + 48800);
  assert.equal(waterfall.monthly[0].shareholderFunding, 5000);
  assert.equal(waterfall.monthly[0].cumulativeCash, 6000);
  assert.ok(waterfall.minimumShareholderFunding > 21200);
  assert.equal(waterfall.fundingShortfall, waterfall.minimumShareholderFunding - 5000);
});

test("cash waterfall accepts the unchanged Task 6 operations result object", () => {
  const operations = { cohortMonths: [], monthly: operationsFixture(() => 0) };
  const before = structuredClone(operations);
  const waterfall = buildCashWaterfall(operations, [], [], {
    initialCash: 0,
    shareholderFunding: 0,
    reportMonths: 36,
  });

  assert.equal(waterfall.monthly.length, 60);
  assert.deepEqual(operations, before);
});

test("DSCR summary uses ratio of sums and returns null for debt-free periods", () => {
  const monthly = Array.from({ length: 60 }, (_, index) => ({
    month: addMonths(START_MONTH, index),
    monthIndex: index + 1,
    cfads: index < 36 ? 10 : 20,
    debtService: index === 0 ? 0 : (index < 36 ? 5 : 10),
    dscr: index === 0 ? null : 2,
  }));
  const summary = summarizeDscr(monthly);

  assert.equal(summary.projectYears[0].dscr, 120 / 55);
  assert.equal(summary.projectYears[1].dscr, 2);
  assert.equal(summary.projectYears[2].dscr, 2);
  assert.equal(summary.debtTail.dscr, 2);
  assert.equal(summary.fullTermDscr, 840 / 415);
  assert.equal(summary.minimumMonthlyDscr.value, 2);
  assert.equal(summary.minimumMonthlyDscr.month, "2026-10");
  assert.equal(summarizeDscr(monthly.map((row) => ({ ...row, debtService: 0, dscr: null }))).fullTermDscr, null);
});

test("negative CFADS remains visible in cash gaps and debt-service coverage", () => {
  const operations = operationsFixture((monthIndex) => (monthIndex <= 2 ? -100 : 0));
  const waterfall = buildCashWaterfall(operations, [], [], {
    initialCash: 0,
    shareholderFunding: 0,
    reportMonths: 36,
  });
  const summary = summarizeDscr([{ month: START_MONTH, monthIndex: 1, cfads: -100, debtService: 50, dscr: -2 }]);

  assert.equal(waterfall.monthly[0].netCash, -100);
  assert.equal(waterfall.minimumShareholderFunding, 200);
  assert.deepEqual(waterfall.peakFundingGap, {
    amount: 200,
    month: "2026-10",
    initialCash: 0,
    cumulativeCfads: -200,
    cumulativeSupplierPayment: 0,
    cumulativeLeaseDisbursement: 0,
    cumulativeDebtService: 0,
  });
  assert.equal(summary.fullTermDscr, -2);
  assert.deepEqual(summary.minimumMonthlyDscr, { month: START_MONTH, value: -2 });
});

function scenarioInputs() {
  return {
    allocations: [{
      city: "测试城",
      isFixed: false,
      fixedOrder: null,
      twoGunSites: 0,
      fourGunSites: 100,
      targetGuns: 400,
    }],
    deploymentConfig: {
      startMonth: START_MONTH,
      shares: BASE_DEPLOYMENT_SHARES,
      totalGuns: 400,
      supplierTermsMonths: 2,
      financeDelayMonths: 1,
    },
    operationsConfig: {
      startMonth: START_MONTH,
      horizonMonths: 60,
      annualServicePerGunDay: 50,
      seasonalityByMonth: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [index + 1, 1])),
      ramp: [0.60, 0.75, 0.85, 0.92, 0.97, 1],
      propertyMode: "分成",
      propertyShare: 0.20,
      fixedRentPerStation: 200,
      otherOpexRate: 0.10,
      headquartersMonthly: 0,
      operatingTaxRate: 0,
      historicalServiceFeeRate: 0.30,
    },
    leaseConfig: {
      financeRatio: 1,
      annualRate: 0.08,
      termMonths: 36,
      residualRate: 0.01,
    },
    cashConfig: { initialCash: 0, shareholderFunding: 0, reportMonths: 36 },
    revenueBenchmarks: { p50: 50, p25: 30 },
    slowDeploymentShares: SLOW_DEPLOYMENT_SHARES,
  };
}

test("six scenarios apply the approved revenue, financing, delay, deployment, property, and opex matrix", () => {
  assert.deepEqual(SCENARIO_NAMES, ["基准", "保守收入", "融资收缩", "放款延迟", "慢建设", "综合压力"]);
  const expected = {
    基准: [50, 1, 1, 12, 0.08, 0.20, 0.10],
    保守收入: [30, 1, 1, 12, 0.08, 0.20, 0.10],
    融资收缩: [50, 0.8, 1, 12, 0.08, 0.20, 0.10],
    放款延迟: [50, 1, 2, 12, 0.08, 0.20, 0.10],
    慢建设: [50, 1, 1, 18, 0.08, 0.20, 0.10],
    综合压力: [27, 0.8, 2, 18, 0.10, 0.20, 0.15],
  };

  for (const name of SCENARIO_NAMES) {
    const inputs = scenarioInputs();
    const before = structuredClone(inputs);
    const result = runScenario(name, inputs);
    const a = result.assumptions;
    assert.deepEqual(
      [a.annualServicePerGunDay, a.financeRatio, a.financeDelayMonths, a.deploymentMonths,
        a.annualRate, a.propertyShare, a.otherOpexRate],
      expected[name],
    );
    assert.equal(a.headquartersMonthly, 0);
    assert.equal(a.operatingTaxRate, 0);
    assert.equal(result.operations.monthly.length, 60);
    assert.equal(result.waterfall.monthly.length, 60);
    assert.deepEqual(inputs, before);
  }
});

test("term comparison reuses one scenario's assets and operations and recalculates debt", () => {
  const result = runScenario("综合压力", scenarioInputs());

  assert.deepEqual(result.termComparison.map((row) => row.termMonths), [18, 24, 36]);
  assert.ok(result.termComparison[0].levelRent > result.termComparison[1].levelRent);
  assert.ok(result.termComparison[1].levelRent > result.termComparison[2].levelRent);
  assert.ok(result.termComparison.every((row) => row.totalPrincipal === result.termComparison[0].totalPrincipal));
  assert.ok(result.termComparison.every((row) => row.threeYearServiceFee === result.termComparison[0].threeYearServiceFee));
  assert.ok(result.leases.every((lease) => lease.payments.at(-1).endingBalance === 0));
  assert.equal(Math.max(...result.leases.flatMap((lease) => lease.payments.map((row) => row.paymentMonthIndex))), 56);
});
