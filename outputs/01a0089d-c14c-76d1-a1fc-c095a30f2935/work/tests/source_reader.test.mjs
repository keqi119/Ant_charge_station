import test from "node:test";
import assert from "node:assert/strict";
import { FIXED_CITIES, SHEET_NAMES } from "../model/constants.mjs";
import { normalizeSourceMatrix } from "../model/source_reader.mjs";

test("fixed city list is the approved 26-city set", () => {
  assert.equal(FIXED_CITIES.length, 26);
  assert.equal(new Set(FIXED_CITIES).size, 26);
  assert.deepEqual(FIXED_CITIES.slice(-4), ["西安", "无锡", "济南", "郑州"]);
});

test("workbook exposes exactly the approved 12 visible sheet names", () => {
  assert.equal(SHEET_NAMES.length, 12);
  assert.equal(SHEET_NAMES[0], "融资摘要");
  assert.equal(SHEET_NAMES[11], "情景分析、检查与来源");
});

test("normalization excludes blank rows and makes blank numeric inputs zero", () => {
  const records = normalizeSourceMatrix([
    ["日期", "站点ID", "站点名称"],
    ["2026-06-16", "S-1", "测试站", 2, 2, "", 10, "", 3, 4, 3, 20, 8, 5, 3],
    Array(16).fill(""),
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].orders, 0);
  assert.equal(records[0].sharpKwh, 0);
  assert.equal(records[0].dcGuns + records[0].acGuns, 4);
  assert.equal(records[0].rawRowNumber, 2);
  assert.equal(records[0].date.toISOString().slice(0, 10), "2026-06-15");
});

test("normalization preserves all required raw-record fields", () => {
  const record = normalizeSourceMatrix([["header"], [new Date("2026-06-16T00:00:00Z"), 1, "站", 1, 0]])[0];
  assert.deepEqual(Object.keys(record), [
    "date", "stationId", "stationName", "dcGuns", "acGuns", "orders", "kwh", "sharpKwh", "peakKwh", "flatKwh", "valleyKwh", "minutes", "gross", "electricityFee", "serviceFee", "rawRowNumber",
  ]);
});
