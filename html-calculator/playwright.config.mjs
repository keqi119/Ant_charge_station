import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: "line",
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
          args: ["--allow-file-access-from-files"],
        },
      },
    },
    {
      name: "edge",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
          args: ["--allow-file-access-from-files"],
        },
      },
    },
  ],
});
