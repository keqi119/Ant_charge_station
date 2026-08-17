function rangeText(config) {
  if (config.range) return config.range;
  const limits = [];
  if (config.min !== undefined) limits.push(`最小 ${config.min}`);
  if (config.max !== undefined) limits.push(`最大 ${config.max}`);
  return limits.join(" · ");
}

/** Renders an accessible labelled input control with unit, range, and error. */
export function renderControl(config) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-control";
  const id = config.id ?? `control-${Math.random().toString(36).slice(2)}`;
  const metaId = `${id}-meta`;
  const errorId = `${id}-error`;

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = config.label;
  wrapper.append(label);

  const fieldRow = document.createElement("div");
  fieldRow.className = "field-row";
  let field;
  if (config.type === "select") {
    field = document.createElement("select");
    for (const option of config.options ?? []) {
      const node = document.createElement("option");
      const value = typeof option === "object" ? option.value : option;
      node.value = String(value);
      node.textContent = typeof option === "object" ? option.label : String(option);
      node.selected = value === config.value;
      field.append(node);
    }
  } else {
    field = document.createElement("input");
    field.type = config.type === "month" ? "month" : "number";
    const displayed = config.type === "percent" ? config.value * 100 : config.value;
    field.value = displayed ?? "";
    if (config.min !== undefined) field.min = config.type === "percent" ? config.min * 100 : config.min;
    if (config.max !== undefined) field.max = config.type === "percent" ? config.max * 100 : config.max;
    if (config.step !== undefined) field.step = config.type === "percent" ? config.step * 100 : config.step;
  }
  field.id = id;
  field.dataset.path = config.path ?? "";
  field.setAttribute("aria-describedby", `${metaId} ${errorId}`);
  field.disabled = config.disabled === true;
  if (config.required !== false) field.required = true;

  const emit = () => {
    let value = field.value;
    if (config.type === "number" || config.type === "percent") {
      value = field.value === "" ? null : Number(field.value);
      if (config.type === "percent" && value !== null) value /= 100;
    }
    config.onChange?.(value, config.path, field);
  };
  field.addEventListener(config.type === "select" ? "change" : "input", emit);
  fieldRow.append(field);
  if (config.unit) {
    const unit = document.createElement("span");
    unit.className = "field-unit";
    unit.textContent = config.unit;
    fieldRow.append(unit);
  }
  wrapper.append(fieldRow);

  const meta = document.createElement("div");
  meta.className = "field-meta";
  meta.id = metaId;
  meta.textContent = rangeText(config);
  wrapper.append(meta);

  const error = document.createElement("div");
  error.className = "field-error";
  error.id = errorId;
  error.textContent = config.error ?? "";
  error.hidden = !config.error;
  wrapper.append(error);
  return wrapper;
}
