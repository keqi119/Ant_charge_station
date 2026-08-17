import { renderControl } from "../controls.mjs";
import { card, formatNumber, pageHeader } from "./page-utils.mjs";

const TIER_LABELS = Object.freeze({ "一线": "一线", "新一线": "新一线", "二线": "二线", "三线": "三线" });
const WEIGHT_LABELS = Object.freeze({
  population: "人口规模权重",
  density: "人口集中度权重",
  housing: "老旧住宅代理权重",
  chargingScarcity: "充电资源稀缺权重",
});

function errorFor(snapshot, path) {
  return snapshot.validation.errors.find((error) => error.path === path)?.message ?? "";
}

function addControls(parent, definitions, snapshot, actions) {
  const grid = document.createElement("div");
  grid.className = "control-grid";
  for (const definition of definitions) {
    const path = definition.path;
    const parts = path.split(".");
    let value = snapshot.draft;
    for (const part of parts) value = value?.[part];
    const numericSelect = definition.type === "select" && definition.numeric === true;
    grid.append(renderControl({
      ...definition,
      id: path.replaceAll(".", "-"),
      value,
      error: errorFor(snapshot, path),
      onChange: (next) => actions.update(path, numericSelect ? Number(next) : next),
    }));
  }
  parent.append(grid);
}

export function render(container, { snapshot, actions }) {
  container.replaceChildren();
  const pageStatus = snapshot.validation.status === "FAIL" ? "FAIL" : snapshot.result.status;
  pageHeader(container, "核心假设", "蓝色边框字段为可编辑输入；任何非法修改都不会覆盖上一版有效结果。", pageStatus);

  const deployment = card("项目与投放", "建设周期最长18个月；当前基准按12个月完成30,000枪上线。");
  addControls(deployment, [
    { path: "assumptions.modelStartMonth", label: "模型起始月", type: "month", range: "选址前置一个月，投放月即并网上线月" },
    { path: "assumptions.targetGuns", label: "目标枪数", type: "number", unit: "枪", min: 2, step: 2, range: "必须为正偶数" },
    { path: "assumptions.supplierTermsMonths", label: "供应商账期", type: "number", unit: "月", min: 0, max: 6, step: 1 },
  ], snapshot, actions);
  const rolloutGrid = document.createElement("div");
  rolloutGrid.className = "compact-control-grid";
  snapshot.draft.assumptions.rolloutShares.forEach((_, index) => {
    const path = `assumptions.rolloutShares.${index}`;
    rolloutGrid.append(renderControl({
      id: path.replaceAll(".", "-"), path, type: "percent", label: `上线M${index + 1}`,
      value: snapshot.draft.assumptions.rolloutShares[index], min: 0, max: 1, step: 0.01,
      error: errorFor(snapshot, path), onChange: (next) => actions.update(path, next),
    }));
  });
  deployment.append(rolloutGrid);
  const rolloutTotal = snapshot.draft.assumptions.rolloutShares.reduce((sum, value) => sum + value, 0);
  const total = document.createElement("div");
  total.className = `calculated-total ${Math.abs(rolloutTotal - 1) < 1e-9 ? "is-valid" : "is-invalid"}`;
  total.textContent = `投放曲线合计：${formatNumber(rolloutTotal * 100, 1)}%`;
  deployment.append(total);
  container.append(deployment);

  const revenue = card("收入、爬坡与物业", "物业按月租或服务费分成二选一；总部费用和经营税为0时保留尽调警示。");
  addControls(revenue, [
    { path: "assumptions.propertyMode", label: "物业结算方式", type: "select", options: ["分成", "固定"], range: "二选一，不叠加" },
    { path: "assumptions.propertyShare", label: "物业服务费分成", type: "percent", min: 0, max: 1, step: 0.01 },
    { path: "assumptions.fixedRentPerStation", label: "物业月租", type: "number", unit: "元/站/月", min: 0, step: 10 },
    { path: "assumptions.otherOpexRate", label: "其他运营费率", type: "percent", min: 0, max: 1, step: 0.01 },
    { path: "assumptions.headquartersMonthly", label: "总部月度费用", type: "number", unit: "元/月", min: 0, step: 1000 },
    { path: "assumptions.operatingTaxRate", label: "经营税率", type: "percent", min: 0, max: 1, step: 0.001 },
  ], snapshot, actions);
  const rampGrid = document.createElement("div");
  rampGrid.className = "compact-control-grid";
  snapshot.draft.assumptions.ramp.forEach((_, index) => {
    const path = `assumptions.ramp.${index}`;
    rampGrid.append(renderControl({
      id: path.replaceAll(".", "-"), path, type: "percent", label: `运营月龄M${index + 1}`,
      value: snapshot.draft.assumptions.ramp[index], min: 0, max: 1.5, step: 0.01,
      onChange: (next) => actions.update(path, next), error: errorFor(snapshot, path),
    }));
  });
  revenue.append(rampGrid);
  container.append(revenue);

  const city = card("城市评分与配额", "同等级城市按可获得指标重新归一化评分；权重总和为计算值。");
  addControls(city, Object.entries(WEIGHT_LABELS).map(([key, label]) => ({
    path: `assumptions.cityWeights.${key}`, label, type: "percent", min: 0, max: 1, step: 0.05,
  })), snapshot, actions);
  const weightTotal = Object.values(snapshot.draft.assumptions.cityWeights).reduce((sum, value) => sum + value, 0);
  const weightNode = document.createElement("output");
  weightNode.className = "calculated-total";
  weightNode.dataset.weightTotal = "";
  weightNode.textContent = `城市权重合计（计算值）：${formatNumber(weightTotal * 100, 1)}%`;
  city.append(weightNode);
  addControls(city, Object.entries(TIER_LABELS).map(([key, label]) => ({
    path: `assumptions.tierQuotas.${key}`, label: `${label}单城配额`, type: "number", unit: "枪", min: 0, step: 2,
  })), snapshot, actions);
  addControls(city, [
    { path: "assumptions.fourGunSiteShareHigh", label: "高分城市4枪站比例", type: "percent", min: 0, max: 1, step: 0.05 },
    { path: "assumptions.fourGunSiteShareLow", label: "低分城市4枪站比例", type: "percent", min: 0, max: 1, step: 0.05 },
  ], snapshot, actions);
  container.append(city);

  const finance = card("融资租赁与股东资金", "租赁物原值为设备及工程，不含渠道费用；放款后次月起租。");
  addControls(finance, [
    { path: "assumptions.leaseAdvanceRate", label: "融资比例", type: "select", numeric: true, options: [{ value: 0.8, label: "80%" }, { value: 0.9, label: "90%" }, { value: 1, label: "100%" }] },
    { path: "assumptions.leaseTermMonths", label: "租赁期限", type: "select", numeric: true, options: [18, 24, 36], unit: "月" },
    { path: "assumptions.annualLeaseRate", label: "年化租赁利率", type: "select", numeric: true, options: [{ value: 0.06, label: "6%" }, { value: 0.08, label: "8%" }, { value: 0.10, label: "10%" }, { value: 0.12, label: "12%" }] },
    { path: "assumptions.leaseDelayMonths", label: "上线至放款延迟", type: "select", numeric: true, options: [0, 1, 2], unit: "月" },
    { path: "assumptions.residualRate", label: "留购比例（按原值）", type: "percent", min: 0, max: 1, step: 0.005 },
    { path: "assumptions.initialCash", label: "期初现金", type: "number", unit: "元", min: 0, step: 10000 },
    { path: "assumptions.shareholderFunding", label: "股东投入", type: "number", unit: "元", min: 0, step: 10000 },
  ], snapshot, actions);
  container.append(finance);
  return () => {};
}
