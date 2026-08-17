import { renderDataTable } from "../data-table.mjs";
import { card, formatNumber, linkNode, money, pageHeader } from "./page-utils.mjs";

export function render(container, { snapshot }) {
  container.replaceChildren();
  const { result } = snapshot;
  pageHeader(container, "情景分析、检查与来源", "六类情景、三种租赁期限、17项模型检查与公开数据来源集中展示。", result.status);

  const scenarios = card("六类融资情景", "保守及压力情景独立改变收入、融资比例、放款延迟、建设期和运营费用。");
  scenarios.append(renderDataTable({
    rows: result.scenarios.map((scenario) => ({
      name: scenario.name,
      ...scenario.assumptions,
      peakFundingGap: scenario.waterfall.peakFundingGap.amount,
      peakMonth: scenario.waterfall.peakFundingGap.month,
      fullTermDscr: scenario.dscr.fullTermDscr,
      minimumDscr: scenario.dscr.minimumMonthlyDscr.value,
      threeYearBalance: scenario.waterfall.monthly[35].endingLeaseBalance,
    })),
    pageSize: 50,
    columns: [
      { key: "name", label: "情景" },
      { key: "annualServicePerGunDay", label: "服务费/枪/日", format: (value) => `¥${formatNumber(value, 2)}` },
      { key: "financeRatio", label: "融资比例", format: (value) => `${formatNumber(value * 100, 0)}%` },
      { key: "financeDelayMonths", label: "放款延迟" }, { key: "deploymentMonths", label: "建设月数" },
      { key: "annualRate", label: "年化利率", format: (value) => `${formatNumber(value * 100, 0)}%` },
      { key: "otherOpexRate", label: "其他OPEX", format: (value) => `${formatNumber(value * 100, 0)}%` },
      { key: "peakFundingGap", label: "峰值缺口", format: (value) => `¥${money.format(value)}` },
      { key: "peakMonth", label: "峰值月" },
      { key: "fullTermDscr", label: "全期DSCR", format: (value) => `${formatNumber(value, 2)}x` },
      { key: "minimumDscr", label: "最低月DSCR", format: (value) => `${formatNumber(value, 2)}x` },
      { key: "threeYearBalance", label: "三年末余额", format: (value) => `¥${money.format(value)}` },
    ],
  }));
  container.append(scenarios);

  const terms = card("18/24/36租赁期限", "精确结果保留在表内，摘要图采用36个月=100的指数便于比较。");
  terms.append(renderDataTable({
    rows: result.termComparison, pageSize: 50,
    columns: [
      { key: "termMonths", label: "期限", format: (value) => `${value}个月` },
      { key: "levelRent", label: "月租合计", format: (value) => `¥${money.format(value)}` },
      { key: "totalPrincipal", label: "融资本金", format: (value) => `¥${money.format(value)}` },
      { key: "threeYearDebtService", label: "三年债务支付", format: (value) => `¥${money.format(value)}` },
      { key: "totalFinanceCost", label: "融资成本", format: (value) => `¥${money.format(value)}` },
      { key: "minimumDscr", label: "最低月DSCR", format: (value) => `${formatNumber(value, 2)}x` },
      { key: "peakFundingGap", label: "峰值缺口", format: (value) => `¥${money.format(value)}` },
      { key: "threeYearEndingBalance", label: "三年末余额", format: (value) => `¥${money.format(value)}` },
    ],
  }));
  container.append(terms);

  const checks = card("17项可见检查", "全部检查通过表示数学勾稽成立；黄色尽调警示不等同于检查失败。");
  checks.append(renderDataTable({
    rows: result.checks, pageSize: 50,
    rowAttributes: (row) => ({ "data-check-row": "", "data-status": row.status }),
    columns: [
      { key: "id", label: "检查ID" }, { key: "label", label: "检查项目" },
      { key: "status", label: "状态" }, { key: "detail", label: "检查结果" },
    ],
  }));
  container.append(checks);

  const scope = card("来源与模型边界", "历史经营数据只保存在本地；公开来源链接供融资尽调复核。");
  const warning = document.createElement("div");
  warning.className = "underwriting-warning";
  warning.dataset.warningList = "";
  warning.innerHTML = `<strong>当前警示</strong><ul>${result.warnings.map((item) => `<li>${item}</li>`).join("") || "<li>无</li>"}</ul>`;
  scope.append(warning);
  const sourceRows = [
    { category: "历史经营数据", name: result.state.history.sourceName, period: `${result.state.history.sourceStart} 至 ${result.state.history.sourceEnd}`, url: "" },
    { category: "城市等级", name: "2025第一财经城市商业魅力榜", period: "2025", url: result.state.cityInputs[0]?.tierSourceUrl },
    { category: "城市密度", name: "住建部城市建设统计年鉴", period: "2022", url: result.state.cityInputs.find((row) => row.densitySourceUrl)?.densitySourceUrl },
    { category: "公共充电趋势", name: "中国充电联盟月度数据", period: "2024", url: result.state.seasonalityInputs.find((row) => row.volumeSourceUrl)?.volumeSourceUrl },
  ];
  scope.append(renderDataTable({
    rows: sourceRows, pageSize: 50,
    columns: [
      { key: "category", label: "来源类别" }, { key: "name", label: "来源名称" },
      { key: "period", label: "数据期间" }, { key: "url", label: "链接", format: linkNode },
    ],
  }));
  const note = document.createElement("p");
  note.className = "model-scope-note";
  note.textContent = "本模型用于项目经营与融资租赁偿债能力测算，不构成会计、税务或法律意见。物业租金、总部费用、税率及融资条件应在尽调阶段以合同和专业意见更新。";
  scope.append(note);
  container.append(scope);
  return () => {};
}
