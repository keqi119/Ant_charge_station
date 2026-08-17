import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

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

export function buildHtml({ template, css, javascript, embeddedData }) {
  return template
    .replace("<!-- INLINE_STYLE -->", `<style>${css}</style>`)
    .replace(
      "<!-- EMBEDDED_DATA -->",
      `<script type="application/json" id="embedded-model-data">${safeJson(embeddedData)}</script>`,
    )
    .replace("<!-- INLINE_SCRIPT -->", `<script>${javascript}</script>`);
}

function loadJsonIfPresent(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

export function buildRelease() {
  const template = readFileSync(join(PROJECT, "src", "index.template.html"), "utf8");
  const css = readFileSync(join(PROJECT, "src", "styles.css"), "utf8");
  const javascript = readFileSync(join(PROJECT, "src", "main.mjs"), "utf8");
  const embeddedData = {
    metadata: { modelVersion: "html-model-1", pages: [] },
    historyRows: loadJsonIfPresent(join(PROJECT, "data", "historical-baseline.json"), []),
    cityInputs: [],
    seasonalityInputs: [],
  };
  const html = buildHtml({ template, css, javascript, embeddedData });
  writeFileSync(OUTPUT, html, "utf8");
  return { output: OUTPUT, bytes: Buffer.byteLength(html) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildRelease();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
