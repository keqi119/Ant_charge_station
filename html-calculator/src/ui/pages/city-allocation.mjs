import { renderDataTable } from "../data-table.mjs";
import { card, count, formatNumber, pageHeader } from "./page-utils.mjs";

function earliestByCity(cohorts, field) {
  const result = new Map();
  for (const cohort of cohorts) {
    if (!result.has(cohort.city) || cohort[field] < result.get(cohort.city)) result.set(cohort.city, cohort[field]);
  }
  return result;
}

export function render(container, { snapshot }) {
  container.replaceChildren();
  const status = snapshot.validation.status === "FAIL" ? "FAIL" : snapshot.result.status;
  pageHeader(container, "城市分配", "首批26城优先，其后按等级、实时评分及第一财经排名自动补选。", status);
  const allocations = snapshot.result.cities.allocations;
  const total = allocations.reduce((sum, row) => sum + row.targetGuns, 0);
  const twoSites = allocations.reduce((sum, row) => sum + row.twoGunSites, 0);
  const fourSites = allocations.reduce((sum, row) => sum + row.fourGunSites, 0);
  const metrics = document.createElement("div");
  metrics.className = "mini-metric-grid";
  metrics.innerHTML = `
    <div class="mini-metric"><span>目标枪数</span><strong data-allocation-total>${count.format(total)}</strong></div>
    <div class="mini-metric"><span>2枪站</span><strong>${count.format(twoSites)}</strong></div>
    <div class="mini-metric"><span>4枪站</span><strong>${count.format(fourSites)}</strong></div>
    <div class="mini-metric"><span>获配城市</span><strong>${allocations.filter((row) => row.targetGuns > 0).length}</strong></div>`;
  container.append(metrics);
  const signature = document.createElement("p");
  signature.className = "audit-signature";
  signature.dataset.cityOrderSignature = "";
  signature.textContent = allocations.filter((row) => !row.isFixed && row.targetGuns > 0).map((row) => row.city).join(" → ");
  container.append(signature);

  const firstOnline = snapshot.result.deployment.firstOnlineMonthByCity;
  const supplier = earliestByCity(snapshot.result.deployment.cohorts, "supplierPaymentMonth");
  const finance = earliestByCity(snapshot.result.deployment.cohorts, "financeDisbursementMonth");
  const section = card("城市目标与站型", "末位补选城市可取得低于等级标准配额的剩余额度；城市及总量始终保持偶数枪。");
  section.append(renderDataTable({
    rows: allocations.map((row, index) => ({
      ...row,
      order: index + 1,
      firstOnlineMonth: firstOnline[row.city] ?? null,
      firstSupplierMonth: supplier.get(row.city),
      firstFinanceMonth: finance.get(row.city),
    })),
    pageSize: 100,
    searchableFields: ["city", "province", "tier"],
    filters: [{ key: "tier", label: "城市等级" }, { key: "isFixed", label: "首批城市", options: [true, false] }],
    columns: [
      { key: "order", label: "顺序" },
      { key: "city", label: "城市" },
      { key: "tier", label: "等级" },
      { key: "isFixed", label: "首批", format: (value) => value ? "是" : "否" },
      { key: "score", label: "评分", format: (value) => Number.isFinite(value) ? `${formatNumber(value, 2)}%` : "—" },
      { key: "dataQuality", label: "质量" },
      { key: "targetGuns", label: "目标枪数", className: "number-cell", format: (value) => count.format(value) },
      { key: "fourGunSiteShare", label: "4枪站比例", format: (value) => `${formatNumber(value * 100, 0)}%` },
      { key: "twoGunSites", label: "2枪站" },
      { key: "fourGunSites", label: "4枪站" },
      { key: "firstOnlineMonth", label: "首次上线" },
      { key: "firstSupplierMonth", label: "首次供应商付款" },
      { key: "firstFinanceMonth", label: "首次放款" },
    ],
  }));
  container.append(section);
  return () => {};
}
