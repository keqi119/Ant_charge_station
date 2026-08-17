import * as XLSX from "xlsx";
import { normalizeSourceMatrix, validateHistoricalRows } from "../model/source-contract.mjs";

export function parseSourceWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  if (!workbook.SheetNames.includes("Data List")) throw new Error("缺少 Data List 工作表");
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets["Data List"], {
    header: 1,
    raw: true,
    defval: null,
  });
  const rows = normalizeSourceMatrix(matrix);
  const validation = validateHistoricalRows(rows);
  return { rows, sheetName: "Data List", sourcePeriod: validation.sourcePeriod, validation };
}
