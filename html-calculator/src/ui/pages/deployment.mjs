import { renderDataTable } from "../data-table.mjs";
import { addMonth, card, count, money, pageHeader } from "./page-utils.mjs";

export function render(container, { snapshot }) {
  container.replaceChildren();
  pageHeader(container, "月度投放计划", "选址确认后1个月上线，供应商按账期付款，融资按上线后延迟月放款。", snapshot.result.status);
  const start = snapshot.validState.assumptions.modelStartMonth;
  const cohorts = snapshot.result.deployment.cohorts;
  const rows = snapshot.result.deployment.monthlyGuns.map((guns, index) => {
    const month = addMonth(start, index);
    const monthCohorts = cohorts.filter((cohort) => cohort.onlineMonth === month);
    return {
      monthIndex: index + 1,
      month,
      guns,
      twoGunSites: monthCohorts.reduce((sum, row) => sum + row.twoGunSites, 0),
      fourGunSites: monthCohorts.reduce((sum, row) => sum + row.fourGunSites, 0),
      cities: new Set(monthCohorts.map((row) => row.city)).size,
      totalCapex: monthCohorts.reduce((sum, row) => sum + row.totalCapex, 0),
      eligibleBasis: monthCohorts.reduce((sum, row) => sum + row.eligibleBasis, 0),
      supplierPaymentMonths: [...new Set(monthCohorts.map((row) => row.supplierPaymentMonth))].join("、"),
      financeMonths: [...new Set(monthCohorts.map((row) => row.financeDisbursementMonth))].join("、"),
    };
  });
  const section = card("上线批次", `合计 ${count.format(rows.reduce((sum, row) => sum + row.guns, 0))} 枪，建设期 ${rows.length} 个月。`);
  section.append(renderDataTable({
    rows, pageSize: 50, columns: [
      { key: "monthIndex", label: "投放月" }, { key: "month", label: "上线月份" },
      { key: "guns", label: "新上线枪数", format: (value) => count.format(value) },
      { key: "twoGunSites", label: "2枪站" }, { key: "fourGunSites", label: "4枪站" },
      { key: "cities", label: "涉及城市" },
      { key: "totalCapex", label: "总投资", format: (value) => `¥${money.format(value)}` },
      { key: "eligibleBasis", label: "可融资原值", format: (value) => `¥${money.format(value)}` },
      { key: "supplierPaymentMonths", label: "供应商付款月" }, { key: "financeMonths", label: "融资放款月" },
    ],
  }));
  container.append(section);
  return () => {};
}
