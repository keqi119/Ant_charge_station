function cellText(value) {
  if (value === null || value === undefined) return "—";
  return String(value);
}

/** Renders a searchable, filterable, paginated audit table. */
export function renderDataTable(config) {
  const container = document.createElement("div");
  container.className = "data-table-component";
  let rows = [...(config.rows ?? [])];
  let page = 1;
  let pageSize = config.pageSize ?? 100;
  let search = "";
  const filterValues = new Map();

  const toolbar = document.createElement("div");
  toolbar.className = "table-toolbar no-print";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = config.searchPlaceholder ?? "搜索当前数据";
  searchInput.setAttribute("aria-label", "搜索表格");
  toolbar.append(searchInput);

  for (const filter of config.filters ?? []) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", filter.label);
    const all = document.createElement("option");
    all.value = "";
    all.textContent = `全部${filter.label}`;
    select.append(all);
    const options = filter.options ?? [...new Set(rows.map((row) => row[filter.key]).filter((value) => value !== null && value !== undefined))];
    for (const value of options) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      select.append(option);
    }
    select.addEventListener("change", () => {
      filterValues.set(filter.key, select.value);
      page = 1;
      render();
    });
    toolbar.append(select);
  }

  const pageSizeSelect = document.createElement("select");
  pageSizeSelect.setAttribute("aria-label", "每页行数");
  for (const value of [50, 100, 200]) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = `${value}行/页`;
    option.selected = value === pageSize;
    pageSizeSelect.append(option);
  }
  pageSizeSelect.addEventListener("change", () => {
    pageSize = Number(pageSizeSelect.value);
    page = 1;
    render();
  });
  toolbar.append(pageSizeSelect);
  container.append(toolbar);

  const scroll = document.createElement("div");
  scroll.className = "table-scroll";
  const table = document.createElement("table");
  table.className = "data-table";
  if (config.caption) {
    const caption = document.createElement("caption");
    caption.textContent = config.caption;
    table.append(caption);
  }
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const column of config.columns ?? []) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column.label;
    headerRow.append(th);
  }
  thead.append(headerRow);
  const tbody = document.createElement("tbody");
  tbody.dataset.tableBody = "";
  table.append(thead, tbody);
  scroll.append(table);
  container.append(scroll);

  const pager = document.createElement("div");
  pager.className = "table-pager no-print";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "上一页";
  const info = document.createElement("span");
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "下一页";
  pager.append(previous, info, next);
  container.append(pager);

  function filteredRows() {
    const fields = config.searchableFields ?? (config.columns ?? []).map((column) => column.key);
    const normalized = search.trim().toLocaleLowerCase("zh-CN");
    return rows.filter((row) => {
      if (normalized && !fields.some((key) => cellText(row[key]).toLocaleLowerCase("zh-CN").includes(normalized))) return false;
      return [...filterValues].every(([key, value]) => !value || String(row[key]) === value);
    });
  }

  function render() {
    const filtered = filteredRows();
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, pages);
    const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
    tbody.replaceChildren();
    for (const row of visible) {
      const tr = document.createElement("tr");
      for (const column of config.columns ?? []) {
        const td = document.createElement("td");
        const value = column.format ? column.format(row[column.key], row) : row[column.key];
        if (value instanceof Node) td.append(value);
        else td.textContent = cellText(value);
        if (column.className) td.className = column.className;
        tr.append(td);
      }
      tbody.append(tr);
    }
    info.textContent = `${page}/${pages}页 · ${filtered.length.toLocaleString()}行`;
    previous.disabled = page <= 1;
    next.disabled = page >= pages;
  }

  searchInput.addEventListener("input", () => {
    search = searchInput.value;
    page = 1;
    render();
  });
  previous.addEventListener("click", () => { page -= 1; render(); });
  next.addEventListener("click", () => { page += 1; render(); });
  container.updateRows = (nextRows) => { rows = [...nextRows]; page = 1; render(); };
  container.getVisibleRowCount = () => tbody.rows.length;
  render();
  return container;
}
