import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

import { APPROVED_HEADERS } from "../../src/model/source-contract.mjs";
import { expect, releaseFileUrl, test } from "./helpers.mjs";

const fixture = (name) => resolve(import.meta.dirname, `../fixtures/${name}`);

function baselineWorkbookBuffer() {
  const rows = JSON.parse(readFileSync(new URL("../../data/historical-baseline.json", import.meta.url), "utf8"));
  const matrix = [APPROVED_HEADERS, ...rows.map((row) => [
    row.date, row.stationId, row.stationName, row.dcGuns, row.acGuns, row.orders,
    row.kwh, row.sharpKwh, row.peakKwh, row.flatKwh, row.valleyKwh, row.minutes,
    row.gross, row.electricityFee, row.serviceFee, "2026-08-15",
  ])];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), "Data List");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("shows the approved twelve-page navigation in order", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(releaseFileUrl);
  await expect(page.locator("[data-page-id]")).toHaveCount(12);
  await expect(page.locator("[data-page-id]").allTextContents()).resolves.toEqual([
    "融资摘要", "核心假设", "城市数据库", "城市分配", "月度投放计划", "单站成本",
    "历史原始数据", "历史单枪模型", "年度季节曲线", "36月运营模型",
    "融资租赁与资金缺口", "情景分析、检查与来源",
  ]);
  await expect(page.locator("[data-page-id][aria-current=true]")).toHaveCount(1);
  await expect(page.locator("[data-model-status]")).toContainText(/警告|通过/);
  await expect(page.locator("[data-solution-name]")).toHaveText("基准方案");
  await expect(page.locator("[data-model-version]")).toHaveText("html-model-1");
  await expect(page.locator("[data-last-calculated]")).toHaveText(/\d{4}.*\d{2}:\d{2}/);
  expect(pageErrors).toEqual([]);
});

test("input pages expose the approved assumptions and audit data", async ({ page }) => {
  await page.goto(releaseFileUrl);
  await page.locator("[data-page-id=assumptions]").click();
  await expect(page.locator("[data-path='assumptions.targetGuns']")).toHaveValue("30000");
  await expect(page.locator("[data-path='assumptions.leaseTermMonths']")).toHaveValue("36");
  await expect(page.locator("[data-path='assumptions.annualLeaseRate']")).toHaveValue("0.08");
  await expect(page.locator("[data-path='assumptions.propertyMode']")).toHaveValue("分成");

  await page.locator("[data-page-id=city-allocation]").click();
  await expect(page.locator("[data-allocation-total]")).toHaveText("30,000");

  await page.locator("[data-page-id=historical-raw]").click();
  await expect(page.locator("[data-history-row-count]")).toHaveText("3,049");
  expect(await page.locator("[data-page-panel=historical-raw] tbody tr").count()).toBeLessThanOrEqual(100);

  await page.locator("[data-page-id=historical-model]").click();
  await expect(page.locator("[data-history-p25]")).not.toHaveText(/NaN|—/);
  await expect(page.locator("[data-history-p50]")).not.toHaveText(/NaN|—/);
});

test("linked edits fail atomically and valid city weights recalculate allocation", async ({ page }) => {
  await page.goto(releaseFileUrl);
  await page.locator("[data-page-id=assumptions]").click();
  const target = page.locator("[data-path='assumptions.targetGuns']");
  await target.fill("30001");
  await expect(page.locator("[data-validation-banner]")).toContainText(/偶数/);
  await expect(page.locator("[data-model-status]")).toContainText("警告");

  await page.locator("[data-page-id=city-allocation]").click();
  await expect(page.locator("[data-allocation-total]")).toHaveText("30,000");
  const before = await page.locator("[data-city-order-signature]").textContent();

  await page.locator("[data-page-id=assumptions]").click();
  await target.fill("30000");
  await expect(page.locator("[data-validation-banner]")).toBeHidden();
  await page.locator("[data-path='assumptions.cityWeights.population']").fill("100");
  await page.locator("[data-path='assumptions.cityWeights.density']").fill("0");
  await page.locator("[data-path='assumptions.cityWeights.housing']").fill("0");
  await page.locator("[data-path='assumptions.cityWeights.chargingScarcity']").fill("0");

  await page.locator("[data-page-id=city-allocation]").click();
  await expect(page.locator("[data-allocation-total]")).toHaveText("30,000");
  await expect(page.locator("[data-city-order-signature]")).not.toHaveText(before);
});

test("stays offline and meets the release performance budgets", async ({ page }) => {
  const loadStarted = Date.now();
  await page.goto(releaseFileUrl);
  await expect(page.locator("[data-kpi=targetGuns]")).toHaveText("30,000");
  const loadMs = Date.now() - loadStarted;
  expect(loadMs).toBeLessThan(5_000);

  await page.locator("[data-page-id=assumptions]").click();
  const recalcStarted = Date.now();
  await page.locator("[data-path='assumptions.targetGuns']").fill("30002");
  await page.locator("[data-page-id=city-allocation]").click();
  await expect(page.locator("[data-allocation-total]")).toHaveText("30,002");
  const recalcMs = Date.now() - recalcStarted;
  expect(recalcMs).toBeLessThan(1_000);

  const importStarted = Date.now();
  await page.locator("[data-file-input=excel]").setInputFiles({
    name: "baseline-3049.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: baselineWorkbookBuffer(),
  });
  await expect(page.locator("[data-import-progress]")).toContainText("完成");
  await page.locator("[data-page-id=historical-raw]").click();
  await expect(page.locator("[data-history-row-count]")).toHaveText("3,049");
  const importMs = Date.now() - importStarted;
  expect(importMs).toBeLessThan(10_000);
  console.log(`PERFORMANCE ${test.info().project.name} load=${loadMs}ms recalc=${recalcMs}ms import3049=${importMs}ms`);
  test.info().annotations.push({ type: "performance", description: JSON.stringify({ loadMs, recalcMs, importMs }) });
});
