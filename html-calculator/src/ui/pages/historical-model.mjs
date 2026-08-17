import { renderDataTable } from "../data-table.mjs";
import { card, count, formatNumber, money, pageHeader } from "./page-utils.mjs";

export function render(container, { snapshot }) {
  container.replaceChildren();
  const historical = snapshot.result.historical;
  pageHeader(container, "历史单枪模型", "成熟站点定义为运营天数不少于30天；以站点单枪日服务费形成P25/P50基准。", snapshot.result.status);
  const metrics = document.createElement("div");
  metrics.className = "mini-metric-grid five";
  metrics.innerHTML = `
    <div class="mini-metric"><span>站点数</span><strong>${count.format(historical.stationCount)}</strong></div>
    <div class="mini-metric"><span>成熟站点</span><strong>${count.format(historical.matureStationCount)}</strong></div>
    <div class="mini-metric"><span>成熟P25</span><strong data-history-p25>¥${formatNumber(historical.benchmarks.matureP25, 2)}</strong><small>元/枪/日</small></div>
    <div class="mini-metric"><span>成熟P50</span><strong data-history-p50>¥${formatNumber(historical.benchmarks.matureMedian, 2)}</strong><small>元/枪/日</small></div>
    <div class="mini-metric"><span>加权均值</span><strong>¥${formatNumber(historical.benchmarks.matureWeighted, 2)}</strong><small>元/枪/日</small></div>`;
  container.append(metrics);
  const reconciliation = document.createElement("div");
  reconciliation.className = "reconciliation-strip";
  reconciliation.innerHTML = `<span>订单拆分差额 <strong>¥${money.format(historical.reconciliations.grossComponentsDifference)}</strong></span><span>分时电量差额 <strong>${formatNumber(historical.reconciliations.touKwhDifference, 2)} 度</strong></span><span>日历期间 <strong>${historical.sourcePeriod.calendarDays} 天</strong></span>`;
  container.append(reconciliation);
  const section = card("站点画像", "成熟度与单枪日产出均由导入明细重新计算。");
  section.append(renderDataTable({
    rows: historical.stationProfiles.map((row) => ({ ...row, mature: row.operatingDays >= 30 ? "成熟" : "爬坡" })),
    pageSize: 100,
    searchableFields: ["stationId", "stationName"],
    filters: [{ key: "mature", label: "成熟状态", options: ["成熟", "爬坡"] }],
    columns: [
      { key: "stationId", label: "站点ID" }, { key: "stationName", label: "站点名称" },
      { key: "guns", label: "枪数" }, { key: "operatingDays", label: "运营天数" },
      { key: "gunDays", label: "枪日" },
      { key: "serviceFee", label: "服务费", format: (value) => `¥${money.format(value)}` },
      { key: "serviceFeePerGunDay", label: "服务费/枪/日", format: (value) => `¥${formatNumber(value, 2)}` },
      { key: "grossPerGunDay", label: "GMV/枪/日", format: (value) => `¥${formatNumber(value, 2)}` },
      { key: "kwhPerGunDay", label: "电量/枪/日", format: (value) => formatNumber(value, 2) },
      { key: "mature", label: "成熟状态" },
    ],
  }));
  container.append(section);
  return () => {};
}
