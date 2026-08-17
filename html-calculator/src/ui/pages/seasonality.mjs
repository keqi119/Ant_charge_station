import { renderDataTable } from "../data-table.mjs";
import { card, formatNumber, linkNode, pageHeader } from "./page-utils.mjs";

export function render(container, { snapshot }) {
  container.replaceChildren();
  pageHeader(container, "年度季节曲线", "公开充电量按月末公共枪数均值及自然日还原单枪日电量，再标准化为年均1.0000。", snapshot.result.status);
  const curve = snapshot.result.seasonality;
  const mean = curve.reduce((sum, row) => sum + row.index, 0) / curve.length;
  const metrics = document.createElement("div");
  metrics.className = "mini-metric-grid";
  metrics.innerHTML = `<div class="mini-metric"><span>来源记录</span><strong>${snapshot.validState.seasonalityInputs.length}</strong></div><div class="mini-metric"><span>计算月份</span><strong>${curve.length}</strong></div><div class="mini-metric"><span>指数均值</span><strong>${formatNumber(mean, 4)}</strong></div><div class="mini-metric"><span>当前高峰基准年化</span><strong>¥${formatNumber(snapshot.result.annualServicePerGunDay, 2)}</strong></div>`;
  container.append(metrics);
  const section = card("月度曲线与来源", "2023年12月仅作为2024年1月月初枪数基准，不参与12个月充电量均值。");
  const byMonth = new Map(curve.map((row) => [row.monthNumber, row]));
  const rows = snapshot.validState.seasonalityInputs.map((row, index) => {
    const monthNumber = index;
    const calculated = byMonth.get(monthNumber);
    return { ...row, monthNumber, ...calculated };
  });
  section.append(renderDataTable({
    rows, pageSize: 50, columns: [
      { key: "month", label: "月份" },
      { key: "monthEndPublicGuns", label: "月末公共枪数", format: (value) => Number(value).toLocaleString("zh-CN") },
      { key: "chargingKwh100m", label: "公共充电量(亿度)", format: (value) => formatNumber(value, 1) },
      { key: "avgGuns", label: "月均枪数", format: (value) => Number.isFinite(value) ? Math.round(value).toLocaleString("zh-CN") : "—" },
      { key: "days", label: "自然日" },
      { key: "kwhPerGunDay", label: "度/枪/日", format: (value) => formatNumber(value, 2) },
      { key: "index", label: "季节指数", format: (value) => formatNumber(value, 4) },
      { key: "gunSourceUrl", label: "枪数来源", format: linkNode },
      { key: "volumeSourceUrl", label: "充电量来源", format: linkNode },
      { key: "accessedDate", label: "访问日期" },
    ],
  }));
  container.append(section);
  return () => {};
}
