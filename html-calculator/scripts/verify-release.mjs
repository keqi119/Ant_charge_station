import { readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

const MAX_BYTES = 20 * 1024 * 1024;
const MIN_BYTES = 500_000;
const DEFAULT_RELEASE = resolve(
  import.meta.dirname,
  "../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁测算.html",
);

export function verifyRelease(path) {
  const absolute = resolve(path);
  if (extname(absolute).toLowerCase() !== ".html") throw new Error("release must be one HTML file");
  const bytes = statSync(absolute).size;
  if (bytes < MIN_BYTES) throw new Error("release HTML is unexpectedly small");
  if (bytes > MAX_BYTES) throw new Error("release HTML exceeds 20 MB");
  const html = readFileSync(absolute, "utf8");
  if (!/<title>便民充电站单枪收入与融资租赁测算<\/title>/.test(html)) throw new Error("release title is missing or not UTF-8 Chinese");
  if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=|<img\b[^>]*\bsrc\s*=\s*["']https?:/i.test(html)) {
    throw new Error("release contains external resource tags");
  }
  if (/sourceMappingURL/.test(html)) throw new Error("release contains a source map URL");
  for (const notice of ["SheetJS", "Apache-2.0", "Chart.js", "esbuild", "MIT"]) {
    if (!html.includes(notice)) throw new Error(`release is missing ${notice} notice`);
  }
  const payloadMatch = html.match(/<script type="application\/json" id="embedded-model-data">([\s\S]*?)<\/script>/);
  if (!payloadMatch) throw new Error("embedded model data is missing");
  const embedded = JSON.parse(payloadMatch[1]);
  const counts = {
    pages: embedded.metadata?.pages?.length,
    historyRows: embedded.historyRows?.length,
    cityInputs: embedded.cityInputs?.length,
    seasonalityInputs: embedded.seasonalityInputs?.length,
  };
  if (counts.pages !== 12) throw new Error(`expected 12 pages, received ${counts.pages}`);
  if (counts.historyRows !== 3049) throw new Error(`expected 3049 history rows, received ${counts.historyRows}`);
  if (counts.cityInputs !== 56) throw new Error(`expected 56 cities, received ${counts.cityInputs}`);
  if (counts.seasonalityInputs !== 13) throw new Error(`expected 13 seasonality rows, received ${counts.seasonalityInputs}`);
  if (!embedded.cityAuditManifest || embedded.cityAuditManifest.cities?.length !== 56) throw new Error("city audit manifest is incomplete");
  return { path: absolute, bytes, counts, modelVersion: embedded.metadata.modelVersion };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const path = process.argv[2] ?? DEFAULT_RELEASE;
  process.stdout.write(`${JSON.stringify(verifyRelease(path))}\n`);
}
