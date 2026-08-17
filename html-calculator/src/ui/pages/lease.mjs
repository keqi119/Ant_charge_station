import { renderDataTable } from "../data-table.mjs";
import { card, formatNumber, money, pageHeader } from "./page-utils.mjs";

function aggregateLeaseBatches(leases) {
  const batches = new Map();
  for (const lease of leases) {
    const batch = batches.get(lease.disbursementMonth) ?? {
      disbursementMonth: lease.disbursementMonth,
      leases: 0,
      cities: new Set(),
      originalValue: 0,
      principal: 0,
      levelRent: 0,
      residualAmount: 0,
      totalFinanceCost: 0,
      endingBalance: 0,
    };
    batch.leases += 1;
    batch.cities.add(lease.city);
    for (const field of ["originalValue", "principal", "levelRent", "residualAmount", "totalFinanceCost"]) batch[field] += lease[field];
    batch.endingBalance += lease.payments.at(-1).endingBalance;
    batches.set(lease.disbursementMonth, batch);
  }
  return [...batches.values()].toSorted((left, right) => left.disbursementMonth.localeCompare(right.disbursementMonth))
    .map((row, index) => ({ ...row, batch: index + 1, cityCount: row.cities.size }));
}

export function render(container, { snapshot }) {
  container.replaceChildren();
  const { leases, waterfall, dscr } = snapshot.result.finance;
  pageHeader(container, "融资租赁与资金缺口", "每个上线城市批次独立起租、摊销和留购；页面同时提供12个放款月汇总及60个月资金瀑布。", snapshot.result.status);
  const metrics = document.createElement("div");
  metrics.className = "mini-metric-grid";
  metrics.innerHTML = `<div class="mini-metric"><span>租赁放款</span><strong>¥${formatNumber(snapshot.result.kpis.leaseDisbursement / 100_000_000, 2)}亿</strong></div><div class="mini-metric"><span>最低股东资金</span><strong>¥${money.format(waterfall.minimumShareholderFunding)}</strong></div><div class="mini-metric"><span>全期限DSCR</span><strong>${formatNumber(dscr.fullTermDscr, 2)}x</strong></div><div class="mini-metric"><span>三年末余额</span><strong>¥${formatNumber(snapshot.result.kpis.threeYearLeaseBalance / 100_000_000, 2)}亿</strong></div>`;
  container.append(metrics);

  const batches = card("12个放款月批次", "一个放款月可包含多个城市批次；所有底层批次仍分别摊销并在租期末归零。");
  batches.append(renderDataTable({
    rows: aggregateLeaseBatches(leases), pageSize: 50,
    rowAttributes: () => ({ "data-lease-batch-row": "" }),
    columns: [
      { key: "batch", label: "批次" }, { key: "disbursementMonth", label: "放款月" },
      { key: "leases", label: "底层城市批次" }, { key: "cityCount", label: "城市数" },
      { key: "originalValue", label: "租赁物原值", format: (value) => `¥${money.format(value)}` },
      { key: "principal", label: "融资本金", format: (value) => `¥${money.format(value)}` },
      { key: "levelRent", label: "月租合计", format: (value) => `¥${money.format(value)}` },
      { key: "residualAmount", label: "留购款", format: (value) => `¥${money.format(value)}` },
      { key: "totalFinanceCost", label: "融资成本", format: (value) => `¥${money.format(value)}` },
      { key: "endingBalance", label: "终值余额", format: (value) => `¥${formatNumber(value, 2)}` },
    ],
  }));
  container.append(batches);

  const monthly = card("60个月融资与现金瀑布", "累计现金包含用户输入的期初现金和股东投入；最低股东资金按注资前曲线自动测算。");
  const rows = waterfall.monthly.map((row) => ({
    ...row,
    openingLeaseBalance: row.endingLeaseBalance - row.leaseDisbursement + row.principalRepayment,
  }));
  monthly.append(renderDataTable({
    rows, pageSize: 100,
    columns: [
      { key: "month", label: "月份" },
      { key: "supplierPayment", label: "供应商付款", format: (value) => `¥${money.format(value)}` },
      { key: "leaseDisbursement", label: "租赁放款", format: (value) => `¥${money.format(value)}` },
      { key: "openingLeaseBalance", label: "期初租赁余额", format: (value) => `¥${money.format(value)}` },
      { key: "financeCost", label: "融资成本", format: (value) => `¥${money.format(value)}` },
      { key: "principalRepayment", label: "本金归还", format: (value) => `¥${money.format(value)}` },
      { key: "residualPayment", label: "留购款", format: (value) => `¥${money.format(value)}` },
      { key: "debtService", label: "债务支付", format: (value) => `¥${money.format(value)}` },
      { key: "endingLeaseBalance", label: "期末租赁余额", format: (value) => `¥${money.format(value)}` },
      { key: "preEquityCumulativeCash", label: "注资前累计现金", format: (value) => `¥${money.format(value)}` },
      { key: "minimumFundedCumulativeCash", label: "最低资金后累计现金", format: (value) => `¥${money.format(value)}` },
      { key: "cumulativeCash", label: "用户资金后累计现金", format: (value) => `¥${money.format(value)}` },
      { key: "dscr", label: "DSCR", format: (value) => Number.isFinite(value) ? `${formatNumber(value, 2)}x` : "" },
    ],
  }));
  container.append(monthly);
  return () => {};
}
