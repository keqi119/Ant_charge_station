import { createAppState } from "./app-state.mjs";
import { calculateModel, createBaselineState } from "./model/calculator.mjs";
import { mountShell, PAGES } from "./ui/shell.mjs";
import * as assumptionsPage from "./ui/pages/assumptions.mjs";
import * as cityDatabasePage from "./ui/pages/city-database.mjs";
import * as cityAllocationPage from "./ui/pages/city-allocation.mjs";
import * as deploymentPage from "./ui/pages/deployment.mjs";
import * as stationCostPage from "./ui/pages/station-cost.mjs";
import * as historicalRawPage from "./ui/pages/historical-raw.mjs";
import * as historicalModelPage from "./ui/pages/historical-model.mjs";
import * as seasonalityPage from "./ui/pages/seasonality.mjs";

const PAGE_RENDERERS = Object.freeze({
  assumptions: assumptionsPage,
  "city-database": cityDatabasePage,
  "city-allocation": cityAllocationPage,
  deployment: deploymentPage,
  "station-cost": stationCostPage,
  "historical-raw": historicalRawPage,
  "historical-model": historicalModelPage,
  seasonality: seasonalityPage,
});

function embeddedData() {
  const node = document.getElementById("embedded-model-data");
  if (!node) throw new Error("内置模型数据缺失");
  return JSON.parse(node.textContent);
}

function renderPlaceholders(shell, snapshot) {
  for (const page of PAGES) {
    const panel = shell.panel(page.id);
    panel.innerHTML = `
      <div class="page-heading">
        <div><div class="eyebrow">MODEL MODULE</div><h1>${page.label}</h1></div>
        <span class="status-chip" data-status="${snapshot.result.status}">${snapshot.result.status === "WARN" ? "警告" : "通过"}</span>
      </div>
      <div class="placeholder-card">
        <div class="placeholder-index">${String(PAGES.indexOf(page) + 1).padStart(2, "0")}</div>
        <div><h2>${page.label}</h2><p>模块正在载入已验证的模型结果。</p></div>
      </div>`;
  }
}

const root = document.getElementById("app");
if (root) {
  try {
    const baseline = createBaselineState(embeddedData());
    const appState = createAppState(baseline, calculateModel);
    const shell = mountShell(root, appState);
    renderPlaceholders(shell, appState.getSnapshot());
    const actions = {
      update: (path, value) => appState.update(path, value),
      replaceHistory: (history) => appState.replaceHistory(history),
    };
    let cleanup = () => {};
    const renderActive = (snapshot) => {
      cleanup();
      const renderer = PAGE_RENDERERS[snapshot.activePage];
      cleanup = renderer?.render(shell.panel(snapshot.activePage), { snapshot, actions }) ?? (() => {});
    };
    const unsubscribePages = appState.subscribe(renderActive);
    renderActive(appState.getSnapshot());
    globalThis.__chargeStationCalculator = { appState, shell, destroy: () => { cleanup(); unsubscribePages(); shell.destroy(); } };
  } catch (error) {
    root.innerHTML = `<div class="fatal-error"><h1>模型载入失败</h1><p>${error instanceof Error ? error.message : String(error)}</p></div>`;
    throw error;
  }
}
