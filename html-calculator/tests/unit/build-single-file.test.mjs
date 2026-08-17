import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildHtml } from "../../scripts/build-single-file.mjs";

const RELEASE = fileURLToPath(new URL(
  "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁测算.html",
  import.meta.url,
));

test("buildHtml produces one runnable Chinese document with every payload inlined", () => {
  const template = `<!doctype html><html lang="zh-CN"><head><!-- INLINE_STYLE --></head><body><main id="app"></main><!-- EMBEDDED_DATA --><!-- INLINE_SCRIPT --></body></html>`;
  const html = buildHtml({
    template,
    css: "body{color:#123}",
    javascript: "globalThis.__appReady=true;",
    embeddedData: { metadata: { modelVersion: "html-model-1" } },
  });

  assert.match(html, /<style>body\{color:#123\}<\/style>/);
  assert.match(html, /<script type="application\/json" id="embedded-model-data">/);
  assert.match(html, /"modelVersion":"html-model-1"/);
  assert.match(html, /<script>globalThis\.__appReady=true;<\/script>/);
  assert.doesNotMatch(html, /INLINE_STYLE|EMBEDDED_DATA|INLINE_SCRIPT/);
  assert.match(html, /lang="zh-CN"/);
});

test("buildHtml escapes script-breaking characters inside embedded JSON", () => {
  const template = "<!-- INLINE_STYLE --><!-- EMBEDDED_DATA --><!-- INLINE_SCRIPT -->";
  const html = buildHtml({ template, css: "", javascript: "", embeddedData: { text: "</script>\u2028\u2029" } });

  assert.doesNotMatch(html, /<\/script>\u2028/);
  assert.match(html, /\\u003c\/script>/);
  assert.match(html, /\\u2028\\u2029/);
});

test("release is one self-contained offline HTML", () => {
  const html = readFileSync(RELEASE, "utf8");
  assert.ok(Buffer.byteLength(html) > 500_000);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(?:src|href)=["']https?:/i);
  assert.match(html, /id="embedded-model-data"/);
  assert.match(html, /SheetJS.*Apache-2\.0/s);
  assert.match(html, /Chart\.js.*MIT/s);
  assert.match(html, /esbuild.*MIT/s);
  assert.doesNotMatch(html, /sourceMappingURL/);
  const payload = html.match(/<script type="application\/json" id="embedded-model-data">([\s\S]*?)<\/script>/);
  assert.ok(payload);
  const embedded = JSON.parse(payload[1]);
  assert.equal(embedded.metadata.pages.length, 12);
  assert.equal(embedded.historyRows.length, 3049);
  assert.equal(embedded.cityInputs.length, 56);
  assert.equal(embedded.seasonalityInputs.length, 13);
});
