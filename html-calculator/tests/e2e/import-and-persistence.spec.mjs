import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import { expect, releaseFileUrl, test } from "./helpers.mjs";

const fixture = (name) => resolve(import.meta.dirname, `../fixtures/${name}`);

async function waitReady(page) {
  await page.waitForFunction(() => globalThis.__chargeStationCalculator?.ready === true);
}

test("valid Excel import recalculates and auto-restores after reload", async ({ page }) => {
  await page.goto(releaseFileUrl);
  await waitReady(page);
  await page.locator("[data-page-id=historical-model]").click();
  const baselineP50 = await page.locator("[data-history-p50]").textContent();

  await page.locator("[data-file-input=excel]").setInputFiles(fixture("valid-update.xlsx"));
  await expect(page.locator("[data-import-progress]")).toContainText("完成");
  await page.locator("[data-page-id=historical-raw]").click();
  await expect(page.locator("[data-history-row-count]")).toHaveText("30");
  await expect(page.locator("[data-page-panel=historical-raw]")).toContainText("2026-07-01 至 2026-07-30");
  await page.locator("[data-page-id=historical-model]").click();
  await expect(page.locator("[data-history-p50]")).not.toHaveText(baselineP50);

  await page.waitForTimeout(500);
  await page.reload();
  await waitReady(page);
  await page.locator("[data-page-id=historical-raw]").click();
  await expect(page.locator("[data-history-row-count]")).toHaveText("30");
});

test("invalid Excel files preserve the previous valid calculation", async ({ page }) => {
  await page.goto(releaseFileUrl);
  await waitReady(page);
  await page.locator("[data-page-id=historical-model]").click();
  const baselineP50 = await page.locator("[data-history-p50]").textContent();

  await page.locator("[data-file-input=excel]").setInputFiles(fixture("invalid-schema.xlsx"));
  await expect(page.locator("[data-validation-banner]")).toContainText(/表头/);
  await expect(page.locator("[data-history-p50]")).toHaveText(baselineP50);

  await page.locator("[data-file-input=excel]").setInputFiles(fixture("invalid-gross.xlsx"));
  await expect(page.locator("[data-validation-banner]")).toContainText(/订单总额|服务费/);
  await expect(page.locator("[data-history-p50]")).toHaveText(baselineP50);
});

test("portable solution and reset workflow round-trip edited inputs and history", async ({ page }) => {
  await page.goto(releaseFileUrl);
  await waitReady(page);
  await page.locator("[data-file-input=excel]").setInputFiles(fixture("valid-update.xlsx"));
  await expect(page.locator("[data-import-progress]")).toContainText("完成");
  await page.locator("[data-page-id=assumptions]").click();
  await page.locator("[data-path='assumptions.leaseTermMonths']").selectOption("24");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-action=save-solution]").click();
  const download = await downloadPromise;
  const solutionPath = await download.path();
  expect(download.suggestedFilename()).toMatch(/^充电站融资测算方案-/);
  const savedEnvelope = JSON.parse(readFileSync(solutionPath, "utf8"));
  expect(savedEnvelope.audit).toMatchObject({ modelStatus: "WARN", passedChecks: 17, totalChecks: 17 });
  expect(savedEnvelope.audit.dataPeriod).toEqual({ start: "2026-07-01", end: "2026-07-30", rows: 30 });

  await page.locator("[data-action=restore-baseline]").click();
  await expect(page.locator("[data-reset-dialog]")).toBeVisible();
  await page.locator("[data-action=cancel-reset]").click();
  await expect(page.locator("[data-path='assumptions.leaseTermMonths']")).toHaveValue("24");
  await page.locator("[data-action=restore-baseline]").click();
  await page.locator("[data-action=confirm-reset]").click();
  await expect(page.locator("[data-path='assumptions.leaseTermMonths']")).toHaveValue("36");
  await expect(page.locator("[data-solution-name]")).toHaveText("基准方案");

  await page.locator("[data-file-input=solution]").setInputFiles(solutionPath);
  await expect(page.locator("[data-path='assumptions.leaseTermMonths']")).toHaveValue("24");
  await expect(page.locator("[data-solution-name]")).toHaveText("当前方案");
  await page.locator("[data-page-id=historical-raw]").click();
  await expect(page.locator("[data-history-row-count]")).toHaveText("30");
});

test("solution source labels are rendered as text and cannot execute markup", async ({ page }) => {
  await page.goto(releaseFileUrl);
  await waitReady(page);
  await page.evaluate(() => { globalThis.__solutionXss = 0; });

  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-action=save-solution]").click();
  const solutionPath = await (await downloadPromise).path();
  const envelope = JSON.parse(readFileSync(solutionPath, "utf8"));
  const hostileLabel = '<img src=x onerror="globalThis.__solutionXss=1">';
  envelope.state.history.sourceName = hostileLabel;

  await page.locator("[data-file-input=solution]").setInputFiles({
    name: "hostile-label.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
  await expect(page.locator("[data-import-progress]")).toContainText("已打开");
  await page.locator("[data-page-id=historical-raw]").click();
  await expect(page.locator("[data-page-panel=historical-raw]")).toContainText(hostileLabel);
  await expect(page.locator("[data-page-panel=historical-raw] img")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__solutionXss)).toBe(0);
});
