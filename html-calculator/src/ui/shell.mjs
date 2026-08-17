export const PAGES = Object.freeze([
  { id: "summary", label: "融资摘要" },
  { id: "assumptions", label: "核心假设" },
  { id: "city-database", label: "城市数据库" },
  { id: "city-allocation", label: "城市分配" },
  { id: "deployment", label: "月度投放计划" },
  { id: "station-cost", label: "单站成本" },
  { id: "historical-raw", label: "历史原始数据" },
  { id: "historical-model", label: "历史单枪模型" },
  { id: "seasonality", label: "年度季节曲线" },
  { id: "operations", label: "36月运营模型" },
  { id: "lease", label: "融资租赁与资金缺口" },
  { id: "scenarios-checks-sources", label: "情景分析、检查与来源" },
]);

const STATUS_TEXT = Object.freeze({ PASS: "✓ 通过", WARN: "⚠ 警告", FAIL: "✕ 失败" });

function toolbarButton(action, label, className = "button button-secondary") {
  return `<button type="button" class="${className}" data-action="${action}">${label}</button>`;
}

/** Mounts the fixed-header, left-navigation calculator application shell. */
export function mountShell(root, appState) {
  if (!(root instanceof HTMLElement)) throw new TypeError("root must be an HTMLElement");
  if (!appState || typeof appState.getSnapshot !== "function") throw new TypeError("appState is required");

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div class="brand-block">
          <button class="menu-toggle no-print" type="button" aria-label="打开模块导航" aria-expanded="false">☰</button>
          <div>
            <div class="brand-kicker">ANT CHARGE · UNDERWRITING MODEL</div>
            <div class="brand-title">便民充电站单枪收入与融资租赁测算</div>
          </div>
        </div>
        <div class="header-actions no-print" aria-label="模型操作">
          ${toolbarButton("import-excel", "导入Excel", "button button-primary")}
          ${toolbarButton("save-solution", "保存方案")}
          ${toolbarButton("open-solution", "打开方案")}
          ${toolbarButton("restore-baseline", "恢复基准")}
          ${toolbarButton("print", "打印/PDF")}
          <input type="file" data-file-input="excel" accept=".xlsx,.xls" hidden>
          <input type="file" data-file-input="solution" accept="application/json,.json" hidden>
        </div>
        <div class="model-status" data-model-status data-status="WARN">⚠ 警告</div>
        <div class="progress-toast" data-import-progress role="status" aria-live="polite" hidden></div>
      </header>
      <div class="app-body">
        <aside class="app-sidebar" aria-label="测算模块导航">
          <div class="sidebar-heading">测算模块</div>
          <nav class="page-nav">
            ${PAGES.map((page, index) => `
              <button type="button" class="page-nav-item" data-page-id="${page.id}"
                data-status="WARN" aria-current="${index === 0 ? "true" : "false"}">${page.label}</button>
            `).join("")}
          </nav>
          <div class="sidebar-footnote">本地离线运行<br>数据不会上传网络</div>
        </aside>
        <main class="app-workspace" tabindex="-1">
          <div class="validation-banner" data-validation-banner hidden role="alert"></div>
          ${PAGES.map((page, index) => `
            <section class="page-panel" data-page-panel="${page.id}" ${index === 0 ? "" : "hidden"}></section>
          `).join("")}
        </main>
      </div>
      <div class="busy-overlay" data-busy-overlay hidden role="status" aria-live="polite">
        <div class="busy-card"><span class="spinner" aria-hidden="true"></span><span data-busy-text>正在重新测算…</span></div>
      </div>
      <dialog class="reset-dialog" data-reset-dialog>
        <form method="dialog">
          <div class="dialog-kicker">RESTORE BASELINE</div>
          <h2>恢复已批准的基准方案？</h2>
          <p>当前输入、导入的历史数据和自动保存将被基准方案替换。您仍可先保存方案文件。</p>
          <div class="dialog-actions">
            <button type="button" class="button dialog-secondary" data-action="cancel-reset">取消</button>
            <button type="button" class="button dialog-danger" data-action="confirm-reset">确认恢复</button>
          </div>
        </form>
      </dialog>
    </div>`;

  const navButtons = [...root.querySelectorAll("[data-page-id]")];
  const panels = [...root.querySelectorAll("[data-page-panel]")];
  const workspace = root.querySelector(".app-workspace");
  const sidebar = root.querySelector(".app-sidebar");
  const menuToggle = root.querySelector(".menu-toggle");
  const statusNode = root.querySelector("[data-model-status]");
  const validationBanner = root.querySelector("[data-validation-banner]");
  const busyOverlay = root.querySelector("[data-busy-overlay]");
  const progress = root.querySelector("[data-import-progress]");

  function showPage(pageId, { updateState = true } = {}) {
    if (!PAGES.some((page) => page.id === pageId)) throw new RangeError(`unknown page: ${pageId}`);
    for (const button of navButtons) button.setAttribute("aria-current", String(button.dataset.pageId === pageId));
    for (const panel of panels) panel.hidden = panel.dataset.pagePanel !== pageId;
    sidebar.dataset.open = "false";
    menuToggle.setAttribute("aria-expanded", "false");
    if (updateState && appState.getSnapshot().activePage !== pageId) appState.setActivePage(pageId);
    workspace.focus({ preventScroll: true });
  }

  function setModelStatus(status) {
    const safeStatus = STATUS_TEXT[status] ? status : "FAIL";
    statusNode.dataset.status = safeStatus;
    statusNode.textContent = STATUS_TEXT[safeStatus];
    for (const button of navButtons) button.dataset.status = safeStatus;
  }

  function setBusy(busy, message = "正在重新测算…") {
    busyOverlay.hidden = !busy;
    root.querySelector("[data-busy-text]").textContent = message;
    root.setAttribute("aria-busy", String(Boolean(busy)));
  }

  function setProgress(message) {
    progress.hidden = !message;
    progress.textContent = message ?? "";
  }

  function setExternalError(message) {
    validationBanner.hidden = !message;
    validationBanner.textContent = message ?? "";
  }

  for (const button of navButtons) button.addEventListener("click", () => showPage(button.dataset.pageId));
  menuToggle.addEventListener("click", () => {
    const open = sidebar.dataset.open !== "true";
    sidebar.dataset.open = String(open);
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  const unsubscribe = appState.subscribe((snapshot) => {
    setModelStatus(snapshot.result?.status ?? "FAIL");
    showPage(snapshot.activePage, { updateState: false });
    validationBanner.hidden = snapshot.validation.status !== "FAIL";
    validationBanner.textContent = snapshot.validation.errors.map((error) => error.message).join("；");
  });
  const initial = appState.getSnapshot();
  setModelStatus(initial.result?.status ?? "FAIL");
  showPage(initial.activePage, { updateState: false });

  return {
    pages: PAGES,
    showPage,
    setModelStatus,
    setBusy,
    setProgress,
    setExternalError,
    panel(pageId) {
      return root.querySelector(`[data-page-panel="${pageId}"]`);
    },
    actionButton(action) {
      return root.querySelector(`[data-action="${action}"]`);
    },
    fileInput(kind) {
      return root.querySelector(`[data-file-input="${kind}"]`);
    },
    resetDialog: root.querySelector("[data-reset-dialog]"),
    destroy() {
      unsubscribe();
      root.replaceChildren();
    },
  };
}
