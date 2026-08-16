import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXED_CITIES, BASE_ASSUMPTIONS, PATHS } from "./model/constants.mjs";
import { allocateCityTargets, scoreCities } from "./model/city_engine.mjs";
import { buildDeploymentPlan } from "./model/deployment_engine.mjs";
import { profileHistoricalRows } from "./model/historical_engine.mjs";
import { loadJson, validateCityInputs, validateSeasonalityInputs } from "./model/input_validation.mjs";
import { buildSeasonalityCurve, annualizePeakBenchmark } from "./model/seasonality_engine.mjs";
import { loadSourceMatrix, normalizeSourceMatrix } from "./model/source_reader.mjs";
import { buildInputSheets, createWorkbook } from "./model/workbook_inputs.mjs";
import { buildOutputSheets } from "./model/workbook_outputs.mjs";
import { applyWorkbookStyles } from "./model/workbook_style.mjs";

const WORK_DIR = dirname(fileURLToPath(import.meta.url));
const CITY_WEIGHTS = Object.freeze({ population: 0.30, density: 0.25, housing: 0.30, chargingScarcity: 0.15 });
const CITY_CONFIG = Object.freeze({
  targetGuns: BASE_ASSUMPTIONS.targetGuns,
  tierQuotas: Object.freeze({ "一线": 1000, "新一线": 800, "二线": 600, "三线": 400 }),
  fourGunSiteShareHigh: BASE_ASSUMPTIONS.fourGunSiteShareHigh,
  fourGunSiteShareLow: BASE_ASSUMPTIONS.fourGunSiteShareLow,
});

let defaultContextPromise;

async function loadModelContext(sourcePath) {
  const { matrix: sourceMatrix } = await loadSourceMatrix(sourcePath);
  const sourceRows = normalizeSourceMatrix(sourceMatrix);
  const historical = profileHistoricalRows(sourceRows, { matureOperatingDays: 30 });
  const seasonalityInputs = validateSeasonalityInputs(loadJson(join(WORK_DIR, "data", "seasonality_2024.json")));
  const seasonality = buildSeasonalityCurve(seasonalityInputs);
  const cityInputs = validateCityInputs(loadJson(join(WORK_DIR, "data", "city_inputs.json")), FIXED_CITIES);
  const scoredCities = scoreCities(cityInputs, CITY_WEIGHTS);
  const allocations = allocateCityTargets(scoredCities, CITY_CONFIG);
  const deployment = buildDeploymentPlan(allocations, {
    startMonth: BASE_ASSUMPTIONS.modelStartMonth,
    shares: BASE_ASSUMPTIONS.rolloutShares,
    totalGuns: BASE_ASSUMPTIONS.targetGuns,
    supplierTermsMonths: BASE_ASSUMPTIONS.supplierTermsMonths,
    financeDelayMonths: BASE_ASSUMPTIONS.leaseDelayMonths,
    expectedFixedCities: FIXED_CITIES,
  });
  const annualServicePerGunDay = annualizePeakBenchmark(
    historical.benchmarks.matureMedian,
    seasonality,
    "2026-06-16",
    "2026-08-15",
  );
  return {
    sourcePath,
    sourceMatrix,
    sourceRows,
    historical,
    seasonalityInputs,
    seasonality,
    cityInputs,
    scoredCities,
    allocations,
    deployment,
    annualServicePerGunDay,
  };
}

export function buildModelContext(sourcePath = PATHS.sourceWorkbook) {
  return sourcePath === PATHS.sourceWorkbook
    ? (defaultContextPromise ??= loadModelContext(sourcePath))
    : loadModelContext(sourcePath);
}

export async function buildModel({ exportFile = false, renderPreviews = false, context, sourcePath = PATHS.sourceWorkbook } = {}) {
  if (exportFile || renderPreviews) {
    throw new Error("Task 8 builds an in-memory workbook only; export and preview rendering are deferred to Task 10");
  }
  const resolvedContext = context ?? buildModelContext(sourcePath);
  const workbook = createWorkbook();
  const modelContext = await resolvedContext;
  buildInputSheets(workbook, modelContext);
  buildOutputSheets(workbook, modelContext);
  applyWorkbookStyles(workbook);
  return workbook;
}

export { createWorkbook, buildInputSheets, buildOutputSheets, applyWorkbookStyles };
