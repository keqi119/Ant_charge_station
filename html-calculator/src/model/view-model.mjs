const MONEY_FORMAT = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const COUNT_FORMAT = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

export function formatMoney(value) {
  return Number.isFinite(value) ? `¥${MONEY_FORMAT.format(value)}` : "—";
}

export function formatCount(value) {
  return Number.isFinite(value) ? COUNT_FORMAT.format(value) : "—";
}

export function formatDscr(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "—";
}

/** Provides stable presentation slices while leaving the detailed result auditable. */
export function createViewModel(result) {
  return {
    status: result.status,
    warnings: [...result.warnings],
    kpis: { ...result.kpis },
    summary: [
      { id: "target-guns", label: "目标枪数", value: formatCount(result.kpis.targetGuns) },
      { id: "total-investment", label: "总投资", value: formatMoney(result.kpis.totalInvestment) },
      { id: "three-year-service-fee", label: "三年服务费", value: formatMoney(result.kpis.threeYearServiceFee) },
      { id: "three-year-cfads", label: "三年CFADS", value: formatMoney(result.kpis.threeYearCfads) },
      { id: "lease-disbursement", label: "租赁放款", value: formatMoney(result.kpis.leaseDisbursement) },
      { id: "peak-gap", label: "峰值资金缺口", value: formatMoney(result.kpis.peakFundingGap), note: result.kpis.peakFundingGapMonth },
      { id: "full-dscr", label: "全期限DSCR", value: formatDscr(result.kpis.fullCycleDscr) },
      { id: "minimum-dscr", label: "最低月DSCR", value: formatDscr(result.kpis.minimumMonthlyDscr), note: result.kpis.minimumMonthlyDscrMonth },
      { id: "three-year-balance", label: "三年末租赁余额", value: formatMoney(result.kpis.threeYearLeaseBalance) },
    ],
    checks: result.checks,
    detail: result,
  };
}
