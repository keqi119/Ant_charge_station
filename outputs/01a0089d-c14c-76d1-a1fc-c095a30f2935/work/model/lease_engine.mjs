import { buildDeploymentPlan } from "./deployment_engine.mjs";
import { projectOperations } from "./operations_engine.mjs";

export const BASE_DEPLOYMENT_SHARES = Object.freeze(
  [5, 6, 7, 8, 9, 10, 11, 11, 10, 9, 8, 6].map((value) => value / 100),
);
export const SLOW_DEPLOYMENT_SHARES = Object.freeze(
  [3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 7, 7, 7, 6, 6, 5, 4, 4].map((value) => value / 100),
);
export const SCENARIO_NAMES = Object.freeze(["基准", "保守收入", "融资收缩", "放款延迟", "慢建设", "综合压力"]);

const TERM_OPTIONS = new Set([18, 24, 36]);
const LEASE_BALANCE_TOLERANCE = 0.01;
const SCENARIO_DEFINITIONS = Object.freeze({
  基准: Object.freeze({ revenue: "p50", financeRatio: 1, financeDelayMonths: 1, slow: false, annualRate: 0.08, otherOpexRate: 0.10 }),
  保守收入: Object.freeze({ revenue: "p25", financeRatio: 1, financeDelayMonths: 1, slow: false, annualRate: 0.08, otherOpexRate: 0.10 }),
  融资收缩: Object.freeze({ revenue: "p50", financeRatio: 0.8, financeDelayMonths: 1, slow: false, annualRate: 0.08, otherOpexRate: 0.10 }),
  放款延迟: Object.freeze({ revenue: "p50", financeRatio: 1, financeDelayMonths: 2, slow: false, annualRate: 0.08, otherOpexRate: 0.10 }),
  慢建设: Object.freeze({ revenue: "p50", financeRatio: 1, financeDelayMonths: 1, slow: true, annualRate: 0.08, otherOpexRate: 0.10 }),
  综合压力: Object.freeze({ revenue: "p25Stress", financeRatio: 0.8, financeDelayMonths: 2, slow: true, annualRate: 0.10, otherOpexRate: 0.15 }),
});

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function requireFinite(value, label, { positive = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (positive && value === 0)) {
    throw new TypeError(`${label} must be ${positive ? "a positive" : "a non-negative"} finite number`);
  }
  return value;
}

function requireSignedFinite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
  return value;
}

function requireRate(value, label, { positive = false } = {}) {
  const rate = requireFinite(value, label, { positive });
  if (rate > 1) throw new RangeError(`${label} must be between 0 and 1`);
  return rate;
}

function requireTerm(value) {
  if (!TERM_OPTIONS.has(value)) throw new RangeError("termMonths must be 18, 24, or 36");
  return value;
}

function parseMonth(value, label) {
  const match = typeof value === "string" && /^(\d{4})-(\d{2})$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new TypeError(`${label} must use YYYY-MM`);
  return (Number(match[1]) * 12) + Number(match[2]) - 1;
}

function formatMonth(monthIndex) {
  const year = Math.floor(monthIndex / 12);
  return `${year}-${String((monthIndex % 12) + 1).padStart(2, "0")}`;
}

function relativeMonthIndex(month, startMonth, label) {
  return parseMonth(month, label) - parseMonth(startMonth, "startMonth") + 1;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + row[field], 0);
}

function boundResidualToPrincipal(residualAmount, financedPrincipal) {
  if (residualAmount - financedPrincipal > LEASE_BALANCE_TOLERANCE) {
    throw new RangeError("residual cannot exceed financed principal");
  }
  return Math.min(residualAmount, financedPrincipal);
}

/** Calculates the level monthly rent while separately discounting the final residual payment. */
export function calculateLeasePayment(principal, originalValue, annualRate, termMonths, residualRate) {
  const financedPrincipal = requireFinite(principal, "principal", { positive: true });
  const assetOriginalValue = requireFinite(originalValue, "originalValue", { positive: true });
  const yearlyRate = requireRate(annualRate, "annualRate");
  const months = requireTerm(termMonths);
  const residualAmount = boundResidualToPrincipal(
    assetOriginalValue * requireRate(residualRate, "residualRate"),
    financedPrincipal,
  );
  const monthlyRate = yearlyRate / 12;
  if (monthlyRate === 0) {
    return (financedPrincipal - residualAmount) / months;
  }
  const discountFactor = (1 + monthlyRate) ** months;
  const payment = (financedPrincipal - (residualAmount / discountFactor))
    * monthlyRate / (1 - ((1 + monthlyRate) ** -months));
  if (payment < 0) throw new RangeError("discounted residual cannot exceed financed principal");
  return payment;
}

/** Builds one lease's complete principal roll-forward from disbursement through buyout. */
export function buildSingleLease(config) {
  requireObject(config, "config");
  const principal = requireFinite(config.principal, "principal", { positive: true });
  const originalValue = requireFinite(config.originalValue, "originalValue", { positive: true });
  const annualRate = requireRate(config.annualRate, "annualRate");
  const termMonths = requireTerm(config.termMonths);
  const residualRate = requireRate(config.residualRate, "residualRate");
  if (!Number.isInteger(config.disbursementMonthIndex) || config.disbursementMonthIndex < 0) {
    throw new TypeError("disbursementMonthIndex must be a non-negative integer");
  }
  const residualAmount = boundResidualToPrincipal(originalValue * residualRate, principal);
  const levelRent = calculateLeasePayment(principal, originalValue, annualRate, termMonths, residualRate);
  const monthlyRate = annualRate / 12;
  const payments = [];
  let openingBalance = principal;
  for (let period = 1; period <= termMonths; period += 1) {
    const financeCost = openingBalance * monthlyRate;
    const residual = period === termMonths ? residualAmount : 0;
    const debtService = levelRent + residual;
    const rawEndingBalance = openingBalance + financeCost - debtService;
    let endingBalance = rawEndingBalance;
    if (period === termMonths) {
      if (Math.abs(rawEndingBalance) > LEASE_BALANCE_TOLERANCE) {
        throw new Error(`lease ending balance ${rawEndingBalance} exceeds 0.01 tolerance`);
      }
      endingBalance = 0;
    }
    const principalRepayment = openingBalance - endingBalance;
    payments.push({
      period,
      paymentMonthIndex: config.disbursementMonthIndex + period,
      openingBalance,
      levelRent,
      financeCost,
      residual,
      debtService,
      principalRepayment,
      endingBalance,
    });
    openingBalance = endingBalance;
  }
  const totalDebtService = sum(payments, "debtService");
  return {
    principal,
    originalValue,
    annualRate,
    monthlyRate,
    termMonths,
    residualRate,
    residualAmount,
    disbursementMonthIndex: config.disbursementMonthIndex,
    levelRent,
    payments,
    totalDebtService,
    totalFinanceCost: totalDebtService - principal,
  };
}

/** Converts Task 6 deployment cohorts to separately amortizing lease cohorts. */
export function buildLeaseCohorts(cohorts, config) {
  if (!Array.isArray(cohorts)) throw new TypeError("cohorts must be an array");
  requireObject(config, "config");
  parseMonth(config.startMonth, "startMonth");
  const financeRatio = requireRate(config.financeRatio, "financeRatio", { positive: true });
  if (config.financeDelayMonths !== undefined
    && (!Number.isInteger(config.financeDelayMonths) || config.financeDelayMonths < 0 || config.financeDelayMonths > 2)) {
    throw new RangeError("financeDelayMonths must be 0, 1, or 2");
  }

  return cohorts.map((cohort, index) => {
    requireObject(cohort, `cohort ${index + 1}`);
    const originalValue = requireFinite(cohort.eligibleBasis, `cohort ${index + 1} eligibleBasis`, { positive: true });
    const totalCapex = requireFinite(cohort.totalCapex, `cohort ${index + 1} totalCapex`, { positive: true });
    const channelCost = requireFinite(cohort.channelCost, `cohort ${index + 1} channelCost`);
    if (totalCapex + 1e-8 < originalValue + channelCost) {
      throw new Error(`cohort ${index + 1} totalCapex cannot be below eligible basis plus channel cost`);
    }
    const disbursementMonth = config.financeDelayMonths === undefined
      ? cohort.financeDisbursementMonth
      : formatMonth(parseMonth(cohort.onlineMonth, `cohort ${index + 1} onlineMonth`) + config.financeDelayMonths);
    const disbursementMonthIndex = relativeMonthIndex(
      disbursementMonth,
      config.startMonth,
      `cohort ${index + 1} financeDisbursementMonth`,
    );
    if (disbursementMonthIndex < 1) throw new RangeError(`cohort ${index + 1} disbursement precedes the model start`);
    const principal = originalValue * financeRatio;
    const lease = buildSingleLease({
      principal,
      originalValue,
      annualRate: config.annualRate,
      termMonths: config.termMonths,
      residualRate: config.residualRate,
      disbursementMonthIndex,
    });
    return {
      ...lease,
      cohortId: cohort.cohortId,
      city: cohort.city,
      onlineMonth: cohort.onlineMonth,
      disbursementMonth,
      financeRatio,
      totalCapex,
      channelCost,
      unfinancedEligibleBasis: originalValue - principal,
      equityFundedAssetCost: totalCapex - principal,
      payments: lease.payments.map((payment) => ({
        ...payment,
        month: formatMonth(parseMonth(config.startMonth, "startMonth") + payment.paymentMonthIndex - 1),
      })),
    };
  });
}

function aggregateByMonthIndex(rows, monthIndexField, valueField, horizonMonths, label) {
  const result = Array(horizonMonths).fill(0);
  for (const row of rows) {
    const monthIndex = row[monthIndexField];
    if (!Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > horizonMonths) {
      throw new RangeError(`${label} falls outside the cash-flow horizon`);
    }
    result[monthIndex - 1] += row[valueField];
  }
  return result;
}

/** Builds gross-project, pre-equity, minimum-funded, and user-funded monthly cash curves. */
export function buildCashWaterfall(operations, cohorts, leases, config) {
  const monthlyOperations = Array.isArray(operations) ? operations : operations?.monthly;
  if (!Array.isArray(monthlyOperations) || monthlyOperations.length === 0) {
    throw new TypeError("operations must be a non-empty monthly array or a Task 6 operations result");
  }
  if (!Array.isArray(cohorts)) throw new TypeError("cohorts must be an array");
  if (!Array.isArray(leases)) throw new TypeError("leases must be an array");
  requireObject(config, "config");
  const initialCash = requireFinite(config.initialCash ?? 0, "initialCash");
  const shareholderFunding = requireFinite(config.shareholderFunding ?? 0, "shareholderFunding");
  const reportMonths = config.reportMonths ?? 36;
  if (!Number.isInteger(reportMonths) || reportMonths <= 0 || reportMonths > monthlyOperations.length) {
    throw new RangeError("reportMonths must fit within the operations horizon");
  }
  const startMonth = monthlyOperations[0].month;
  const startMonthAbsolute = parseMonth(startMonth, "operations month 1");
  monthlyOperations.forEach((row, index) => {
    requireObject(row, `operations month ${index + 1}`);
    if (row.monthIndex !== undefined && row.monthIndex !== index + 1) throw new Error("operations monthIndex must be continuous and one-based");
    if (parseMonth(row.month, `operations month ${index + 1}`) !== startMonthAbsolute + index) {
      throw new Error("operations months must be continuous and chronological");
    }
    requireSignedFinite(row.cfads, `operations month ${index + 1} cfads`);
  });
  const horizonMonths = monthlyOperations.length;
  const supplierRows = cohorts.map((cohort, index) => ({
    paymentMonthIndex: relativeMonthIndex(
      cohort.supplierPaymentMonth,
      startMonth,
      `cohort ${index + 1} supplierPaymentMonth`,
    ),
    amount: requireFinite(cohort.totalCapex, `cohort ${index + 1} totalCapex`),
  }));
  const supplierPayments = aggregateByMonthIndex(supplierRows, "paymentMonthIndex", "amount", horizonMonths, "supplier payment");
  const disbursements = aggregateByMonthIndex(leases, "disbursementMonthIndex", "principal", horizonMonths, "lease disbursement");
  const paymentRows = leases.flatMap((lease) => lease.payments);
  const levelRents = aggregateByMonthIndex(paymentRows, "paymentMonthIndex", "levelRent", horizonMonths, "lease payment");
  const residualPayments = aggregateByMonthIndex(paymentRows, "paymentMonthIndex", "residual", horizonMonths, "lease payment");
  const debtService = aggregateByMonthIndex(paymentRows, "paymentMonthIndex", "debtService", horizonMonths, "lease payment");
  const financeCosts = aggregateByMonthIndex(paymentRows, "paymentMonthIndex", "financeCost", horizonMonths, "lease payment");
  const principalRepayments = aggregateByMonthIndex(paymentRows, "paymentMonthIndex", "principalRepayment", horizonMonths, "lease payment");

  let projectCumulativeCash = initialCash;
  let preEquityCumulativeCash = initialCash;
  let cumulativeCash = initialCash;
  let cumulativeCfads = 0;
  let cumulativeSupplierPayment = 0;
  let cumulativeLeaseDisbursement = 0;
  let cumulativeDebtService = 0;
  let endingLeaseBalance = 0;
  const outstandingByLease = new Map();
  const monthly = monthlyOperations.map((operation, index) => {
    const monthIndex = index + 1;
    for (const lease of leases) {
      if (lease.disbursementMonthIndex === monthIndex) outstandingByLease.set(lease, lease.principal);
      const payment = lease.payments.find((row) => row.paymentMonthIndex === monthIndex);
      if (payment) outstandingByLease.set(lease, payment.endingBalance);
    }
    endingLeaseBalance = [...outstandingByLease.values()].reduce((total, balance) => total + balance, 0);
    const projectNetCash = operation.cfads - supplierPayments[index] - debtService[index];
    const preEquityNetCash = projectNetCash + disbursements[index];
    const funding = index === 0 ? shareholderFunding : 0;
    const netCash = preEquityNetCash + funding;
    projectCumulativeCash += projectNetCash;
    preEquityCumulativeCash += preEquityNetCash;
    cumulativeCash += netCash;
    cumulativeCfads += operation.cfads;
    cumulativeSupplierPayment += supplierPayments[index];
    cumulativeLeaseDisbursement += disbursements[index];
    cumulativeDebtService += debtService[index];
    return {
      ...operation,
      monthIndex,
      period: monthIndex <= reportMonths ? "report" : "debtTail",
      supplierPayment: supplierPayments[index],
      leaseDisbursement: disbursements[index],
      levelRent: levelRents[index],
      residualPayment: residualPayments[index],
      debtService: debtService[index],
      financeCost: financeCosts[index],
      principalRepayment: principalRepayments[index],
      endingLeaseBalance,
      dscr: debtService[index] === 0 ? null : operation.cfads / debtService[index],
      projectNetCash,
      projectCumulativeCash,
      preEquityNetCash,
      preEquityCumulativeCash,
      cumulativeCfads,
      cumulativeSupplierPayment,
      cumulativeLeaseDisbursement,
      cumulativeDebtService,
      shareholderFunding: funding,
      netCash,
      cumulativeCash,
    };
  });
  if (Math.abs(endingLeaseBalance) >= 0.01) throw new Error("cash-flow horizon ends before all lease balances are repaid");

  const lowestPreEquityRow = monthly.reduce((lowest, row) => (
    row.preEquityCumulativeCash < lowest.preEquityCumulativeCash ? row : lowest
  ));
  const lowestProjectRow = monthly.reduce((lowest, row) => (
    row.projectCumulativeCash < lowest.projectCumulativeCash ? row : lowest
  ));
  const minimumShareholderFunding = Math.max(0, -lowestPreEquityRow.preEquityCumulativeCash);
  for (const row of monthly) row.minimumFundedCumulativeCash = row.preEquityCumulativeCash + minimumShareholderFunding;
  const fundingShortfall = Math.max(0, minimumShareholderFunding - shareholderFunding);
  return {
    monthly,
    initialCash,
    shareholderFunding,
    minimumShareholderFunding,
    fundingShortfall,
    projectFundingRequirement: Math.max(0, -lowestProjectRow.projectCumulativeCash),
    peakFundingGap: {
      amount: minimumShareholderFunding,
      month: minimumShareholderFunding === 0 ? null : lowestPreEquityRow.month,
      initialCash,
      cumulativeCfads: lowestPreEquityRow.cumulativeCfads,
      cumulativeSupplierPayment: lowestPreEquityRow.cumulativeSupplierPayment,
      cumulativeLeaseDisbursement: lowestPreEquityRow.cumulativeLeaseDisbursement,
      cumulativeDebtService: lowestPreEquityRow.cumulativeDebtService,
    },
  };
}

function summarizePeriod(rows, label) {
  const totalCfads = sum(rows, "cfads");
  const totalDebtService = sum(rows, "debtService");
  return { label, totalCfads, totalDebtService, dscr: totalDebtService === 0 ? null : totalCfads / totalDebtService };
}

/** Summarizes DSCR from cash totals, never by averaging monthly ratios. */
export function summarizeDscr(monthly) {
  if (!Array.isArray(monthly) || monthly.length === 0) throw new TypeError("monthly must be a non-empty array");
  monthly.forEach((row, index) => {
    requireObject(row, `monthly row ${index + 1}`);
    requireSignedFinite(row.cfads, `monthly row ${index + 1} cfads`);
    requireFinite(row.debtService, `monthly row ${index + 1} debtService`);
  });
  const allProjectYears = [];
  for (let offset = 0; offset < monthly.length; offset += 12) {
    allProjectYears.push(summarizePeriod(monthly.slice(offset, offset + 12), `项目年度${Math.floor(offset / 12) + 1}`));
  }
  const debtMonths = monthly
    .filter((row) => row.debtService > 0)
    .map((row) => ({ month: row.month, value: row.cfads / row.debtService }));
  const minimumMonthlyDscr = debtMonths.length === 0
    ? { value: null, month: null }
    : debtMonths.reduce((minimum, row) => (row.value < minimum.value ? row : minimum));
  const fullTerm = summarizePeriod(monthly, "全期限");
  return {
    projectYears: allProjectYears.slice(0, 3),
    allProjectYears,
    debtTail: summarizePeriod(monthly.slice(36), "债务尾期"),
    fullTermDscr: fullTerm.dscr,
    totalCfads: fullTerm.totalCfads,
    totalDebtService: fullTerm.totalDebtService,
    minimumMonthlyDscr,
  };
}

function revenueForScenario(definition, benchmarks) {
  requireObject(benchmarks, "revenueBenchmarks");
  const p50 = requireFinite(benchmarks.p50, "revenueBenchmarks.p50");
  const p25 = requireFinite(benchmarks.p25, "revenueBenchmarks.p25");
  if (definition.revenue === "p50") return p50;
  if (definition.revenue === "p25") return p25;
  return p25 * 0.9;
}

function buildTermComparison(cohorts, operations, leaseConfig, cashConfig) {
  return [18, 24, 36].map((termMonths) => {
    const leases = buildLeaseCohorts(cohorts, { ...leaseConfig, termMonths });
    const waterfall = buildCashWaterfall(operations, cohorts, leases, cashConfig);
    const dscr = summarizeDscr(waterfall.monthly);
    const firstThirtySix = waterfall.monthly.slice(0, 36);
    return {
      termMonths,
      levelRent: sum(leases, "levelRent"),
      totalPrincipal: sum(leases, "principal"),
      threeYearServiceFee: sum(firstThirtySix, "serviceFee"),
      threeYearDebtService: sum(firstThirtySix, "debtService"),
      minimumDscr: dscr.minimumMonthlyDscr.value,
      threeYearEndingBalance: firstThirtySix.at(-1)?.endingLeaseBalance ?? 0,
      peakFundingGap: waterfall.peakFundingGap.amount,
      totalFinanceCost: sum(leases, "totalFinanceCost"),
      fullTermDscr: dscr.fullTermDscr,
    };
  });
}

/** Runs one of the six approved scenarios and its 18/24/36-month term comparison. */
export function runScenario(name, inputs) {
  if (!SCENARIO_NAMES.includes(name)) throw new RangeError(`unknown scenario: ${name}`);
  requireObject(inputs, "inputs");
  if (!Array.isArray(inputs.allocations)) throw new TypeError("inputs.allocations must be an array");
  const definition = SCENARIO_DEFINITIONS[name];
  const annualServicePerGunDay = revenueForScenario(definition, inputs.revenueBenchmarks);
  const shares = definition.slow ? SLOW_DEPLOYMENT_SHARES : BASE_DEPLOYMENT_SHARES;
  const deploymentConfig = {
    ...requireObject(inputs.deploymentConfig, "inputs.deploymentConfig"),
    shares,
    financeDelayMonths: definition.financeDelayMonths,
  };
  const operationsConfig = {
    ...requireObject(inputs.operationsConfig, "inputs.operationsConfig"),
    horizonMonths: 60,
    annualServicePerGunDay,
    propertyMode: "分成",
    propertyShare: 0.20,
    otherOpexRate: definition.otherOpexRate,
  };
  const leaseConfig = {
    ...requireObject(inputs.leaseConfig, "inputs.leaseConfig"),
    startMonth: deploymentConfig.startMonth,
    financeRatio: definition.financeRatio,
    financeDelayMonths: definition.financeDelayMonths,
    annualRate: definition.annualRate,
    termMonths: 36,
  };
  const cashConfig = {
    ...requireObject(inputs.cashConfig, "inputs.cashConfig"),
    reportMonths: 36,
  };
  const plan = buildDeploymentPlan(inputs.allocations, deploymentConfig);
  const operations = projectOperations(plan.cohorts, operationsConfig);
  const leases = buildLeaseCohorts(plan.cohorts, leaseConfig);
  const waterfall = buildCashWaterfall(operations.monthly, plan.cohorts, leases, cashConfig);
  const dscr = summarizeDscr(waterfall.monthly);
  return {
    name,
    assumptions: {
      annualServicePerGunDay,
      financeRatio: definition.financeRatio,
      financeDelayMonths: definition.financeDelayMonths,
      deploymentMonths: shares.length,
      annualRate: definition.annualRate,
      termMonths: 36,
      residualRate: leaseConfig.residualRate,
      propertyMode: operationsConfig.propertyMode,
      propertyShare: operationsConfig.propertyShare,
      otherOpexRate: operationsConfig.otherOpexRate,
      headquartersMonthly: operationsConfig.headquartersMonthly,
      operatingTaxRate: operationsConfig.operatingTaxRate,
    },
    plan,
    operations,
    leases,
    waterfall,
    dscr,
    termComparison: buildTermComparison(plan.cohorts, operations.monthly, leaseConfig, cashConfig),
  };
}
