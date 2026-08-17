import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateModel, createBaselineState } from "../../src/model/calculator.mjs";
import { CHECK_IDS, runModelChecks } from "../../src/model/checks.mjs";

function readJson(relativeUrl) {
  return JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), "utf8"));
}

function baselineState() {
  return createBaselineState({
    metadata: { modelVersion: "html-model-1" },
    historyRows: readJson("../../data/historical-baseline.json"),
    cityInputs: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/city_inputs.json"),
    seasonalityInputs: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/seasonality_2024.json"),
    cityAuditManifest: readJson("../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/data/city_metric_audit_manifest.json"),
  });
}

function recomputeChecks(result) {
  return runModelChecks({
    state: result.state,
    historical: result.historical,
    allocations: result.cities.allocations,
    deployment: result.deployment,
    operations: result.operations,
    leases: result.finance.leases,
    waterfall: result.finance.waterfall,
    dscr: result.finance.dscr,
    scenarios: result.scenarios,
  });
}

test("all 17 approved checks pass for the baseline", () => {
  const result = calculateModel(baselineState());
  assert.deepEqual(result.checks.map((row) => row.id), CHECK_IDS);
  assert.equal(result.checks.length, 17);
  assert.ok(result.checks.every((row) => row.status === "PASS"));
  assert.equal(result.status, "WARN");
  assert.equal(result.warnings.length, 2);
});

test("controlled corruptions fail the matching checks", () => {
  const baseline = calculateModel(baselineState());

  const oddTarget = structuredClone(baseline);
  oddTarget.state.assumptions.targetGuns = 30001;
  assert.equal(
    recomputeChecks(oddTarget).find((row) => row.id === "city-even-and-sites-integer").status,
    "FAIL",
  );

  const residualAbovePrincipal = structuredClone(baseline);
  residualAbovePrincipal.finance.leases[0].residualAmount = residualAbovePrincipal.finance.leases[0].principal + 1;
  assert.equal(
    recomputeChecks(residualAbovePrincipal).find((row) => row.id === "approved-lease-inputs").status,
    "FAIL",
  );

  const brokenGross = structuredClone(baseline);
  brokenGross.historical.reconciliations.grossComponentsDifference = 2;
  assert.equal(
    recomputeChecks(brokenGross).find((row) => row.id === "history-gross-split").status,
    "FAIL",
  );

  const missingFixedLaunch = structuredClone(baseline);
  delete missingFixedLaunch.deployment.firstOnlineMonthByCity[missingFixedLaunch.state.fixedCities[0]];
  assert.equal(
    recomputeChecks(missingFixedLaunch).find((row) => row.id === "fixed-cities-first-six-months").status,
    "FAIL",
  );
});
