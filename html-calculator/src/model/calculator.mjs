import { BASE_ASSUMPTIONS, FIXED_CITIES } from "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/constants.mjs";
import { allocateCityTargets, scoreCities } from "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/city_engine.mjs";
import { profileHistoricalRows } from "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/historical_engine.mjs";
import { buildSeasonalityCurve, annualizePeakBenchmark } from "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/seasonality_engine.mjs";
import { buildDeploymentPlan } from "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/deployment_engine.mjs";
import { projectOperations } from "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/operations_engine.mjs";
import {
  buildCashWaterfall,
  buildLeaseCohorts,
  runScenario,
  SCENARIO_NAMES,
  SLOW_DEPLOYMENT_SHARES,
  summarizeDscr,
} from "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/lease_engine.mjs";
import { validateHistoricalRows } from "./source-contract.mjs";
import { runModelChecks } from "./checks.mjs";

const DEFAULT_CITY_WEIGHTS = Object.freeze({
  population: 0.30,
  density: 0.25,
  housing: 0.30,
  chargingScarcity: 0.15,
});

const DEFAULT_TIER_QUOTAS = Object.freeze({
  "一线": 1000,
  "新一线": 800,
  "二线": 600,
  "三线": 400,
});

function copyPlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function restoreHistoricalRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("embedded historyRows must be an array");
  return rows.map((row, index) => {
    const copy = { ...row };
    const date = row.date instanceof Date
      ? new Date(row.date.getTime())
      : new Date(`${row.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) throw new Error(`embedded history row ${index + 1} has an invalid date`);
    copy.date = date;
    return copy;
  });
}

function allocationConfig(assumptions) {
  return {
    targetGuns: assumptions.targetGuns,
    tierQuotas: assumptions.tierQuotas,
    fourGunSiteShareHigh: assumptions.fourGunSiteShareHigh,
    fourGunSiteShareLow: assumptions.fourGunSiteShareLow,
  };
}

function scenarioInputs(state, allocations, seasonality, annualServicePerGunDay, historical) {
  const a = state.assumptions;
  return {
    allocations,
    deploymentConfig: {
      startMonth: a.modelStartMonth,
      shares: a.rolloutShares,
      totalGuns: a.targetGuns,
      supplierTermsMonths: a.supplierTermsMonths,
      financeDelayMonths: a.leaseDelayMonths,
      expectedFixedCities: state.fixedCities,
      costByStationType: a.costByStationType,
    },
    operationsConfig: {
      startMonth: a.modelStartMonth,
      horizonMonths: 60,
      annualServicePerGunDay,
      seasonalityByMonth: seasonality,
      ramp: a.ramp,
      propertyMode: a.propertyMode,
      propertyShare: a.propertyShare,
      fixedRentPerStation: a.fixedRentPerStation,
      otherOpexRate: a.otherOpexRate,
      headquartersMonthly: a.headquartersMonthly,
      operatingTaxRate: a.operatingTaxRate,
      historicalServiceFeeRate: historical.totals.serviceFee / historical.totals.gross,
    },
    leaseConfig: {
      financeRatio: a.leaseAdvanceRate,
      annualRate: a.annualLeaseRate,
      termMonths: a.leaseTermMonths,
      residualRate: a.residualRate,
    },
    cashConfig: {
      initialCash: a.initialCash,
      shareholderFunding: a.shareholderFunding,
      reportMonths: a.reportMonths,
    },
    revenueBenchmarks: {
      p50: annualServicePerGunDay,
      p25: annualizePeakBenchmark(
        historical.benchmarks.matureP25,
        seasonality,
        state.history.sourceStart,
        state.history.sourceEnd,
      ),
    },
    slowDeploymentShares: a.slowDeploymentShares,
  };
}

function buildWarnings(state) {
  const warnings = [];
  if (state.assumptions.headquartersMonthly === 0) warnings.push("总部费用当前为0，请在融资尽调前补充组织与管理费用预算。");
  if (state.assumptions.operatingTaxRate === 0) warnings.push("经营税率当前为0，请结合项目主体和税务口径复核。");
  return warnings;
}

function buildTermComparison(plan, operations, inputs) {
  return [18, 24, 36].map((termMonths) => {
    const leases = buildLeaseCohorts(plan.cohorts, {
      ...inputs.leaseConfig,
      startMonth: inputs.deploymentConfig.startMonth,
      financeDelayMonths: inputs.deploymentConfig.financeDelayMonths,
      termMonths,
    });
    const waterfall = buildCashWaterfall(operations.monthly, plan.cohorts, leases, inputs.cashConfig);
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

function runCustomBase(inputs) {
  const plan = buildDeploymentPlan(inputs.allocations, inputs.deploymentConfig);
  const operations = projectOperations(plan.cohorts, inputs.operationsConfig);
  const leaseConfig = {
    ...inputs.leaseConfig,
    startMonth: inputs.deploymentConfig.startMonth,
    financeDelayMonths: inputs.deploymentConfig.financeDelayMonths,
  };
  const leases = buildLeaseCohorts(plan.cohorts, leaseConfig);
  const waterfall = buildCashWaterfall(operations.monthly, plan.cohorts, leases, inputs.cashConfig);
  const dscr = summarizeDscr(waterfall.monthly);
  return {
    name: "基准",
    assumptions: {
      annualServicePerGunDay: inputs.operationsConfig.annualServicePerGunDay,
      financeRatio: leaseConfig.financeRatio,
      financeDelayMonths: leaseConfig.financeDelayMonths,
      deploymentMonths: inputs.deploymentConfig.shares.length,
      annualRate: leaseConfig.annualRate,
      termMonths: leaseConfig.termMonths,
      residualRate: leaseConfig.residualRate,
      propertyMode: inputs.operationsConfig.propertyMode,
      propertyShare: inputs.operationsConfig.propertyShare,
      otherOpexRate: inputs.operationsConfig.otherOpexRate,
      headquartersMonthly: inputs.operationsConfig.headquartersMonthly,
      operatingTaxRate: inputs.operationsConfig.operatingTaxRate,
    },
    plan,
    operations,
    leases,
    waterfall,
    dscr,
    termComparison: buildTermComparison(plan, operations, inputs),
  };
}

function extractKpis(base, allocations) {
  const firstThirtySix = base.waterfall.monthly.slice(0, 36);
  return {
    targetGuns: sum(allocations, "targetGuns"),
    totalInvestment: sum(base.plan.cohorts, "totalCapex"),
    threeYearServiceFee: sum(firstThirtySix, "serviceFee"),
    threeYearCfads: sum(firstThirtySix, "cfads"),
    leaseDisbursement: sum(base.leases, "principal"),
    peakFundingGap: base.waterfall.peakFundingGap.amount,
    peakFundingGapMonth: base.waterfall.peakFundingGap.month,
    fullCycleDscr: base.dscr.fullTermDscr,
    minimumMonthlyDscr: base.dscr.minimumMonthlyDscr.value,
    minimumMonthlyDscrMonth: base.dscr.minimumMonthlyDscr.month,
    threeYearLeaseBalance: firstThirtySix.at(-1)?.endingLeaseBalance ?? 0,
  };
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + row[field], 0);
}

function validateCityWeights(weights) {
  const keys = Object.keys(DEFAULT_CITY_WEIGHTS);
  if (!weights || typeof weights !== "object" || keys.some((key) => !Number.isFinite(weights[key]) || weights[key] < 0 || weights[key] > 1)) {
    throw new Error("城市权重必须是0%至100%的有限非负数");
  }
  const total = keys.reduce((value, key) => value + weights[key], 0);
  if (Math.abs(total - 1) > 1e-9) throw new Error("城市权重合计必须为100%");
}

/** Creates a mutable browser state from the immutable embedded release data. */
export function createBaselineState(embeddedData) {
  if (!embeddedData || typeof embeddedData !== "object") throw new TypeError("embedded data is required");
  const historyRows = restoreHistoricalRows(embeddedData.historyRows);
  const historyAudit = validateHistoricalRows(historyRows);
  const modelVersion = embeddedData.metadata?.modelVersion ?? "html-model-1";
  return {
    modelVersion,
    fixedCities: [...FIXED_CITIES],
    assumptions: {
      ...copyPlain(BASE_ASSUMPTIONS),
      cityWeights: copyPlain(DEFAULT_CITY_WEIGHTS),
      tierQuotas: copyPlain(DEFAULT_TIER_QUOTAS),
      initialCash: 0,
      shareholderFunding: 0,
      slowDeploymentShares: [...SLOW_DEPLOYMENT_SHARES],
    },
    history: {
      rows: historyRows,
      sourceStart: historyAudit.sourcePeriod.start,
      sourceEnd: historyAudit.sourcePeriod.end,
      sourceName: "内置历史数据",
    },
    cityInputs: copyPlain(embeddedData.cityInputs ?? []),
    seasonalityInputs: copyPlain(embeddedData.seasonalityInputs ?? []),
    cityAuditManifest: copyPlain(embeddedData.cityAuditManifest ?? null),
  };
}

/** Composes the approved pure engines into one presentation-ready result. */
export function calculateModel(state) {
  if (!state || typeof state !== "object") throw new TypeError("model state is required");
  validateCityWeights(state.assumptions?.cityWeights);
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
  const base = runCustomBase(inputs);
  const scenarios = [base, ...SCENARIO_NAMES.slice(1).map((name) => runScenario(name, inputs))];
  const warnings = buildWarnings(state);
  const checkContext = {
    state,
    historical,
    allocations,
    deployment: base.plan,
    operations: base.operations,
    leases: base.leases,
    waterfall: base.waterfall,
    dscr: base.dscr,
    scenarios,
  };
  const checks = runModelChecks(checkContext);
  const failed = checks.some((check) => check.status === "FAIL");
  return {
    state,
    historical,
    seasonality,
    annualServicePerGunDay,
    cities: { scored: scoredCities, allocations },
    deployment: base.plan,
    operations: base.operations,
    finance: { leases: base.leases, waterfall: base.waterfall, dscr: base.dscr },
    scenarios,
    termComparison: base.termComparison,
    checks,
    status: failed ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS",
    warnings,
    kpis: extractKpis(base, allocations),
  };
}
