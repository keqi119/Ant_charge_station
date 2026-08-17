import { createSummaryCharts, destroyCharts } from "../charts.mjs";
import { count, formatNumber, money, pageHeader } from "./page-utils.mjs";

function yi(value) {
  return `¥${formatNumber(value / 100_000_000, 2)}亿元`;
}

function wan(value) {
  return `¥${formatNumber(value / 10_000, 2)}万元`;
}

function kpi(id, label, value, note = "") {
  const node = document.createElement("article");
  node.className = "kpi-card";
  node.innerHTML = `<span>${label}</span><strong data-kpi="${id}">${value}</strong>${note ? `<small>${note}</small>` : ""}`;
  return node;
}

function chartFigure(id, title, note) {
  const figure = document.createElement("figure");
  figure.className = "chart-card";
  figure.innerHTML = `<figcaption><strong>${title}</strong><span>${note}</span></figcaption><div class="chart-frame"><canvas data-chart-id="${id}" aria-label="${title}" role="img"></canvas></div>`;
  return figure;
}

export function render(container, { snapshot }) {
  container.replaceChildren();
  const { result } = snapshot;
  pageHeader(container, "融资摘要", "面向债权资金方的项目规模、偿债覆盖、资金缺口与风险情景总览。", result.status);
  const kpis = document.createElement("div");
  kpis.className = "kpi-grid";
  kpis.append(
    kpi("targetGuns", "目标枪数", count.format(result.kpis.targetGuns), "1桩＝1枪"),
    kpi("totalInvestment", "总投资", yi(result.kpis.totalInvestment)),
    kpi("threeYearServiceFee", "三年服务费", yi(result.kpis.threeYearServiceFee)),
    kpi("threeYearCfads", "三年CFADS", yi(result.kpis.threeYearCfads)),
    kpi("leaseDisbursement", "租赁放款", yi(result.kpis.leaseDisbursement)),
    kpi("peakFundingGap", "最低股东资金/峰值缺口", wan(result.kpis.peakFundingGap), result.kpis.peakFundingGapMonth),
    kpi("fullCycleDscr", "全期限DSCR", `${formatNumber(result.kpis.fullCycleDscr, 2)}x`),
    kpi("minimumMonthlyDscr", "最低月DSCR", `${formatNumber(result.kpis.minimumMonthlyDscr, 2)}x`, result.kpis.minimumMonthlyDscrMonth),
    kpi("threeYearLeaseBalance", "三年末租赁余额", yi(result.kpis.threeYearLeaseBalance)),
  );
  container.append(kpis);

  if (result.warnings.length > 0) {
    const warning = document.createElement("aside");
    warning.className = "underwriting-warning";
    warning.dataset.warningList = "";
    warning.innerHTML = `<strong>尽调警示</strong><ul>${result.warnings.map((item) => `<li>${item}</li>`).join("")}</ul>`;
    container.append(warning);
  }

  const charts = document.createElement("div");
  charts.className = "chart-grid";
  charts.append(
    chartFigure("service-cfads", "服务费与CFADS", "60个月经营曲线"),
    chartFigure("funding-balance", "资金与租赁余额", "注资前累计现金及债务尾期"),
    chartFigure("monthly-dscr", "月度DSCR", "仅有债月份产生覆盖率"),
    chartFigure("scenario-gap", "六情景资金缺口", "各情景独立重算"),
    chartFigure("term-comparison", "18/24/36期限指数", "36个月=100；精确金额见下表"),
  );
  container.append(charts);
  createSummaryCharts(container, result);

  const term = document.createElement("section");
  term.className = "content-card";
  term.innerHTML = `<div class="card-heading"><h2>租赁期限比较</h2><p>同一资产、收入及融资比例，仅重算债务期限。</p></div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>期限</th><th>月租合计</th><th>三年债务支付</th><th>融资成本</th><th>最低月DSCR</th><th>峰值缺口</th><th>三年末余额</th></tr></thead><tbody>
      ${result.termComparison.map((row) => `<tr><td>${row.termMonths}个月</td><td>¥${money.format(row.levelRent)}</td><td>¥${money.format(row.threeYearDebtService)}</td><td>¥${money.format(row.totalFinanceCost)}</td><td>${formatNumber(row.minimumDscr, 2)}x</td><td>¥${money.format(row.peakFundingGap)}</td><td>¥${money.format(row.threeYearEndingBalance)}</td></tr>`).join("")}
    </tbody></table></div>`;
  container.append(term);
  return destroyCharts;
}
