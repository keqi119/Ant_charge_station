import test from "node:test";
import assert from "node:assert/strict";
import { buildHtml } from "../../scripts/build-single-file.mjs";

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
