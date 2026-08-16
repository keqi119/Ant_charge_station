import fs from "node:fs/promises";
import { loadSourceMatrix } from "./source_reader.mjs";

const { workbook, matrix } = await loadSourceMatrix();
const preview = await workbook.render({
  sheetName: "Data List",
  range: "A1:P40",
  scale: 1.5,
  format: "png",
});
await fs.mkdir("previews", { recursive: true });
await fs.writeFile("previews/source-data-list.png", new Uint8Array(await preview.arrayBuffer()));
console.log(JSON.stringify({ rows: matrix.length, columns: matrix[0].length, preview: "previews/source-data-list.png" }));
