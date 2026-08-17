import { validateHistoricalRows } from "../model/source-contract.mjs";

export const SOLUTION_FORMAT = "ant-charge-station-solution";
export const SOLUTION_VERSION = 1;

const APPROVED_ADVANCE_RATES = new Set([0.8, 0.9, 1]);
const APPROVED_LEASE_RATES = new Set([0.06, 0.08, 0.10, 0.12]);
const APPROVED_TERMS = new Set([18, 24, 36]);
const APPROVED_DELAYS = new Set([0, 1, 2]);

function requireArray(value, label, { exactLength } = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label}必须为数组`);
  if (exactLength !== undefined && value.length !== exactLength) throw new Error(`${label}必须包含${exactLength}项`);
  return value;
}

function dateToIso(value, label) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`${label}日期无效`);
  return value.toISOString().slice(0, 10);
}

function parseDate(value, label) {
  const match = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label}必须使用YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime())
    || date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() + 1 !== Number(match[2])
    || date.getUTCDate() !== Number(match[3])
  ) throw new Error(`${label}日期无效`);
  return date;
}

function validateAssumptions(assumptions) {
  if (!assumptions || typeof assumptions !== "object" || Array.isArray(assumptions)) throw new TypeError("assumptions缺失");
  if (!Number.isInteger(assumptions.targetGuns) || assumptions.targetGuns <= 0 || assumptions.targetGuns % 2 !== 0) {
    throw new Error("目标枪数必须为正偶数");
  }
  if (!APPROVED_ADVANCE_RATES.has(assumptions.leaseAdvanceRate)) throw new Error("融资比例必须为80%、90%或100%");
  if (!APPROVED_LEASE_RATES.has(assumptions.annualLeaseRate)) throw new Error("年化租赁利率不在批准范围");
  if (!APPROVED_TERMS.has(assumptions.leaseTermMonths)) throw new Error("租赁期限必须为18、24或36个月");
  if (!APPROVED_DELAYS.has(assumptions.leaseDelayMonths)) throw new Error("放款延迟必须为0、1或2个月");
  if (!Number.isFinite(assumptions.residualRate) || assumptions.residualRate < 0
    || assumptions.residualRate > assumptions.leaseAdvanceRate) throw new Error("留购比例不能超过融资比例");
  if (!new Set(["分成", "固定"]).has(assumptions.propertyMode)) throw new Error("物业结算方式无效");
  if (!Number.isInteger(assumptions.supplierTermsMonths) || assumptions.supplierTermsMonths < 0) throw new Error("供应商账期无效");

  const shares = requireArray(assumptions.rolloutShares, "投放曲线");
  if (shares.length === 0 || shares.length > 18
    || shares.some((value) => !Number.isFinite(value) || value < 0)
    || shares.at(-1) <= 0
    || Math.abs(shares.reduce((sum, value) => sum + value, 0) - 1) > 1e-9) {
    throw new Error("投放曲线必须在18个月内且合计100%");
  }
}

function restoreHistory(history) {
  if (!history || typeof history !== "object" || Array.isArray(history)) throw new TypeError("history缺失");
  const rows = requireArray(history.rows, "历史数据").map((row, index) => ({
    ...row,
    date: parseDate(row?.date, `历史数据第${index + 1}行`),
  }));
  const audit = validateHistoricalRows(rows);
  if (history.sourceStart !== audit.sourcePeriod.start || history.sourceEnd !== audit.sourcePeriod.end) {
    throw new Error("历史数据期间与明细不一致");
  }
  return { ...history, rows };
}

export function toPortableState(state) {
  if (!state || typeof state !== "object") throw new TypeError("state is required");
  validateAssumptions(state.assumptions);
  requireArray(state.cityInputs, "cityInputs");
  requireArray(state.seasonalityInputs, "seasonalityInputs", { exactLength: 13 });
  if (state.cityInputs.length === 0) throw new Error("cityInputs不能为空");
  const rows = requireArray(state.history?.rows, "历史数据").map((row, index) => ({
    ...row,
    date: dateToIso(row?.date, `历史数据第${index + 1}行`),
  }));
  validateHistoricalRows(state.history.rows);
  return {
    assumptions: structuredClone(state.assumptions),
    cityInputs: structuredClone(state.cityInputs),
    seasonalityInputs: structuredClone(state.seasonalityInputs),
    history: { ...structuredClone(state.history), rows },
  };
}
/** Serializes a complete valid model state into the portable solution envelope. */
export function serializeSolution(state, options = {}) {
  const savedAt = options.savedAt ?? new Date().toISOString();
  const savedDate = new Date(savedAt);
  if (!Number.isFinite(savedDate.getTime()) || savedDate.toISOString() !== savedAt) throw new Error("savedAt必须为ISO时间");
  const name = options.name ?? "基准方案";
  if (typeof name !== "string" || name.trim() === "") throw new Error("方案名称不能为空");
  const modelVersion = state?.modelVersion;
  if (typeof modelVersion !== "string" || modelVersion.trim() === "") throw new Error("modelVersion缺失");
  return JSON.stringify({
    format: SOLUTION_FORMAT,
    version: SOLUTION_VERSION,
    savedAt,
    modelVersion,
    name: name.trim(),
    state: toPortableState(state),
  });
}

/** Parses and validates a portable solution before it can replace live state. */
export function parseSolution(text) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error("方案文件不是有效JSON");
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("方案文件结构无效");
  if (envelope.format !== SOLUTION_FORMAT) throw new Error("不是便民充电站方案文件");
  if (envelope.version !== SOLUTION_VERSION) throw new Error("方案文件版本不受支持");
  if (typeof envelope.modelVersion !== "string" || envelope.modelVersion === "") throw new Error("模型版本缺失");
  if (typeof envelope.name !== "string" || envelope.name.trim() === "") throw new Error("方案名称缺失");
  const savedDate = new Date(envelope.savedAt);
  if (!Number.isFinite(savedDate.getTime()) || savedDate.toISOString() !== envelope.savedAt) throw new Error("保存时间无效");

  const state = envelope.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("方案状态缺失");
  validateAssumptions(state.assumptions);
  const cityInputs = requireArray(state.cityInputs, "cityInputs");
  if (cityInputs.length === 0) throw new Error("cityInputs不能为空");
  const seasonalityInputs = requireArray(state.seasonalityInputs, "seasonalityInputs", { exactLength: 13 });
  const history = restoreHistory(state.history);
  return {
    format: envelope.format,
    version: envelope.version,
    savedAt: envelope.savedAt,
    modelVersion: envelope.modelVersion,
    name: envelope.name.trim(),
    state: {
      assumptions: structuredClone(state.assumptions),
      cityInputs: structuredClone(cityInputs),
      seasonalityInputs: structuredClone(seasonalityInputs),
      history,
    },
  };
}
