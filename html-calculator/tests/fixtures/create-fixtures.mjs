import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { APPROVED_HEADERS } from "../../src/model/source-contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(HERE, { recursive: true });

function row(day, overrides = {}) {
  const values = {
    date: `2026-07-${String(day).padStart(2, "0")}`,
    stationId: "S1",
    stationName: "更新样本站",
    dcGuns: 2,
    acGuns: 0,
    orders: 3,
    kwh: 20,
    sharp: 1,
    peak: 2,
    flat: 7,
    valley: 10,
    minutes: 60,
    gross: 30,
    electricity: 20,
    service: 10,
    ...overrides,
  };
  return [values.date, values.stationId, values.stationName, values.dcGuns, values.acGuns,
    values.orders, values.kwh, values.sharp, values.peak, values.flat, values.valley,
    values.minutes, values.gross, values.electricity, values.service, "2026-08-15"];
}

function writeWorkbook(filename, sheetName, matrix) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), sheetName);
  writeFileSync(join(HERE, filename), XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

writeWorkbook("valid-update.xlsx", "Data List", [
  APPROVED_HEADERS,
  ...Array.from({ length: 30 }, (_, index) => row(index + 1)),
]);

const badHeaders = [...APPROVED_HEADERS];
badHeaders[12] = "收入";
writeWorkbook("invalid-schema.xlsx", "Data List", [badHeaders, row(1)]);
writeWorkbook("invalid-gross.xlsx", "Data List", [APPROVED_HEADERS, row(1, { gross: 35 })]);
