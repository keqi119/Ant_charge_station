import { expect, test } from "@playwright/test";

import { releaseFileUrl } from "./helpers.mjs";

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
  expect(pageErrors).toEqual([]);
});
