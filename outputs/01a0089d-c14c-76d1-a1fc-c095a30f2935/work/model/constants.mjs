export const PATHS = Object.freeze({
  sourceWorkbook: "D:/工作资料/蚂蚁站/站点报表-导出项 (2).xlsx",
  sourceSheet: "Data List",
  sourceRange: "A1:P3050",
  outputWorkbook: "D:/Project_Mini_Charge_Station/outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁模型.xlsx",
});

export const SHEET_NAMES = Object.freeze([
  "融资摘要", "核心假设", "城市数据库", "城市分配", "月度投放计划", "单站成本",
  "历史原始数据", "历史单枪模型", "年度季节曲线", "36月运营模型", "融资租赁与资金缺口", "情景分析、检查与来源",
]);

export const FIXED_CITIES = Object.freeze([
  "合肥", "淮南", "芜湖", "阜阳", "宁波", "南京", "武汉", "长沙", "宿迁", "杭州",
  "徐州", "深圳", "嘉兴", "金华", "北京", "天津", "青岛", "海口", "三亚", "湖州",
  "台州", "绍兴", "西安", "无锡", "济南", "郑州",
]);

export const BASE_ASSUMPTIONS = Object.freeze({
  modelStartMonth: "2026-09",
  reportMonths: 36,
  calculationMonths: 60,
  targetGuns: 30000,
  rolloutMonths: 12,
  rolloutShares: Object.freeze([0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.11, 0.10, 0.09, 0.08, 0.06]),
  ramp: Object.freeze([0.60, 0.75, 0.85, 0.92, 0.97, 1]),
  propertyMode: "分成",
  propertyShare: 0.20,
  fixedRentPerStation: 200,
  otherOpexRate: 0.10,
  headquartersMonthly: 0,
  operatingTaxRate: 0,
  leaseAdvanceRate: 1,
  leaseTermMonths: 36,
  annualLeaseRate: 0.08,
  leaseDelayMonths: 1,
  supplierTermsMonths: 2,
  residualRate: 0.01,
  fourGunSiteShareHigh: 0.70,
  fourGunSiteShareLow: 0.40,
  costByStationType: Object.freeze({
    twoGun: Object.freeze({ equipment: 25000, engineering: 25000, channel: 10000 }),
    fourGun: Object.freeze({ equipment: 36000, engineering: 25000, channel: 10000 }),
  }),
});

export const COLORS = Object.freeze({
  input: "#0000FF",
  formula: "#000000",
  crossSheet: "#008000",
  externalLink: "#FF0000",
  warningFill: "#FFFF00",
});

export const NUMBER_FORMATS = Object.freeze({
  financial: '$#,##0;[Red]($#,##0);-',
  percent: '0.0%;[Red](0.0%);-',
  count: '#,##0;[Red](#,##0);-',
  dscr: '0.00x;[Red](0.00x);-',
});
