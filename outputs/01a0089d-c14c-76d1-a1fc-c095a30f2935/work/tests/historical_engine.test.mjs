import test from "node:test";
import assert from "node:assert/strict";
import { PATHS } from "../model/constants.mjs";
import { loadSourceMatrix, normalizeSourceMatrix } from "../model/source_reader.mjs";
import { profileHistoricalRows } from "../model/historical_engine.mjs";

const record = (overrides = {}) => ({
  date: new Date("2026-06-16T00:00:00Z"),
  stationId: "S-1",
  stationName: "Station 1",
  dcGuns: 2,
  acGuns: 0,
  orders: 1,
  kwh: 10,
  sharpKwh: 1,
  peakKwh: 2,
  flatKwh: 3,
  valleyKwh: 4,
  minutes: 60,
  gross: 8,
  electricityFee: 5,
  serviceFee: 3,
  rawRowNumber: 2,
  ...overrides,
});

test("profiles mature stations using maximum guns, distinct valid dates, and station-level percentiles", () => {
  const rows = [
    record({ stationId: "A", date: new Date("2026-06-16T00:00:00Z"), dcGuns: 2, serviceFee: 20 }),
    record({ stationId: "A", date: new Date("2026-06-17T00:00:00Z"), dcGuns: 4, serviceFee: 40 }),
    record({ stationId: "A", date: new Date("2026-06-17T00:00:00Z"), dcGuns: 1, serviceFee: 4 }),
    record({ stationId: "B", date: new Date("2026-06-16T00:00:00Z"), serviceFee: 8 }),
    record({ stationId: "B", date: new Date("2026-06-17T00:00:00Z"), serviceFee: 8 }),
    record({ stationId: "C", date: new Date("2026-06-16T00:00:00Z"), serviceFee: 999 }),
  ];
  const profile = profileHistoricalRows(rows, { matureOperatingDays: 2 });

  assert.equal(profile.matureStationCount, 2);
  assert.equal(profile.stationProfiles.find((x) => x.stationId === "A").guns, 4);
  assert.equal(profile.stationProfiles.find((x) => x.stationId === "A").operatingDays, 2);
  assert.equal(profile.benchmarks.matureP25, 5);
  assert.equal(profile.benchmarks.matureMedian, 6);
  assert.equal(profile.benchmarks.matureWeighted, 80 / 12);
});

test("rejects invalid dates and zero-gun station rows instead of silently calculating a benchmark", () => {
  assert.throws(
    () => profileHistoricalRows([record({ date: new Date("not-a-date") })]),
    /invalid operating date/i,
  );
  assert.throws(
    () => profileHistoricalRows([record({ dcGuns: 0, acGuns: 0 })]),
    /positive gun count/i,
  );
  assert.throws(
    () => profileHistoricalRows([record({ dcGuns: -1, acGuns: 3 })]),
    /non-negative gun count/i,
  );
});

test("source workbook reconciles to approved historical totals", async () => {
  const { matrix } = await loadSourceMatrix(PATHS.sourceWorkbook);
  const p = profileHistoricalRows(normalizeSourceMatrix(matrix));
  assert.equal(p.rowCount, 3049);
  assert.equal(p.stationCount, 60);
  assert.equal(p.matureStationCount, 52);
  assert.ok(Math.abs(p.totals.orders - 84356) < 0.001);
  assert.ok(Math.abs(p.totals.kwh - 2013192.36) < 0.01);
  assert.ok(Math.abs(p.totals.gross - 1758717.20) < 0.01);
  assert.ok(Math.abs(p.totals.electricityFee - 1202523.78) < 0.01);
  assert.ok(Math.abs(p.totals.serviceFee - 556193.42) < 0.01);
  assert.ok(Math.abs(p.benchmarks.matureP25 - 28.3617) < 0.0001);
  assert.ok(Math.abs(p.benchmarks.matureMedian - 60.7750) < 0.0001);
  assert.ok(Math.abs(p.benchmarks.matureWeighted - 62.7329) < 0.0001);
});
