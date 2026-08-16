function requireFinitePositive(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
  return value;
}

function parseUtcDate(value, label) {
  if (value instanceof Date) {
    const date = new Date(value.getTime());
    if (!Number.isFinite(date.getTime())) throw new Error(`invalid date: ${label}`);
    return date;
  }
  const match = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`invalid date: ${label}`);
  const [, year, month, day] = match;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new Error(`invalid date: ${label}`);
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() + 1 !== Number(month)
    || date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`invalid date: ${label}`);
  }
  return date;
}

export function buildSeasonalityCurve(inputs) {
  if (!Array.isArray(inputs) || inputs.length !== 13) {
    throw new Error("seasonality inputs must contain December base plus 12 months");
  }
  const months = inputs.slice(1).map((row, index) => {
    const prior = inputs[index];
    const days = new Date(Date.UTC(2024, index + 1, 0)).getUTCDate();
    const avgGuns = (requireFinitePositive(prior.monthEndPublicGuns, `month ${index} guns`)
      + requireFinitePositive(row.monthEndPublicGuns, `month ${index + 1} guns`)) / 2;
    const chargingKwh100m = requireFinitePositive(row.chargingKwh100m, `month ${index + 1} charging kWh`);
    const kwhPerGunDay = chargingKwh100m * 1e8 / days / avgGuns;
    return { monthNumber: index + 1, days, avgGuns, chargingKwh100m, kwhPerGunDay };
  });
  const mean = months.reduce((sum, month) => sum + month.kwhPerGunDay, 0) / months.length;
  return months.map((month) => ({ ...month, index: month.kwhPerGunDay / mean }));
}

export function annualizePeakBenchmark(value, curve, startDate, endDate) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError("benchmark value must be a non-negative finite number");
  }
  if (!Array.isArray(curve) || curve.length !== 12) throw new Error("seasonality curve must contain 12 months");
  const indexByMonth = new Map();
  for (const month of curve) {
    if (!Number.isInteger(month?.monthNumber) || month.monthNumber < 1 || month.monthNumber > 12) {
      throw new Error("seasonality curve has an invalid month number");
    }
    if (indexByMonth.has(month.monthNumber)) throw new Error("seasonality curve has duplicate months");
    indexByMonth.set(month.monthNumber, requireFinitePositive(month.index, `seasonality index for month ${month.monthNumber}`));
  }
  if (indexByMonth.size !== 12) throw new Error("seasonality curve must contain every month");

  const start = parseUtcDate(startDate, "start");
  const end = parseUtcDate(endDate, "end");
  if (end < start) throw new RangeError("end date must not precede start date");

  let totalIndex = 0;
  let sourcePeriodDays = 0;
  for (let day = start.getTime(); day <= end.getTime(); day += 86_400_000) {
    totalIndex += indexByMonth.get(new Date(day).getUTCMonth() + 1);
    sourcePeriodDays += 1;
  }
  return value / (totalIndex / sourcePeriodDays);
}
