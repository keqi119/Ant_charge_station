import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createBaselineState } from "../../src/model/calculator.mjs";
import { parseSolution, serializeSolution } from "../../src/io/solution-file.mjs";

function readJson(relativeUrl) {
  return JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), "utf8"));
}

function fullState() {
  return createBaselineState({
    metadata: { modelVersion: "html-model-1" },
    historyRows: readJson("../../data/historical-baseline.json"),
    cityInputs: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/city_inputs.json"),
    seasonalityInputs: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/seasonality_2024.json"),
  });
}

test("portable solution round-trips the complete approved state", () => {
  const text = serializeSolution(fullState(), {
    name: "基准方案",
    savedAt: "2026-08-17T00:00:00.000Z",
  });
  const parsed = parseSolution(text);

  assert.equal(parsed.format, "ant-charge-station-solution");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.savedAt, "2026-08-17T00:00:00.000Z");
  assert.equal(parsed.modelVersion, "html-model-1");
  assert.equal(parsed.name, "基准方案");
  assert.equal(parsed.state.history.rows.length, 3049);
  assert.ok(parsed.state.history.rows[0].date instanceof Date);
  assert.equal(parsed.state.history.rows[0].date.toISOString().slice(0, 10), "2026-08-15");
  assert.equal(parsed.state.cityInputs.length, 56);
  assert.equal(parsed.state.seasonalityInputs.length, 13);
});

test("parser rejects foreign versions, malformed arrays, dates, and financing domains", () => {
  const valid = JSON.parse(serializeSolution(fullState(), { savedAt: "2026-08-17T00:00:00.000Z" }));
  const corruptions = [
    ["wrong format", (value) => { value.format = "other"; }],
    ["unsupported version", (value) => { value.version = 2; }],
    ["missing cities", (value) => { delete value.state.cityInputs; }],
    ["invalid date", (value) => { value.state.history.rows[0].date = "2026-02-31"; }],
    ["odd target", (value) => { value.state.assumptions.targetGuns = 30001; }],
    ["invalid finance ratio", (value) => { value.state.assumptions.leaseAdvanceRate = 0.75; }],
    ["invalid rate", (value) => { value.state.assumptions.annualLeaseRate = 0.07; }],
    ["invalid term", (value) => { value.state.assumptions.leaseTermMonths = 30; }],
  ];

  for (const [label, corrupt] of corruptions) {
    const candidate = structuredClone(valid);
    corrupt(candidate);
    assert.throws(() => parseSolution(JSON.stringify(candidate)), undefined, label);
  }
});

test("parser rejects history whose cumulative gross split is invalid", () => {
  const candidate = JSON.parse(serializeSolution(fullState(), { savedAt: "2026-08-17T00:00:00.000Z" }));
  candidate.state.history.rows[0].gross += 2;
  assert.throws(() => parseSolution(JSON.stringify(candidate)), /超过1元/);
});
