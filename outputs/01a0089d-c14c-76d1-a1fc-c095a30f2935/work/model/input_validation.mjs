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

    if (record.population10k !== null || record.urbanPopulation10k !== null) {
      if (!Number.isInteger(record.populationYear) || !isHttpUrl(record.populationSourceUrl)) {
        throw new Error(`population indicator requires year and source row ${row}`);
      }
    }
    if (record.builtAreaKm2 !== null) {
      if (!Number.isInteger(record.densityYear) || !isHttpUrl(record.densitySourceUrl)) {
        throw new Error(`built-area indicator requires year and source row ${row}`);
      }
    }
    if (record.pre2005HousingProxy !== null || record.housingMetric !== null) {
      if (!Number.isInteger(record.housingYear) || !isHttpUrl(record.housingSourceUrl)) {
        throw new Error(`housing indicator requires year and source row ${row}`);
      }
    }
    if (record.publicChargingGuns !== null) {
      if (!Number.isInteger(record.chargingYear) || !isHttpUrl(record.chargingSourceUrl)) {
        throw new Error(`charging indicator requires year and source row ${row}`);
      }
    }

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
