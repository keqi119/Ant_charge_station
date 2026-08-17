import assert from "node:assert/strict";
import test from "node:test";

import { createAppState } from "../../src/app-state.mjs";

function fixtureState() {
  return {
    modelVersion: "html-model-1",
    assumptions: { targetGuns: 30000 },
    history: { rows: [{ date: new Date("2026-08-15T00:00:00Z") }], sourceName: "内置历史数据" },
  };
}

function calculate(state) {
  if (!Number.isInteger(state.assumptions.targetGuns) || state.assumptions.targetGuns % 2 !== 0) {
    throw new Error("目标枪数必须为偶数");
  }
  return { status: "PASS", kpis: { targetGuns: state.assumptions.targetGuns } };
}

test("invalid edits keep the last valid result and preserve the draft", () => {
  const app = createAppState(fixtureState(), calculate);
  const before = app.getSnapshot().result;
  const after = app.update("assumptions.targetGuns", 30001);

  assert.equal(after.validation.status, "FAIL");
  assert.deepEqual(after.result, before);
  assert.equal(after.draft.assumptions.targetGuns, 30001);
  assert.equal(after.validState.assumptions.targetGuns, 30000);
  assert.match(after.validation.errors[0].message, /偶数/);
});

test("valid edits promote state, notify subscribers, and restore baseline", () => {
  const app = createAppState(fixtureState(), calculate);
  const notifications = [];
  const unsubscribe = app.subscribe((snapshot) => notifications.push(snapshot.result.kpis.targetGuns));

  const promoted = app.update("assumptions.targetGuns", 30002);
  assert.equal(promoted.validation.status, "PASS");
  assert.equal(promoted.validState.assumptions.targetGuns, 30002);
  assert.equal(promoted.result.kpis.targetGuns, 30002);
  assert.ok(promoted.lastCalculatedAt);

  const restored = app.restoreBaseline();
  assert.equal(restored.draft.assumptions.targetGuns, 30000);
  assert.deepEqual(notifications, [30002, 30000]);
  unsubscribe();
  app.update("assumptions.targetGuns", 30004);
  assert.deepEqual(notifications, [30002, 30000]);
});

test("history replacement is failure-atomic and active page is independent", () => {
  const state = fixtureState();
  const app = createAppState(state, (candidate) => {
    if (candidate.history.rows.length === 0) throw new Error("历史数据不能为空");
    return calculate(candidate);
  });

  app.setActivePage("city-allocation");
  assert.equal(app.getSnapshot().activePage, "city-allocation");
  const failed = app.replaceHistory({ rows: [], sourceName: "空数据" });
  assert.equal(failed.validation.status, "FAIL");
  assert.equal(failed.validState.history.rows.length, 1);
  assert.equal(failed.draft.history.rows.length, 0);
});
