import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeasonalityCurve, annualizePeakBenchmark } from "../model/seasonality_engine.mjs";

const inputs = JSON.parse(readFileSync(new URL("../data/seasonality_2024.json", import.meta.url), "utf8"));

test("builds a 12-month, unit-mean curve with month-end gun averages and positive unit volume", () => {
  const curve = buildSeasonalityCurve(inputs);

  assert.equal(curve.length, 12);
  assert.ok(Math.abs(curve.reduce((sum, month) => sum + month.index, 0) / 12 - 1) < 1e-10);
  for (const [index, month] of curve.entries()) {
    assert.equal(month.avgGuns, (inputs[index].monthEndPublicGuns + inputs[index + 1].monthEndPublicGuns) / 2);
    assert.ok(month.kwhPerGunDay > 0);
  }
});

test("daily-weights the 61-day source period and de-seasonalizes the summer peak benchmark", () => {
  const curve = buildSeasonalityCurve(inputs);
  const annualized = annualizePeakBenchmark(60.775, curve, "2026-06-16", "2026-08-15");

  assert.equal((new Date("2026-08-15T00:00:00Z") - new Date("2026-06-16T00:00:00Z")) / 86_400_000 + 1, 61);
  assert.ok(annualized < 60.775);
  assert.ok(Math.abs(annualized - 57.80451272535889) < 1e-10);
});

test("rejects invalid date ranges and incomplete curves", () => {
  assert.throws(() => annualizePeakBenchmark(1, [], "2026-06-16", "2026-08-15"), /12 month/i);
  assert.throws(() => annualizePeakBenchmark(1, buildSeasonalityCurve(inputs), "bad", "2026-08-15"), /invalid date/i);
});
