import { Workbook } from "@oai/artifact-tool";
import { BASE_ASSUMPTIONS, COLORS, FIXED_CITIES, SHEET_NAMES } from "./constants.mjs";
import {
  formatCount,
  formatFinancial,
  formatPercent,
  styleCheck,
  styleCrossSheet,
  styleFormula,
  styleInput,
  styleSection,
  styleTitle,
} from "./workbook_style.mjs";

const ACCESS_DATE = "2026-08-16";
const DESIGN_URL = "https://github.com/keqi119/Ant_charge_station/blob/main/docs/superpowers/specs/2026-08-16-charge-station-financing-model-design.md";

function rangeTitle(sheet, address, text) {
  const range = sheet.getRange(address);
  range.merge();
  range.values = [[text]];
  styleTitle(range);
}

function rangeSection(sheet, address, text) {
  const range = sheet.getRange(address);
  range.merge();
  range.values = [[text]];
  styleSection(range);
}

function sourceComment({ name, asOf, url, notes }) {
  return `Source: ${name} | As-of: ${asOf} | URL: ${url} | Accessed: ${ACCESS_DATE} | Notes: ${notes}`;
}

function addSourceComment(workbook, sheet, address, details) {
  workbook.comments.addThread({ cell: sheet.getRange(address) }, sourceComment(details));
}

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

function monthDate(month) {
  return new Date(`${month}-01T00:00:00Z`);
}

function normalizedSourceDate(value) {
  if (value === null || value === "") return null;
  if (value instanceof Date) return value;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildSourceCatalog(context) {
  const entries = [];
  const byUrl = new Map();
  const add = (url, name, category, asOf, notes) => {
    if (!url) return "";
    if (!byUrl.has(url)) {
      const id = `SRC-${String(entries.length + 1).padStart(3, "0")}`;
      byUrl.set(url, id);
      entries.push({ id, category, name, asOf, url, accessed: ACCESS_DATE, notes });
    }
    return byUrl.get(url);
  };

  add(context.sourcePath, "站点报表源工作簿", "历史经营数据", "2026-06-16至2026-08-15", "Data List!A1:P3050逐值导入");
  add(DESIGN_URL, "项目设计规格", "模型假设", ACCESS_DATE, "融资、成本、投放及口径基准");
  for (const city of context.cityInputs) {
    add(city.tierSourceUrl, city.tierSourceName, "城市等级", "2025", "第一财经城市商业魅力等级与排名");
    add(city.populationSourceUrl, `${city.city}人口来源`, "城市人口", city.populationYear ?? "未提供", city.notes);
    add(city.densitySourceUrl, `${city.city}建成区来源`, "城市密度", city.densityYear ?? "未提供", city.notes);
    add(city.housingSourceUrl, `${city.city}住房代理来源`, "老旧住房代理", city.housingYear ?? "未提供", city.notes);
    add(city.chargingSourceUrl, `${city.city}充电资源来源`, "公共充电资源", city.chargingYear ?? "未提供", city.notes);
  }
  for (const row of context.seasonalityInputs) {
    add(row.gunSourceUrl, "中国充电联盟公共充电设施数量", "年度季节曲线", row.month, "月末公共充电设施数量");
    add(row.volumeSourceUrl, "中国充电联盟公共充电量", "年度季节曲线", row.month, "月度公共充电设施充电量（亿千瓦时）");
  }
  return { entries, byUrl };
}

export function createWorkbook() {
  const workbook = Workbook.create();
  for (const name of SHEET_NAMES) workbook.worksheets.add(name);
  workbook.comments.setSelf({ displayName: "User" });
  return workbook;
}

function buildCoreAssumptions(workbook, context) {
  const sheet = workbook.worksheets.getItem("核心假设");
  rangeTitle(sheet, "A1:M1", "核心假设｜30,000枪新增投放与融资参数");
  rangeSection(sheet, "A3:C3", "纵向假设（蓝字为可编辑输入）");
  sheet.getRange("A4:C4").values = [["参数", "基准值", "单位/说明"]];
  styleSection(sheet.getRange("A4:C4"));

  const assumptions = [
    ["模型起始月", monthDate(BASE_ASSUMPTIONS.modelStartMonth), "月"],
    ["新增目标枪数", BASE_ASSUMPTIONS.targetGuns, "枪"],
    ["正式报告期", BASE_ASSUMPTIONS.reportMonths, "月"],
    ["底层计算期", BASE_ASSUMPTIONS.calculationMonths, "月"],
    ["上线比例为正的月份数", null, "月（由B55:M55计算）"],
    ["人口权重", 0.30, "%"],
    ["密度权重", 0.25, "%"],
    ["老旧住房权重", 0.30, "%"],
    ["充电稀缺权重", 0.15, "%"],
    ["城市权重合计", null, "%"],
    ["2枪站设备", BASE_ASSUMPTIONS.costByStationType.twoGun.equipment, "元/站"],
    ["2枪站工程施工及辅材", BASE_ASSUMPTIONS.costByStationType.twoGun.engineering, "元/站"],
    ["2枪站渠道公关", BASE_ASSUMPTIONS.costByStationType.twoGun.channel, "元/站"],
    ["4枪站设备", BASE_ASSUMPTIONS.costByStationType.fourGun.equipment, "元/站"],
    ["4枪站工程施工及辅材", BASE_ASSUMPTIONS.costByStationType.fourGun.engineering, "元/站"],
    ["4枪站渠道公关", BASE_ASSUMPTIONS.costByStationType.fourGun.channel, "元/站"],
    ["一线城市标准枪数", 1000, "枪/城"],
    ["新一线城市标准枪数", 800, "枪/城"],
    ["二线城市标准枪数", 600, "枪/城"],
    ["三线城市标准枪数", 400, "枪/城"],
    ["高分城市4枪站占比", BASE_ASSUMPTIONS.fourGunSiteShareHigh, "%"],
    ["低分城市4枪站占比", BASE_ASSUMPTIONS.fourGunSiteShareLow, "%"],
    ["融资比例", BASE_ASSUMPTIONS.leaseAdvanceRate, "%"],
    ["融资期限", BASE_ASSUMPTIONS.leaseTermMonths, "月"],
    ["年化综合资金成本", BASE_ASSUMPTIONS.annualLeaseRate, "%"],
    ["放款延迟", BASE_ASSUMPTIONS.leaseDelayMonths, "月"],
    ["供应商账期", BASE_ASSUMPTIONS.supplierTermsMonths, "月"],
    ["留购款比例", BASE_ASSUMPTIONS.residualRate, "%"],
    ["物业方式", BASE_ASSUMPTIONS.propertyMode, "分成/固定租金"],
    ["物业服务费分成", BASE_ASSUMPTIONS.propertyShare, "%"],
    ["固定月租", BASE_ASSUMPTIONS.fixedRentPerStation, "元/站/月"],
    ["其他运营成本率", BASE_ASSUMPTIONS.otherOpexRate, "%服务费"],
    ["总部月度成本", BASE_ASSUMPTIONS.headquartersMonthly, "元/月"],
    ["经营税费率", BASE_ASSUMPTIONS.operatingTaxRate, "%服务费"],
    ["初始现金", 0, "元"],
    ["成熟站门槛", 30, "有效运营日"],
    ["历史基准选择", "P50", "P25/P50/加权"],
    ["季节情景", "基准", "基准/无季节性/旺季下调10%"],
    ["充电量单位换算", 100000000, "亿千瓦时→千瓦时"],
    ["源期间开始日", new Date("2026-06-16T00:00:00Z"), "日"],
    ["源期间结束日", new Date("2026-08-15T00:00:00Z"), "日"],
    ["首批城市数量", FIXED_CITIES.length, "城"],
    ["站枪对应关系", 1, "1桩=1枪"],
    ["2枪站功率堆", 120, "kW"],
    ["4枪站功率堆", 160, "kW"],
    ["模型版本日期", new Date("2026-08-16T00:00:00Z"), "日"],
  ];
  sheet.getRange("A5:C50").values = assumptions;
  sheet.getRange("B9").formulas = [['=COUNTIF(B55:M55,">0")']];
  sheet.getRange("B14").formulas = [["=SUM(B10:B13)"]];
  styleInput(sheet.getRange("B5:B8"));
  styleFormula(sheet.getRange("B9"));
  styleInput(sheet.getRange("B10:B13"));
  styleFormula(sheet.getRange("B14"));
  styleInput(sheet.getRange("B15:B50"));
  formatPercent(sheet.getRange("B10:B13"));
  formatPercent(sheet.getRange("B14:B14"));
  formatPercent(sheet.getRange("B25:B27"));
  formatPercent(sheet.getRange("B29:B29"));
  formatPercent(sheet.getRange("B32:B32"));
  formatPercent(sheet.getRange("B34:B34"));
  formatPercent(sheet.getRange("B36:B36"));
  formatPercent(sheet.getRange("B38:B38"));
  sheet.getRange("B5").format.numberFormat = "yyyy-mm";
  sheet.getRange("B44:B45").format.numberFormat = "yyyy-mm-dd";
  sheet.getRange("B50").format.numberFormat = "yyyy-mm-dd";

  sheet.getRange("B6").dataValidation = {
    rule: { type: "custom", formula1: "=AND(B6>0,MOD(B6,1)=0,MOD(B6,2)=0)" },
    prompt: { title: "新增目标枪数", message: "请输入正偶数整数；粘贴后请确认模型检查为PASS。" },
    errorAlert: { style: "stop", title: "无效目标枪数", message: "新增目标枪数必须为正偶数整数。" },
  };
  sheet.getRange("B27").dataValidation = {
    rule: { type: "list", values: ["80%", "90%", "100%"] },
    prompt: { title: "融资比例", message: "请选择批准值：80%、90%或100%。" },
    errorAlert: { style: "stop", title: "无效融资比例", message: "融资比例仅允许80%、90%或100%。" },
  };
  sheet.getRange("B28").dataValidation = { rule: { type: "list", values: ["18", "24", "36"] } };
  sheet.getRange("B29").dataValidation = {
    rule: { type: "list", values: ["6%", "8%", "10%", "12%"] },
    prompt: { title: "年化综合资金成本", message: "请选择批准值：6%、8%、10%或12%。" },
    errorAlert: { style: "stop", title: "无效资金成本", message: "年化综合资金成本仅允许6%、8%、10%或12%。" },
  };
  sheet.getRange("B30").dataValidation = { rule: { type: "list", values: ["0", "1", "2"] } };
  sheet.getRange("B32").dataValidation = {
    rule: { type: "decimal", operator: "between", formula1: 0, formula2: "=B27" },
    prompt: { title: "留购款比例", message: "请输入0%至融资比例之间的留购款比例。" },
    errorAlert: { style: "stop", title: "无效留购款比例", message: "留购款比例必须不低于0%且不高于融资比例。" },
  };
  sheet.getRange("B33").dataValidation = { rule: { type: "list", values: ["分成", "固定租金"] } };
  sheet.getRange("B41").dataValidation = { rule: { type: "list", values: ["P25", "P50", "加权"] } };
  sheet.getRange("B42").dataValidation = { rule: { type: "list", values: ["基准", "无季节性", "旺季下调10%"] } };

  rangeSection(sheet, "A53:M53", "12个月上线比例");
  sheet.getRange("A54:M54").values = [["月份", ...Array.from({ length: 12 }, (_, index) => `M${index + 1}`)]];
  styleSection(sheet.getRange("A54:M54"));
  sheet.getRange("A55").values = [["上线比例"]];
  sheet.getRange("B55:M55").values = [BASE_ASSUMPTIONS.rolloutShares];
  styleInput(sheet.getRange("B55:M55"));
  formatPercent(sheet.getRange("B55:M55"));

  rangeSection(sheet, "A58:G58", "新站6个月收入爬坡");
  sheet.getRange("A59:G59").values = [["运营月龄", 1, 2, 3, 4, 5, "6+"]];
  styleSection(sheet.getRange("A59:G59"));
  sheet.getRange("A60").values = [["爬坡系数"]];
  sheet.getRange("B60:G60").values = [BASE_ASSUMPTIONS.ramp];
  styleInput(sheet.getRange("B60:G60"));
  formatPercent(sheet.getRange("B60:G60"));

  const designDetails = {
    name: "项目设计规格",
    asOf: ACCESS_DATE,
    url: DESIGN_URL,
    notes: "基准假设；蓝字允许用户覆盖，覆盖后下游公式自动重算",
  };
  for (let row = 5; row <= 50; row += 1) addSourceComment(workbook, sheet, `B${row}`, designDetails);
  addSourceComment(workbook, sheet, "B55", designDetails);
  addSourceComment(workbook, sheet, "B60", designDetails);

  sheet.getRange("A1:A60").format.columnWidth = 28;
  sheet.getRange("B1:B60").format.columnWidth = 16;
  sheet.getRange("C1:C50").format.columnWidth = 24;
  sheet.freezePanes.freezeRows(4);
}

function buildStationCost(workbook) {
  const sheet = workbook.worksheets.getItem("单站成本");
  rangeTitle(sheet, "A1:G1", "单站成本｜总投资与融资租赁原值");
  rangeSection(sheet, "A3:G3", "站型成本拆分");
  sheet.getRange("A4:G4").values = [["配置", "设备", "工程施工及辅材", "渠道公关", "总投资", "融资租赁原值", "单枪原值"]];
  styleSection(sheet.getRange("A4:G4"));
  sheet.getRange("A5:A6").values = [["2枪站"], ["4枪站"]];
  sheet.getRange("B5:G6").formulas = [
    ["='核心假设'!B15", "='核心假设'!B16", "='核心假设'!B17", "='核心假设'!B15+'核心假设'!B16+'核心假设'!B17", "='核心假设'!B15+'核心假设'!B16", "=F5/2"],
    ["='核心假设'!B18", "='核心假设'!B19", "='核心假设'!B20", "='核心假设'!B18+'核心假设'!B19+'核心假设'!B20", "='核心假设'!B18+'核心假设'!B19", "=F6/4"],
  ];
  styleCrossSheet(sheet.getRange("B5:F6"));
  styleFormula(sheet.getRange("G5:G6"));
  formatFinancial(sheet.getRange("B5:G6"));
  sheet.getRange("A8:G9").values = [["口径说明", null, null, null, null, null, null], ["融资租赁原值仅含设备和工程；渠道费用不融资并形成自有资金需求。", null, null, null, null, null, null]];
  sheet.getRange("A8:G8").merge();
  sheet.getRange("A9:G9").merge();
  styleSection(sheet.getRange("A8:G8"));
  sheet.getRange("A9:G9").format.wrapText = true;
  sheet.getRange("A1:A9").format.columnWidth = 18;
  sheet.getRange("B1:G9").format.columnWidth = 16;
}

function buildHistoricalRaw(workbook, context) {
  const sheet = workbook.worksheets.getItem("历史原始数据");
  sheet.getRange("A1:P3050").values = context.sourceMatrix;
  sheet.getRange("Q1").values = [["标准化日期（辅助）"]];
  sheet.getRange("Q2:Q3050").values = context.sourceMatrix.slice(1).map((row) => [normalizedSourceDate(row[0])]);
  sheet.getRange("A1:Q1").format = {
    fill: "#1F4E78",
    font: { bold: true, color: "#FFFFFF", name: "Arial" },
  };
  sheet.getRange("A2:A3050").format.numberFormat = "yyyy-mm-dd";
  sheet.getRange("Q2:Q3050").format.numberFormat = "yyyy-mm-dd";
  formatCount(sheet.getRange("D2:L3050"));
  formatFinancial(sheet.getRange("M2:O3050"));
  sheet.getRange("A2:Q3050").format.font = { color: COLORS.formula, name: "Arial" };
  sheet.getRange("A1:A3050").format.columnWidth = 12;
  sheet.getRange("B1:B3050").format.columnWidth = 18;
  sheet.getRange("C1:C3050").format.columnWidth = 28;
  sheet.getRange("D1:P3050").format.columnWidth = 13;
  sheet.getRange("Q1:Q3050").format.columnWidth = 18;
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(3);
  addSourceComment(workbook, sheet, "A1", {
    name: "站点报表源工作簿",
    asOf: "2026-06-16至2026-08-15",
    url: context.sourcePath,
    notes: "Data List!A1:P3050逐值导入，未改变原始数值",
  });
  addSourceComment(workbook, sheet, "Q1", {
    name: "站点报表源工作簿",
    asOf: "2026-06-16至2026-08-15",
    url: context.sourcePath,
    notes: "仅将A列ISO日期文本规范为Excel日期类型，供首末运营日公式聚合；A:P原值不变",
  });
}

function buildHistoricalModel(workbook, context) {
  const sheet = workbook.worksheets.getItem("历史单枪模型");
  const profiles = context.historical.stationProfiles;
  const firstRow = 6;
  const lastRow = firstRow + profiles.length - 1;
  const sourceStationIds = "'历史原始数据'!$B$2:$B$3050";
  rangeTitle(sheet, "A1:N1", "历史单枪模型｜站级聚合与成熟站基准");
  rangeSection(sheet, "A3:J3", "站级可审计计算");
  sheet.getRange("A4:J4").values = [["站点ID", "站点名称", "枪数", "有效日", "枪日", "服务费", "服务费/枪日", "成熟标志", "首个运营日", "末个运营日"]];
  styleSection(sheet.getRange("A4:J4"));
  sheet.getRange(`A${firstRow}:B${lastRow}`).values = profiles.map((row) => [row.stationId, row.stationName]);
  const formulas = profiles.map((_, index) => {
    const row = firstRow + index;
    return [
      `=MAXIFS('历史原始数据'!$D$2:$D$3050,'历史原始数据'!$B$2:$B$3050,$A${row})+MAXIFS('历史原始数据'!$E$2:$E$3050,'历史原始数据'!$B$2:$B$3050,$A${row})`,
      `=COUNTIFS('历史原始数据'!$B$2:$B$3050,$A${row})`,
      `=C${row}*D${row}`,
      `=SUMIFS('历史原始数据'!$O$2:$O$3050,'历史原始数据'!$B$2:$B$3050,$A${row})`,
      `=IFERROR(F${row}/E${row},0)`,
      `=IF(D${row}>='核心假设'!$B$40,1,0)`,
      `=IF(D${row}=0,"",MINIFS('历史原始数据'!$Q$2:$Q$3050,${sourceStationIds},$A${row}))`,
      `=IF(D${row}=0,"",MAXIFS('历史原始数据'!$Q$2:$Q$3050,${sourceStationIds},$A${row}))`,
    ];
  });
  sheet.getRange(`C${firstRow}:J${lastRow}`).formulas = formulas;
  styleCrossSheet(sheet.getRange(`C${firstRow}:D${lastRow}`));
  styleFormula(sheet.getRange(`E${firstRow}:G${lastRow}`));
  styleCrossSheet(sheet.getRange(`H${firstRow}:J${lastRow}`));
  formatCount(sheet.getRange(`C${firstRow}:E${lastRow}`));
  formatFinancial(sheet.getRange(`F${firstRow}:G${lastRow}`));
  sheet.getRange(`H${firstRow}:H${lastRow}`).format.numberFormat = "0";
  sheet.getRange(`I${firstRow}:J${lastRow}`).format.numberFormat = "yyyy-mm-dd";

  rangeSection(sheet, "L3:N3", "成熟站基准：工作簿公式 vs 纯函数参考");
  sheet.getRange("L4:N4").values = [["指标", "工作簿公式", "纯函数参考"]];
  styleSection(sheet.getRange("L4:N4"));
  sheet.getRange("L5:L9").values = [["成熟P25"], ["成熟P50"], ["成熟加权"], ["成熟站数"], ["源记录数"]];
  sheet.getRange("M5:M9").formulas = [
    [`=PERCENTILE.INC(K${firstRow}:K${lastRow},0.25)`],
    [`=MEDIAN(K${firstRow}:K${lastRow})`],
    [`=SUMIFS(F${firstRow}:F${lastRow},H${firstRow}:H${lastRow},1)/SUMIFS(E${firstRow}:E${lastRow},H${firstRow}:H${lastRow},1)`],
    [`=SUM(H${firstRow}:H${lastRow})`],
    ["=COUNTA('历史原始数据'!$A$2:$A$3050)"],
  ];
  sheet.getRange(`K${firstRow}:K${lastRow}`).formulas = profiles.map((_, index) => {
    const row = firstRow + index;
    return [`=IF(H${row}=1,G${row},"")`];
  });
  sheet.getRange("N5:N9").values = [[context.historical.benchmarks.matureP25], [context.historical.benchmarks.matureMedian], [context.historical.benchmarks.matureWeighted], [context.historical.matureStationCount], [context.historical.rowCount]];
  styleFormula(sheet.getRange(`K${firstRow}:K${lastRow}`));
  styleFormula(sheet.getRange("M5:M9"));
  styleCrossSheet(sheet.getRange("M9"));
  formatFinancial(sheet.getRange("M5:N7"));
  formatCount(sheet.getRange("M8:N9"));
  sheet.getRange(`A1:A${lastRow}`).format.columnWidth = 20;
  sheet.getRange(`B1:B${lastRow}`).format.columnWidth = 28;
  sheet.getRange(`C1:J${lastRow}`).format.columnWidth = 14;
  sheet.getRange(`K1:N${lastRow}`).format.columnWidth = 18;
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(2);
}

function buildSeasonality(workbook, context, sourceCatalog) {
  const sheet = workbook.worksheets.getItem("年度季节曲线");
  rangeTitle(sheet, "A1:L1", "年度季节曲线｜2024公共充电网络形状");
  rangeSection(sheet, "A3:L3", "月度输入与公式归一");
  sheet.getRange("A4:L4").values = [["月份", "月初枪", "月末枪", "平均枪", "天数", "充电量(亿kWh)", "单枪日充电量", "季节指数", "枪数来源ID", "电量来源ID", "访问日", "口径"]];
  styleSection(sheet.getRange("A4:L4"));
  const inputs = context.seasonalityInputs;
  const rows = inputs.slice(1).map((row, index) => [
    monthDate(row.month),
    inputs[index].monthEndPublicGuns,
    row.monthEndPublicGuns,
    null,
    null,
    row.chargingKwh100m,
    null,
    null,
    sourceCatalog.byUrl.get(row.gunSourceUrl),
    sourceCatalog.byUrl.get(row.volumeSourceUrl),
    row.accessedDate,
    "公共充电网络仅用于年度形状",
  ]);
  sheet.getRange("A6:L17").values = rows;
  sheet.getRange("D6:D17").formulas = Array.from({ length: 12 }, (_, index) => [`=(B${index + 6}+C${index + 6})/2`]);
  sheet.getRange("E6:E17").formulas = Array.from({ length: 12 }, (_, index) => [`=DAY(EOMONTH(A${index + 6},0))`]);
  sheet.getRange("G6:G17").formulas = Array.from({ length: 12 }, (_, index) => [`=F${index + 6}*'核心假设'!$B$43/E${index + 6}/D${index + 6}`]);
  sheet.getRange("H6:H17").formulas = Array.from({ length: 12 }, (_, index) => [`=G${index + 6}/AVERAGE($G$6:$G$17)`]);
  styleFormula(sheet.getRange("D6:E17"));
  styleCrossSheet(sheet.getRange("G6:G17"));
  styleFormula(sheet.getRange("H6:H17"));
  sheet.getRange("A6:A17").format.numberFormat = "yyyy-mm";
  formatCount(sheet.getRange("B6:E17"));
  sheet.getRange("F6:F17").format.numberFormat = "0.0";
  sheet.getRange("G6:G17").format.numberFormat = "0.00";
  sheet.getRange("H6:H17").format.numberFormat = "0.0000";
  for (let index = 0; index < 12; index += 1) {
    const row = index + 6;
    const current = inputs[index + 1];
    addSourceComment(workbook, sheet, `B${row}`, {
      name: "中国充电联盟公共充电设施数量",
      asOf: inputs[index].month,
      url: inputs[index].gunSourceUrl,
      notes: "上月末公共充电枪数，作为本月月初枪数",
    });
    addSourceComment(workbook, sheet, `C${row}`, {
      name: "中国充电联盟公共充电设施数量",
      asOf: current.month,
      url: current.gunSourceUrl,
      notes: "当月末公共充电枪数",
    });
    addSourceComment(workbook, sheet, `F${row}`, {
      name: "中国充电联盟公共充电量",
      asOf: current.month,
      url: current.volumeSourceUrl,
      notes: "月度公共充电设施充电量，单位亿千瓦时",
    });
  }
  sheet.getRange("A1:A17").format.columnWidth = 13;
  sheet.getRange("B1:H17").format.columnWidth = 15;
  sheet.getRange("I1:K17").format.columnWidth = 16;
  sheet.getRange("L1:L17").format.columnWidth = 32;
  sheet.getRange("L6:L17").format.wrapText = true;
  sheet.freezePanes.freezeRows(4);
}

function buildCityDatabase(workbook, context, sourceCatalog) {
  const sheet = workbook.worksheets.getItem("城市数据库");
  const firstRow = 6;
  const lastRow = firstRow + context.cityInputs.length - 1;
  rangeTitle(sheet, "A1:AG1", "城市数据库｜原始指标、同等级百分位与来源审计");
  rangeSection(sheet, "A3:AG3", "原始公开指标（黑字）与公式派生（公式黑字、跨表绿字）");
  const headers = ["城市", "省份", "等级", "一财排名", "首批", "首批顺序", "人口(万人)", "人口年", "城区人口(万人)", "建成区(km²)", "密度年", "人口密度", "老旧住房代理", "代理口径", "住房年", "公共充电枪", "充电年", "枪/万人", "等级来源", "人口来源", "密度来源", "住房来源", "充电来源", "访问日", "备注", "人口百分位", "密度百分位", "住房百分位", "稀缺百分位", "综合得分", "数据质量", "等级优先级", "实时排序名次"];
  sheet.getRange("A4:AG4").values = [headers];
  styleSection(sheet.getRange("A4:AG4"));
  sheet.getRange(`A${firstRow}:Y${lastRow}`).values = context.cityInputs.map((city) => [
    city.city, city.province, city.tier, city.yicaiRank, city.isFixed ? "是" : "否", city.fixedOrder,
    city.population10k, city.populationYear, city.urbanPopulation10k, city.builtAreaKm2, city.densityYear, null,
    city.pre2005HousingProxy, city.housingMetric, city.housingYear, city.publicChargingGuns, city.chargingYear, null,
    sourceCatalog.byUrl.get(city.tierSourceUrl), sourceCatalog.byUrl.get(city.populationSourceUrl), sourceCatalog.byUrl.get(city.densitySourceUrl), sourceCatalog.byUrl.get(city.housingSourceUrl) ?? "", sourceCatalog.byUrl.get(city.chargingSourceUrl) ?? "", city.accessedDate, city.notes,
  ]);
  sheet.getRange(`L${firstRow}:L${lastRow}`).formulas = context.cityInputs.map((_, index) => {
    const row = firstRow + index;
    return [`=IFERROR(IF(AND(I${row}<>"",J${row}<>""),I${row}/J${row},G${row}/J${row}),"")`];
  });
  sheet.getRange(`R${firstRow}:R${lastRow}`).formulas = context.cityInputs.map((_, index) => {
    const row = firstRow + index;
    return [`=IFERROR(P${row}/G${row},"")`];
  });
  sheet.getRange(`Z${firstRow}:AE${lastRow}`).formulas = context.cityInputs.map((city, index) => {
    const row = firstRow + index;
    return [
      `=IF(G${row}="","",COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$G$${firstRow}:$G$${lastRow},"<="&G${row})/COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$G$${firstRow}:$G$${lastRow},"<>"))`,
      `=IF(L${row}="","",COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$L$${firstRow}:$L$${lastRow},"<="&L${row})/COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$L$${firstRow}:$L$${lastRow},"<>"))`,
      `=IF(M${row}="","",COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$M$${firstRow}:$M$${lastRow},"<="&M${row})/COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$M$${firstRow}:$M$${lastRow},"<>"))`,
      `=IF(R${row}="","",COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$R$${firstRow}:$R$${lastRow},">="&R${row})/COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$R$${firstRow}:$R$${lastRow},"<>"))`,
      `=IFERROR((IF(Z${row}="",0,Z${row}*'核心假设'!$B$10)+IF(AA${row}="",0,AA${row}*'核心假设'!$B$11)+IF(AB${row}="",0,AB${row}*'核心假设'!$B$12)+IF(AC${row}="",0,AC${row}*'核心假设'!$B$13))/(IF(Z${row}="",0,'核心假设'!$B$10)+IF(AA${row}="",0,'核心假设'!$B$11)+IF(AB${row}="",0,'核心假设'!$B$12)+IF(AC${row}="",0,'核心假设'!$B$13)),"")`,
      `=IF(COUNT(Z${row}:AC${row})<4,"缺失重算",IF(OR(AND(I${row}="",G${row}<>""),ISNUMBER(SEARCH("代理",N${row}))),"代理","完整"))`,
    ];
  });
  sheet.getRange(`AF${firstRow}:AG${lastRow}`).formulas = context.cityInputs.map((_, index) => {
    const row = firstRow + index;
    return [
      `=IF(C${row}="一线",1,IF(C${row}="新一线",2,IF(C${row}="二线",3,4)))`,
      `=IF(E${row}="是",F${row},COUNTIF($E$${firstRow}:$E$${lastRow},"是")+1+COUNTIFS($E$${firstRow}:$E$${lastRow},"否",$AF$${firstRow}:$AF$${lastRow},"<"&AF${row})+COUNTIFS($E$${firstRow}:$E$${lastRow},"否",$AF$${firstRow}:$AF$${lastRow},AF${row},$AD$${firstRow}:$AD$${lastRow},">"&AD${row})+COUNTIFS($E$${firstRow}:$E$${lastRow},"否",$AF$${firstRow}:$AF$${lastRow},AF${row},$AD$${firstRow}:$AD$${lastRow},AD${row},$D$${firstRow}:$D$${lastRow},"<"&D${row}))`,
    ];
  });
  styleFormula(sheet.getRange(`L${firstRow}:L${lastRow}`));
  styleFormula(sheet.getRange(`R${firstRow}:R${lastRow}`));
  styleFormula(sheet.getRange(`Z${firstRow}:AC${lastRow}`));
  styleCrossSheet(sheet.getRange(`AD${firstRow}:AD${lastRow}`));
  styleFormula(sheet.getRange(`AE${firstRow}:AE${lastRow}`));
  styleFormula(sheet.getRange(`AF${firstRow}:AG${lastRow}`));
  formatCount(sheet.getRange(`D${firstRow}:K${lastRow}`));
  formatCount(sheet.getRange(`M${firstRow}:Q${lastRow}`));
  sheet.getRange(`L${firstRow}:L${lastRow}`).format.numberFormat = "0.00";
  sheet.getRange(`R${firstRow}:R${lastRow}`).format.numberFormat = "0.00";
  formatPercent(sheet.getRange(`Z${firstRow}:AD${lastRow}`));

  for (const [index, city] of context.cityInputs.entries()) {
    const row = firstRow + index;
    addSourceComment(workbook, sheet, `D${row}`, { name: city.tierSourceName, asOf: "2025", url: city.tierSourceUrl, notes: `${city.city}等级及排名` });
    if (city.population10k !== null) addSourceComment(workbook, sheet, `G${row}`, { name: `${city.city}人口来源`, asOf: city.populationYear, url: city.populationSourceUrl, notes: city.notes });
    if (city.urbanPopulation10k !== null) addSourceComment(workbook, sheet, `I${row}`, { name: `${city.city}城区人口来源`, asOf: city.densityYear, url: city.densitySourceUrl, notes: city.notes });
    if (city.builtAreaKm2 !== null) addSourceComment(workbook, sheet, `J${row}`, { name: `${city.city}建成区来源`, asOf: city.densityYear, url: city.densitySourceUrl, notes: city.notes });
    if (city.pre2005HousingProxy !== null) addSourceComment(workbook, sheet, `M${row}`, { name: `${city.city}住房代理来源`, asOf: city.housingYear, url: city.housingSourceUrl, notes: city.notes });
    if (city.publicChargingGuns !== null) addSourceComment(workbook, sheet, `P${row}`, { name: `${city.city}充电资源来源`, asOf: city.chargingYear, url: city.chargingSourceUrl, notes: city.notes });
  }
  sheet.getRange("A1:A70").format.columnWidth = 12;
  sheet.getRange("B1:F70").format.columnWidth = 11;
  sheet.getRange("G1:R70").format.columnWidth = 14;
  sheet.getRange("S1:X70").format.columnWidth = 14;
  sheet.getRange("Y1:Y70").format.columnWidth = 42;
  sheet.getRange("Y6:Y70").format.wrapText = true;
  sheet.getRange("Z1:AG70").format.columnWidth = 14;
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(3);
}

function buildCityAllocation(workbook, context) {
  const sheet = workbook.worksheets.getItem("城市分配");
  const firstRow = 6;
  const lastRow = firstRow + context.cityInputs.length - 1;
  rangeTitle(sheet, "A1:S1", "城市分配｜精确目标枪数与整数站型");
  rangeSection(sheet, "A3:S3", "固定26城优先，其余按等级、实时得分与一财排名动态补充");
  sheet.getRange("A4:S4").values = [["顺序", "城市", "等级", "首批", "首批顺序", "综合得分", "可自动选择", "标准配额", "累计前值", "目标枪数", "4枪站占比", "4枪站", "2枪站", "总站数", "枪数校验", "预留月份序号", "同级选中得分序", "同级选中数", "同级选中得分中位数"]];
  styleSection(sheet.getRange("A4:S4"));
  sheet.getRange(`A${firstRow}:B${lastRow}`).formulas = context.cityInputs.map((_, index) => {
    const row = firstRow + index;
    return [
      `=ROW()-${firstRow - 1}`,
      `=INDEX('城市数据库'!$A$${firstRow}:$A$${lastRow},MATCH(A${row},'城市数据库'!$AG$${firstRow}:$AG$${lastRow},0))`,
    ];
  });
  sheet.getRange(`C${firstRow}:J${lastRow}`).formulas = context.cityInputs.map((_, index) => {
    const row = firstRow + index;
    return [
      `=INDEX('城市数据库'!$C$6:$C$61,MATCH(B${row},'城市数据库'!$A$6:$A$61,0))`,
      `=INDEX('城市数据库'!$E$6:$E$61,MATCH(B${row},'城市数据库'!$A$6:$A$61,0))`,
      `=INDEX('城市数据库'!$F$6:$F$61,MATCH(B${row},'城市数据库'!$A$6:$A$61,0))`,
      `=INDEX('城市数据库'!$AD$6:$AD$61,MATCH(B${row},'城市数据库'!$A$6:$A$61,0))`,
      `=--(INDEX('城市数据库'!$G$6:$G$61,MATCH(B${row},'城市数据库'!$A$6:$A$61,0))<>"")`,
      `=IF(C${row}="一线",'核心假设'!$B$21,IF(C${row}="新一线",'核心假设'!$B$22,IF(C${row}="二线",'核心假设'!$B$23,'核心假设'!$B$24)))`,
      `=SUM($J$${firstRow}:J${row - 1})`,
      `=IF(G${row}=0,0,IF(D${row}="是",H${row},MAX(0,MIN(H${row},'核心假设'!$B$6-I${row}))))`,
    ];
  });
  sheet.getRange(`K${firstRow}:K${lastRow}`).formulas = context.cityInputs.map((_, index) => {
    const row = firstRow + index;
    return [`=IF(J${row}=0,0,IF(F${row}>=S${row},'核心假设'!$B$25,'核心假设'!$B$26))`];
  });
  sheet.getRange(`L${firstRow}:P${lastRow}`).formulas = context.cityInputs.map((_, index) => {
    const row = firstRow + index;
    return [
      `=ROUND((J${row}*K${row})/(2+2*K${row}),0)`,
      `=(J${row}-4*L${row})/2`,
      `=L${row}+M${row}`,
      `=4*L${row}+2*M${row}-J${row}`,
      `=IF(D${row}="是",MOD(E${row}-1,6),"")`,
    ];
  });
  sheet.getRange(`Q${firstRow}:S${lastRow}`).formulas = context.cityInputs.map((_, index) => {
    const row = firstRow + index;
    return [
      `=IF(J${row}=0,"",COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$J$${firstRow}:$J$${lastRow},">0",$F$${firstRow}:$F$${lastRow},">"&F${row})+COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$J$${firstRow}:$J$${lastRow},">0",$F$${firstRow}:$F$${lastRow},F${row},$A$${firstRow}:$A$${lastRow},"<"&A${row})+1)`,
      `=IF(J${row}=0,0,COUNTIFS($C$${firstRow}:$C$${lastRow},C${row},$J$${firstRow}:$J$${lastRow},">0"))`,
      `=IF(J${row}=0,"",(SUMIFS($F$${firstRow}:$F$${lastRow},$C$${firstRow}:$C$${lastRow},C${row},$J$${firstRow}:$J$${lastRow},">0",$Q$${firstRow}:$Q$${lastRow},INT((R${row}+1)/2))+SUMIFS($F$${firstRow}:$F$${lastRow},$C$${firstRow}:$C$${lastRow},C${row},$J$${firstRow}:$J$${lastRow},">0",$Q$${firstRow}:$Q$${lastRow},INT((R${row}+2)/2)))/2)`,
    ];
  });
  styleFormula(sheet.getRange(`A${firstRow}:A${lastRow}`));
  styleCrossSheet(sheet.getRange(`B${firstRow}:H${lastRow}`));
  styleFormula(sheet.getRange(`I${firstRow}:I${lastRow}`));
  styleCrossSheet(sheet.getRange(`J${firstRow}:K${lastRow}`));
  styleFormula(sheet.getRange(`L${firstRow}:S${lastRow}`));
  formatPercent(sheet.getRange(`F${firstRow}:F${lastRow}`));
  formatPercent(sheet.getRange(`K${firstRow}:K${lastRow}`));
  formatCount(sheet.getRange(`H${firstRow}:R${lastRow}`));
  formatPercent(sheet.getRange(`S${firstRow}:S${lastRow}`));
  sheet.getRange("A1:A70").format.columnWidth = 9;
  sheet.getRange("B1:B70").format.columnWidth = 13;
  sheet.getRange("C1:G70").format.columnWidth = 12;
  sheet.getRange("H1:S70").format.columnWidth = 14;
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(2);
}

function buildMonthlyDeployment(workbook, context) {
  const sheet = workbook.worksheets.getItem("月度投放计划");
  const months = BASE_ASSUMPTIONS.rolloutShares.length;
  const twoStart = 10;
  const twoEnd = twoStart + months - 1;
  const fourStart = twoEnd + 1;
  const fourEnd = fourStart + months - 1;
  const firstCityRow = 28;
  const lastCityRow = firstCityRow + context.allocations.length - 1;
  const twoStartCol = excelColumn(twoStart);
  const twoEndCol = excelColumn(twoEnd);
  const fourStartCol = excelColumn(fourStart);
  const fourEndCol = excelColumn(fourEnd);
  const checkCol = excelColumn(fourEnd + 1);
  rangeTitle(sheet, `A1:${checkCol}1`, "月度投放计划｜首批预留 + 剩余站型区间重叠分配");
  rangeSection(sheet, `A3:${twoEndCol}3`, "月度目标与站型组合（公式驱动）");
  sheet.getRange("A4:A24").values = [["上线月"], ["目标枪数"], ["预留2枪站"], ["预留4枪站"], ["剩余目标枪数"], ["必需2枪站"], ["额外2枪容量"], ["后续额外容量"], ["额外2枪分配"], ["剩余2枪站"], ["剩余4枪站"], ["当月2枪站"], ["当月4枪站"], ["月度枪数校验"], ["2枪累计起点"], ["2枪累计终点"], ["4枪累计起点"], ["4枪累计终点"], ["选址月"], ["供应商付款月"], ["融资放款月"]];
  sheet.getRange(`${twoStartCol}4`).formulas = [["='核心假设'!$B$5"]];
  sheet.getRange(`${twoStartCol}4:${twoEndCol}4`).fillRight();
  for (let index = 1; index < months; index += 1) {
    const col = excelColumn(twoStart + index);
    const prior = excelColumn(twoStart + index - 1);
    sheet.getRange(`${col}4`).formulas = [[`=EDATE(${prior}4,1)`]];
  }
  for (let index = 0; index < months; index += 1) {
    const col = excelColumn(twoStart + index);
    const rolloutCol = excelColumn(2 + index);
    const monthIndex = index;
    sheet.getRange(`${col}5`).formulas = [[index === months - 1 ? `='核心假设'!$B$6-SUM(${twoStartCol}5:${excelColumn(twoEnd - 1)}5)` : `=ROUND('核心假设'!$B$6*'核心假设'!${rolloutCol}$55/2,0)*2`]];
    sheet.getRange(`${col}6`).formulas = [[`=IF(${monthIndex}<6,COUNTIFS('城市分配'!$D$6:$D$61,"是",'城市分配'!$P$6:$P$61,${monthIndex},'城市分配'!$M$6:$M$61,">0"),0)`]];
    sheet.getRange(`${col}7`).formulas = [[`=IF(${monthIndex}<6,COUNTIFS('城市分配'!$D$6:$D$61,"是",'城市分配'!$P$6:$P$61,${monthIndex},'城市分配'!$M$6:$M$61,0,'城市分配'!$L$6:$L$61,">0"),0)`]];
    sheet.getRange(`${col}8`).formulas = [[`=${col}5-2*${col}6-4*${col}7`]];
    sheet.getRange(`${col}9`).formulas = [[`=MOD(${col}8/2,2)`]];
    sheet.getRange(`${col}10`).formulas = [[`=${col}8/2-${col}9`]];
    sheet.getRange(`${col}11`).formulas = [[index === months - 1 ? "=0" : `=SUM(${excelColumn(twoStart + index + 1)}10:${twoEndCol}10)`]];
    sheet.getRange(`${col}12`).formulas = [[`=MAX(0,MIN($B$10,${col}11+${col}10)-MIN($B$10,${col}11))`]];
    sheet.getRange(`${col}13`).formulas = [[`=${col}9+${col}12`]];
    sheet.getRange(`${col}14`).formulas = [[`=(${col}8-2*${col}13)/4`]];
    sheet.getRange(`${col}15`).formulas = [[`=${col}6+${col}13`]];
    sheet.getRange(`${col}16`).formulas = [[`=${col}7+${col}14`]];
    sheet.getRange(`${col}17`).formulas = [[`=4*${col}16+2*${col}15-${col}5`]];
    sheet.getRange(`${col}18`).formulas = [[index === 0 ? "=0" : `=SUM(${twoStartCol}13:${excelColumn(twoStart + index - 1)}13)`]];
    sheet.getRange(`${col}19`).formulas = [[`=${col}18+${col}13`]];
    sheet.getRange(`${col}20`).formulas = [[index === 0 ? "=0" : `=SUM(${twoStartCol}14:${excelColumn(twoStart + index - 1)}14)`]];
    sheet.getRange(`${col}21`).formulas = [[`=${col}20+${col}14`]];
    sheet.getRange(`${col}22`).formulas = [[`=EDATE(${col}4,-1)`]];
    sheet.getRange(`${col}23`).formulas = [[`=EDATE(${col}22,'核心假设'!$B$31)`]];
    sheet.getRange(`${col}24`).formulas = [[`=EDATE(${col}4,'核心假设'!$B$30)`]];
  }
  sheet.getRange("A10:B10").values = [["待分配额外2枪站", null]];
  sheet.getRange("B10").formulas = [[`=SUM('城市分配'!$M$6:$M$61)-SUM(${twoStartCol}6:${twoEndCol}6)-SUM(${twoStartCol}9:${twoEndCol}9)`]];
  styleCrossSheet(sheet.getRange(`${twoStartCol}4:${twoEndCol}7`));
  styleFormula(sheet.getRange(`${twoStartCol}8:${twoEndCol}22`));
  styleCrossSheet(sheet.getRange(`${twoStartCol}23:${twoEndCol}24`));
  sheet.getRange(`${twoStartCol}4:${twoEndCol}4`).format.numberFormat = "yyyy-mm";
  sheet.getRange(`${twoStartCol}22:${twoEndCol}24`).format.numberFormat = "yyyy-mm";
  formatCount(sheet.getRange(`${twoStartCol}5:${twoEndCol}21`));

  rangeSection(sheet, `A26:${checkCol}26`, "城市×月份站点分配");
  const headers = ["城市", "目标2枪站", "预留2枪站", "剩余2枪起点", "剩余2枪终点", "目标4枪站", "预留4枪站", "剩余4枪起点", "剩余4枪终点"];
  for (let index = 0; index < months; index += 1) headers.push(`M${index + 1} 2枪站`);
  for (let index = 0; index < months; index += 1) headers.push(`M${index + 1} 4枪站`);
  headers.push("分配枪数差");
  sheet.getRange(`A27:${checkCol}27`).values = [headers];
  styleSection(sheet.getRange(`A27:${checkCol}27`));
  sheet.getRange(`A${firstCityRow}:A${lastCityRow}`).values = context.allocations.map((row) => [row.city]);
  sheet.getRange(`B${firstCityRow}:I${lastCityRow}`).formulas = context.allocations.map((_, index) => {
    const row = firstCityRow + index;
    return [
      `=INDEX('城市分配'!$M$6:$M$61,MATCH($A${row},'城市分配'!$B$6:$B$61,0))`,
      `=IF(AND(INDEX('城市分配'!$D$6:$D$61,MATCH($A${row},'城市分配'!$B$6:$B$61,0))="是",B${row}>0),1,0)`,
      index === 0 ? "=0" : `=SUM($B$${firstCityRow}:B${row - 1})-SUM($C$${firstCityRow}:C${row - 1})`,
      `=D${row}+B${row}-C${row}`,
      `=INDEX('城市分配'!$L$6:$L$61,MATCH($A${row},'城市分配'!$B$6:$B$61,0))`,
      `=IF(AND(INDEX('城市分配'!$D$6:$D$61,MATCH($A${row},'城市分配'!$B$6:$B$61,0))="是",F${row}>0,B${row}=0),1,0)`,
      index === 0 ? "=0" : `=SUM($F$${firstCityRow}:F${row - 1})-SUM($G$${firstCityRow}:G${row - 1})`,
      `=H${row}+F${row}-G${row}`,
    ];
  });
  for (let index = 0; index < months; index += 1) {
    const monthCol = excelColumn(twoStart + index);
    sheet.getRange(`${monthCol}${firstCityRow}:${monthCol}${lastCityRow}`).formulas = context.allocations.map((_, cityIndex) => {
      const row = firstCityRow + cityIndex;
      return [`=MAX(0,MIN($E${row},${monthCol}$19)-MAX($D${row},${monthCol}$18))+IF(AND($C${row}=1,INDEX('城市分配'!$P$6:$P$61,MATCH($A${row},'城市分配'!$B$6:$B$61,0))=${index}),1,0)`];
    });
    const fourCol = excelColumn(fourStart + index);
    sheet.getRange(`${fourCol}${firstCityRow}:${fourCol}${lastCityRow}`).formulas = context.allocations.map((_, cityIndex) => {
      const row = firstCityRow + cityIndex;
      return [`=MAX(0,MIN($I${row},${monthCol}$21)-MAX($H${row},${monthCol}$20))+IF(AND($G${row}=1,INDEX('城市分配'!$P$6:$P$61,MATCH($A${row},'城市分配'!$B$6:$B$61,0))=${index}),1,0)`];
    });
    sheet.getRange(`${fourCol}4:${fourCol}4`).formulas = [[`=${monthCol}4`]];
  }
  styleCrossSheet(sheet.getRange(`${fourStartCol}4:${fourEndCol}4`));
  sheet.getRange(`${fourStartCol}4:${fourEndCol}4`).format.numberFormat = "yyyy-mm";
  sheet.getRange(`${checkCol}${firstCityRow}:${checkCol}${lastCityRow}`).formulas = context.allocations.map((_, index) => {
    const row = firstCityRow + index;
    return [`=2*SUM(${twoStartCol}${row}:${twoEndCol}${row})+4*SUM(${fourStartCol}${row}:${fourEndCol}${row})-INDEX('城市分配'!$J$6:$J$61,MATCH($A${row},'城市分配'!$B$6:$B$61,0))`];
  });
  styleCrossSheet(sheet.getRange(`B${firstCityRow}:C${lastCityRow}`));
  styleFormula(sheet.getRange(`D${firstCityRow}:E${lastCityRow}`));
  styleCrossSheet(sheet.getRange(`F${firstCityRow}:G${lastCityRow}`));
  styleFormula(sheet.getRange(`H${firstCityRow}:I${lastCityRow}`));
  styleCrossSheet(sheet.getRange(`${twoStartCol}${firstCityRow}:${fourEndCol}${lastCityRow}`));
  styleCrossSheet(sheet.getRange(`${checkCol}${firstCityRow}:${checkCol}${lastCityRow}`));
  formatCount(sheet.getRange(`B${firstCityRow}:${checkCol}${lastCityRow}`));
  sheet.getRange(`A1:A${lastCityRow}`).format.columnWidth = 13;
  sheet.getRange(`B1:I${lastCityRow}`).format.columnWidth = 13;
  sheet.getRange(`${twoStartCol}1:${fourEndCol}${lastCityRow}`).format.columnWidth = 11;
  sheet.getRange(`${checkCol}1:${checkCol}${lastCityRow}`).format.columnWidth = 14;
  sheet.freezePanes.freezeRows(27);
  sheet.freezePanes.freezeColumns(9);
}

function buildChecksAndSources(workbook, context, sourceCatalog) {
  const sheet = workbook.worksheets.getItem("情景分析、检查与来源");
  rangeTitle(sheet, "A1:H1", "Task 8 检查与来源｜纯函数参考仅用于核验");
  rangeSection(sheet, "A3:H3", "输入、历史、城市与投放检查");
  sheet.getRange("A4:H4").values = [["检查", "实际", "期望", "差异", "容差", "状态", "修复位置", "说明"]];
  styleSection(sheet.getRange("A4:H4"));
  const checks = [
    ["历史原始记录数", "=COUNTA('历史原始数据'!$A$2:$A$3050)", context.sourceMatrix.length - 1, "=B5-C5", 0, "历史原始数据!A2:P3050", "源矩阵逐值导入"],
    ["历史总额三项核对", "=SUM('历史原始数据'!$M$2:$M$3050)-SUM('历史原始数据'!$N$2:$N$3050)-SUM('历史原始数据'!$O$2:$O$3050)", context.historical.reconciliations.grossComponentsDifference, "=B6-C6", 0.01, "历史原始数据!M:O", "订单总额=电费+服务费"],
    ["成熟P25", "='历史单枪模型'!M5", context.historical.benchmarks.matureP25, "=B7-C7", 0.000001, "历史单枪模型!M5", "工作簿公式与纯函数参考"],
    ["成熟P50", "='历史单枪模型'!M6", context.historical.benchmarks.matureMedian, "=B8-C8", 0.000001, "历史单枪模型!M6", "工作簿公式与纯函数参考"],
    ["成熟加权", "='历史单枪模型'!M7", context.historical.benchmarks.matureWeighted, "=B9-C9", 0.000001, "历史单枪模型!M7", "工作簿公式与纯函数参考"],
    ["季节指数均值", "=AVERAGE('年度季节曲线'!$H$6:$H$17)", 1, "=B10-C10", 0.000001, "年度季节曲线!H6:H17", "12个月指数算术平均=1"],
    ["城市目标枪数", "=SUM('城市分配'!$J$6:$J$61)", BASE_ASSUMPTIONS.targetGuns, "=B11-C11", 0, "城市分配!J6:J61", "精确新增目标"],
    ["城市站型枪数", "=SUM('城市分配'!$O$6:$O$61)", 0, "=B12-C12", 0, "城市分配!L:O", "2/4枪站整数结果"],
    ["月度目标枪数", "=SUM('月度投放计划'!$J$5:$U$5)", BASE_ASSUMPTIONS.targetGuns, "=B13-C13", 0, "月度投放计划!J5:U5", "上线比例合计"],
    ["月度站型组合", "=SUM('月度投放计划'!$J$17:$U$17)", 0, "=B14-C14", 0, "月度投放计划!J17:U17", "每月4×4枪站+2×2枪站=目标枪数"],
    ["城市月度分配", "=SUM('月度投放计划'!$AH$28:$AH$83)", 0, "=B15-C15", 0, "月度投放计划!AH28:AH83", "城市月度分配回归城市目标"],
  ];
  sheet.getRange("A5:A15").values = checks.map((row) => [row[0]]);
  sheet.getRange("B5:B15").formulas = checks.map((row) => [row[1]]);
  sheet.getRange("C5:C15").values = checks.map((row) => [row[2]]);
  sheet.getRange("D5:D15").formulas = checks.map((row) => [row[3]]);
  sheet.getRange("E5:E15").values = checks.map((row) => [row[4]]);
  sheet.getRange("F5:F15").formulas = checks.map((_, index) => [`=IF(ABS(D${index + 5})<=E${index + 5},"OK","FAIL")`]);
  sheet.getRange("G5:H15").values = checks.map((row) => [row[5], row[6]]);
  styleCrossSheet(sheet.getRange("B5:B15"));
  styleFormula(sheet.getRange("D5:F15"));
  styleCheck(sheet.getRange("A5:H15"));
  sheet.getRange("B5:E15").format.numberFormat = "0.000000;[Red](0.000000);-";

  rangeSection(sheet, "A18:H18", "来源目录（长URL集中存放）");
  sheet.getRange("A19:H19").values = [["来源ID", "类别", "来源名称", "统计期", "URL/路径", "访问日", "口径/备注", "使用位置"]];
  styleSection(sheet.getRange("A19:H19"));
  if (sourceCatalog.entries.length > 0) {
    const lastRow = 19 + sourceCatalog.entries.length;
    sheet.getRange(`A20:H${lastRow}`).values = sourceCatalog.entries.map((entry) => [entry.id, entry.category, entry.name, entry.asOf, entry.url, entry.accessed, entry.notes, "核心假设/城市数据库/年度季节曲线/历史原始数据"]);
    sheet.getRange(`E20:E${lastRow}`).format.font = { color: COLORS.externalLink, name: "Arial" };
    sheet.getRange(`C20:H${lastRow}`).format.wrapText = true;
  }
  sheet.getRange("A1:A200").format.columnWidth = 15;
  sheet.getRange("B1:F200").format.columnWidth = 18;
  sheet.getRange("G1:G200").format.columnWidth = 28;
  sheet.getRange("H1:H200").format.columnWidth = 34;
  sheet.freezePanes.freezeRows(4);
}

export function buildInputSheets(workbook, context) {
  const sourceCatalog = buildSourceCatalog(context);
  buildCoreAssumptions(workbook, context);
  buildStationCost(workbook);
  buildHistoricalRaw(workbook, context);
  buildHistoricalModel(workbook, context);
  buildSeasonality(workbook, context, sourceCatalog);
  buildCityDatabase(workbook, context, sourceCatalog);
  buildCityAllocation(workbook, context);
  buildMonthlyDeployment(workbook, context);
  buildChecksAndSources(workbook, context, sourceCatalog);
  return workbook;
}
