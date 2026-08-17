import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  APPROVED_HEADERS,
  normalizeSourceMatrix,
  validateHistoricalRows,
} from "../../src/model/source-contract.mjs";
import { parseSourceWorkbook } from "../../src/io/excel-import.mjs";
import { extractBaselineFromArrayBuffer } from "../../scripts/extract-baseline.mjs";

function matrixRow(overrides = {}) {
  const values = {
    date: "2026-06-16",
    stationId: "S1",
    stationName: "测试站",
    dcGuns: 2,
    acGuns: 0,
    orders: 3,
    kwh: 20,
    sharpKwh: 1,
    peakKwh: 2,
    flatKwh: 7,
    valleyKwh: 10,
    minutes: 60,
    gross: 18,
    electricityFee: 12,
    serviceFee: 6,
    reportDate: "2026-08-15",
    ...overrides,
  };
  return [
    values.date, values.stationId, values.stationName, values.dcGuns, values.acGuns,
    values.orders, values.kwh, values.sharpKwh, values.peakKwh, values.flatKwh,
    values.valleyKwh, values.minutes, values.gross, values.electricityFee,
    values.serviceFee, values.reportDate,
  ];
}

function xlsxBuffer(sheetName, matrix) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), sheetName);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

test("normalizes the approved 16-column matrix and preserves source row numbers", () => {
  const rows = normalizeSourceMatrix([
    APPROVED_HEADERS,
    matrixRow(),
    Array(16).fill(null),
    matrixRow({ date: "2026-06-17", stationId: "S2", stationName: "第二站", gross: 20, electricityFee: 14 }),
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].rawRowNumber, 2);
  assert.equal(rows[1].rawRowNumber, 4);
  assert.equal(rows[0].date.toISOString().slice(0, 10), "2026-06-16");
  assert.deepEqual(
    Object.keys(rows[0]),
    ["date", "stationId", "stationName", "dcGuns", "acGuns", "orders", "kwh", "sharpKwh", "peakKwh", "flatKwh", "valleyKwh", "minutes", "gross", "electricityFee", "serviceFee", "rawRowNumber"],
  );
  assert.deepEqual(validateHistoricalRows(rows).sourcePeriod, { start: "2026-06-16", end: "2026-06-17" });
});

test("rejects an altered schema before parsing any history", () => {
  const badHeaders = [...APPROVED_HEADERS];
  badHeaders[12] = "收入";
  assert.throws(() => normalizeSourceMatrix([badHeaders, matrixRow()]), /第13列表头/);
});

test("rejects invalid dates, blank station identity, and non-positive gun counts", () => {
  assert.throws(() => normalizeSourceMatrix([APPROVED_HEADERS, matrixRow({ date: "2026-02-30" })]), /日期/);
  assert.throws(() => validateHistoricalRows(normalizeSourceMatrix([APPROVED_HEADERS, matrixRow({ stationId: "" })])), /站点ID/);
  assert.throws(() => validateHistoricalRows(normalizeSourceMatrix([APPROVED_HEADERS, matrixRow({ stationName: "" })])), /站点名称/);
  assert.throws(() => validateHistoricalRows(normalizeSourceMatrix([APPROVED_HEADERS, matrixRow({ dcGuns: 0, acGuns: 0 })])), /枪数/);
});

test("rejects a cumulative gross split difference above one yuan", () => {
  const rows = normalizeSourceMatrix([
    APPROVED_HEADERS,
    matrixRow({ gross: 20, electricityFee: 10, serviceFee: 8 }),
  ]);
  assert.throws(() => validateHistoricalRows(rows), /订单总额.*电费.*服务费.*1元/);
});

test("parses a valid Data List workbook and refuses missing or invalid sheets", () => {
  const valid = parseSourceWorkbook(xlsxBuffer("Data List", [APPROVED_HEADERS, matrixRow()]));
  assert.equal(valid.sheetName, "Data List");
  assert.equal(valid.rows.length, 1);
  assert.deepEqual(valid.sourcePeriod, { start: "2026-06-16", end: "2026-06-16" });

  assert.throws(() => parseSourceWorkbook(xlsxBuffer("Sheet1", [APPROVED_HEADERS, matrixRow()])), /缺少 Data List/);
  assert.throws(
    () => parseSourceWorkbook(xlsxBuffer("Data List", [APPROVED_HEADERS, matrixRow({ gross: 20, electricityFee: 10, serviceFee: 8 })])),
    /订单总额.*电费.*服务费/,
  );
});

test("extracts a JSON-safe mature-station baseline from an Excel buffer", () => {
  const rows = Array.from({ length: 30 }, (_, index) => matrixRow({
    date: `2026-07-${String(index + 1).padStart(2, "0")}`,
    serviceFee: 10,
    electricityFee: 20,
    gross: 30,
  }));
  const baseline = extractBaselineFromArrayBuffer(xlsxBuffer("Data List", [APPROVED_HEADERS, ...rows]));

  assert.equal(baseline.rows.length, 30);
  assert.equal(baseline.rows[0].date, "2026-07-01");
  assert.equal(baseline.rows.at(-1).date, "2026-07-30");
  assert.equal(baseline.profile.matureStationCount, 1);
  assert.equal(baseline.profile.totals.serviceFee, 300);
});
