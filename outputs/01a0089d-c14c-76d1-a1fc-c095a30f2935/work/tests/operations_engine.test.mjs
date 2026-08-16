import test from "node:test";
import assert from "node:assert/strict";

import { projectOperations } from "../model/operations_engine.mjs";

const ALL_MONTHS_FLAT = Object.freeze(Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [index + 1, 1]),
));

function baseConfig(overrides = {}) {
  return {
    startMonth: "2027-01",
    horizonMonths: 1,
    annualServicePerGunDay: 50,
    seasonalityByMonth: { 1: 0.8 },
    ramp: [0.60, 0.75, 0.85, 0.92, 0.97, 1],
    propertyMode: "分成",
    propertyShare: 0.20,
    fixedRentPerStation: 200,
    otherOpexRate: 0.10,
    headquartersMonthly: 0,
    operatingTaxRate: 0,
    historicalServiceFeeRate: 556193.42 / 1758717.20,
    ...overrides,
  };
}

test("two-gun cohort applies seasonality, ramp and percentage property cost", () => {
  const out = projectOperations([{
    cohortId: "C1",
    city: "测试城",
    onlineMonth: "2027-01",
    stations: 1,
    guns: 2,
  }], baseConfig());

  assert.ok(Math.abs(out.monthly[0].serviceFee - 1488.0) < 0.01);
  assert.ok(Math.abs(out.monthly[0].cfads - 1041.6) < 0.01);
  assert.ok(Math.abs(out.monthly[0].gmv - (1488 / (556193.42 / 1758717.20))) < 0.01);
});

test("six-month ramp matures and fixed rent is mutually exclusive with revenue share", () => {
  const out = projectOperations([{
    cohortId: "C1",
    city: "测试城",
    onlineMonth: "2027-01",
    stations: 1,
    guns: 2,
  }], baseConfig({
    horizonMonths: 7,
    annualServicePerGunDay: 10,
    seasonalityByMonth: ALL_MONTHS_FLAT,
    propertyMode: "固定",
    propertyShare: 0.99,
    fixedRentPerStation: 200,
    otherOpexRate: 0,
    historicalServiceFeeRate: 0.25,
  }));

  assert.deepEqual(out.cohortMonths.map((row) => row.rampFactor), [0.60, 0.75, 0.85, 0.92, 0.97, 1, 1]);
  assert.equal(out.monthly[0].propertyCost, 200);
  assert.equal(out.monthly[0].cfads, 172);
  assert.equal(out.monthly[5].serviceFee, 600);
  assert.equal(out.monthly[6].serviceFee, 620);
});

test("60-month axis has no additions after deployment while mature sites continue operating", () => {
  const out = projectOperations([
    { cohortId: "C1", city: "首月城", onlineMonth: "2026-09", stations: 1, guns: 2 },
    { cohortId: "C2", city: "末月城", onlineMonth: "2027-08", stations: 1, guns: 4 },
  ], baseConfig({
    startMonth: "2026-09",
    horizonMonths: 60,
    annualServicePerGunDay: 10,
    seasonalityByMonth: ALL_MONTHS_FLAT,
    propertyShare: 0,
    otherOpexRate: 0.10,
    headquartersMonthly: 100,
    operatingTaxRate: 0.05,
    historicalServiceFeeRate: 0.25,
  }));

  assert.equal(out.monthly.length, 60);
  assert.equal(out.monthly[0].month, "2026-09");
  assert.equal(out.monthly.at(-1).month, "2031-08");
  assert.equal(out.monthly[11].newGuns, 4);
  assert.ok(out.monthly.slice(36).every((month) => month.newGuns === 0));
  assert.ok(out.monthly.at(-1).serviceFee > 0);
  assert.equal(out.monthly.at(-1).operatingGuns, 6);
  assert.equal(out.cohortMonths.find((row) => row.cohortId === "C1" && row.month === "2028-02").days, 29);
});

test("property selector rejects a mode that could ambiguously combine both methods", () => {
  assert.throws(
    () => projectOperations([], baseConfig({ propertyMode: "分成+固定" })),
    /property mode|物业方式/i,
  );
});

test("property assumptions resolve cohort then city then global without combining methods", () => {
  const out = projectOperations([
    { cohortId: "A", city: "固定租金城", onlineMonth: "2027-01", stations: 1, guns: 2 },
    { cohortId: "B", city: "全局分成城", onlineMonth: "2027-01", stations: 1, guns: 2 },
    {
      cohortId: "C",
      city: "固定租金城",
      onlineMonth: "2027-01",
      stations: 1,
      guns: 2,
      propertyMode: "分成",
      propertyShare: 0.10,
    },
  ], baseConfig({
    propertyModeByCity: { "固定租金城": "固定" },
    fixedRentPerStationByCity: { "固定租金城": 123 },
  }));

  assert.deepEqual(out.cohortMonths.map((row) => row.propertyMode), ["固定", "分成", "分成"]);
  assert.equal(out.cohortMonths[0].propertyCost, 123);
  assert.equal(out.cohortMonths[1].propertyCost, 297.6);
  assert.equal(out.cohortMonths[2].propertyCost, 148.8);
});

test("financial rates reject values above 100 percent", () => {
  for (const overrides of [
    { propertyShare: 1.01 },
    { otherOpexRate: 1.01 },
    { operatingTaxRate: 1.01 },
    { historicalServiceFeeRate: 1.01 },
  ]) {
    assert.throws(() => projectOperations([], baseConfig(overrides)), /between 0 and 1|rate|share/i);
  }
});

test("cohort station and gun counts must describe whole two- or four-gun sites", () => {
  assert.throws(
    () => projectOperations([
      { cohortId: "odd", city: "测试城", onlineMonth: "2027-01", stations: 1, guns: 3 },
    ], baseConfig()),
    /station|gun/i,
  );
  assert.throws(
    () => projectOperations([
      { cohortId: "too-many", city: "测试城", onlineMonth: "2027-01", stations: 1, guns: 6 },
    ], baseConfig()),
    /station|gun/i,
  );
});

test("operations rejects cohorts first coming online in month 37 or later", () => {
  assert.throws(
    () => projectOperations([
      { cohortId: "late", city: "测试城", onlineMonth: "2030-01", stations: 1, guns: 2 },
    ], baseConfig({
      startMonth: "2027-01",
      horizonMonths: 60,
      seasonalityByMonth: ALL_MONTHS_FLAT,
    })),
    /36|online|deployment/i,
  );
});

test("seasonality keys must be unique integer calendar months from 1 through 12", () => {
  for (const seasonalityByMonth of [
    { 1: 0.8, "01": 0.9 },
    { 1: 0.8, 13: 1 },
  ]) {
    assert.throws(
      () => projectOperations([], baseConfig({ seasonalityByMonth })),
      /seasonality.*month|duplicate|1.*12/i,
    );
  }
});
