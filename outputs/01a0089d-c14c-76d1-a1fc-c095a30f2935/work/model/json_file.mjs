import { readFileSync } from "node:fs";

/** Node-only JSON loader kept separate from browser-safe input validators. */
export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
