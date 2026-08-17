import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { FIXED_CITIES } from "../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/constants.mjs";
import {
  validateCityInputs,
  validateCityMetricAuditManifest,
} from "../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/work/model/input_validation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, "..");
const REPOSITORY = resolve(PROJECT, "..");
const OUTPUT = join(
  REPOSITORY,
  "outputs",
  "01a0089d-c14c-76d1-a1fc-c095a30f2935",
  "便民充电站单枪收入与融资租赁测算.html",
);

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function buildHtml({ template, css, javascript, embeddedData, thirdPartyNotices = "" }) {
  return template
    .replace("<!-- INLINE_STYLE -->", `<style>${css}</style>`)
    .replace(
      "<!-- EMBEDDED_DATA -->",
      `<script type="application/json" id="embedded-model-data">${safeJson(embeddedData)}</script>`,
    )
    .replace("<!-- INLINE_SCRIPT -->", `<script>${javascript}</script>`)
    .replace(
      "<!-- THIRD_PARTY_NOTICES -->",
      `<section id="third-party-notices" hidden aria-hidden="true"><pre>${escapeHtml(thirdPartyNotices)}</pre></section>`,
    );
}

function loadJsonIfPresent(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

export async function buildRelease() {
  const template = readFileSync(join(PROJECT, "src", "index.template.html"), "utf8");
  const css = readFileSync(join(PROJECT, "src", "styles.css"), "utf8");
  const noticeIndex = readFileSync(join(PROJECT, "data", "third-party-notices.txt"), "utf8");
  const thirdPartyNotices = [
    noticeIndex,
    "\n===== SheetJS Community Edition (xlsx) — Apache-2.0 full license =====\n",
    readFileSync(join(PROJECT, "node_modules", "xlsx", "LICENSE"), "utf8"),
    "\n===== Chart.js — MIT full license =====\n",
    readFileSync(join(PROJECT, "node_modules", "chart.js", "LICENSE.md"), "utf8"),
    "\n===== esbuild — MIT full license =====\n",
    readFileSync(join(PROJECT, "node_modules", "esbuild", "LICENSE.md"), "utf8"),
  ].join("\n");
  const bundle = await build({
    entryPoints: [join(PROJECT, "src", "main.mjs")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["chrome110", "edge110"],
    minify: true,
    legalComments: "none",
  });
  const javascript = bundle.outputFiles[0].text;
  const cityInputs = loadJsonIfPresent(join(REPOSITORY, "outputs", "01a0089d-c14c-76d1-a1fc-c095a30f2935", "work", "data", "city_inputs.json"), []);
  const cityAuditManifest = loadJsonIfPresent(join(REPOSITORY, "outputs", "01a0089d-c14c-76d1-a1fc-c095a30f2935", "work", "data", "city_metric_audit_manifest.json"), null);
  validateCityInputs(cityInputs, [...FIXED_CITIES]);
  validateCityMetricAuditManifest(cityAuditManifest, cityInputs);
  const embeddedData = {
    metadata: {
      modelVersion: "html-model-1",
      pages: [
        "融资摘要", "核心假设", "城市数据库", "城市分配", "月度投放计划", "单站成本",
        "历史原始数据", "历史单枪模型", "年度季节曲线", "36月运营模型",
        "融资租赁与资金缺口", "情景分析、检查与来源",
      ],
    },
    historyRows: loadJsonIfPresent(join(PROJECT, "data", "historical-baseline.json"), []),
    cityInputs,
    seasonalityInputs: loadJsonIfPresent(join(REPOSITORY, "outputs", "01a0089d-c14c-76d1-a1fc-c095a30f2935", "work", "data", "seasonality_2024.json"), []),
    cityAuditManifest,
  };
  const html = buildHtml({ template, css, javascript, embeddedData, thirdPartyNotices });
  if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=|<img\b[^>]*\bsrc\s*=\s*["']https?:/i.test(html)) {
    throw new Error("release contains an external resource tag");
  }
  writeFileSync(OUTPUT, html, "utf8");
  return { output: OUTPUT, bytes: Buffer.byteLength(html) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildRelease();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
