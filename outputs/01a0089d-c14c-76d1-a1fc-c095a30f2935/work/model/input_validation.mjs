import { readFileSync } from "node:fs";

const CITY_TIERS = new Set(["一线", "新一线", "二线", "三线"]);
const SOURCE_FIELDS = [
  "tierSourceUrl",
  "populationSourceUrl",
  "densitySourceUrl",
  "housingSourceUrl",
  "chargingSourceUrl",
];
const CITY_FIELDS = [
  "city",
  "province",
  "tier",
  "yicaiRank",
  "tierSourceName",
  "tierSourceUrl",
  "isFixed",
  "fixedOrder",
  "population10k",
  "populationYear",
  "urbanPopulation10k",
  "builtAreaKm2",
  "densityYear",
  "pre2005HousingProxy",
  "housingMetric",
  "housingYear",
  "publicChargingGuns",
  "chargingYear",
  "populationSourceUrl",
  "densitySourceUrl",
  "housingSourceUrl",
  "chargingSourceUrl",
  "accessedDate",
  "notes",
];

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isReasonableYear(value, accessedDate) {
  const accessedYear = Number.parseInt(accessedDate.slice(0, 4), 10);
  return Number.isInteger(value) && value >= 1900 && value <= accessedYear;
}

function validateProvenanceCoupling({ hasValue, year, sourceUrl, accessedDate, label, row }) {
  if (hasValue) {
    if (!isReasonableYear(year, accessedDate) || !isHttpUrl(sourceUrl)) {
      throw new Error(`${label} requires a reasonable year and source row ${row}`);
    }
  } else if (year !== null || sourceUrl !== "") {
    throw new Error(`${label.replace(/ (?:pair|value)$/u, "")} null state requires null year and blank source row ${row}`);
  }
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateSeasonalityInputs(records) {
  if (!Array.isArray(records) || records.length !== 13) {
    throw new Error("seasonality rows must equal 13");
  }

  const expectedMonths = [
    "2023-12",
    ...Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, "0")}`),
  ];
  const months = records.map((record) => record.month);
  if (new Set(months).size !== 13 || months.some((month, i) => month !== expectedMonths[i])) {
    throw new Error("seasonality months must run 2023-12 through 2024-12");
  }

  for (const [i, record] of records.entries()) {
    if (!isPositiveInteger(record.monthEndPublicGuns) || !isHttpUrl(record.gunSourceUrl)) {
      throw new Error(`invalid gun input row ${i + 1}`);
    }
    if (record.accessedDate !== "2026-08-16") {
      throw new Error(`invalid accessed date row ${i + 1}`);
    }
    if (i === 0) {
      if (record.chargingKwh100m !== null || record.volumeSourceUrl !== "") {
        throw new Error("prior December row must contain gun base only");
      }
    } else if (!isPositiveNumber(record.chargingKwh100m) || !isHttpUrl(record.volumeSourceUrl)) {
      throw new Error(`invalid volume input row ${i + 1}`);
    }
  }

  return records;
}

export function validateCityInputs(records, fixedCities) {
  if (!Array.isArray(records) || !Array.isArray(fixedCities)) {
    throw new TypeError("city inputs and fixed cities must be arrays");
  }

  const names = records.map((record) => record.city);
  if (names.some((name) => typeof name !== "string" || name.length === 0)) {
    throw new Error("city name is required");
  }
  if (new Set(names).size !== names.length) {
    throw new Error("duplicate city names");
  }
  const ranks = records.map((record) => record.yicaiRank);
  if (new Set(ranks).size !== ranks.length) {
    throw new Error("duplicate Yicai ranks");
  }

  const missingFixed = fixedCities.filter((city) => !names.includes(city));
  if (missingFixed.length > 0) {
    throw new Error(`missing fixed cities: ${missingFixed.join(", ")}`);
  }

  const expectedFixedOrder = new Map(fixedCities.map((city, i) => [city, i + 1]));
  for (const [i, record] of records.entries()) {
    const row = i + 1;
    for (const field of CITY_FIELDS) {
      if (!Object.hasOwn(record, field)) {
        throw new Error(`missing city field ${field} row ${row}`);
      }
    }
    if (typeof record.province !== "string" || record.province.length === 0) {
      throw new Error(`province required row ${row}`);
    }
    if (!CITY_TIERS.has(record.tier)) {
      throw new Error(`invalid tier row ${row}`);
    }
    if (!Number.isInteger(record.yicaiRank) || record.yicaiRank <= 0) {
      throw new Error(`invalid Yicai rank row ${row}`);
    }
    if (!(typeof record.tierSourceName === "string" && record.tierSourceName.trim()) || !isHttpUrl(record.tierSourceUrl)) {
      throw new Error(`invalid tier provenance row ${row}`);
    }
    if (typeof record.isFixed !== "boolean") {
      throw new Error(`invalid fixed flag row ${row}`);
    }

    const wantedOrder = expectedFixedOrder.get(record.city);
    if (wantedOrder !== undefined) {
      if (record.isFixed !== true || record.fixedOrder !== wantedOrder) {
        throw new Error(`fixed city flag or order mismatch row ${row}`);
      }
    } else if (record.isFixed || record.fixedOrder !== null) {
      throw new Error(`non-fixed city flag or order mismatch row ${row}`);
    }

    for (const field of SOURCE_FIELDS) {
      const value = record[field];
      if (value !== "" && !isHttpUrl(value)) {
        throw new Error(`non-HTTP source in ${field} row ${row}`);
      }
    }
    if (record.accessedDate !== "2026-08-16") {
      throw new Error(`invalid accessed date row ${row}`);
    }

    if (!record.isFixed && record.population10k === null) {
      throw new Error(`population required for automatic selection row ${row}`);
    }
    if (record.population10k !== null && !isPositiveNumber(record.population10k)) {
      throw new Error(`population must be positive row ${row}`);
    }

    const optionalRules = [
      ["urbanPopulation10k", isPositiveNumber, "invalid urban-population indicator"],
      ["builtAreaKm2", isPositiveNumber, "invalid built-area indicator"],
      ["pre2005HousingProxy", isNonNegativeNumber, "invalid housing-proxy indicator"],
      ["housingMetric", (value) => typeof value === "string" && value.trim().length > 0, "invalid housing metric"],
      ["publicChargingGuns", isNonNegativeInteger, "invalid charging indicator"],
    ];
    for (const [field, isValid, message] of optionalRules) {
      if (record[field] !== null && !isValid(record[field])) {
        if (record[field] === "") {
          throw new Error(`optional indicator ${field} must be null or a valid value row ${row}`);
        }
        throw new Error(`${message} row ${row}`);
      }
    }

    validateProvenanceCoupling({
      hasValue: record.population10k !== null,
      year: record.populationYear,
      sourceUrl: record.populationSourceUrl,
      accessedDate: record.accessedDate,
      label: "population pair",
      row,
    });

    const hasUrbanPopulation = record.urbanPopulation10k !== null;
    const hasBuiltArea = record.builtAreaKm2 !== null;
    if (hasUrbanPopulation !== hasBuiltArea) {
      throw new Error(`urban population and built area must be paired row ${row}`);
    }
    validateProvenanceCoupling({
      hasValue: hasUrbanPopulation,
      year: record.densityYear,
      sourceUrl: record.densitySourceUrl,
      accessedDate: record.accessedDate,
      label: "density pair",
      row,
    });

    const hasHousingValue = record.pre2005HousingProxy !== null;
    const hasHousingMetric = record.housingMetric !== null;
    if (hasHousingValue !== hasHousingMetric) {
      throw new Error(`housing value and metric must be paired row ${row}`);
    }
    validateProvenanceCoupling({
      hasValue: hasHousingValue,
      year: record.housingYear,
      sourceUrl: record.housingSourceUrl,
      accessedDate: record.accessedDate,
      label: "housing value",
      row,
    });

    validateProvenanceCoupling({
      hasValue: record.publicChargingGuns !== null,
      year: record.chargingYear,
      sourceUrl: record.chargingSourceUrl,
      accessedDate: record.accessedDate,
      label: "charging value",
      row,
    });

    const optionalValues = [
      record.urbanPopulation10k,
      record.builtAreaKm2,
      record.pre2005HousingProxy,
      record.housingMetric,
      record.publicChargingGuns,
    ];
    if (optionalValues.some((value) => value === null) && !(typeof record.notes === "string" && record.notes.trim())) {
      throw new Error(`notes must explain missing optional indicators row ${row}`);
    }
  }

  return records;
}

export function validateCityMetricAuditManifest(manifest, records) {
  if (!manifest || typeof manifest !== "object" || manifest.schemaVersion !== 1) {
    throw new Error("invalid city metric audit manifest schema");
  }
  if (!Array.isArray(records) || !Array.isArray(manifest.cities)) {
    throw new TypeError("city inputs and audit manifest cities must be arrays");
  }

  const source = manifest.sources?.mohurd2022CityConstruction;
  if (
    !source ||
    !isHttpUrl(source.indexUrl) ||
    !isHttpUrl(source.directUrl) ||
    source.sheet !== "2-2" ||
    source.workbookYear !== 2022 ||
    source.rowNumberBasis !== "Excel worksheet row, 1-based" ||
    !Number.isInteger(source.fileSizeBytes) ||
    source.fileSizeBytes <= 0 ||
    !/^[a-f0-9]{64}$/.test(source.sha256)
  ) {
    throw new Error("invalid MOHURD source identity in audit manifest");
  }

  const housingContract = manifest.contracts?.housing;
  const chargingContract = manifest.contracts?.charging;
  if (
    housingContract?.requiredUnit !== "个" ||
    !Array.isArray(housingContract.allowedProxyMetrics) ||
    !Array.isArray(housingContract.allowedExecutionStatuses) ||
    housingContract.directSourceRequiredWhenPopulated !== true
  ) {
    throw new Error("invalid housing audit contract");
  }
  if (
    chargingContract?.requiredUnit !== "枪" ||
    chargingContract.requiredGeography !== "市级" ||
    chargingContract.requiredMetric !== "公共充电枪数量" ||
    chargingContract.directSourceRequiredWhenPopulated !== true ||
    chargingContract.provinceSubstitutionAllowed !== false
  ) {
    throw new Error("invalid charging audit contract");
  }

  if (manifest.cities.length !== records.length) {
    throw new Error("audit manifest city count mismatch");
  }
  const manifestNames = manifest.cities.map((entry) => entry?.city);
  if (new Set(manifestNames).size !== manifestNames.length) {
    throw new Error("duplicate audit manifest city");
  }
  const byCity = new Map(manifest.cities.map((entry) => [entry.city, entry]));

  for (const record of records) {
    const audit = byCity.get(record.city);
    if (!audit) throw new Error(`missing audit manifest city ${record.city}`);

    const population = audit.population;
    if (
      population?.expectedValue10k !== record.population10k ||
      population?.year !== record.populationYear ||
      population?.directSourceUrl !== record.populationSourceUrl ||
      !isPositiveNumber(population.expectedValue10k) ||
      !Number.isInteger(population.year) ||
      !isHttpUrl(population.directSourceUrl)
    ) {
      throw new Error(`${record.city}: population manifest drift`);
    }

    const density = audit.density;
    const rawTemporary = density?.rawTemporaryPopulation10k;
    const rawArea = density?.rawBuiltAreaComponentsKm2?.builtArea;
    if (
      !density ||
      density.sourceId !== "mohurd2022CityConstruction" ||
      density.year !== 2022 ||
      density.sheet !== "2-2" ||
      density.directSourceUrl !== source.directUrl ||
      !Number.isInteger(density.officialRow) ||
      density.officialRow <= 0 ||
      !isPositiveNumber(density.rawUrbanPopulation10k) ||
      !(rawTemporary === null || isNonNegativeNumber(rawTemporary)) ||
      !(rawArea === null || isPositiveNumber(rawArea)) ||
      density.rawBuiltAreaKm2 !== rawArea ||
      density.computedBuiltAreaKm2 !== rawArea
    ) {
      throw new Error(`${record.city}: invalid density manifest row`);
    }
    const computedUrban = Number(
      (density.rawUrbanPopulation10k + (rawTemporary ?? 0)).toFixed(10),
    );
    if (density.computedUrbanPopulation10k !== computedUrban) {
      throw new Error(`${record.city}: density computation drift`);
    }
    if (
      density.expectedUrbanPopulation10k !== record.urbanPopulation10k ||
      density.expectedBuiltAreaKm2 !== record.builtAreaKm2
    ) {
      throw new Error(`${record.city}: density manifest drift`);
    }
    if (record.urbanPopulation10k !== null || record.builtAreaKm2 !== null) {
      if (
        record.urbanPopulation10k !== computedUrban ||
        record.builtAreaKm2 !== rawArea ||
        record.densityYear !== density.year ||
        record.densitySourceUrl !== density.directSourceUrl ||
        !isHttpUrl(density.directSourceUrl)
      ) {
        throw new Error(`${record.city}: density manifest drift`);
      }
    } else if (
      record.densityYear !== null ||
      record.densitySourceUrl !== "" ||
      !(typeof density.missingReason === "string" && density.missingReason.trim())
    ) {
      throw new Error(`${record.city}: density missing reason or null state invalid`);
    }

    const housing = audit.housing;
    if (
      housing?.expectedValue !== record.pre2005HousingProxy ||
      housing?.year !== record.housingYear ||
      housing?.directSourceUrl !== record.housingSourceUrl ||
      housing?.proxyMetric !== record.housingMetric
    ) {
      throw new Error(`${record.city}: housing manifest drift`);
    }
    if (record.pre2005HousingProxy !== null) {
      if (
        housing.unit !== housingContract.requiredUnit ||
        !housingContract.allowedProxyMetrics.includes(housing.proxyMetric) ||
        !housingContract.allowedExecutionStatuses.includes(housing.executionStatus) ||
        !Number.isInteger(housing.year) ||
        !isHttpUrl(housing.directSourceUrl)
      ) {
        throw new Error(`${record.city}: housing manifest semantics invalid`);
      }
    } else if (!(typeof housing.missingReason === "string" && housing.missingReason.trim())) {
      throw new Error(`${record.city}: housing missing reason required`);
    }

    const charging = audit.charging;
    if (
      charging?.expectedValue !== record.publicChargingGuns ||
      charging?.year !== record.chargingYear ||
      charging?.directSourceUrl !== record.chargingSourceUrl
    ) {
      throw new Error(`${record.city}: charging manifest drift`);
    }
    if (record.publicChargingGuns !== null) {
      if (
        charging.unit !== chargingContract.requiredUnit ||
        charging.geography !== chargingContract.requiredGeography ||
        charging.metric !== chargingContract.requiredMetric ||
        !Number.isInteger(charging.year) ||
        !isHttpUrl(charging.directSourceUrl)
      ) {
        throw new Error(`${record.city}: charging manifest semantics invalid`);
      }
    } else if (!(typeof charging.missingReason === "string" && charging.missingReason.trim())) {
      throw new Error(`${record.city}: charging missing reason required`);
    }
  }

  return manifest.cities;
}
