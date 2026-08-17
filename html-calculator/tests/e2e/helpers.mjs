import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test as base } from "@playwright/test";

export const releasePath = resolve(
  import.meta.dirname,
  "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁测算.html",
);
export const releaseFileUrl = pathToFileURL(releasePath).href;

export const test = base.extend({
  page: async ({ page }, use) => {
    const violations = [];
    await page.context().route(/^https?:\/\//i, async (route) => {
      violations.push(`network: ${route.request().url()}`);
      await route.abort();
    });
    page.on("console", (message) => {
      if (message.type() === "error") violations.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => violations.push(`page: ${error.message}`));
    await use(page);
    expect(violations).toEqual([]);
  },
});

export { expect };
