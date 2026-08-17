import { renderDataTable } from "../data-table.mjs";
import { card, count, displayDate, money, pageHeader } from "./page-utils.mjs";

export function render(container, { snapshot }) {
  container.replaceChildren();
  const history = snapshot.result.state.history;
  pageHeader(container, "历史原始数据", `${history.sourceStart} 至 ${history.sourceEnd}，当前来源：${history.sourceName}。`, snapshot.result.status);
  const metrics = document.createElement("div");
  metrics.className = "mini-metric-grid";
  metrics.innerHTML = `<div class="mini-metric"><span>明细行数</span><strong data-history-row-count>${count.format(history.rows.length)}</strong></div><div class="mini-metric"><span>起始日期</span><strong>${history.sourceStart}</strong></div><div class="mini-metric"><span>结束日期</span><strong>${history.sourceEnd}</strong></div><div class="mini-metric"><span>数据口径</span><strong>站点日</strong></div>`;
  container.append(metrics);
  const section = card("Data List 明细", "搜索站点ID或名称；页面最多渲染所选的50/100/200行，避免大表卡顿。");
  section.append(renderDataTable({
    rows: history.rows,
    pageSize: 100,
    searchableFields: ["stationId", "stationName"],
    columns: [
      { key: "date", label: "订单创建日期", format: displayDate },
      { key: "stationId", label: "站点ID" }, { key: "stationName", label: "站点名称" },
      { key: "dcGuns", label: "直流枪" }, { key: "acGuns", label: "交流枪" },
      { key: "orders", label: "充电单量", format: (value) => count.format(value) },
      { key: "kwh", label: "充电电量", format: (value) => money.format(value) },
      { key: "gross", label: "订单总额", format: (value) => money.format(value) },
      { key: "electricityFee", label: "充电电费", format: (value) => money.format(value) },
      { key: "serviceFee", label: "充电服务费", format: (value) => money.format(value) },
      { key: "rawRowNumber", label: "源行号" },
    ],
  }));
  container.append(section);
  return () => {};
}
