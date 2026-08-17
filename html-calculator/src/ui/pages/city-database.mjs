import { renderDataTable } from "../data-table.mjs";
import { card, formatNumber, linkNode, pageHeader } from "./page-utils.mjs";

export function render(container, { snapshot }) {
  container.replaceChildren();
  pageHeader(container, "城市数据库", "56个一线、新一线、二线及补充城市；缺失指标按同等级可得权重重算。", snapshot.result.status);
  const section = card("城市指标与公开来源", "人口和密度采用同口径年份；住房与市级公共枪数不可比时明确保留空值。");
  const scored = new Map(snapshot.result.cities.scored.map((row) => [`${row.city}|${row.yicaiRank}`, row]));
  const rows = snapshot.validState.cityInputs.map((city) => ({
    ...city,
    score: scored.get(`${city.city}|${city.yicaiRank}`)?.score,
    dataQuality: scored.get(`${city.city}|${city.yicaiRank}`)?.dataQuality,
  }));
  section.append(renderDataTable({
    rows,
    pageSize: 100,
    searchableFields: ["city", "province", "tier", "notes"],
    filters: [{ key: "tier", label: "城市等级" }, { key: "isFixed", label: "首批城市", options: [true, false] }],
    columns: [
      { key: "city", label: "城市" },
      { key: "province", label: "省份" },
      { key: "tier", label: "等级" },
      { key: "yicaiRank", label: "第一财经排名" },
      { key: "isFixed", label: "首批", format: (value) => value ? "是" : "否" },
      { key: "population10k", label: "常住人口(万人)", format: (value) => formatNumber(value, 2) },
      { key: "populationYear", label: "人口年" },
      { key: "urbanPopulation10k", label: "城区人口(万人)", format: (value) => formatNumber(value, 2) },
      { key: "builtAreaKm2", label: "建成区(km²)", format: (value) => formatNumber(value, 2) },
      { key: "densityYear", label: "密度年" },
      { key: "score", label: "有效得分", format: (value) => Number.isFinite(value) ? `${formatNumber(value, 2)}%` : "—" },
      { key: "dataQuality", label: "数据质量" },
      { key: "populationSourceUrl", label: "人口来源", format: linkNode },
      { key: "densitySourceUrl", label: "密度来源", format: linkNode },
      { key: "notes", label: "口径说明" },
    ],
  }));
  container.append(section);
  return () => {};
}
