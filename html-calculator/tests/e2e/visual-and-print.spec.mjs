import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { expect, releaseFileUrl, test } from "./helpers.mjs";

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

test("print action targets only the active page", async ({ page }) => {
  await page.goto(releaseFileUrl);
  await page.evaluate(() => {
    globalThis.__printCalled = 0;
    globalThis.print = () => {
      globalThis.__printCalled += 1;
      globalThis.__printPage = document.body.dataset.printPage;
      globalThis.dispatchEvent(new Event("afterprint"));
    };
  });
  await page.locator("[data-action=print]").click();
  await expect.poll(() => page.evaluate(() => globalThis.__printCalled)).toBe(1);
  expect(await page.evaluate(() => globalThis.__printPage)).toBe("summary");
  await expect(page.locator("body")).not.toHaveAttribute("data-print-page");
});

test("all twelve modules and the print view fit the release layout", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto(releaseFileUrl);
  const pageIds = await page.locator("[data-page-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.pageId));
  expect(pageIds).toHaveLength(12);

  for (const [index, pageId] of pageIds.entries()) {
    await page.locator(`[data-page-id="${pageId}"]`).click();
    const panel = page.locator(`[data-page-panel="${pageId}"]`);
    await expect(panel).toBeVisible();
    const geometry = await page.evaluate(() => {
      const sidebar = document.querySelector(".app-sidebar").getBoundingClientRect();
      const workspace = document.querySelector(".app-workspace").getBoundingClientRect();
      return {
        sidebarRight: sidebar.right,
        workspaceLeft: workspace.left,
        viewportOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.sidebarRight).toBeLessThanOrEqual(geometry.workspaceLeft + 1);
    expect(geometry.viewportOverflow).toBeLessThanOrEqual(1);
    const clippedKpis = await panel.locator(".kpi-card strong").evaluateAll((nodes) => nodes.filter((node) => {
      const value = node.getBoundingClientRect();
      const card = node.closest(".kpi-card").getBoundingClientRect();
      return value.left < card.left - 1 || value.right > card.right + 1
        || value.top < card.top - 1 || value.bottom > card.bottom + 1;
    }).length);
    expect(clippedKpis).toBe(0);
    const tableContainersFit = await panel.locator(".table-scroll").evaluateAll((nodes) => {
      const workspace = document.querySelector(".app-workspace").getBoundingClientRect();
      return nodes.every((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left >= workspace.left - 1 && rect.right <= workspace.right + 1;
      });
    });
    expect(tableContainersFit).toBe(true);

    if (pageId === "summary") {
      const chartDimensions = await panel.locator("canvas[data-chart-id]").evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      expect(chartDimensions).toHaveLength(5);
      expect(chartDimensions.every(({ width, height }) => width > 0 && height > 0)).toBe(true);
    }

    if (testInfo.project.name === "chrome") {
      const screenshotPath = testInfo.outputPath("release-screenshots", `${String(index + 1).padStart(2, "0")}-${pageId}.png`);
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  }

  await page.locator("[data-page-id=summary]").click();
  await page.evaluate(() => { document.body.dataset.printPage = "summary"; });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app-header")).toBeHidden();
  await expect(page.locator(".app-sidebar")).toBeHidden();
  await expect(page.locator("[data-page-panel=summary]")).toBeVisible();
  if (testInfo.project.name === "chrome") {
    const printPath = testInfo.outputPath("release-screenshots", "13-print-summary.png");
    await mkdir(dirname(printPath), { recursive: true });
    await page.screenshot({ path: printPath, fullPage: true });
  }
});
