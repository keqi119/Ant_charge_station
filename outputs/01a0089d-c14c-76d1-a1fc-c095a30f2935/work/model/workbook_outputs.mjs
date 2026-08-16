import { NUMBER_FORMATS } from "./constants.mjs";
import {
  WORKBOOK_STYLE_COLORS,
  formatCount,
  formatFinancial,
  formatPercent,
  styleCheck,
  styleCrossSheet,
  styleFormula,
  styleSection,
  styleTitle,
} from "./workbook_style.mjs";

const REPORT_MONTHS = 36;
const CALCULATION_MONTHS = 60;
const BASE_COHORTS = 12;
const SCENARIO_COHORTS = 18;
const DESIGN_URL = "https://github.com/keqi119/Ant_charge_station/blob/main/docs/superpowers/specs/2026-08-16-charge-station-financing-model-design.md";
const SLOW_ROLLOUT = Object.freeze([0.03, 0.04, 0.04, 0.05, 0.05, 0.06, 0.06, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.06, 0.06, 0.05, 0.04, 0.04]);

function excelColumn(number) {
  let value = number;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function title(sheet, address, text) {
  const range = sheet.getRange(address);
  range.merge();
  range.values = [[text]];
  styleTitle(range);
}

function section(sheet, address, text) {
  const range = sheet.getRange(address);
  range.merge();
  range.values = [[text]];
  styleSection(range);
}

function formulaRow(startColumn, count, callback) {
  return [Array.from({ length: count }, (_, index) => callback(index, excelColumn(startColumn + index)))];
}

function fillMonthDates(sheet, row, startColumn = 2) {
  const first = excelColumn(startColumn);
  const last = excelColumn(startColumn + CALCULATION_MONTHS - 1);
  sheet.getRange(`${first}${row}`).formulas = [["='36月运营模型'!B5"]];
  if (CALCULATION_MONTHS > 1) {
    sheet.getRange(`${excelColumn(startColumn + 1)}${row}:${last}${row}`).formulas = formulaRow(
      startColumn + 1,
      CALCULATION_MONTHS - 1,
      (_, column) => `='36月运营模型'!${column}5`,
    );
  }
  sheet.getRange(`${first}${row}:${last}${row}`).format.numberFormat = "yyyy-mm";
}

function buildSeasonalityAudit(workbook) {
  const sheet = workbook.worksheets.getItem("年度季节曲线");
  section(sheet, "M3:N3", "源期间季节还原");
  sheet.getRange("M4:N4").values = [["源期间覆盖天数", "覆盖天数×季节指数"]];
  styleSection(sheet.getRange("M4:N4"));
  sheet.getRange("M6:M17").formulas = Array.from({ length: 12 }, (_, index) => {
    const row = index + 6;
    return [`=MAX(0,MIN(EOMONTH(DATE(YEAR('核心假设'!$B$44),MONTH(A${row}),1),0),'核心假设'!$B$45)-MAX(DATE(YEAR('核心假设'!$B$44),MONTH(A${row}),1),'核心假设'!$B$44)+1)`];
  });
  sheet.getRange("N6:N17").formulas = Array.from({ length: 12 }, (_, index) => {
    const row = index + 6;
    return [`=M${row}*H${row}`];
  });
  styleCrossSheet(sheet.getRange("M6:M17"));
  styleFormula(sheet.getRange("N6:N17"));
  sheet.getRange("M1:N17").format.columnWidth = 20;
}

function rampFormula(monthIndex) {
  const terms = [];
  for (let cohort = 0; cohort < BASE_COHORTS && cohort <= monthIndex; cohort += 1) {
    const deploymentColumn = excelColumn(10 + cohort);
    const age = Math.min(6, monthIndex - cohort + 1);
    terms.push(`'月度投放计划'!$${deploymentColumn}$5*INDEX('核心假设'!$B$60:$G$60,1,${age})`);
  }
  return `=IF(${excelColumn(2 + monthIndex)}8=0,0,(${terms.join("+")})/${excelColumn(2 + monthIndex)}8)`;
}

function buildOperations(workbook) {
  const sheet = workbook.worksheets.getItem("36月运营模型");
  sheet.getRange("A1:BI30").clear({ applyTo: "all" });
  title(sheet, "A1:BI1", "36月运营模型｜60个月经营底层与债务尾期");
  section(sheet, "A3:BI3", "前36个月为正式报告期；第37至60个月仅延续成熟运营和偿债");
  sheet.getRange("A5:A20").values = [
    ["月份"], ["阶段"], ["新增枪数"], ["运营枪数"], ["运营站数"], ["季节指数"], ["加权爬坡"], ["服务费收入"],
    ["充电交易额"], ["代收代付电费"], ["物业成本"], ["其他运营成本"], ["总部成本"], ["经营税费"], ["经营贡献"], ["CFADS"],
  ];
  styleSection(sheet.getRange("A5:A20"));

  sheet.getRange("B5").formulas = [["='核心假设'!$B$5"]];
  sheet.getRange("C5:BI5").formulas = formulaRow(3, CALCULATION_MONTHS - 1, (_, column) => `=EDATE(${excelColumn(excelColumnNumber(column) - 1)}5,1)`);
  sheet.getRange("B5:BI5").format.numberFormat = "yyyy-mm";
  sheet.getRange("B6:BI6").formulas = formulaRow(2, CALCULATION_MONTHS, (index) => `=IF(${index + 1}<='核心假设'!$B$7,"正式报告","债务尾期")`);
  sheet.getRange("B7:BI7").formulas = formulaRow(2, CALCULATION_MONTHS, (index) => {
    if (index < BASE_COHORTS) return `='月度投放计划'!${excelColumn(10 + index)}$5`;
    return "=0";
  });
  sheet.getRange("B8:BI8").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=SUM($B7:${column}7)`);
  sheet.getRange("B9:BI9").formulas = formulaRow(2, CALCULATION_MONTHS, (index, column) => {
    if (index < BASE_COHORTS) return `=SUM('月度投放计划'!$J$15:${excelColumn(10 + index)}$16)`;
    return `=${excelColumn(2 + BASE_COHORTS - 1)}9`;
  });
  sheet.getRange("B10:BI10").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=IF('核心假设'!$B$42="无季节性",1,IF('核心假设'!$B$42="旺季下调10%",IF(INDEX('年度季节曲线'!$H$6:$H$17,MONTH(${column}$5))>1,INDEX('年度季节曲线'!$H$6:$H$17,MONTH(${column}$5))*(1-10%),INDEX('年度季节曲线'!$H$6:$H$17,MONTH(${column}$5))),INDEX('年度季节曲线'!$H$6:$H$17,MONTH(${column}$5))))`);
  sheet.getRange("B11:BI11").formulas = formulaRow(2, CALCULATION_MONTHS, (index) => rampFormula(index));
  sheet.getRange("B12:BI12").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=${column}8*$B$23*DAY(EOMONTH(${column}$5,0))*${column}10*${column}11`);
  sheet.getRange("B13:BI13").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=IF($B$24=0,0,${column}12/$B$24)`);
  sheet.getRange("B14:BI14").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=MAX(0,${column}13-${column}12)`);
  sheet.getRange("B15:BI15").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=IF('核心假设'!$B$33="固定租金",${column}9*'核心假设'!$B$35,${column}12*'核心假设'!$B$34)`);
  sheet.getRange("B16:BI16").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=${column}12*'核心假设'!$B$36`);
  sheet.getRange("B17:BI17").formulas = formulaRow(2, CALCULATION_MONTHS, () => "='核心假设'!$B$37");
  sheet.getRange("B18:BI18").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=${column}12*'核心假设'!$B$38`);
  sheet.getRange("B19:BI19").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=${column}12-${column}15-${column}16`);
  sheet.getRange("B20:BI20").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=${column}19-${column}17-${column}18`);

  sheet.getRange("A22:B24").values = [["源期间加权季节指数", null], ["年均单枪日服务费", null], ["历史服务费/交易额", null]];
  sheet.getRange("B22").formulas = [["=IF(SUM('年度季节曲线'!$M$6:$M$17)=0,0,SUM('年度季节曲线'!$N$6:$N$17)/SUM('年度季节曲线'!$M$6:$M$17))"]];
  sheet.getRange("B23").formulas = [["=IF($B$22=0,0,IF('核心假设'!$B$41=\"P25\",'历史单枪模型'!$M$5,IF('核心假设'!$B$41=\"加权\",'历史单枪模型'!$M$7,'历史单枪模型'!$M$6))/$B$22)"]];
  sheet.getRange("B24").formulas = [["=IF(SUM('历史原始数据'!$M$2:$M$3050)=0,0,SUM('历史原始数据'!$O$2:$O$3050)/SUM('历史原始数据'!$M$2:$M$3050))"]];
  styleCrossSheet(sheet.getRange("B5:BI20"));
  styleCrossSheet(sheet.getRange("B22:B24"));
  formatCount(sheet.getRange("B7:BI9"));
  formatPercent(sheet.getRange("B10:BI11"));
  formatFinancial(sheet.getRange("B12:BI20"));
  sheet.getRange("B22:B24").format.numberFormat = "0.0000";
  sheet.getRange("AL5:BI20").format.fill = WORKBOOK_STYLE_COLORS.lightGray;
  sheet.getRange("A1:A24").format.columnWidth = 24;
  sheet.getRange("B1:BI24").format.columnWidth = 12;
  sheet.freezePanes.freezeRows(5);
  sheet.freezePanes.freezeColumns(1);
}

function excelColumnNumber(column) {
  return [...column].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);
}

function cohortMatrixFormula({ monthColumn, matrixRow, metadataRow, previousColumn }) {
  if (!previousColumn) return `=IF(${monthColumn}$21<$F${metadataRow},0,IF(${monthColumn}$21=$F${metadataRow},$E${metadataRow},MAX(0,$E${metadataRow}-${monthColumn}${matrixRow + 48}-${monthColumn}${matrixRow + 64})))`;
  return `=IF(${monthColumn}$21<$F${metadataRow},0,IF(${monthColumn}$21=$F${metadataRow},$E${metadataRow},MAX(0,${previousColumn}${matrixRow}-${monthColumn}${matrixRow + 48}-${monthColumn}${matrixRow + 64})))`;
}

function buildLease(workbook) {
  const sheet = workbook.worksheets.getItem("融资租赁与资金缺口");
  sheet.getRange("A1:BI130").clear({ applyTo: "all" });
  title(sheet, "A1:BI1", "融资租赁与资金缺口｜批次摊销、应付款、现金与DSCR");
  section(sheet, "A3:O3", "每个上线月为独立融资批次");
  sheet.getRange("A4:O4").values = [[
    "批次", "上线月", "选定月", "融资租赁原值", "融资额", "放款月", "期限", "年化成本", "月利率",
    "留购款", "月租金", "供应商付款月", "总投资", "渠道费用", "放款时点差",
  ]];
  styleSection(sheet.getRange("A4:O4"));

  for (let index = 0; index < BASE_COHORTS; index += 1) {
    const row = 5 + index;
    const deploymentColumn = excelColumn(10 + index);
    sheet.getRange(`A${row}`).values = [[`批次${String(index + 1).padStart(2, "0")}`]];
    sheet.getRange(`B${row}:O${row}`).formulas = [[
      `='月度投放计划'!${deploymentColumn}$4`,
      `='月度投放计划'!${deploymentColumn}$22`,
      `='月度投放计划'!${deploymentColumn}$15*'单站成本'!$F$5+'月度投放计划'!${deploymentColumn}$16*'单站成本'!$F$6`,
      `=D${row}*'核心假设'!$B$27`,
      `='月度投放计划'!${deploymentColumn}$24`,
      "='核心假设'!$B$28",
      "='核心假设'!$B$29",
      `=H${row}/12`,
      `=D${row}*'核心假设'!$B$32`,
      `=IF(I${row}=0,(E${row}-J${row})/G${row},(E${row}-J${row}/(1+I${row})^G${row})*I${row}/(1-(1+I${row})^-G${row}))`,
      `='月度投放计划'!${deploymentColumn}$23`,
      `='月度投放计划'!${deploymentColumn}$15*'单站成本'!$E$5+'月度投放计划'!${deploymentColumn}$16*'单站成本'!$E$6`,
      `='月度投放计划'!${deploymentColumn}$15*'单站成本'!$D$5+'月度投放计划'!${deploymentColumn}$16*'单站成本'!$D$6`,
      `=(YEAR(F${row})-YEAR(B${row}))*12+MONTH(F${row})-MONTH(B${row})-'核心假设'!$B$30`,
    ]];
  }
  styleCrossSheet(sheet.getRange("B5:O16"));
  sheet.getRange("B5:C16").format.numberFormat = "yyyy-mm";
  sheet.getRange("F5:F16").format.numberFormat = "yyyy-mm";
  sheet.getRange("L5:L16").format.numberFormat = "yyyy-mm";
  formatFinancial(sheet.getRange("D5:E16"));
  formatPercent(sheet.getRange("H5:I16"));
  formatFinancial(sheet.getRange("J5:N16"));

  const matrixSections = [
    { titleRow: 19, dateRow: 21, firstRow: 22, label: "期末租赁余额" },
    { titleRow: 35, dateRow: 37, firstRow: 38, label: "债务支付（租金+末期留购）" },
    { titleRow: 51, dateRow: 53, firstRow: 54, label: "融资成本" },
    { titleRow: 67, dateRow: 69, firstRow: 70, label: "本金偿还" },
    { titleRow: 83, dateRow: 85, firstRow: 86, label: "留购款" },
  ];
  for (const block of matrixSections) {
    section(sheet, `A${block.titleRow}:BI${block.titleRow}`, block.label);
    sheet.getRange(`A${block.dateRow}`).values = [["批次/月"]];
    sheet.getRange(`B${block.dateRow}:BI${block.dateRow}`).formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `='36月运营模型'!${column}$5`);
    sheet.getRange(`B${block.dateRow}:BI${block.dateRow}`).format.numberFormat = "yyyy-mm";
    sheet.getRange(`A${block.firstRow}:A${block.firstRow + BASE_COHORTS - 1}`).values = Array.from({ length: BASE_COHORTS }, (_, index) => [`=A${5 + index}`]);
  }

  for (let cohort = 0; cohort < BASE_COHORTS; cohort += 1) {
    const metadataRow = 5 + cohort;
    const balanceRow = 22 + cohort;
    const serviceRow = 38 + cohort;
    const interestRow = 54 + cohort;
    const principalRow = 70 + cohort;
    const residualRow = 86 + cohort;
    for (let month = 0; month < CALCULATION_MONTHS; month += 1) {
      const column = excelColumn(2 + month);
      const previous = month === 0 ? null : excelColumn(1 + month);
      sheet.getRange(`${column}${balanceRow}`).formulas = [[cohortMatrixFormula({ monthColumn: column, matrixRow: balanceRow, metadataRow, previousColumn: previous })]];
      const beginningBalance = previous ? `${previous}${balanceRow}` : `$E${metadataRow}`;
      sheet.getRange(`${column}${interestRow}`).formulas = [[`=IF(AND(${column}$53>$F${metadataRow},${column}$53<=EDATE($F${metadataRow},$G${metadataRow})),${beginningBalance}*$I${metadataRow},0)`]];
      sheet.getRange(`${column}${principalRow}`).formulas = [[`=IF(AND(${column}$69>$F${metadataRow},${column}$69<=EDATE($F${metadataRow},$G${metadataRow})),$K${metadataRow}-${column}${interestRow},0)`]];
      sheet.getRange(`${column}${residualRow}`).formulas = [[`=IF(${column}$85=EDATE($F${metadataRow},$G${metadataRow}),$J${metadataRow},0)`]];
      sheet.getRange(`${column}${serviceRow}`).formulas = [[`=IF(AND(${column}$37>$F${metadataRow},${column}$37<=EDATE($F${metadataRow},$G${metadataRow})),$K${metadataRow}+IF(${column}$37=EDATE($F${metadataRow},$G${metadataRow}),$J${metadataRow},0),0)`]];
    }
  }
  styleFormula(sheet.getRange("B22:BI97"));
  formatFinancial(sheet.getRange("B22:BI97"));

  section(sheet, "A99:BI99", "月度资金瀑布与偿债覆盖");
  sheet.getRange("A101:A121").values = [
    ["月份"], ["本月形成应付款"], ["供应商付款"], ["期末应付款"], ["融资放款"], ["等额租金"], ["融资成本"], ["本金偿还"],
    ["留购款"], ["债务支付"], ["期末租赁余额"], ["CFADS"], ["DSCR"], ["项目净现金（不含放款）"], ["项目累计现金"],
    ["股东注资前净现金"], ["股东注资前累计现金"], ["最低股东资金需求"], ["最低资金注入后累计现金"], ["最大资金缺口月份"], ["最大资金缺口"],
  ];
  styleSection(sheet.getRange("A101:A121"));
  sheet.getRange("B101:BI101").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `='36月运营模型'!${column}$5`);
  sheet.getRange("B101:BI101").format.numberFormat = "yyyy-mm";
  sheet.getRange("B102:BI102").formulas = formulaRow(2, CALCULATION_MONTHS, (index, column) => `=SUMIFS($M$5:$M$16,$C$5:$C$16,${column}$101)${index === 0 ? "+SUMIFS($M$5:$M$16,$C$5:$C$16,\"<\"&$B$101)" : ""}`);
  sheet.getRange("B103:BI103").formulas = formulaRow(2, CALCULATION_MONTHS, (index, column) => `=SUMIFS($M$5:$M$16,$L$5:$L$16,${column}$101)${index === 0 ? "+SUMIFS($M$5:$M$16,$L$5:$L$16,\"<\"&$B$101)" : ""}`);
  sheet.getRange("B104:BI104").formulas = formulaRow(2, CALCULATION_MONTHS, (index, column) => `=${index === 0 ? "B102-B103" : `${excelColumn(1 + index)}104+${column}102-${column}103`}`);
  sheet.getRange("B105:BI105").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=SUMIFS($E$5:$E$16,$F$5:$F$16,${column}$101)`);
  sheet.getRange("B106:BI106").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=SUM(${column}38:${column}49)-SUM(${column}86:${column}97)`);
  sheet.getRange("B107:BI107").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=SUM(${column}54:${column}65)`);
  sheet.getRange("B108:BI108").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=SUM(${column}70:${column}81)`);
  sheet.getRange("B109:BI109").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=SUM(${column}86:${column}97)`);
  sheet.getRange("B110:BI110").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=SUM(${column}38:${column}49)`);
  sheet.getRange("B111:BI111").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=SUM(${column}22:${column}33)`);
  sheet.getRange("B112:BI112").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `='36月运营模型'!${column}$20`);
  sheet.getRange("B113:BI113").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=IF(${column}110=0,"",${column}112/${column}110)`);
  sheet.getRange("B114:BI114").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=${column}112-${column}103-${column}110`);
  sheet.getRange("B115:BI115").formulas = formulaRow(2, CALCULATION_MONTHS, (index, column) => `=${index === 0 ? `'核心假设'!$B$39+${column}114` : `${excelColumn(1 + index)}115+${column}114`}`);
  sheet.getRange("B116:BI116").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=${column}114+${column}105`);
  sheet.getRange("B117:BI117").formulas = formulaRow(2, CALCULATION_MONTHS, (index, column) => `=${index === 0 ? `'核心假设'!$B$39+${column}116` : `${excelColumn(1 + index)}117+${column}116`}`);
  sheet.getRange("B118").formulas = [["=MAX(0,-MIN(B117:BI117))"]];
  sheet.getRange("B119:BI119").formulas = formulaRow(2, CALCULATION_MONTHS, (_, column) => `=${column}117+$B$118`);
  sheet.getRange("B120").formulas = [["=INDEX(B101:BI101,1,MATCH(MIN(B117:BI117),B117:BI117,0))"]];
  sheet.getRange("B121").formulas = [["=$B$118"]];
  styleCrossSheet(sheet.getRange("B101:BI121"));
  formatFinancial(sheet.getRange("B102:BI112"));
  sheet.getRange("B113:BI113").format.numberFormat = NUMBER_FORMATS.dscr;
  formatFinancial(sheet.getRange("B114:BI119"));
  sheet.getRange("B120").format.numberFormat = "yyyy-mm";
  formatFinancial(sheet.getRange("B121"));

  sheet.getRange("AL21:BI121").format.fill = WORKBOOK_STYLE_COLORS.lightGray;
  sheet.getRange("A1:A121").format.columnWidth = 26;
  sheet.getRange("B1:BI121").format.columnWidth = 12;
  sheet.getRange("A4:O16").format.wrapText = true;
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(1);
}

function scenarioServiceFormula(scenarioRow, monthIndex, monthColumn) {
  const terms = [];
  for (let cohort = 0; cohort < SCENARIO_COHORTS && cohort <= monthIndex; cohort += 1) {
    const shareColumn = excelColumn(13 + cohort);
    const age = Math.min(6, monthIndex - cohort + 1);
    terms.push(`'核心假设'!$B$6*$${shareColumn}${scenarioRow}*INDEX('核心假设'!$B$60:$G$60,1,${age})`);
  }
  return `=(${terms.join("+")})*$B${scenarioRow}*DAY(EOMONTH(${monthColumn}$4,0))*INDEX('年度季节曲线'!$H$6:$H$17,MONTH(${monthColumn}$4))`;
}

function scenarioRentExpression(scenarioRow, cohort) {
  const shareColumn = excelColumn(13 + cohort);
  const principal = `SUM('融资租赁与资金缺口'!$D$5:$D$16)*$${shareColumn}${scenarioRow}*$C${scenarioRow}`;
  const residual = `SUM('融资租赁与资金缺口'!$D$5:$D$16)*$${shareColumn}${scenarioRow}*'核心假设'!$B$32`;
  const rate = `$E${scenarioRow}/12`;
  return `IF(${rate}=0,(${principal}-${residual})/$D${scenarioRow},(${principal}-${residual}/(1+${rate})^$D${scenarioRow})*${rate}/(1-(1+${rate})^-$D${scenarioRow}))`;
}

function scenarioDebtFormula(scenarioRow, monthColumn) {
  const terms = Array.from({ length: SCENARIO_COHORTS }, (_, cohort) => {
    const shareColumn = excelColumn(13 + cohort);
    const disbursement = `EDATE('核心假设'!$B$5,${cohort}+$F${scenarioRow})`;
    const residual = `SUM('融资租赁与资金缺口'!$D$5:$D$16)*$${shareColumn}${scenarioRow}*'核心假设'!$B$32`;
    return `IF(AND(${monthColumn}$4>${disbursement},${monthColumn}$4<=EDATE(${disbursement},$D${scenarioRow})),${scenarioRentExpression(scenarioRow, cohort)}+IF(${monthColumn}$4=EDATE(${disbursement},$D${scenarioRow}),${residual},0),0)`;
  });
  return `=SUM(${terms.join(",")})`;
}

function scenarioDisbursementFormula(scenarioRow, monthColumn) {
  const terms = Array.from({ length: SCENARIO_COHORTS }, (_, cohort) => {
    const shareColumn = excelColumn(13 + cohort);
    return `IF(${monthColumn}$4=EDATE('核心假设'!$B$5,${cohort}+$F${scenarioRow}),SUM('融资租赁与资金缺口'!$D$5:$D$16)*$${shareColumn}${scenarioRow}*$C${scenarioRow},0)`;
  });
  return `SUM(${terms.join(",")})`;
}

function scenarioSupplierPaymentFormula(scenarioRow, monthColumn, monthIndex) {
  const terms = Array.from({ length: SCENARIO_COHORTS }, (_, cohort) => {
    const shareColumn = excelColumn(13 + cohort);
    const paymentMonth = `EDATE('核心假设'!$B$5,${cohort}-1+'核心假设'!$B$31)`;
    const timingTest = monthIndex === 0 ? `${paymentMonth}<=${monthColumn}$4` : `${monthColumn}$4=${paymentMonth}`;
    return `IF(${timingTest},SUM('融资租赁与资金缺口'!$M$5:$M$16)*$${shareColumn}${scenarioRow},0)`;
  });
  return `=SUM(${terms.join(",")})`;
}

function termRentExpression(metadataRow, termRow) {
  const financeSheet = "'融资租赁与资金缺口'!";
  return `IF(${financeSheet}$I$${metadataRow}=0,(${financeSheet}$E$${metadataRow}-${financeSheet}$J$${metadataRow})/$A${termRow},(${financeSheet}$E$${metadataRow}-${financeSheet}$J$${metadataRow}/(1+${financeSheet}$I$${metadataRow})^$A${termRow})*${financeSheet}$I$${metadataRow}/(1-(1+${financeSheet}$I$${metadataRow})^-$A${termRow}))`;
}

function termDebtFormula(termRow, monthColumn) {
  const terms = Array.from({ length: BASE_COHORTS }, (_, index) => {
    const metadataRow = 5 + index;
    return `IF(AND(${monthColumn}$46>'融资租赁与资金缺口'!$F$${metadataRow},${monthColumn}$46<=EDATE('融资租赁与资金缺口'!$F$${metadataRow},$A${termRow})),${termRentExpression(metadataRow, termRow)}+IF(${monthColumn}$46=EDATE('融资租赁与资金缺口'!$F$${metadataRow},$A${termRow}),'融资租赁与资金缺口'!$J$${metadataRow},0),0)`;
  });
  return `=SUM(${terms.join(",")})`;
}

function termBalanceFormula(termRow, monthColumn) {
  const terms = Array.from({ length: BASE_COHORTS }, (_, index) => {
    const metadataRow = 5 + index;
    const disb = `'融资租赁与资金缺口'!$F$${metadataRow}`;
    const principal = `'融资租赁与资金缺口'!$E$${metadataRow}`;
    const rate = `'融资租赁与资金缺口'!$I$${metadataRow}`;
    const elapsed = `((YEAR(${monthColumn}$46)-YEAR(${disb}))*12+MONTH(${monthColumn}$46)-MONTH(${disb}))`;
    const rent = termRentExpression(metadataRow, termRow);
    return `IF(${monthColumn}$46<${disb},0,IF(${monthColumn}$46=${disb},${principal},IF(${elapsed}>=$A${termRow},0,MAX(0,IF(${rate}=0,${principal}-${rent}*${elapsed},${principal}*(1+${rate})^${elapsed}-${rent}*((1+${rate})^${elapsed}-1)/${rate})))))`;
  });
  return `=SUM(${terms.join(",")})`;
}

function buildScenarioHelpers(sheet) {
  const firstHelperColumn = 32;
  const lastHelperColumn = firstHelperColumn + CALCULATION_MONTHS - 1;
  const first = excelColumn(firstHelperColumn);
  const last = excelColumn(lastHelperColumn);
  sheet.getRange(`${first}4:${last}4`).formulas = formulaRow(firstHelperColumn, CALCULATION_MONTHS, (_, column) => `='36月运营模型'!${excelColumn(2 + excelColumnNumber(column) - firstHelperColumn)}$5`);
  sheet.getRange(`${first}4:${last}4`).format.numberFormat = "yyyy-mm";

  for (let scenario = 0; scenario < 6; scenario += 1) {
    const scenarioRow = 5 + scenario;
    const serviceRow = 5 + scenario * 6;
    const cfadsRow = serviceRow + 1;
    const debtRow = serviceRow + 2;
    const dscrRow = serviceRow + 3;
    const supplierRow = serviceRow + 4;
    const cashRow = serviceRow + 5;
    sheet.getRange(`AE${serviceRow}:AE${cashRow}`).values = [[`${sheet.getRange(`A${scenarioRow}`).values[0][0]}服务费`], ["CFADS"], ["债务支付"], ["DSCR"], ["供应商付款"], ["注资前累计现金"]];
    for (let month = 0; month < CALCULATION_MONTHS; month += 1) {
      const column = excelColumn(firstHelperColumn + month);
      sheet.getRange(`${column}${serviceRow}`).formulas = [[scenarioServiceFormula(scenarioRow, month, column)]];
      const activeShareEnd = excelColumn(13 + Math.min(month, SCENARIO_COHORTS - 1));
      const stations = `SUM('月度投放计划'!$J$15:$U$16)*SUM($M${scenarioRow}:$${activeShareEnd}${scenarioRow})`;
      sheet.getRange(`${column}${cfadsRow}`).formulas = [[`=${column}${serviceRow}-IF($G${scenarioRow}="固定租金",${stations}*'核心假设'!$B$35,${column}${serviceRow}*'核心假设'!$B$34)-${column}${serviceRow}*$H${scenarioRow}-'核心假设'!$B$37-${column}${serviceRow}*'核心假设'!$B$38`]];
      sheet.getRange(`${column}${debtRow}`).formulas = [[scenarioDebtFormula(scenarioRow, column)]];
      sheet.getRange(`${column}${dscrRow}`).formulas = [[`=IF(${column}${debtRow}=0,"",${column}${cfadsRow}/${column}${debtRow})`]];
      sheet.getRange(`${column}${supplierRow}`).formulas = [[scenarioSupplierPaymentFormula(scenarioRow, column, month)]];
      const cashChange = `${column}${cfadsRow}-${column}${debtRow}+${scenarioDisbursementFormula(scenarioRow, column)}-${column}${supplierRow}`;
      sheet.getRange(`${column}${cashRow}`).formulas = [[`=${month === 0 ? `'核心假设'!$B$39+${cashChange}` : `${excelColumn(firstHelperColumn + month - 1)}${cashRow}+${cashChange}`}`]];
    }
    sheet.getRange(`I${scenarioRow}`).formulas = [[`=SUM(${first}${serviceRow}:${excelColumn(firstHelperColumn + REPORT_MONTHS - 1)}${serviceRow})`]];
    sheet.getRange(`J${scenarioRow}`).formulas = [[`=IF(SUM(${first}${debtRow}:${last}${debtRow})=0,"",SUM(${first}${cfadsRow}:${last}${cfadsRow})/SUM(${first}${debtRow}:${last}${debtRow}))`]];
    sheet.getRange(`K${scenarioRow}`).formulas = [[`=MAX(0,-MIN(${first}${cashRow}:${last}${cashRow}))`]];
  }

  sheet.getRange(`${first}46:${last}46`).formulas = formulaRow(firstHelperColumn, CALCULATION_MONTHS, (_, column) => `='36月运营模型'!${excelColumn(2 + excelColumnNumber(column) - firstHelperColumn)}$5`);
  sheet.getRange(`${first}46:${last}46`).format.numberFormat = "yyyy-mm";
  for (let term = 0; term < 3; term += 1) {
    const termRow = 15 + term;
    const debtRow = 47 + term * 5;
    const balanceRow = debtRow + 1;
    const dscrRow = debtRow + 2;
    const cashRow = debtRow + 3;
    sheet.getRange(`AE${debtRow}:AE${cashRow}`).values = [[`${sheet.getRange(`A${termRow}`).values[0][0]}期债务支付`], ["期末余额"], ["DSCR"], ["注资前累计现金"]];
    for (let month = 0; month < CALCULATION_MONTHS; month += 1) {
      const column = excelColumn(firstHelperColumn + month);
      sheet.getRange(`${column}${debtRow}`).formulas = [[termDebtFormula(termRow, column)]];
      sheet.getRange(`${column}${balanceRow}`).formulas = [[termBalanceFormula(termRow, column)]];
      sheet.getRange(`${column}${dscrRow}`).formulas = [[`=IF(${column}${debtRow}=0,"",'36月运营模型'!${excelColumn(2 + month)}$20/${column}${debtRow})`]];
      const change = `'36月运营模型'!${excelColumn(2 + month)}$20-'融资租赁与资金缺口'!${excelColumn(2 + month)}$103-${column}${debtRow}+'融资租赁与资金缺口'!${excelColumn(2 + month)}$105`;
      sheet.getRange(`${column}${cashRow}`).formulas = [[`=${month === 0 ? `'核心假设'!$B$39+${change}` : `${excelColumn(firstHelperColumn + month - 1)}${cashRow}+${change}`}`]];
    }
    const rents = Array.from({ length: BASE_COHORTS }, (_, index) => termRentExpression(5 + index, termRow));
    sheet.getRange(`B${termRow}`).formulas = [[`=SUM(${rents.join(",")})`]];
    sheet.getRange(`C${termRow}`).formulas = [[`=SUM(${first}${debtRow}:${excelColumn(firstHelperColumn + REPORT_MONTHS - 1)}${debtRow})`]];
    sheet.getRange(`D${termRow}`).formulas = [[`=MIN(${first}${dscrRow}:${last}${dscrRow})`]];
    sheet.getRange(`E${termRow}`).formulas = [[`=${excelColumn(firstHelperColumn + REPORT_MONTHS - 1)}${balanceRow}`]];
    sheet.getRange(`F${termRow}`).formulas = [[`=MAX(0,-MIN(${first}${cashRow}:${last}${cashRow}))`]];
    sheet.getRange(`G${termRow}`).formulas = [[`=SUM(${first}${debtRow}:${last}${debtRow})-SUM('融资租赁与资金缺口'!$E$5:$E$16)`]];
    sheet.getRange(`H${termRow}`).formulas = [["=SUM('36月运营模型'!$B$12:$AK$12)"]];
  }
  styleCrossSheet(sheet.getRange(`${first}4:${last}66`));
  formatFinancial(sheet.getRange(`${first}5:${last}66`));
}

function buildScenariosChecksAndSources(workbook) {
  const sheet = workbook.worksheets.getItem("情景分析、检查与来源");
  const deploymentSheet = workbook.worksheets.getItem("月度投放计划");
  const oldSources = sheet.getRange("A20:H500").values.filter((row) => row[0]);
  sheet.getRange("A1:CM500").clear({ applyTo: "all" });
  title(sheet, "A1:K1", "情景分析、检查与来源｜承销压力、期限比较与审计状态");
  section(sheet, "A3:AD3", "六情景矩阵（假设可见，结果由公式计算）");
  sheet.getRange("A4:L4").values = [["情景", "年均单枪日收入", "融资比例", "期限", "年化成本", "放款延迟", "物业方式", "其他运营成本率", "三年服务费", "全期DSCR", "峰值资金缺口", "部署月数"]];
  styleSection(sheet.getRange("A4:L4"));
  sheet.getRange("M4:AD4").values = [[...Array.from({ length: SCENARIO_COHORTS }, (_, index) => `上线M${index + 1}`)]];
  styleSection(sheet.getRange("M4:AD4"));
  sheet.getRange("A5:A10").values = [["基准"], ["保守收入"], ["融资收缩"], ["放款延迟"], ["慢建设"], ["综合压力"]];
  const scenarioFormulas = [
    ["='36月运营模型'!$B$23", "='核心假设'!$B$27", "='核心假设'!$B$28", "='核心假设'!$B$29", "='核心假设'!$B$30", "='核心假设'!$B$33", "='核心假设'!$B$36", "=12"],
    ["=IF('36月运营模型'!$B$22=0,0,'历史单枪模型'!$M$5/'36月运营模型'!$B$22)", "='核心假设'!$B$27", "='核心假设'!$B$28", "='核心假设'!$B$29", "='核心假设'!$B$30", "='核心假设'!$B$33", "='核心假设'!$B$36", "=12"],
    ["='36月运营模型'!$B$23", "=80%", "='核心假设'!$B$28", "='核心假设'!$B$29", "='核心假设'!$B$30", "='核心假设'!$B$33", "='核心假设'!$B$36", "=12"],
    ["='36月运营模型'!$B$23", "='核心假设'!$B$27", "='核心假设'!$B$28", "='核心假设'!$B$29", "=2", "='核心假设'!$B$33", "='核心假设'!$B$36", "=12"],
    ["='36月运营模型'!$B$23", "='核心假设'!$B$27", "='核心假设'!$B$28", "='核心假设'!$B$29", "='核心假设'!$B$30", "='核心假设'!$B$33", "='核心假设'!$B$36", "=18"],
    ["=IF('36月运营模型'!$B$22=0,0,'历史单枪模型'!$M$5/'36月运营模型'!$B$22*90%)", "=80%", "=36", "=10%", "=2", "=\"分成\"", "=15%", "=18"],
  ];
  for (let index = 0; index < 6; index += 1) {
    const row = 5 + index;
    const formulas = scenarioFormulas[index];
    sheet.getRange(`B${row}:H${row}`).formulas = [[...formulas.slice(0, 7)]];
    sheet.getRange(`L${row}`).formulas = [[formulas[7]]];
    for (let cohort = 0; cohort < SCENARIO_COHORTS; cohort += 1) {
      const column = excelColumn(13 + cohort);
      const slow = index === 4 || index === 5;
      if (slow) sheet.getRange(`${column}${row}`).formulas = [[`=${SLOW_ROLLOUT[cohort] * 100}%`]];
      else if (cohort < BASE_COHORTS) sheet.getRange(`${column}${row}`).formulas = [[`='核心假设'!${excelColumn(2 + cohort)}$55`]];
      else sheet.getRange(`${column}${row}`).formulas = [["=0"]];
    }
  }
  styleFormula(sheet.getRange("B5:H10"));
  styleCrossSheet(sheet.getRange("B5:H6"));
  styleCrossSheet(sheet.getRange("B7"));
  styleCrossSheet(sheet.getRange("D7:H7"));
  styleCrossSheet(sheet.getRange("B8:E8"));
  styleCrossSheet(sheet.getRange("G8:H8"));
  styleCrossSheet(sheet.getRange("B9:H9"));
  styleCrossSheet(sheet.getRange("B10"));
  for (const address of ["C7", "F8", "C10", "D10", "E10", "F10", "G10", "H10"]) {
    workbook.comments.addThread(
      { cell: sheet.getRange(address) },
      `Source: Task 9 approved scenario constant | As-of: 2026-08-16 | URL: ${DESIGN_URL} | Accessed: 2026-08-16 | Notes: Approved stress-case definition; black formula text denotes an in-sheet design constant.`,
    );
  }
  workbook.comments.addThread(
    { cell: sheet.getRange("L4") },
    `Source: Task 9 approved deployment constant | As-of: 2026-08-16 | URL: ${DESIGN_URL} | Accessed: 2026-08-16 | Notes: Header comment covers deployment-month constants in L5:L10.`,
  );
  workbook.comments.addThread(
    { cell: sheet.getRange("M4") },
    `Source: Task 9 approved deployment constant | As-of: 2026-08-16 | URL: ${DESIGN_URL} | Accessed: 2026-08-16 | Notes: Header comment covers approved slow-build rollout constants in M9:AD10.`,
  );
  styleFormula(sheet.getRange("L5:AD10"));
  formatFinancial(sheet.getRange("B5:B10"));
  formatPercent(sheet.getRange("C5:C10"));
  formatPercent(sheet.getRange("E5:E10"));
  formatPercent(sheet.getRange("H5:H10"));
  formatFinancial(sheet.getRange("I5:I10"));
  sheet.getRange("J5:J10").format.numberFormat = NUMBER_FORMATS.dscr;
  formatFinancial(sheet.getRange("K5:K10"));
  formatPercent(sheet.getRange("M5:AD10"));

  section(sheet, "A13:H13", "18/24/36个月期限比较");
  sheet.getRange("A14:H14").values = [["期限", "月租金合计", "三年债务服务", "最低月度DSCR", "三年末余额", "峰值资金缺口", "全期融资成本", "三年服务费"]];
  styleSection(sheet.getRange("A14:H14"));
  sheet.getRange("A15:A17").values = [[18], [24], [36]];
  styleFormula(sheet.getRange("B15:H17"));
  formatFinancial(sheet.getRange("B15:C17"));
  sheet.getRange("D15:D17").format.numberFormat = NUMBER_FORMATS.dscr;
  formatFinancial(sheet.getRange("E15:H17"));

  buildScenarioHelpers(sheet);

  deploymentSheet.getRange("AI27").values = [["首批前6月实际上线"]];
  deploymentSheet.getRange("AI28:AI83").formulas = Array.from({ length: 56 }, (_, index) => {
    const row = 28 + index;
    return [`=IF(INDEX('城市分配'!$D$6:$D$61,MATCH($A${row},'城市分配'!$B$6:$B$61,0))="是",--(SUM($J${row}:$O${row})+SUM($V${row}:$AA${row})>0),0)`];
  });
  styleSection(deploymentSheet.getRange("AI27"));
  styleCrossSheet(deploymentSheet.getRange("AI28:AI83"));
  formatCount(deploymentSheet.getRange("AI28:AI83"));
  deploymentSheet.getRange("AI1:AI83").format.columnWidth = 19;

  sheet.getRange("A19").values = [["模型总状态"]];
  sheet.getRange("B19").formulas = [["=IF(COUNTIF(F22:F38,\"FAIL\")=0,\"PASS\",\"FAIL\")"]];
  section(sheet, "A20:H20", "至少17项公式检查");
  sheet.getRange("A21:H21").values = [["检查项", "实际", "预期", "差额", "容差", "状态", "修复位置", "说明"]];
  styleSection(sheet.getRange("A21:H21"));
  const checks = [
    ["新增枪数累计精确等于目标", "=SUM('36月运营模型'!$B$7:$BI$7)", "='核心假设'!$B$6", 0, "36月运营模型!B7:BI7", "投放期后新增为0"],
    ["城市枪数/站数非负且站数为整数", "=COUNTIF('城市分配'!$J$6:$J$61,\"<0\")+COUNTIF('城市分配'!$L$6:$M$61,\"<0\")", "=0", 0, "城市分配!J6:M61", "2枪/4枪站数由ROUND公式生成整数"],
    ["每城站型枪数回归目标", "=COUNTIF('城市分配'!$O$6:$O$61,\"<>0\")", "=0", 0, "城市分配!O6:O61", "2×2枪站+4×4枪站=目标，亦保证偶数枪"],
    ["首批26城前6月实际上线", "='核心假设'!$B$46-SUM('月度投放计划'!$AI$28:$AI$83)", "=0", 0, "月度投放计划!J28:O83,V28:AA83,AI28:AI83", "直接检查每个固定城市前6月实际2枪/4枪站数"],
    ["月度新增与城市批次明细一致", "=SUM('月度投放计划'!$J$17:$U$17)+SUM('月度投放计划'!$AH$28:$AH$83)", "=0", 0, "月度投放计划!J17:AH83", "月度站型和逐城分配同时回归"],
    ["总投资与原值成本口径", "=SUM('融资租赁与资金缺口'!$M$5:$M$16)", "=SUM('月度投放计划'!$J$15:$U$15)*'单站成本'!$E$5+SUM('月度投放计划'!$J$16:$U$16)*'单站成本'!$E$6", 0.01, "融资租赁与资金缺口!D5:M16", "总投资含渠道，租赁原值仅设备工程"],
    ["应付形成/付款/余额滚动", "=SUM('融资租赁与资金缺口'!$B$102:$BI$102)-SUM('融资租赁与资金缺口'!$B$103:$BI$103)-'融资租赁与资金缺口'!$BI$104", "=0", 0.01, "融资租赁与资金缺口!102:104", "供应商选定形成应付并按t+2付款"],
    ["放款比例与延迟", "=MAX(ABS(SUM('融资租赁与资金缺口'!$E$5:$E$16)-SUM('融资租赁与资金缺口'!$D$5:$D$16)*'核心假设'!$B$27),ABS(MIN('融资租赁与资金缺口'!$O$5:$O$16)),ABS(MAX('融资租赁与资金缺口'!$O$5:$O$16)))", "=0", 0.01, "融资租赁与资金缺口!E5:O16", "融资额=合格原值×比例，放款月=上线月+延迟"],
    ["逐批摊销及末期归零", "=MAX('融资租赁与资金缺口'!$BI$22:$BI$33)", "=0", 0.01, "融资租赁与资金缺口!22:97", "末期租金及留购后逐批余额归零"],
    ["物业固定租金与分成互斥", "=SUM('36月运营模型'!$B$15:$BI$15)", "=IF('核心假设'!$B$33=\"固定租金\",SUM('36月运营模型'!$B$9:$BI$9)*'核心假设'!$B$35,SUM('36月运营模型'!$B$12:$BI$12)*'核心假设'!$B$34)", 0.01, "36月运营模型!15:15", "同月只命中一种物业成本"],
    ["12个月季节指数均值", "=AVERAGE('年度季节曲线'!$H$6:$H$17)", "=1", 0.000001, "年度季节曲线!H6:H17", "年度形状归一为1.0000"],
    ["历史总金额拆分", "=SUM('历史原始数据'!$M$2:$M$3050)-SUM('历史原始数据'!$N$2:$N$3050)-SUM('历史原始数据'!$O$2:$O$3050)", "=0", 1, "历史原始数据!M2:O3050", "总金额=电费+服务费，允许源系统1元内尾差"],
    ["月度净现金与累计现金滚动", "=SUM('融资租赁与资金缺口'!$B$114:$BI$114)+'核心假设'!$B$39-'融资租赁与资金缺口'!$BI$115", "=0", 0.01, "融资租赁与资金缺口!114:117", "项目与股东投入前两条曲线均按月滚动"],
    ["最低股东资金注入后不为负", "=MIN('融资租赁与资金缺口'!$B$119:$BI$119)", "=0", 0.01, "融资租赁与资金缺口!118:119", "最低股东资金填补峰值缺口"],
    ["36月报告/60月尾期边界", "=COUNTIF('36月运营模型'!$B$6:$AK$6,\"正式报告\")+COUNTIF('36月运营模型'!$AL$6:$BI$6,\"债务尾期\")", "='核心假设'!$B$8", 0, "36月运营模型!B5:BI20", "前36月正式报告，后24月债务尾期"],
    ["强制来源与代理说明完整", "=COUNTIF($A$43:$A$500,\"SRC-*\")-COUNTIFS($A$43:$A$500,\"SRC-*\",$G$43:$G$500,\"<>\")", "=0", 0, "情景分析、检查与来源!A43:I500", "每个来源ID均保留Ref；代理和缺失在Notes披露"],
    ["六情景峰值资金缺口勾稽", "=MAX(ABS($K$5-MAX(0,-MIN($AF$10:$CM$10))),ABS($K$6-MAX(0,-MIN($AF$16:$CM$16))),ABS($K$7-MAX(0,-MIN($AF$22:$CM$22))),ABS($K$8-MAX(0,-MIN($AF$28:$CM$28))),ABS($K$9-MAX(0,-MIN($AF$34:$CM$34))),ABS($K$10-MAX(0,-MIN($AF$40:$CM$40))))", "=0", 0.01, "情景分析、检查与来源!K5:K10,AF10:CM40", "逐情景从月度累计现金独立重算峰值缺口并与结果列勾稽"],
  ];
  sheet.getRange("A22:A38").values = checks.map((row) => [row[0]]);
  sheet.getRange("B22:B38").formulas = checks.map((row) => [row[1]]);
  sheet.getRange("C22:C38").formulas = checks.map((row) => [row[2]]);
  sheet.getRange("D22:D38").formulas = checks.map((_, index) => [`=B${22 + index}-C${22 + index}`]);
  sheet.getRange("E22:E38").values = checks.map((row) => [row[3]]);
  sheet.getRange("F22:F38").formulas = checks.map((_, index) => [`=IF(ABS(D${22 + index})<=E${22 + index},"PASS","FAIL")`]);
  sheet.getRange("G22:H38").values = checks.map((row) => [row[4], row[5]]);
  styleCrossSheet(sheet.getRange("B22:C38"));
  styleFormula(sheet.getRange("D22:F38"));
  styleCheck(sheet.getRange("A22:H38"));
  sheet.getRange("B22:E38").format.numberFormat = "0.000000;[Red](0.000000);-";

  sheet.getRange("A39:H39").values = [["外部构建门禁（不计入模型总状态）", "Node workbook.inspect", "", "", "", "由测试单独判定", "tests/workbook_formulas.test.mjs", "五类Excel公式错误扫描"]];
  sheet.getRange("A39:H39").format = {
    fill: "#FFF2CC",
    font: { bold: true, color: "#C00000", name: "Arial" },
    wrapText: true,
  };

  section(sheet, "A40:I40", "来源目录与范围口径");
  sheet.getRange("A42:I42").values = [["Item", "Value", "Units", "Period/As-of", "Source Type", "Source Name", "Ref", "Notes", "Accessed"]];
  styleSection(sheet.getRange("A42:I42"));
  const scopeRows = [
    ["Scope-Property", "2005年12月31日前住宅物业", "范围", "项目设计口径", "设计规格", "项目设计规格", "docs/superpowers/specs/2026-08-16-charge-station-financing-model-design.md", "若公开数据缺少精确房龄，老旧小区改造等代理必须显式标记", "2026-08-16"],
    ["Scope-Hainan-1", "海口", "城市", "首批城市", "用户范围", "首批城市拆分", "核心假设/城市分配", "海南口径拆分为海口和三亚，不以海南省作为单一城市", "2026-08-16"],
    ["Scope-Hainan-2", "三亚", "城市", "首批城市", "用户范围", "首批城市拆分", "核心假设/城市分配", "海南口径拆分为海口和三亚，不以海南省作为单一城市", "2026-08-16"],
  ];
  sheet.getRange("A43:I45").values = scopeRows;
  if (oldSources.length > 0) {
    sheet.getRange(`A46:I${45 + oldSources.length}`).values = oldSources.map((row) => [row[0], row[2], "", row[3], row[1], row[2], row[4], `${row[6] ?? ""}${row[7] ? ` | 使用位置: ${row[7]}` : ""}`, row[5]]);
  }
  sheet.getRange("G43:G500").format.font = { color: "#FF0000", name: "Arial" };
  sheet.getRange("F43:I500").format.wrapText = true;

  sheet.getRange("A1:A500").format.columnWidth = 22;
  sheet.getRange("B1:F500").format.columnWidth = 18;
  sheet.getRange("G1:G500").format.columnWidth = 38;
  sheet.getRange("H1:H500").format.columnWidth = 46;
  sheet.getRange("I1:I500").format.columnWidth = 14;
  sheet.getRange("M1:AD10").format.columnWidth = 10;
  sheet.getRange("AE1:CM66").format.columnWidth = 11;
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(1);
}

function addChart(sheet, type, range, titleText, start, end, yNumberFormat) {
  const chart = sheet.charts.add(type, sheet.getRange(range));
  chart.setPosition(start, end);
  chart.title = titleText;
  chart.titleTextStyle.fontSize = 12;
  chart.hasLegend = true;
  chart.xAxis = { axisType: "textAxis", textStyle: { fontSize: 9 } };
  chart.yAxis = { numberFormatCode: yNumberFormat, textStyle: { fontSize: 9 } };
  return chart;
}

function buildSummary(workbook) {
  const sheet = workbook.worksheets.getItem("融资摘要");
  sheet.getRange("A1:AF80").clear({ applyTo: "all" });
  sheet.charts.deleteAll();
  title(sheet, "A1:R1", "融资摘要｜30,000枪三年经营、融资与资金缺口");
  sheet.getRange("A3").values = [["模型状态"]];
  sheet.getRange("B3").formulas = [["='情景分析、检查与来源'!$B$19"]];
  const warning = sheet.getRange("D3:R3");
  warning.merge();
  warning.formulas = [["=IF(OR('核心假设'!$B$37=0,'核心假设'!$B$38=0),\"⚠ 当前总部成本或经营税费为0；录入前不得视为完整承销结果\",\"总部成本与经营税费已录入\")"]];
  warning.format = { fill: "#FFFF00", font: { bold: true, color: "#C00000", name: "Arial" }, wrapText: true };
  styleSection(sheet.getRange("A3:B3"));

  sheet.getRange("A5:A12").values = [["新增目标枪数"], ["总投资"], ["三年服务费"], ["三年CFADS"], ["租赁放款"], ["最低股东资金"], ["峰值缺口月份"], ["峰值缺口"]];
  sheet.getRange("B5:B12").formulas = [["='核心假设'!$B$6"], ["=SUM('融资租赁与资金缺口'!$M$5:$M$16)"], ["=SUM('36月运营模型'!$B$12:$AK$12)"], ["=SUM('36月运营模型'!$B$20:$AK$20)"], ["=SUM('融资租赁与资金缺口'!$B$105:$BI$105)"], ["='融资租赁与资金缺口'!$B$118"], ["='融资租赁与资金缺口'!$B$120"], ["='融资租赁与资金缺口'!$B$121"]];
  sheet.getRange("A13").values = [["不可融资及自有资金承担"]];
  sheet.getRange("B13").formulas = [["=SUM('融资租赁与资金缺口'!$M$5:$M$16)-SUM('融资租赁与资金缺口'!$E$5:$E$16)"]];
  sheet.getRange("D5:D12").values = [["第1年DSCR"], ["第2年DSCR"], ["第3年DSCR"], ["债务尾期DSCR"], ["全期限DSCR"], ["最低月度DSCR"], ["最低DSCR月份"], ["三年末租赁余额"]];
  sheet.getRange("E5:E12").formulas = [
    ["=IF(SUM('融资租赁与资金缺口'!$B$110:$M$110)=0,\"\",SUM('36月运营模型'!$B$20:$M$20)/SUM('融资租赁与资金缺口'!$B$110:$M$110))"],
    ["=IF(SUM('融资租赁与资金缺口'!$N$110:$Y$110)=0,\"\",SUM('36月运营模型'!$N$20:$Y$20)/SUM('融资租赁与资金缺口'!$N$110:$Y$110))"],
    ["=IF(SUM('融资租赁与资金缺口'!$Z$110:$AK$110)=0,\"\",SUM('36月运营模型'!$Z$20:$AK$20)/SUM('融资租赁与资金缺口'!$Z$110:$AK$110))"],
    ["=IF(SUM('融资租赁与资金缺口'!$AL$110:$BI$110)=0,\"\",SUM('36月运营模型'!$AL$20:$BI$20)/SUM('融资租赁与资金缺口'!$AL$110:$BI$110))"],
    ["=IF(SUM('融资租赁与资金缺口'!$B$110:$BI$110)=0,\"\",SUM('36月运营模型'!$B$20:$BI$20)/SUM('融资租赁与资金缺口'!$B$110:$BI$110))"],
    ["=MIN('融资租赁与资金缺口'!$B$113:$BI$113)"],
    ["=INDEX('融资租赁与资金缺口'!$B$101:$BI$101,1,MATCH(E10,'融资租赁与资金缺口'!$B$113:$BI$113,0))"],
    ["='融资租赁与资金缺口'!$AK$111"],
  ];
  sheet.getRange("G5:G12").values = [["全期限融资成本"], ["全期限留购款"], ["三年经营贡献"], ["三年经营贡献率"], ["基准情景服务费"], ["综合压力峰值缺口"], ["18个月最低DSCR"], ["36个月峰值缺口"]];
  sheet.getRange("H5:H12").formulas = [["=SUM('融资租赁与资金缺口'!$B$107:$BI$107)"], ["=SUM('融资租赁与资金缺口'!$B$109:$BI$109)"], ["=SUM('36月运营模型'!$B$19:$AK$19)"], ["=IF(B7=0,0,H7/B7)"], ["='情景分析、检查与来源'!$I$5"], ["='情景分析、检查与来源'!$K$10"], ["='情景分析、检查与来源'!$D$15"], ["='情景分析、检查与来源'!$F$17"]];
  styleCrossSheet(sheet.getRange("B5:B12"));
  styleCrossSheet(sheet.getRange("E5:E12"));
  styleCrossSheet(sheet.getRange("H5:H12"));
  formatCount(sheet.getRange("B5"));
  formatFinancial(sheet.getRange("B6:B10"));
  sheet.getRange("B11").format.numberFormat = "yyyy-mm";
  formatFinancial(sheet.getRange("B12"));
  formatFinancial(sheet.getRange("B13"));
  sheet.getRange("E5:E10").format.numberFormat = NUMBER_FORMATS.dscr;
  sheet.getRange("E11").format.numberFormat = "yyyy-mm";
  formatFinancial(sheet.getRange("E12"));
  formatFinancial(sheet.getRange("H5:H7"));
  formatPercent(sheet.getRange("H8"));
  formatFinancial(sheet.getRange("H9:H10"));
  sheet.getRange("H11").format.numberFormat = NUMBER_FORMATS.dscr;
  formatFinancial(sheet.getRange("H12"));

  sheet.getRange("T4:V4").values = [["月份", "新增枪数", "累计枪数"]];
  for (let index = 0; index < 12; index += 1) {
    const row = 5 + index;
    const sourceColumn = excelColumn(2 + index);
    sheet.getRange(`T${row}:V${row}`).formulas = [[`=TEXT('36月运营模型'!${sourceColumn}5,"yyyy-mm")`, `='36月运营模型'!${sourceColumn}7`, `='36月运营模型'!${sourceColumn}8`]];
  }
  sheet.getRange("T20:W20").values = [["月份", "服务费", "CFADS", "债务支付"]];
  sheet.getRange("X20:Y20").values = [["月份", "股东投入前累计现金"]];
  sheet.getRange("Z20:AB20").values = [["月份", "月度DSCR", "1.0x参考线"]];
  for (let index = 0; index < CALCULATION_MONTHS; index += 1) {
    const sourceColumn = excelColumn(2 + index);
    const row1 = 21 + index;
    const monthLabel = `=TEXT('36月运营模型'!${sourceColumn}5,"yyyy-mm")`;
    sheet.getRange(`T${row1}:W${row1}`).formulas = [[monthLabel, `='36月运营模型'!${sourceColumn}12`, `='36月运营模型'!${sourceColumn}20`, `='融资租赁与资金缺口'!${sourceColumn}110`]];
    sheet.getRange(`X${row1}:Y${row1}`).formulas = [[monthLabel, `='融资租赁与资金缺口'!${sourceColumn}117`]];
    sheet.getRange(`Z${row1}:AB${row1}`).formulas = [[monthLabel, `='融资租赁与资金缺口'!${sourceColumn}113`, "=1"]];
  }
  sheet.getRange("AC4:AF4").values = [["期限", "最低DSCR指数", "峰值缺口指数", "融资成本指数"]];
  for (let index = 0; index < 3; index += 1) {
    const row = 5 + index;
    const sourceRow = 15 + index;
    sheet.getRange(`AC${row}:AF${row}`).formulas = [[
      `='情景分析、检查与来源'!A${sourceRow}`,
      `='情景分析、检查与来源'!D${sourceRow}/'情景分析、检查与来源'!$D$17`,
      `='情景分析、检查与来源'!F${sourceRow}/'情景分析、检查与来源'!$F$17`,
      `='情景分析、检查与来源'!G${sourceRow}/'情景分析、检查与来源'!$G$17`,
    ]];
  }
  sheet.getRange("T5:T16").format.numberFormat = "yyyy-mm";
  sheet.getRange("T21:T80").format.numberFormat = "yyyy-mm";
  sheet.getRange("X21:X80").format.numberFormat = "yyyy-mm";
  sheet.getRange("Z21:Z80").format.numberFormat = "yyyy-mm";
  sheet.getRange("AA21:AB80").format.numberFormat = NUMBER_FORMATS.dscr;

  addChart(sheet, "line", "T4:V16", "12个月新增与累计枪数", "A15", "I30", "#,##0");
  addChart(sheet, "line", "T20:W80", "60个月服务费、CFADS与债务支付（元）", "J15", "R30", "¥#,##0");
  addChart(sheet, "line", "X20:Y80", "股东投入前累计现金（元）", "A32", "I47", "¥#,##0");
  addChart(sheet, "line", "Z20:AB80", "月度DSCR与1.0x参考线", "J32", "R47", "0.00x");
  addChart(sheet, "bar", "AC4:AF7", "期限比较指数（36个月=100%）", "A49", "R66", "0%");

  sheet.getRange("A1:A66").format.columnWidth = 23;
  sheet.getRange("B1:B66").format.columnWidth = 18;
  sheet.getRange("C1:C66").format.columnWidth = 3;
  sheet.getRange("D1:H66").format.columnWidth = 20;
  sheet.getRange("I1:I66").format.columnWidth = 3;
  sheet.getRange("J1:R66").format.columnWidth = 12;
  sheet.getRange("T1:AF80").format.columnWidth = 12;
  sheet.freezePanes.freezeRows(3);
}

export function buildOutputSheets(workbook, context) {
  void context;
  buildSeasonalityAudit(workbook);
  buildOperations(workbook);
  buildLease(workbook);
  buildScenariosChecksAndSources(workbook);
  buildSummary(workbook);
  return workbook;
}

export { buildOperations, buildLease, buildScenariosChecksAndSources, buildSummary };
