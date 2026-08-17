import { createAppState } from "./app-state.mjs";
import { calculateModel, createBaselineState } from "./model/calculator.mjs";
import { mountShell, PAGES } from "./ui/shell.mjs";

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
    globalThis.__chargeStationCalculator = { appState, shell };
  } catch (error) {
    root.innerHTML = `<div class="fatal-error"><h1>模型载入失败</h1><p>${error instanceof Error ? error.message : String(error)}</p></div>`;
    throw error;
  }
}
