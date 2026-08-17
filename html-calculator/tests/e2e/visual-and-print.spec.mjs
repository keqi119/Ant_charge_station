import { expect, test } from "@playwright/test";

import { releaseFileUrl } from "./helpers.mjs";

test("summary reconciles and owns exactly five charts", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(releaseFileUrl);
  await expect(page.locator("[data-kpi=targetGuns]")).toHaveText("30,000");
  await expect(page.locator("[data-kpi=totalInvestment]")).toContainText("6.40");
  await expect(page.locator("canvas[data-chart-id]")).toHaveCount(5);
  await expect(page.locator("[data-model-status]")).toContainText("警告");

  await page.locator("[data-page-id=operations]").click();
  await expect(page.locator("[data-page-panel=operations] tbody tr")).toHaveCount(60);
  await expect(page.locator("[data-period=debtTail]")).toHaveCount(24);

  await page.locator("[data-page-id=lease]").click();
  await expect(page.locator("[data-lease-batch-row]")).toHaveCount(12);

  await page.locator("[data-page-id=scenarios-checks-sources]").click();
  await expect(page.locator("[data-check-row]")).toHaveCount(17);
  await expect(page.locator("[data-check-row][data-status=PASS]")).toHaveCount(17);
  expect(errors).toEqual([]);
});

test("debt and downside risk remain visible without fake DSCR values", async ({ page }) => {
  await page.goto(releaseFileUrl);
  await page.locator("[data-page-id=assumptions]").click();
  await page.locator("[data-path='assumptions.propertyMode']").selectOption("固定");
  await page.locator("[data-path='assumptions.fixedRentPerStation']").fill("5000");
  await page.locator("[data-path='assumptions.headquartersMonthly']").fill("10000000");

  await page.locator("[data-page-id=operations]").click();
  await expect(page.locator("[data-cfads-negative]").first()).toBeVisible();
  expect(await page.locator("[data-dscr-blank]").count()).toBeGreaterThan(0);

  await page.locator("[data-page-id=summary]").click();
  await expect(page.locator("[data-warning-list]")).toContainText("经营税率当前为0");
  await expect(page.locator("canvas[data-chart-id]")).toHaveCount(5);
});
