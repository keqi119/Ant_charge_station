import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { PATHS } from "./constants.mjs";

const num = (value) => value === null || value === "" ? 0 : Number(value);

export async function loadSourceMatrix(path = PATHS.sourceWorkbook) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
  const sheet = workbook.worksheets.getItem(PATHS.sourceSheet);
  return { workbook, matrix: sheet.getRange(PATHS.sourceRange).values };
}

export function normalizeSourceMatrix(matrix) {
  return matrix.slice(1)
    .map((row, index) => ({ row, rawRowNumber: index + 2 }))
    .filter(({ row }) => row.some((value) => value !== null && value !== ""))
    .map(({ row, rawRowNumber }) => ({
    date: row[0] instanceof Date ? row[0] : new Date(`${row[0]}T00:00:00+08:00`),
    stationId: String(row[1]),
    stationName: String(row[2]),
    dcGuns: num(row[3]),
    acGuns: num(row[4]),
    orders: num(row[5]),
    kwh: num(row[6]),
    sharpKwh: num(row[7]),
    peakKwh: num(row[8]),
    flatKwh: num(row[9]),
    valleyKwh: num(row[10]),
    minutes: num(row[11]),
    gross: num(row[12]),
    electricityFee: num(row[13]),
    serviceFee: num(row[14]),
    rawRowNumber,
  }));
}
