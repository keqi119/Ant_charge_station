export const APPROVED_HEADERS = Object.freeze([
  "订单创建日期",
  "站点ID",
  "站点名称",
  "直流桩数",
  "交流桩数",
  "充电单量",
  "充电电量（度）",
  "尖时电量（度）",
  "峰时电量（度）",
  "平时电量（度）",
  "谷时电量（度）",
  "充电时长（分钟）",
  "订单总额（元）",
  "充电电费（元）",
  "充电服务费（元）",
  "报表更新日期",
]);

const NUMERIC_FIELDS = Object.freeze([
  "dcGuns", "acGuns", "orders", "kwh", "sharpKwh", "peakKwh", "flatKwh",
  "valleyKwh", "minutes", "gross", "electricityFee", "serviceFee",
]);

function parseCalendarDate(value, rowNumber) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error(`第${rowNumber}行日期无效`);
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const text = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`第${rowNumber}行日期必须使用YYYY-MM-DD`);
  const date = new Date(`${text}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime())
    || date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() + 1 !== Number(match[2])
    || date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`第${rowNumber}行日期无效`);
  }
  return date;
}

function numberValue(value, rowNumber, header) {
  if (value === null || value === undefined || value === "") return 0;
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error(`第${rowNumber}行${header}不是有效数值`);
  return result;
}

function assertHeaders(headerRow) {
  if (!Array.isArray(headerRow)) throw new Error("Data List缺少表头");
  for (const [index, expected] of APPROVED_HEADERS.entries()) {
    const actual = String(headerRow[index] ?? "").trim();
    if (actual !== expected) {
      throw new Error(`第${index + 1}列表头应为“${expected}”，实际为“${actual || "空白"}”`);
    }
  }
}

export function normalizeSourceMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) throw new Error("Data List没有可用数据");
  assertHeaders(matrix[0]);
  return matrix.slice(1)
    .map((row, index) => ({ row, rawRowNumber: index + 2 }))
    .filter(({ row }) => Array.isArray(row) && row.slice(0, 16).some((value) => value !== null && value !== ""))
    .map(({ row, rawRowNumber }) => ({
      date: parseCalendarDate(row[0], rawRowNumber),
      stationId: String(row[1] ?? "").trim(),
      stationName: String(row[2] ?? "").trim(),
      dcGuns: numberValue(row[3], rawRowNumber, APPROVED_HEADERS[3]),
      acGuns: numberValue(row[4], rawRowNumber, APPROVED_HEADERS[4]),
      orders: numberValue(row[5], rawRowNumber, APPROVED_HEADERS[5]),
      kwh: numberValue(row[6], rawRowNumber, APPROVED_HEADERS[6]),
      sharpKwh: numberValue(row[7], rawRowNumber, APPROVED_HEADERS[7]),
      peakKwh: numberValue(row[8], rawRowNumber, APPROVED_HEADERS[8]),
      flatKwh: numberValue(row[9], rawRowNumber, APPROVED_HEADERS[9]),
      valleyKwh: numberValue(row[10], rawRowNumber, APPROVED_HEADERS[10]),
      minutes: numberValue(row[11], rawRowNumber, APPROVED_HEADERS[11]),
      gross: numberValue(row[12], rawRowNumber, APPROVED_HEADERS[12]),
      electricityFee: numberValue(row[13], rawRowNumber, APPROVED_HEADERS[13]),
      serviceFee: numberValue(row[14], rawRowNumber, APPROVED_HEADERS[14]),
      rawRowNumber,
    }));
}

export function validateHistoricalRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("历史数据不能为空");
  const totals = Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, 0]));
  let firstTime = Infinity;
  let lastTime = -Infinity;
  for (const [index, row] of rows.entries()) {
    const rowNumber = row?.rawRowNumber ?? index + 2;
    if (!(row?.date instanceof Date) || !Number.isFinite(row.date.getTime())) throw new Error(`第${rowNumber}行日期无效`);
    if (typeof row.stationId !== "string" || row.stationId.trim() === "") throw new Error(`第${rowNumber}行站点ID不能为空`);
    for (const field of NUMERIC_FIELDS) {
      if (typeof row[field] !== "number" || !Number.isFinite(row[field])) throw new Error(`第${rowNumber}行${field}不是有效数值`);
      totals[field] += row[field];
    }
    if (row.dcGuns < 0 || row.acGuns < 0 || row.dcGuns + row.acGuns <= 0) throw new Error(`第${rowNumber}行枪数必须为正数`);
    firstTime = Math.min(firstTime, row.date.getTime());
    lastTime = Math.max(lastTime, row.date.getTime());
  }
  const grossComponentsDifference = totals.gross - totals.electricityFee - totals.serviceFee;
  if (Math.abs(grossComponentsDifference) > 1) {
    throw new Error(`订单总额与电费、服务费累计差额超过1元：${grossComponentsDifference.toFixed(2)}`);
  }
  const iso = (time) => new Date(time).toISOString().slice(0, 10);
  return {
    totals,
    sourcePeriod: { start: iso(firstTime), end: iso(lastTime) },
    reconciliations: { grossComponentsDifference },
  };
}
