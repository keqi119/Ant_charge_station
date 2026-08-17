import { renderDataTable } from "../data-table.mjs";
import { card, count, formatNumber, money, pageHeader } from "./page-utils.mjs";

function moneyNode(value, attribute) {
  const span = document.createElement("span");
  span.textContent = `¥${money.format(value)}`;
  if (attribute && value < 0) span.setAttribute(attribute, "");
  return span;
}

function dscrNode(value) {
  const span = document.createElement("span");
  if (value === null || value === undefined) {
    span.dataset.dscrBlank = "";
    span.textContent = "";
  } else {
    span.textContent = `${formatNumber(value, 2)}x`;
    if (value < 1) span.className = "negative-value";
  }
  return span;
}

export function render(container, { snapshot }) {
  container.replaceChildren();
  const monthly = snapshot.result.finance.waterfall.monthly;
  pageHeader(container, "36月运营模型", "经营预测展示完整60个月；第1–36月为报告期，第37–60月为债务尾期且无新增投放。", snapshot.result.status);
  const metrics = document.createElement("div");
  metrics.className = "mini-metric-grid";
  metrics.innerHTML = `<div class="mini-metric"><span>报告期</span><strong>36个月</strong></div><div class="mini-metric"><span>计算轴</span><strong>60个月</strong></div><div class="mini-metric"><span>三年服务费</span><strong>¥${formatNumber(snapshot.result.kpis.threeYearServiceFee / 100_000_000, 2)}亿</strong></div><div class="mini-metric"><span>三年CFADS</span><strong>¥${formatNumber(snapshot.result.kpis.threeYearCfads / 100_000_000, 2)}亿</strong></div>`;
  container.append(metrics);
  const section = card("月度经营与偿债", "GMV仅作为辅助口径，不进入CFADS；电费为代收代付。");
  section.append(renderDataTable({
    rows: monthly,
    pageSize: 100,
    rowAttributes: (row) => ({ "data-period": row.period }),
    columns: [
      { key: "monthIndex", label: "月序" }, { key: "month", label: "月份" },
      { key: "period", label: "期间", format: (value) => value === "report" ? "报告期" : "债务尾期" },
      { key: "newGuns", label: "新增枪", format: (value) => count.format(value) },
      { key: "operatingGuns", label: "运营枪", format: (value) => count.format(value) },
      { key: "weightedRamp", label: "加权爬坡", format: (value) => `${formatNumber(value * 100, 1)}%` },
      { key: "seasonality", label: "季节指数", format: (value) => formatNumber(value, 4) },
      { key: "serviceFee", label: "服务费", format: (value) => moneyNode(value) },
      { key: "propertyCost", label: "物业成本", format: (value) => moneyNode(value) },
      { key: "otherOpex", label: "其他OPEX", format: (value) => moneyNode(value) },
      { key: "headquartersCost", label: "总部费用", format: (value) => moneyNode(value) },
      { key: "operatingTax", label: "经营税", format: (value) => moneyNode(value) },
      { key: "cfads", label: "CFADS", format: (value) => moneyNode(value, "data-cfads-negative") },
      { key: "debtService", label: "债务支付", format: (value) => moneyNode(value) },
      { key: "dscr", label: "DSCR", format: dscrNode },
    ],
  }));
  container.append(section);
  return () => {};
}
