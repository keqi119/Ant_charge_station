const TOTAL_FIELDS = Object.freeze([
  "orders", "kwh", "sharpKwh", "peakKwh", "flatKwh", "valleyKwh",
  "minutes", "gross", "electricityFee", "serviceFee",
]);

function requireFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function validDayKey(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("invalid operating date");
  }
  return Math.floor(value.getTime() / 86_400_000);
}

function median(values) {
  const middle = values.length / 2;
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[Math.floor(middle)];
}

function linearPercentile(sortedValues, percentile) {
  const position = percentile * (sortedValues.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

export function profileHistoricalRows(rows, { matureOperatingDays = 30 } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("historical rows must be an array");
  if (!Number.isInteger(matureOperatingDays) || matureOperatingDays <= 0) {
    throw new RangeError("mature operating days must be a positive integer");
  }

  const totals = Object.fromEntries(TOTAL_FIELDS.map((field) => [field, 0]));
  const stationMap = new Map();
  const calendarDays = new Set();

  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object") throw new TypeError(`historical row ${index + 1} must be an object`);
    if (typeof row.stationId !== "string" || row.stationId.length === 0) {
      throw new Error(`historical row ${index + 1} must have a station ID`);
    }
    const dayKey = validDayKey(row.date);
    const dcGuns = requireFiniteNumber(row.dcGuns, `historical row ${index + 1} DC guns`);
    const acGuns = requireFiniteNumber(row.acGuns, `historical row ${index + 1} AC guns`);
    if (dcGuns < 0 || acGuns < 0) throw new RangeError(`historical row ${index + 1} must have a non-negative gun count`);
    const guns = dcGuns + acGuns;
    if (guns <= 0) throw new RangeError(`historical row ${index + 1} must have a positive gun count`);
    for (const field of TOTAL_FIELDS) totals[field] += requireFiniteNumber(row[field], `historical row ${index + 1} ${field}`);

    const station = stationMap.get(row.stationId) ?? {
      stationId: row.stationId,
      stationName: row.stationName,
      guns: 0,
      operatingDayKeys: new Set(),
      serviceFee: 0,
      gross: 0,
      kwh: 0,
    };
    station.guns = Math.max(station.guns, guns);
    station.operatingDayKeys.add(dayKey);
    station.serviceFee += row.serviceFee;
    station.gross += row.gross;
    station.kwh += row.kwh;
    stationMap.set(row.stationId, station);
    calendarDays.add(dayKey);
  }

  const stationProfiles = [...stationMap.values()].map((station) => {
    const operatingDays = station.operatingDayKeys.size;
    const gunDays = station.guns * operatingDays;
    return {
      ...station,
      operatingDayKeys: undefined,
      operatingDays,
      gunDays,
      serviceFeePerGunDay: station.serviceFee / gunDays,
      grossPerGunDay: station.gross / gunDays,
      kwhPerGunDay: station.kwh / gunDays,
    };
  });
  const matureStationProfiles = stationProfiles.filter((station) => station.operatingDays >= matureOperatingDays);
  if (matureStationProfiles.length === 0) throw new Error("no mature stations available for benchmark");

  const matureServicePerGunDay = matureStationProfiles.map((station) => station.serviceFeePerGunDay).sort((a, b) => a - b);
  const matureGunDays = matureStationProfiles.reduce((sum, station) => sum + station.gunDays, 0);
  const matureServiceFee = matureStationProfiles.reduce((sum, station) => sum + station.serviceFee, 0);
  const dayNumbers = [...calendarDays];

  return {
    rowCount: rows.length,
    stationCount: stationProfiles.length,
    matureStationCount: matureStationProfiles.length,
    sourcePeriod: {
      startDayKey: Math.min(...dayNumbers),
      endDayKey: Math.max(...dayNumbers),
      calendarDays: dayNumbers.length === 0 ? 0 : Math.max(...dayNumbers) - Math.min(...dayNumbers) + 1,
    },
    totals,
    reconciliations: {
      grossComponentsDifference: totals.gross - totals.electricityFee - totals.serviceFee,
      touKwhDifference: totals.kwh - totals.sharpKwh - totals.peakKwh - totals.flatKwh - totals.valleyKwh,
    },
    stationProfiles,
    matureStationProfiles,
    benchmarks: {
      matureP25: linearPercentile(matureServicePerGunDay, 0.25),
      matureMedian: median(matureServicePerGunDay),
      matureWeighted: matureServiceFee / matureGunDays,
    },
  };
}
