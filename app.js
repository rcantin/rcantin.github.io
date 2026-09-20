const COLLECTIONS = [
  {
    id: "comics",
    label: "Comic Books",
    file: "data/comics.json",
    sheet: "https://docs.google.com/spreadsheets/d/1ayhk7-di_woCB-Yn7xJXLF89zmaUSlXX-fpAsONAztY/gviz/tq?tqx=out:csv",
    type: "comics",
  },
  {
    id: "cards",
    label: "Trading Cards",
    file: "data/trading-cards.json",
    sheet: "https://docs.google.com/spreadsheets/d/1AX6MCDmu-zMOzwaj09jc4XKSit8SzFycUWxLtjgcfS0/gviz/tq?tqx=out:csv",
    type: "cards",
  },
  { id: "figures", label: "Action Figures", type: "empty" },
  { id: "beanies", label: "Beanie Babies", type: "empty" },
  { id: "coins", label: "Coins", type: "empty" },
  { id: "stamps", label: "Stamps", type: "empty" },
];

const selectEl = document.getElementById("collection");
const searchEl = document.getElementById("search");
const statsEl = document.getElementById("stats");
const contentEl = document.getElementById("content");

const cache = {};
let current = COLLECTIONS[0];
let rows = [];

function checksKey(id) {
  return `collections-checks:${id}`;
}

function loadChecks(id) {
  try {
    return JSON.parse(localStorage.getItem(checksKey(id)) || "{}");
  } catch {
    return {};
  }
}

function saveCheck(id, key, value) {
  const map = loadChecks(id);
  map[key] = value;
  localStorage.setItem(checksKey(id), JSON.stringify(map));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((vals) => {
    const o = {};
    headers.forEach((h, i) => {
      if (h) o[h] = (vals[i] || "").trim();
    });
    return o;
  });
}

function mapComics(list) {
  return list
    .map((r) => ({
      title: r.title || r.Title || "",
      issue: String(r.issue || r.Issue || ""),
      year: String(r.year || r.Year || ""),
      reference: r.reference || r.Reference || "",
      photo: r.photo || "",
      scan: r.scan || r["Actual Condition Photos"] || "",
      value: r.value || r.Value || "",
    }))
    .filter((r) => r.title);
}

function mapCards(list) {
  return list
    .map((r) => ({
      year: String(r.year || r.Year || ""),
      brand: r.brand || r.Brand || "",
      series: r.series || r.Series || "",
      inSet: Number(r.inSet ?? r["In Set"] ?? 0) || 0,
      owned: Number(r.owned ?? r.Owned ?? 0) || 0,
      comments: r.comments || r.Comments || "",
      reference: r.reference || r.Reference || "",
      photos: r.photos || r.Photos || "",
    }))
    .filter((r) => r.series || r.brand);
}

async function loadCollection(col) {
  if (cache[col.id]) return cache[col.id];
  if (col.type === "empty") return (cache[col.id] = []);

  if (col.sheet) {
    try {
      const res = await fetch(col.sheet, { cache: "no-store" });
      if (res.ok) {
        const raw = parseCsv(await res.text());
        const mapped = col.type === "comics" ? mapComics(raw) : mapCards(raw);
        if (mapped.length) return (cache[col.id] = mapped);
      }
    } catch (_) {}
  }

  const res = await fetch(col.file);
  const data = await res.json();
  cache[col.id] = col.type === "comics" ? mapComics(data) : mapCards(data);
  return cache[col.id];
}

function itemKey(col, row, i) {
  if (col.type === "comics") return `${row.title}|${row.issue}|${row.year}`;
  if (col.type === "cards") return `${row.year}|${row.brand}|${row.series}|${row.inSet}`;
  return String(i);
}

function matches(row, q) {
  if (!q) return true;
  return Object.values(row).some((v) => String(v).toLowerCase().includes(q));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkCell(url, label) {
  if (!url) return `<span class="muted">—</span>`;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label || "Link")}</a>`;
}

function renderComics(list, checks) {
  const q = searchEl.value.trim().toLowerCase();
  const filtered = list.filter((r) => matches(r, q));
  const have = filtered.filter((r) => checks[itemKey(current, r)] !== false).length;
  statsEl.innerHTML = `
    <span class="chip"><strong>${filtered.length}</strong> issues</span>
    <span class="chip"><strong>${new Set(filtered.map((r) => r.title)).size}</strong> titles</span>
    <span class="chip"><strong>${have}</strong> checked</span>`;

  if (!filtered.length) {
    contentEl.innerHTML = `<div class="empty"><h2>No matches</h2><p>Try a different search.</p></div>`;
    return;
  }

  contentEl.innerHTML = `<table>
    <thead><tr>
      <th class="check"></th>
      <th>Title</th>
      <th>Issue</th>
      <th>Year</th>
      <th class="hide-sm">Reference</th>
    </tr></thead>
    <tbody>
      ${filtered
        .map((r, i) => {
          const key = itemKey(current, r, i);
          const on = checks[key] !== false;
          return `<tr>
            <td class="check"><input type="checkbox" data-key="${escapeHtml(key)}" ${on ? "checked" : ""} /></td>
            <td class="title">${escapeHtml(r.title)}</td>
            <td>#${escapeHtml(r.issue)}</td>
            <td>${escapeHtml(r.year)}</td>
            <td class="hide-sm">${linkCell(r.reference, "GoCollect")}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

function renderCards(list, checks) {
  const q = searchEl.value.trim().toLowerCase();
  const filtered = list.filter((r) => matches(r, q));
  const owned = filtered.reduce((n, r) => n + r.owned, 0);
  const total = filtered.reduce((n, r) => n + r.inSet, 0);
  const complete = filtered.filter((r) => r.owned >= r.inSet && r.inSet > 0).length;
  statsEl.innerHTML = `
    <span class="chip"><strong>${filtered.length}</strong> sets</span>
    <span class="chip"><strong>${owned}</strong> / ${total} cards</span>
    <span class="chip"><strong>${complete}</strong> complete</span>`;

  if (!filtered.length) {
    contentEl.innerHTML = `<div class="empty"><h2>No matches</h2><p>Try a different search.</p></div>`;
    return;
  }

  contentEl.innerHTML = `<table>
    <thead><tr>
      <th class="check"></th>
      <th>Set</th>
      <th>Year</th>
      <th>Progress</th>
      <th class="hide-sm">Notes</th>
    </tr></thead>
    <tbody>
      ${filtered
        .map((r, i) => {
          const key = itemKey(current, r, i);
          const done = r.owned >= r.inSet && r.inSet > 0;
          const on = checks[key] ?? done;
          const pct = r.inSet ? Math.min(100, Math.round((r.owned / r.inSet) * 100)) : 0;
          return `<tr>
            <td class="check"><input type="checkbox" data-key="${escapeHtml(key)}" ${on ? "checked" : ""} /></td>
            <td>
              <div class="title">${escapeHtml(r.brand)} ${escapeHtml(r.series)}</div>
              <div class="muted">${escapeHtml(r.photos || "")}</div>
            </td>
            <td>${escapeHtml(r.year)}</td>
            <td>
              <div class="${done ? "complete" : "partial"}">${r.owned} / ${r.inSet}</div>
              <div class="bar"><span style="width:${pct}%"></span></div>
            </td>
            <td class="hide-sm muted">${escapeHtml(r.comments || "—")}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

function renderEmpty() {
  statsEl.innerHTML = `<span class="chip">Not started</span>`;
  contentEl.innerHTML = `<div class="empty">
    <h2>${escapeHtml(current.label)} is ready to add</h2>
    <p>This collection has no checklist yet. Drop in a sheet later and it will appear here.</p>
  </div>`;
}

function render() {
  const checks = loadChecks(current.id);
  if (current.type === "comics") renderComics(rows, checks);
  else if (current.type === "cards") renderCards(rows, checks);
  else renderEmpty();
}

contentEl.addEventListener("change", (e) => {
  const box = e.target.closest("input[type=checkbox][data-key]");
  if (!box) return;
  saveCheck(current.id, box.dataset.key, box.checked);
  render();
});

searchEl.addEventListener("input", render);

selectEl.innerHTML = COLLECTIONS.map(
  (c) => `<option value="${c.id}">${c.label}</option>`
).join("");

async function switchTo(id) {
  current = COLLECTIONS.find((c) => c.id === id) || COLLECTIONS[0];
  selectEl.value = current.id;
  const params = new URLSearchParams(location.search);
  params.set("c", current.id);
  history.replaceState(null, "", `${location.pathname}?${params}`);
  contentEl.innerHTML = `<div class="empty"><p>Loading…</p></div>`;
  rows = await loadCollection(current);
  render();
}

selectEl.addEventListener("change", () => switchTo(selectEl.value));

const start = new URLSearchParams(location.search).get("c") || "comics";
switchTo(start);
