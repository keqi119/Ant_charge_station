export const money = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
export const count = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

export function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
}

export function pageHeader(container, title, subtitle, status = "PASS") {
  const header = document.createElement("div");
  header.className = "page-heading";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "MODEL MODULE";
  const heading = document.createElement("h1");
  heading.textContent = String(title ?? "");
  copy.append(eyebrow, heading);
  if (subtitle) {
    const paragraph = document.createElement("p");
    paragraph.className = "page-subtitle";
    paragraph.textContent = String(subtitle);
    copy.append(paragraph);
  }
  const chip = document.createElement("span");
  chip.className = "status-chip";
  chip.dataset.status = status;
  chip.textContent = status === "FAIL" ? "失败" : status === "WARN" ? "警告" : "通过";
  header.append(copy, chip);
  container.append(header);
}

export function card(title, description) {
  const section = document.createElement("section");
  section.className = "content-card";
  const heading = document.createElement("div");
  heading.className = "card-heading";
  const h2 = document.createElement("h2");
  h2.textContent = title;
  heading.append(h2);
  if (description) {
    const paragraph = document.createElement("p");
    paragraph.textContent = description;
    heading.append(paragraph);
  }
  section.append(heading);
  return section;
}

export function metric(label, value, options = {}) {
  const node = document.createElement("div");
  node.className = "mini-metric";
  if (options.attribute) node.setAttribute(options.attribute, "");
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const valueNode = document.createElement("strong");
  valueNode.textContent = value;
  node.append(labelNode, valueNode);
  if (options.note) {
    const note = document.createElement("small");
    note.textContent = options.note;
    node.append(note);
  }
  return node;
}

export function linkNode(value) {
  if (!value) return "—";
  const link = document.createElement("a");
  link.href = value;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "查看来源";
  return link;
}

export function displayDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : String(value ?? "—");
}

export function addMonth(start, offset) {
  const [year, month] = start.split("-").map(Number);
  const absolute = (year * 12) + month - 1 + offset;
  return `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, "0")}`;
}
