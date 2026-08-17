import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSourceWorkbook } from "../src/io/excel-import.mjs";
import { profileHistoricalRows } from "../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/historical_engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(HERE, "..", "data", "historical-baseline.json");

function serializeRows(rows) {
  return rows.map((row) => ({ ...row, date: row.date.toISOString().slice(0, 10) }));
}

export function extractBaselineFromArrayBuffer(arrayBuffer) {
  const parsed = parseSourceWorkbook(arrayBuffer);
  const profile = profileHistoricalRows(parsed.rows, { matureOperatingDays: 30 });
  return {
    rows: serializeRows(parsed.rows),
    profile,
    sourcePeriod: parsed.sourcePeriod,
  };
}

function assertApprovedBaseline(baseline) {
  assert.equal(baseline.rows.length, 3049);
  assert.equal(baseline.profile.totals.orders, 84356);
  assert.ok(Math.abs(baseline.profile.totals.gross - 1758717.20) <= 0.01);
  assert.ok(Math.abs(baseline.profile.totals.electricityFee - 1202523.78) <= 0.01);
  assert.ok(Math.abs(baseline.profile.totals.serviceFee - 556193.42) <= 0.01);
}

export function extractBaselineFile(inputPath, outputPath = OUTPUT) {
  const buffer = readFileSync(inputPath);
  const baseline = extractBaselineFromArrayBuffer(buffer);
  assertApprovedBaseline(baseline);
  writeFileSync(outputPath, `${JSON.stringify(baseline.rows)}\n`, "utf8");
  return { output: resolve(outputPath), rows: baseline.rows.length, sourcePeriod: baseline.sourcePeriod };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("用法: node scripts/extract-baseline.mjs <source.xlsx>");
  process.stdout.write(`${JSON.stringify(extractBaselineFile(inputPath))}\n`);
}
