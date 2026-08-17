import Chart from "chart.js/auto";

const CHARTS = new Map();
const COLORS = Object.freeze({
  teal: "#177d83",
  cyan: "#48aeb0",
  navy: "#17394a",
  gold: "#c68721",
  red: "#b42318",
  slate: "#80919d",
});

const moneyWan = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

function register(id, canvas, config) {
  const existing = CHARTS.get(id);
  existing?.destroy();
  const chart = new Chart(canvas, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, font: { family: "Microsoft YaHei" } } },
        tooltip: { bodyFont: { family: "Microsoft YaHei" }, titleFont: { family: "Microsoft YaHei" } },
        ...(config.options?.plugins ?? {}),
      },
      scales: config.options?.scales,
    },
  });
  CHARTS.set(id, chart);
  return chart;
}

function moneyTooltip(context) {
  return `${context.dataset.label}：¥${moneyWan.format(context.parsed.y)}万元`;
}

function lineDataset(label, data, color, extra = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0.18,
    ...extra,
  };
}

function indexed(rows, field) {
  const base = rows.find((row) => row.termMonths === 36)?.[field];
  return rows.map((row) => Number.isFinite(base) && base !== 0 ? (row[field] / base) * 100 : null);
}

/** Creates the approved five native charts inside the summary page. */
export function createSummaryCharts(container, result) {
  destroyCharts();
  const monthly = result.finance.waterfall.monthly;
  const labels = monthly.map((row) => row.month);
  register("service-cfads", container.querySelector("[data-chart-id=service-cfads]"), {
    type: "line",
    data: {
      labels,
      datasets: [
        lineDataset("服务费", monthly.map((row) => row.serviceFee / 10_000), COLORS.teal),
        lineDataset("CFADS", monthly.map((row) => row.cfads / 10_000), COLORS.navy),
      ],
    },
    options: { plugins: { tooltip: { callbacks: { label: moneyTooltip } } }, scales: { y: { title: { display: true, text: "万元/月" } } } },
  });

  register("funding-balance", container.querySelector("[data-chart-id=funding-balance]"), {
    type: "line",
    data: {
      labels,
      datasets: [
        lineDataset("注资前累计现金", monthly.map((row) => row.preEquityCumulativeCash / 10_000), COLORS.red),
        lineDataset("租赁期末余额", monthly.map((row) => row.endingLeaseBalance / 10_000), COLORS.gold),
      ],
    },
    options: { plugins: { tooltip: { callbacks: { label: moneyTooltip } } }, scales: { y: { title: { display: true, text: "万元" } } } },
  });

  register("monthly-dscr", container.querySelector("[data-chart-id=monthly-dscr]"), {
    type: "line",
    data: {
      labels,
      datasets: [
        lineDataset("月度DSCR", monthly.map((row) => row.dscr), COLORS.teal),
        lineDataset("1.00x参考线", monthly.map(() => 1), COLORS.red, { borderDash: [6, 5], borderWidth: 1 }),
      ],
    },
    options: {
      plugins: { tooltip: { callbacks: { label: (context) => `${context.dataset.label}：${context.parsed.y?.toFixed(2) ?? "—"}x` } } },
      scales: { y: { title: { display: true, text: "DSCR (x)" }, suggestedMin: 0 } },
    },
  });

  register("scenario-gap", container.querySelector("[data-chart-id=scenario-gap]"), {
    type: "bar",
    data: {
      labels: result.scenarios.map((scenario) => scenario.name),
      datasets: [{
        label: "峰值资金缺口",
        data: result.scenarios.map((scenario) => scenario.waterfall.peakFundingGap.amount / 10_000),
        backgroundColor: [COLORS.teal, COLORS.slate, COLORS.gold, COLORS.cyan, COLORS.navy, COLORS.red],
        borderWidth: 0,
      }],
    },
    options: { plugins: { tooltip: { callbacks: { label: moneyTooltip } } }, scales: { y: { title: { display: true, text: "万元" } } } },
  });

  const terms = result.termComparison;
  register("term-comparison", container.querySelector("[data-chart-id=term-comparison]"), {
    type: "line",
    data: {
      labels: terms.map((row) => `${row.termMonths}个月`),
      datasets: [
        lineDataset("月租指数", indexed(terms, "levelRent"), COLORS.teal, { pointRadius: 4 }),
        lineDataset("融资成本指数", indexed(terms, "totalFinanceCost"), COLORS.gold, { pointRadius: 4 }),
        lineDataset("资金缺口指数", indexed(terms, "peakFundingGap"), COLORS.red, { pointRadius: 4 }),
      ],
    },
    options: {
      plugins: { tooltip: { callbacks: { label: (context) => `${context.dataset.label}：${context.parsed.y?.toFixed(1) ?? "—"}` } } },
      scales: { y: { type: "logarithmic", title: { display: true, text: "36个月=100（对数轴）" } } },
    },
  });
  return CHARTS;
}

export function destroyCharts() {
  for (const chart of CHARTS.values()) chart.destroy();
  CHARTS.clear();
}

export function chartCount() {
  return CHARTS.size;
}
