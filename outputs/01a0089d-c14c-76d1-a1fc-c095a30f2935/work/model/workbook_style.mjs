import { COLORS, NUMBER_FORMATS } from "./constants.mjs";

const NAVY = "#17365D";
const SECTION_BLUE = "#1F4E78";
const LIGHT_BLUE = "#D9EAF7";
const LIGHT_GREEN = "#E2F0D9";
const LIGHT_RED = "#FCE4D6";
const LIGHT_GRAY = "#E7E6E6";
const WHITE = "#FFFFFF";

export function styleTitle(range) {
  range.format = {
    fill: NAVY,
    font: { bold: true, color: WHITE, size: 15, name: "Arial" },
    verticalAlignment: "center",
    horizontalAlignment: "left",
  };
  range.format.rowHeight = 26;
  return range;
}

export function styleSection(range) {
  range.format = {
    fill: SECTION_BLUE,
    font: { bold: true, color: WHITE, name: "Arial" },
    verticalAlignment: "center",
    horizontalAlignment: "left",
    borders: { preset: "outside", style: "thin", color: NAVY },
  };
  return range;
}

export function styleInput(range) {
  range.format = {
    fill: "#FFF2CC",
    font: { color: COLORS.input, name: "Arial" },
  };
  return range;
}

export function styleFormula(range) {
  range.format.font = { color: COLORS.formula, name: "Arial" };
  return range;
}

export function styleCrossSheet(range) {
  range.format.font = { color: COLORS.crossSheet, name: "Arial" };
  return range;
}

export function styleCheck(range) {
  range.format = {
    fill: LIGHT_GREEN,
    borders: { preset: "outside", style: "thin", color: "#A9D08E" },
  };
  range.conditionalFormats.addCustom('=OR($F1="FAIL",$F1="警告")', {
    fill: LIGHT_RED,
    font: { color: "#C00000", bold: true },
  });
  return range;
}

export function formatFinancial(range) {
  range.format.numberFormat = NUMBER_FORMATS.financial;
  range.format.horizontalAlignment = "right";
  return range;
}

export function formatPercent(range) {
  range.format.numberFormat = NUMBER_FORMATS.percent;
  range.format.horizontalAlignment = "right";
  return range;
}

export function formatCount(range) {
  range.format.numberFormat = NUMBER_FORMATS.count;
  range.format.horizontalAlignment = "right";
  return range;
}

export function applyWorkbookStyles(workbook) {
  for (const sheet of workbook.worksheets.items) {
    sheet.showGridLines = false;
  }
  return workbook;
}

export const WORKBOOK_STYLE_COLORS = Object.freeze({
  navy: NAVY,
  sectionBlue: SECTION_BLUE,
  lightBlue: LIGHT_BLUE,
  lightGreen: LIGHT_GREEN,
  lightRed: LIGHT_RED,
  lightGray: LIGHT_GRAY,
});
