import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { indexedDB } from "fake-indexeddb";

import { createBaselineState } from "../../src/model/calculator.mjs";
import { createSolutionStore } from "../../src/io/solution-store.mjs";

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

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

test("IndexedDB auto-save preserves all 3,049 dated history rows", async () => {
  await deleteDatabase("ant-charge-station-calculator");
  const store = createSolutionStore(indexedDB);
  assert.equal(await store.load(), null);

  await store.save(fullState());
  const loaded = await store.load();
  assert.equal(loaded.history.rows.length, 3049);
  assert.ok(loaded.history.rows[0].date instanceof Date);
  assert.equal(loaded.history.rows[0].date.toISOString().slice(0, 10), "2026-08-15");
  assert.equal(loaded.cityInputs.length, 56);

  await store.clear();
  assert.equal(await store.load(), null);
  await store.close();
});
