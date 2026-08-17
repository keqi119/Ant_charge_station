import { createAppState } from "./app-state.mjs";
import { calculateModel, createBaselineState } from "./model/calculator.mjs";
import { parseSourceWorkbook } from "./io/excel-import.mjs";
import { parseSolution, serializeSolution } from "./io/solution-file.mjs";
import { createSolutionStore } from "./io/solution-store.mjs";
import { mountShell, PAGES } from "./ui/shell.mjs";
import * as assumptionsPage from "./ui/pages/assumptions.mjs";
import * as cityDatabasePage from "./ui/pages/city-database.mjs";
import * as cityAllocationPage from "./ui/pages/city-allocation.mjs";
import * as deploymentPage from "./ui/pages/deployment.mjs";
import * as stationCostPage from "./ui/pages/station-cost.mjs";
import * as historicalRawPage from "./ui/pages/historical-raw.mjs";
import * as historicalModelPage from "./ui/pages/historical-model.mjs";
import * as seasonalityPage from "./ui/pages/seasonality.mjs";
import * as summaryPage from "./ui/pages/summary.mjs";
import * as operationsPage from "./ui/pages/operations.mjs";
import * as leasePage from "./ui/pages/lease.mjs";
import * as scenariosChecksSourcesPage from "./ui/pages/scenarios-checks-sources.mjs";

const PAGE_RENDERERS = Object.freeze({
  summary: summaryPage,
  assumptions: assumptionsPage,
  "city-database": cityDatabasePage,
  "city-allocation": cityAllocationPage,
  deployment: deploymentPage,
  "station-cost": stationCostPage,
  "historical-raw": historicalRawPage,
  "historical-model": historicalModelPage,
  seasonality: seasonalityPage,
  operations: operationsPage,
  lease: leasePage,
  "scenarios-checks-sources": scenariosChecksSourcesPage,
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

function mergePortableState(baseline, portable) {
  if (portable.modelVersion && portable.modelVersion !== baseline.modelVersion) throw new Error("方案模型版本与当前HTML不一致");
  return {
    ...structuredClone(baseline),
    ...structuredClone(portable),
    modelVersion: baseline.modelVersion,
    fixedCities: [...baseline.fixedCities],
    cityAuditManifest: structuredClone(baseline.cityAuditManifest),
  };
}

function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function filenameTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

async function bootstrap(root) {
  const baseline = createBaselineState(embeddedData());
  const appState = createAppState(baseline, calculateModel);
  const shell = mountShell(root, appState);
  const store = createSolutionStore(globalThis.indexedDB);
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

  const excelInput = shell.fileInput("excel");
  const solutionInput = shell.fileInput("solution");

  async function importExcel(file) {
    if (!file) return;
    shell.setExternalError("");
    shell.setBusy(true, "读取文件");
    shell.setProgress("读取文件");
    try {
      const buffer = await file.arrayBuffer();
      shell.setBusy(true, "校验数据");
      shell.setProgress("校验数据");
      const parsed = parseSourceWorkbook(buffer);
      const candidate = structuredClone(appState.getSnapshot().validState);
      candidate.history = {
        rows: parsed.rows,
        sourceStart: parsed.sourcePeriod.start,
        sourceEnd: parsed.sourcePeriod.end,
        sourceName: file.name,
      };
      shell.setBusy(true, "重新测算");
      shell.setProgress("重新测算");
      calculateModel(candidate);
      const promoted = appState.replaceState(candidate);
      if (promoted.validation.status === "FAIL") throw new Error(promoted.validation.errors[0]?.message ?? "重新测算失败");
      shell.setProgress("完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      shell.setExternalError(message);
      shell.setProgress("导入失败");
    } finally {
      shell.setBusy(false);
      excelInput.value = "";
    }
  }

  function downloadSolution(name = "当前方案") {
    const snapshot = appState.getSnapshot();
    if (snapshot.validation.status !== "PASS") throw new Error("存在未修正的输入错误，不能保存方案");
    const text = serializeSolution(snapshot.validState, { name });
    downloadText(text, `充电站融资测算方案-${name}-${filenameTimestamp()}.json`);
  }

  async function openSolution(file) {
    if (!file) return;
    shell.setExternalError("");
    shell.setBusy(true, "正在打开方案…");
    try {
      const envelope = parseSolution(await file.text());
      if (envelope.modelVersion !== baseline.modelVersion) throw new Error("方案模型版本与当前HTML不一致");
      const candidate = mergePortableState(baseline, { modelVersion: envelope.modelVersion, ...envelope.state });
      calculateModel(candidate);
      const promoted = appState.replaceState(candidate);
      if (promoted.validation.status === "FAIL") throw new Error(promoted.validation.errors[0]?.message ?? "方案测算失败");
      shell.setProgress(`已打开：${envelope.name}`);
    } catch (error) {
      shell.setExternalError(error instanceof Error ? error.message : String(error));
    } finally {
      shell.setBusy(false);
      solutionInput.value = "";
    }
  }

  function printActivePage() {
    const pageId = appState.getSnapshot().activePage;
    document.body.dataset.printPage = pageId;
    let cleaned = false;
    const cleanupPrint = () => {
      if (cleaned) return;
      cleaned = true;
      delete document.body.dataset.printPage;
      globalThis.removeEventListener("afterprint", cleanupPrint);
    };
    globalThis.addEventListener("afterprint", cleanupPrint, { once: true });
    globalThis.print();
    setTimeout(cleanupPrint, 1_000);
  }

  excelInput.addEventListener("change", () => importExcel(excelInput.files?.[0]));
  solutionInput.addEventListener("change", () => openSolution(solutionInput.files?.[0]));
  shell.actionButton("import-excel").addEventListener("click", () => excelInput.click());
  shell.actionButton("save-solution").addEventListener("click", () => {
    try { downloadSolution(); } catch (error) { shell.setExternalError(error.message); }
  });
  shell.actionButton("open-solution").addEventListener("click", () => solutionInput.click());
  shell.actionButton("restore-baseline").addEventListener("click", () => shell.resetDialog.showModal());
  shell.actionButton("cancel-reset").addEventListener("click", () => shell.resetDialog.close());
  shell.actionButton("confirm-reset").addEventListener("click", async () => {
    shell.resetDialog.close();
    appState.restoreBaseline();
    await store.clear();
    shell.setProgress("已恢复基准方案");
  });
  shell.actionButton("print").addEventListener("click", printActivePage);

  try {
    const saved = await store.load();
    if (saved) {
      const restored = mergePortableState(baseline, saved);
      calculateModel(restored);
      appState.replaceState(restored);
      shell.setProgress("已恢复本地自动保存");
    }
  } catch (error) {
    shell.setExternalError(`自动恢复失败：${error instanceof Error ? error.message : String(error)}`);
  }

  let saveTimer;
  const unsubscribeSave = appState.subscribe((snapshot) => {
    if (snapshot.validation.status !== "PASS") return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      store.save(snapshot.validState).catch((error) => shell.setExternalError(`自动保存失败：${error.message}`));
    }, 300);
  });

  const api = {
    appState,
    shell,
    ready: true,
    importExcel,
    downloadSolution,
    openSolution,
    restoreBaseline: () => appState.restoreBaseline(),
    printActivePage,
    destroy: async () => {
      clearTimeout(saveTimer);
      cleanup();
      unsubscribeSave();
      unsubscribePages();
      shell.destroy();
      await store.close();
    },
  };
  globalThis.__chargeStationCalculator = api;
  return api;
}

const root = document.getElementById("app");
if (root) {
  globalThis.__chargeStationCalculator = { ready: false };
  bootstrap(root).catch((error) => {
    root.innerHTML = `<div class="fatal-error"><h1>模型载入失败</h1><p>${error instanceof Error ? error.message : String(error)}</p></div>`;
    globalThis.__chargeStationCalculator = { ready: false, error };
    setTimeout(() => { throw error; });
  });
}
