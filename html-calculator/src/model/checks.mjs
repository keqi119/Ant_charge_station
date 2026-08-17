export const CHECK_IDS = Object.freeze([
  "history-gross-split", "city-even-and-sites-integer", "target-guns-total",
  "fixed-cities-first-six-months", "deployment-total-and-horizon",
  "station-cost-components", "capex-and-eligible-basis", "supplier-payable-rollforward",
  "finance-disbursement-timing", "approved-lease-inputs", "lease-cohorts-end-at-zero",
  "debt-service-components", "service-fee-rollforward", "cfads-rollforward",
  "cash-rollforward", "dscr-ratio-of-sums", "scenario-gap-reconciliation",
]);

const CHECK_LABELS = Object.freeze({
  "history-gross-split": "历史订单总额＝电费＋服务费",
  "city-even-and-sites-integer": "城市枪数为偶数且站型为整数",
  "target-guns-total": "城市分配合计等于目标枪数",
  "fixed-cities-first-six-months": "首批26城在前6个月上线",
  "deployment-total-and-horizon": "月度投放合计与建设期限",
  "station-cost-components": "单站成本组成勾稽",
  "capex-and-eligible-basis": "总投资与可融资原值勾稽",
  "supplier-payable-rollforward": "供应商付款时点与金额勾稽",
  "finance-disbursement-timing": "融资放款时点与金额勾稽",
  "approved-lease-inputs": "融资租赁输入位于批准范围",
  "lease-cohorts-end-at-zero": "逐批租赁期末余额归零",
  "debt-service-components": "债务支付＝本金＋融资成本",
  "service-fee-rollforward": "服务费按批次汇总勾稽",
  "cfads-rollforward": "CFADS经营现金流勾稽",
  "cash-rollforward": "累计现金滚动勾稽",
  "dscr-ratio-of-sums": "DSCR采用现金总额比值",
  "scenario-gap-reconciliation": "六情景峰值资金缺口勾稽",
});

const EPSILON = 0.01;

function nearlyEqual(left, right, tolerance = EPSILON) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function monthIndex(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  return (Number(match[1]) * 12) + Number(match[2]) - 1;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row?.[field]) || 0), 0);
}

function result(id, passed, detail) {
  return { id, label: CHECK_LABELS[id], status: passed ? "PASS" : "FAIL", detail };
}

function groupByMonth(rows, monthField, valueField) {
  const grouped = new Map();
  for (const row of rows) {
    const month = row?.[monthField];
    grouped.set(month, (grouped.get(month) ?? 0) + (Number(row?.[valueField]) || 0));
  }
  return grouped;
}

function checkHistorical(context) {
  const difference = context.historical?.reconciliations?.grossComponentsDifference;
  return result(
    "history-gross-split",
    Number.isFinite(difference) && Math.abs(difference) <= 1,
    Number.isFinite(difference) ? `累计差额 ${difference.toFixed(2)} 元` : "历史拆分差额不可用",
  );
}

function checkCityIntegers(context) {
  const target = context.state?.assumptions?.targetGuns;
  const validTarget = Number.isInteger(target) && target >= 0 && target % 2 === 0;
  const invalid = (context.allocations ?? []).filter((city) => (
    !Number.isInteger(city.targetGuns) || city.targetGuns < 0 || city.targetGuns % 2 !== 0
    || !Number.isInteger(city.twoGunSites) || city.twoGunSites < 0
    || !Number.isInteger(city.fourGunSites) || city.fourGunSites < 0
    || (2 * city.twoGunSites) + (4 * city.fourGunSites) !== city.targetGuns
  ));
  return result(
    "city-even-and-sites-integer",
    validTarget && invalid.length === 0,
    validTarget && invalid.length === 0 ? "目标及全部城市站型均为有效整数" : `异常城市 ${invalid.length} 个或总目标不是正偶数`,
  );
}

function checkTargetTotal(context) {
  const allocated = sum(context.allocations ?? [], "targetGuns");
  const target = context.state?.assumptions?.targetGuns;
  return result("target-guns-total", allocated === target, `城市合计 ${allocated.toLocaleString()} / 目标 ${target?.toLocaleString?.() ?? target}`);
}

function checkFixedLaunch(context) {
  const start = monthIndex(context.state?.assumptions?.modelStartMonth);
  const deadline = start === null ? null : start + 5;
  const firstOnline = context.deployment?.firstOnlineMonthByCity ?? {};
  const missing = (context.state?.fixedCities ?? []).filter((city) => {
    const launch = monthIndex(firstOnline[city]);
    return launch === null || deadline === null || launch > deadline;
  });
  return result(
    "fixed-cities-first-six-months",
    missing.length === 0,
    missing.length === 0 ? "全部首批城市在前6个月上线" : `未按期上线：${missing.join("、")}`,
  );
}

function checkDeployment(context) {
  const monthly = context.deployment?.monthlyGuns ?? [];
  const target = context.state?.assumptions?.targetGuns;
  const cohorts = context.deployment?.cohorts ?? [];
  const start = monthIndex(context.state?.assumptions?.modelStartMonth);
  const latest = cohorts.reduce((maximum, cohort) => Math.max(maximum, monthIndex(cohort.onlineMonth) ?? Infinity), -Infinity);
  const validHorizon = monthly.length > 0 && monthly.length <= 18 && monthly.at(-1) > 0
    && (cohorts.length === 0 || (start !== null && latest - start < 18));
  return result(
    "deployment-total-and-horizon",
    sum(monthly.map((guns) => ({ guns })), "guns") === target && validHorizon,
    `${monthly.length}个月投放，合计 ${monthly.reduce((total, guns) => total + guns, 0).toLocaleString()} 枪`,
  );
}

function expectedCohortCosts(cohort, costs) {
  const two = costs?.twoGun ?? {};
  const four = costs?.fourGun ?? {};
  return {
    totalCapex: cohort.twoGunSites * ((two.equipment ?? 0) + (two.engineering ?? 0) + (two.channel ?? 0))
      + cohort.fourGunSites * ((four.equipment ?? 0) + (four.engineering ?? 0) + (four.channel ?? 0)),
    eligibleBasis: cohort.twoGunSites * ((two.equipment ?? 0) + (two.engineering ?? 0))
      + cohort.fourGunSites * ((four.equipment ?? 0) + (four.engineering ?? 0)),
    channelCost: cohort.twoGunSites * (two.channel ?? 0) + cohort.fourGunSites * (four.channel ?? 0),
  };
}

function checkStationCosts(context) {
  const costs = context.state?.assumptions?.costByStationType;
  const fieldsValid = [costs?.twoGun, costs?.fourGun].every((cost) => (
    [cost?.equipment, cost?.engineering, cost?.channel].every((value) => Number.isFinite(value) && value >= 0)
  ));
  const invalid = (context.deployment?.cohorts ?? []).filter((cohort) => {
    const expected = expectedCohortCosts(cohort, costs);
    return !nearlyEqual(cohort.totalCapex, expected.totalCapex)
      || !nearlyEqual(cohort.eligibleBasis, expected.eligibleBasis)
      || !nearlyEqual(cohort.channelCost, expected.channelCost);
  });
  return result("station-cost-components", fieldsValid && invalid.length === 0, invalid.length === 0 ? "逐批成本组成一致" : `${invalid.length} 个批次成本不一致`);
}

function checkCapex(context) {
  const cohorts = context.deployment?.cohorts ?? [];
  const leases = context.leases ?? [];
  const invalid = cohorts.filter((cohort) => (
    !nearlyEqual(cohort.totalCapex, cohort.eligibleBasis + cohort.channelCost)
  ));
  const leaseBasis = sum(leases, "originalValue");
  const eligible = sum(cohorts, "eligibleBasis");
  return result(
    "capex-and-eligible-basis",
    invalid.length === 0 && nearlyEqual(leaseBasis, eligible),
    `总投资 ${sum(cohorts, "totalCapex").toLocaleString()} 元，可融资原值 ${eligible.toLocaleString()} 元`,
  );
}

function checkSupplierPayments(context) {
  const expected = groupByMonth(context.deployment?.cohorts ?? [], "supplierPaymentMonth", "totalCapex");
  const actual = new Map((context.waterfall?.monthly ?? []).map((row) => [row.month, row.supplierPayment]));
  const months = new Set([...expected.keys(), ...actual.keys()]);
  const passed = [...months].every((month) => nearlyEqual(expected.get(month) ?? 0, actual.get(month) ?? 0));
  return result("supplier-payable-rollforward", passed, `累计供应商付款 ${sum(context.waterfall?.monthly ?? [], "supplierPayment").toLocaleString()} 元`);
}

function checkDisbursements(context) {
  const expected = groupByMonth(context.leases ?? [], "disbursementMonth", "principal");
  const actual = new Map((context.waterfall?.monthly ?? []).map((row) => [row.month, row.leaseDisbursement]));
  const delay = context.state?.assumptions?.leaseDelayMonths;
  const timing = (context.leases ?? []).every((lease) => (
    monthIndex(lease.disbursementMonth) - monthIndex(lease.onlineMonth) === delay
  ));
  const months = new Set([...expected.keys(), ...actual.keys()]);
  const amounts = [...months].every((month) => nearlyEqual(expected.get(month) ?? 0, actual.get(month) ?? 0));
  return result("finance-disbursement-timing", timing && amounts, `累计放款 ${sum(context.waterfall?.monthly ?? [], "leaseDisbursement").toLocaleString()} 元`);
}

function checkApprovedLeaseInputs(context) {
  const assumptions = context.state?.assumptions ?? {};
  const approved = [0.8, 0.9, 1].includes(assumptions.leaseAdvanceRate)
    && [0.06, 0.08, 0.10, 0.12].includes(assumptions.annualLeaseRate)
    && [18, 24, 36].includes(assumptions.leaseTermMonths)
    && [0, 1, 2].includes(assumptions.leaseDelayMonths)
    && Number.isFinite(assumptions.residualRate) && assumptions.residualRate >= 0;
  const leasesValid = (context.leases ?? []).every((lease) => (
    lease.residualAmount <= lease.principal
    && lease.termMonths === assumptions.leaseTermMonths
    && nearlyEqual(lease.annualRate, assumptions.annualLeaseRate, 1e-10)
  ));
  return result("approved-lease-inputs", approved && leasesValid, approved && leasesValid ? "融资比例、利率、期限、延迟和留购款均有效" : "存在超出批准范围的融资输入");
}

function checkLeaseEndings(context) {
  const invalid = (context.leases ?? []).filter((lease) => (
    !lease.payments?.length || Math.abs(lease.payments.at(-1).endingBalance) > EPSILON
  ));
  return result("lease-cohorts-end-at-zero", invalid.length === 0, invalid.length === 0 ? "全部批次期末余额归零" : `${invalid.length} 个批次未归零`);
}

function checkDebtComponents(context) {
  const invalid = (context.leases ?? []).flatMap((lease) => lease.payments ?? []).filter((payment) => (
    !nearlyEqual(payment.debtService, payment.principalRepayment + payment.financeCost)
    || !nearlyEqual(payment.debtService, payment.levelRent + payment.residual)
  ));
  return result("debt-service-components", invalid.length === 0, invalid.length === 0 ? "所有月度债务支付组成一致" : `${invalid.length} 笔债务支付不一致`);
}

function checkServiceFee(context) {
  const cohortFees = groupByMonth(context.operations?.cohortMonths ?? [], "month", "serviceFee");
  const invalid = (context.operations?.monthly ?? []).filter((row) => !nearlyEqual(row.serviceFee, cohortFees.get(row.month) ?? 0));
  return result("service-fee-rollforward", invalid.length === 0, invalid.length === 0 ? "60个月服务费逐月勾稽" : `${invalid.length} 个月服务费不一致`);
}

function checkCfads(context) {
  const invalid = (context.operations?.monthly ?? []).filter((row) => !nearlyEqual(
    row.cfads,
    row.serviceFee - row.propertyCost - row.otherOpex - row.headquartersCost - row.operatingTax,
  ));
  return result("cfads-rollforward", invalid.length === 0, invalid.length === 0 ? "60个月CFADS逐月勾稽" : `${invalid.length} 个月CFADS不一致`);
}

function checkCash(context) {
  const monthly = context.waterfall?.monthly ?? [];
  let expected = context.waterfall?.initialCash ?? 0;
  const invalid = monthly.filter((row) => {
    expected += row.netCash;
    return !nearlyEqual(row.cumulativeCash, expected);
  });
  return result("cash-rollforward", invalid.length === 0, invalid.length === 0 ? "累计现金逐月滚动一致" : `${invalid.length} 个月现金滚动不一致`);
}

function checkDscr(context) {
  const rows = context.waterfall?.monthly ?? [];
  const totalCfads = sum(rows, "cfads");
  const debt = sum(rows, "debtService");
  const expected = debt === 0 ? null : totalCfads / debt;
  const actual = context.dscr?.fullTermDscr;
  const passed = expected === null ? actual === null : nearlyEqual(actual, expected, 1e-9);
  return result("dscr-ratio-of-sums", passed, expected === null ? "全期限无债务支付" : `全期限DSCR ${expected.toFixed(4)}x`);
}

function checkScenarioGaps(context) {
  const scenarios = context.scenarios ?? [];
  const invalid = scenarios.filter((scenario) => {
    const monthly = scenario.waterfall?.monthly ?? [];
    if (monthly.length !== 60) return true;
    const minimum = monthly.reduce((value, row) => Math.min(value, row.preEquityCumulativeCash), Infinity);
    return !nearlyEqual(scenario.waterfall.peakFundingGap?.amount, Math.max(0, -minimum));
  });
  return result(
    "scenario-gap-reconciliation",
    scenarios.length === 6 && invalid.length === 0,
    scenarios.length === 6 && invalid.length === 0 ? "六个情景峰值资金缺口均独立勾稽" : "情景数量或资金缺口勾稽失败",
  );
}

/** Runs the 17 visible audit checks without mutating the model result. */
export function runModelChecks(context) {
  const checks = [
    checkHistorical(context),
    checkCityIntegers(context),
    checkTargetTotal(context),
    checkFixedLaunch(context),
    checkDeployment(context),
    checkStationCosts(context),
    checkCapex(context),
    checkSupplierPayments(context),
    checkDisbursements(context),
    checkApprovedLeaseInputs(context),
    checkLeaseEndings(context),
    checkDebtComponents(context),
    checkServiceFee(context),
    checkCfads(context),
    checkCash(context),
    checkDscr(context),
    checkScenarioGaps(context),
  ];
  if (checks.map((check) => check.id).join("|") !== CHECK_IDS.join("|")) throw new Error("check order contract changed");
  return checks;
}
