/* Federal Award Explorer — vanilla JS + MapLibre GL
 *
 * Top:    choropleth of total obligated contract $ by state or county
 *         (place of performance), from USAspending /spending_by_geography.
 * Bottom: sortable, paginated table of award rows from /spending_by_award.
 *
 * USAspending sends no CORS headers, so every API call goes through the Netlify
 * proxy at /.netlify/functions/usaspending?path=... (never the API directly).
 *
 * The geography endpoint returns amounts keyed by code only (no geometry):
 *   - state layer  → shape_code is the 2-letter postal code ("GA")
 *   - county layer → shape_code is the 5-digit county FIPS ("13089")
 * We fetch boundary geometry from us-atlas (TopoJSON, no key) and join amounts
 * onto it. State postal codes are mapped to FIPS via STATE_FIPS below; county
 * shape_code is already a FIPS id and joins directly.
 */

// ---- endpoints -----------------------------------------------------------
// Repointed for the boblemieux site: the CORS proxy is now an in-repo Next.js
// API route (was the standalone Netlify function /.netlify/functions/usaspending).
const PROXY = "/api/usaspending";
const GEO_URL = `${PROXY}?path=search/spending_by_geography`;
const AWARD_URL = `${PROXY}?path=search/spending_by_award`;

// us-atlas boundary geometry (no API key). ids are FIPS codes.
const STATES_TOPO = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const COUNTIES_TOPO = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";

const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const SE_CENTER = [-82.0, 33.5];
const SE_ZOOM = 5;

// Award fields to request. "sort" must be one of these. NAICS arrives as a
// nested {code, description} object; we flatten it for display/sort/export.
const AWARD_FIELDS = [
  "Award ID",
  "Recipient Name",
  "Award Amount",
  "Awarding Agency",
  "NAICS",
  "Place of Performance State Code",
  "generated_internal_id",
];
const PAGE_LIMIT = 25;

// State postal → 2-digit FIPS (for joining state-layer results to geometry).
const STATE_FIPS = {
  AL:"01",AK:"02",AZ:"04",AR:"05",CA:"06",CO:"08",CT:"09",DE:"10",DC:"11",
  FL:"12",GA:"13",HI:"15",ID:"16",IL:"17",IN:"18",IA:"19",KS:"20",KY:"21",
  LA:"22",ME:"23",MD:"24",MA:"25",MI:"26",MN:"27",MS:"28",MO:"29",MT:"30",
  NE:"31",NV:"32",NH:"33",NJ:"34",NM:"35",NY:"36",NC:"37",ND:"38",OH:"39",
  OK:"40",OR:"41",PA:"42",RI:"44",SC:"45",SD:"46",TN:"47",TX:"48",UT:"49",
  VT:"50",VA:"51",WA:"53",WV:"54",WI:"55",WY:"56",
};
const FIPS_STATE = Object.fromEntries(Object.entries(STATE_FIPS).map(([k, v]) => [v, k]));
const STATE_NAMES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",
  CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",
  LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",
  NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",
  OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",
  WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
};

// Choropleth buckets (dollars) + colors (sequential blues, ColorBrewer).
const BUCKETS = [
  { min: 0,     color: "#eeeeee", label: "No data / $0" },
  { min: 1,     color: "#deebf7", label: "< $1M" },
  { min: 1e6,   color: "#9ecae1", label: "$1M – $10M" },
  { min: 1e7,   color: "#6baed6", label: "$10M – $50M" },
  { min: 5e7,   color: "#3182bd", label: "$50M – $100M" },
  { min: 1e8,   color: "#08519c", label: "≥ $100M" },
];

// Defaults (seed values).
const DEFAULT_STATES = ["SC", "NC", "GA", "TN"];
const DEFAULT_NAICS = ["236220", "237130", "518210"];
const DEFAULT_AWARD_TYPES = ["A", "B", "C", "D"];

// ---- state ---------------------------------------------------------------
let labelLayerId;                 // basemap's lowest symbol layer (overlays go below)
let statesGeo = null;             // parsed GeoJSON FeatureCollection (states)
let countiesGeo = null;           // parsed GeoJSON FeatureCollection (counties)
let currentRows = [];             // award rows currently loaded in the table
let currentPage = 1;
let hasNext = false;
let activeFilters = null;         // last applied filters (frozen on Apply)
let activeGeoLayer = "state";
let lastQueryKey = null;          // signature to avoid refiring identical queries
let sortState = { key: "Award Amount", dir: "desc" };

const SRC_ID = "geo-src";
const FILL_ID = "geo-fill";
const LINE_ID = "geo-line";

// ---- map -----------------------------------------------------------------
const map = new maplibregl.Map({
  container: "map",
  style: BASEMAP_STYLE,
  center: SE_CENTER,
  zoom: SE_ZOOM,
});
map.addControl(new maplibregl.NavigationControl(), "top-right");

function firstSymbolLayerId() {
  const layers = map.getStyle().layers || [];
  for (const l of layers) if (l.type === "symbol") return l.id;
  return undefined;
}

// ---- helpers -------------------------------------------------------------
function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function fmtUSD(n) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function colorForAmount(amt) {
  let c = BUCKETS[0].color;
  for (const b of BUCKETS) if (amt >= b.min) c = b.color;
  return c;
}

// ---- filters from UI -----------------------------------------------------
function fyToTimePeriod(fy) {
  // Federal FY N runs Oct 1 (N-1) → Sep 30 (N).
  const y = parseInt(fy, 10);
  return { start_date: `${y - 1}-10-01`, end_date: `${y}-09-30` };
}

function readFilters() {
  const fys = [...document.getElementById("fy").selectedOptions].map((o) => o.value);
  const states = [...document.getElementById("states").selectedOptions].map((o) => o.value);
  const naics = document
    .getElementById("naics")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const awardTypes = [...document.querySelectorAll("#award-types input:checked")].map((c) => c.value);

  const filters = {
    time_period: fys.map(fyToTimePeriod),
    award_type_codes: awardTypes,
  };
  if (naics.length) filters.naics_codes = naics;
  if (states.length) filters.place_of_performance_locations = states.map((s) => ({ country: "USA", state: s }));

  return { filters, states, fys, naics, awardTypes };
}

// ---- API calls (through proxy) ------------------------------------------
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

async function queryGeography(filters, geoLayer) {
  const data = await apiPost(GEO_URL, {
    scope: "place_of_performance",
    geo_layer: geoLayer,
    filters,
  });
  return data.results || [];
}

async function queryAwards(filters, page) {
  const data = await apiPost(AWARD_URL, {
    filters,
    fields: AWARD_FIELDS,
    page,
    limit: PAGE_LIMIT,
    sort: "Award Amount",
    order: "desc",
  });
  return {
    rows: (data.results || []).map(flattenAward),
    hasNext: !!(data.page_metadata && data.page_metadata.hasNext),
    page: (data.page_metadata && data.page_metadata.page) || page,
  };
}

// Flatten the API row into a flat object the table/sort/export can use.
function flattenAward(r) {
  const naics = r.NAICS || {};
  return {
    "Recipient Name": r["Recipient Name"] || "",
    "Award Amount": r["Award Amount"] != null ? Number(r["Award Amount"]) : null,
    "Awarding Agency": r["Awarding Agency"] || "",
    naics_code: naics.code || "",
    naics_desc: naics.description || "",
    "Place of Performance State Code": r["Place of Performance State Code"] || "",
    "Award ID": r["Award ID"] || "",
    generated_internal_id: r.generated_internal_id || "",
  };
}

// ---- choropleth ----------------------------------------------------------
function ensureGeoLayers() {
  if (map.getSource(SRC_ID)) return;
  map.addSource(SRC_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  // Data-driven fill from the joined `amount` property. Insert BELOW the first
  // symbol layer so basemap place labels stay readable on top.
  const fillColor = ["step", ["coalesce", ["get", "amount"], 0]];
  fillColor.push(BUCKETS[0].color);
  for (let i = 1; i < BUCKETS.length; i++) fillColor.push(BUCKETS[i].min, BUCKETS[i].color);

  map.addLayer(
    {
      id: FILL_ID,
      type: "fill",
      source: SRC_ID,
      paint: { "fill-color": fillColor, "fill-opacity": 0.75 },
    },
    labelLayerId
  );
  map.addLayer(
    {
      id: LINE_ID,
      type: "line",
      source: SRC_ID,
      paint: { "line-color": "#37474f", "line-width": 0.5 },
    },
    labelLayerId
  );

  // Popup on click.
  map.on("click", FILL_ID, (e) => {
    const f = e.features[0];
    if (!f) return;
    new maplibregl.Popup({ closeButton: true })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="popup"><strong>${escapeHtml(f.properties.name)}</strong><br>` +
        `Total obligated: ${fmtUSD(f.properties.amount)}</div>`
      )
      .addTo(map);
  });
  map.on("mouseenter", FILL_ID, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", FILL_ID, () => (map.getCanvas().style.cursor = ""));
}

// Build a FeatureCollection for the selected geography, joining amounts.
function paintChoropleth(results, geoLayer, selectedStates) {
  ensureGeoLayers();
  const amountByCode = new Map(results.map((r) => [String(r.shape_code), r]));
  let features;

  if (geoLayer === "state") {
    // shape_code = postal code → FIPS to match us-atlas state ids.
    const wanted = new Set((selectedStates.length ? selectedStates : Object.keys(STATE_FIPS)).map((s) => STATE_FIPS[s]).filter(Boolean));
    features = statesGeo.features
      .filter((f) => wanted.has(String(f.id).padStart(2, "0")))
      .map((f) => {
        const postal = FIPS_STATE[String(f.id).padStart(2, "0")];
        const rec = amountByCode.get(postal);
        return joinFeature(f, rec ? rec.aggregated_amount : 0, rec ? rec.display_name : (STATE_NAMES[postal] || postal));
      });
  } else {
    // county: shape_code = 5-digit FIPS = feature id directly.
    const stateFipsSet = new Set((selectedStates.length ? selectedStates : Object.keys(STATE_FIPS)).map((s) => STATE_FIPS[s]).filter(Boolean));
    features = countiesGeo.features
      .filter((f) => stateFipsSet.has(String(f.id).padStart(5, "0").slice(0, 2)))
      .map((f) => {
        const fips = String(f.id).padStart(5, "0");
        const rec = amountByCode.get(fips);
        return joinFeature(f, rec ? rec.aggregated_amount : 0, rec ? rec.display_name : (f.properties && f.properties.name) || fips);
      });
  }

  map.getSource(SRC_ID).setData({ type: "FeatureCollection", features });
}

function joinFeature(f, amount, name) {
  return {
    type: "Feature",
    geometry: f.geometry,
    properties: { amount: amount || 0, name },
  };
}

// ---- legend --------------------------------------------------------------
function buildLegend() {
  const ul = document.getElementById("legend");
  ul.innerHTML = BUCKETS.map(
    (b) => `<li><span class="sw" style="background:${b.color}"></span>${b.label}</li>`
  ).join("");
}

// ---- table ---------------------------------------------------------------
function renderTable() {
  const body = document.getElementById("awards-body");
  const empty = document.getElementById("empty");
  const rows = sortedRows();

  if (!rows.length) {
    body.innerHTML = "";
    empty.hidden = false;
  } else {
    empty.hidden = true;
    body.innerHTML = rows
      .map((r) => {
        const url = r.generated_internal_id
          ? `https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id)}`
          : null;
        const idCell = url
          ? `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(r["Award ID"])}</a>`
          : escapeHtml(r["Award ID"]);
        const naics = r.naics_code ? `${escapeHtml(r.naics_code)}${r.naics_desc ? " — " + escapeHtml(r.naics_desc) : ""}` : "—";
        return (
          `<tr>` +
          `<td>${escapeHtml(r["Recipient Name"]) || "—"}</td>` +
          `<td class="num">${fmtUSD(r["Award Amount"])}</td>` +
          `<td>${escapeHtml(r["Awarding Agency"]) || "—"}</td>` +
          `<td>${naics}</td>` +
          `<td>${escapeHtml(r["Place of Performance State Code"]) || "—"}</td>` +
          `<td>${idCell}</td>` +
          `</tr>`
        );
      })
      .join("");
  }
  updateHeaderArrows();
  updatePager();
}

function sortedRows() {
  const { key, dir } = sortState;
  const mult = dir === "asc" ? 1 : -1;
  return [...currentRows].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (typeof av === "number" || typeof bv === "number") {
      return ((av ?? -Infinity) - (bv ?? -Infinity)) * mult;
    }
    return String(av ?? "").localeCompare(String(bv ?? "")) * mult;
  });
}

function updateHeaderArrows() {
  document.querySelectorAll("#awards thead th").forEach((th) => {
    const arrow = th.querySelector(".arrow");
    if (arrow) arrow.remove();
    if (th.dataset.key === sortState.key) {
      const s = document.createElement("span");
      s.className = "arrow";
      s.textContent = sortState.dir === "asc" ? " ▲" : " ▼";
      th.appendChild(s);
    }
  });
}

function updatePager() {
  document.getElementById("page-info").textContent = `Page ${currentPage}${currentRows.length ? ` · ${currentRows.length} rows` : ""}`;
  document.getElementById("prev").disabled = currentPage <= 1;
  document.getElementById("next").disabled = !hasNext;
  const title = activeFilters
    ? `Awards — ${activeFilters.place_of_performance_locations ? activeFilters.place_of_performance_locations.map((l) => l.state).join(", ") : "all states"}`
    : "Awards";
  document.getElementById("table-title").textContent = title;
}

// ---- query orchestration -------------------------------------------------
function queryKey(filters, geoLayer) {
  return JSON.stringify({ filters, geoLayer });
}

async function applyFilters() {
  const { filters, states } = readFilters();
  const geoLayer = document.querySelector('input[name="geo"]:checked').value;

  if (!filters.award_type_codes.length) {
    setStatus("Select at least one award type.", true);
    return;
  }
  if (!filters.time_period.length) {
    setStatus("Select at least one fiscal year.", true);
    return;
  }

  const key = queryKey(filters, geoLayer);
  if (key === lastQueryKey) {
    setStatus("Filters unchanged — using current results.");
    return;
  }

  activeFilters = filters;
  activeGeoLayer = geoLayer;
  currentPage = 1;

  await runQuery(states, /*newFilters=*/ true);
  lastQueryKey = key;
}

async function runQuery(states, newFilters) {
  const btn = document.getElementById("apply");
  btn.disabled = true;
  setStatus("Querying USAspending…");
  try {
    // One geography call + one award-page call per Apply (rate-limit friendly).
    const [geoResults, awardResult] = await Promise.all([
      newFilters ? queryGeography(activeFilters, activeGeoLayer) : Promise.resolve(null),
      queryAwards(activeFilters, currentPage),
    ]);

    if (geoResults) {
      paintChoropleth(geoResults, activeGeoLayer, states || lastStates());
      _lastStates = states;
    }

    currentRows = awardResult.rows;
    hasNext = awardResult.hasNext;
    currentPage = awardResult.page;
    renderTable();

    const geoMsg = geoResults ? `${geoResults.length} ${activeGeoLayer}(s) mapped · ` : "";
    setStatus(`${geoMsg}${currentRows.length} award(s) on page ${currentPage}${hasNext ? " (more available)" : ""}.`);
  } catch (e) {
    setStatus(`Query failed: ${e.message}. Is 'netlify dev' running?`, true);
  } finally {
    btn.disabled = false;
  }
}

let _lastStates = DEFAULT_STATES;
function lastStates() { return _lastStates; }

async function changePage(delta) {
  const target = currentPage + delta;
  if (target < 1) return;
  if (delta > 0 && !hasNext) return;
  currentPage = target;
  await runQuery(null, /*newFilters=*/ false);
}

// ---- Excel export --------------------------------------------------------
function exportToExcel() {
  if (!currentRows.length) {
    setStatus("Nothing to export — table is empty.", true);
    return;
  }
  const aoa = currentRows.map((r) => ({
    Recipient: r["Recipient Name"],
    "Award Amount": r["Award Amount"],
    "Awarding Agency": r["Awarding Agency"],
    "NAICS Code": r.naics_code,
    "NAICS Description": r.naics_desc,
    "Place of Performance": r["Place of Performance State Code"],
    "Award ID": r["Award ID"],
    "USAspending URL": r.generated_internal_id
      ? `https://www.usaspending.gov/award/${r.generated_internal_id}`
      : "",
  }));
  const ws = XLSX.utils.json_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Awards");
  XLSX.writeFile(wb, `usaspending-awards-page${currentPage}.xlsx`);
}

// ---- UI population + wiring ---------------------------------------------
function populateControls() {
  // Fiscal years: current FY back 6 years; default-select last two full FYs.
  // (Today is in FY of Oct-Sep; FY2025 ended 2025-09-30.)
  const fySel = document.getElementById("fy");
  const fyNow = 2025; // most recent complete fiscal year as of build
  const years = [];
  for (let y = fyNow + 1; y >= fyNow - 5; y--) years.push(y);
  fySel.innerHTML = years
    .map((y) => `<option value="${y}" ${y === 2024 || y === 2025 ? "selected" : ""}>FY${y}</option>`)
    .join("");

  // States.
  const stSel = document.getElementById("states");
  stSel.innerHTML = Object.keys(STATE_NAMES)
    .sort()
    .map((code) => `<option value="${code}" ${DEFAULT_STATES.includes(code) ? "selected" : ""}>${code} — ${STATE_NAMES[code]}</option>`)
    .join("");
}

function wireControls() {
  document.getElementById("apply").addEventListener("click", applyFilters);
  document.getElementById("prev").addEventListener("click", () => changePage(-1));
  document.getElementById("next").addEventListener("click", () => changePage(1));
  document.getElementById("export").addEventListener("click", exportToExcel);

  // Client-side column sort.
  document.querySelectorAll("#awards thead th").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (sortState.key === key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.dir = key === "Award Amount" ? "desc" : "asc";
      }
      renderTable();
    });
  });
}

// ---- boot ----------------------------------------------------------------
async function boot() {
  populateControls();
  buildLegend();
  wireControls();

  setStatus("Loading map boundaries…");
  try {
    const [statesTopo, countiesTopo] = await Promise.all([
      fetch(STATES_TOPO).then((r) => r.json()),
      fetch(COUNTIES_TOPO).then((r) => r.json()),
    ]);
    statesGeo = topojson.feature(statesTopo, statesTopo.objects.states);
    countiesGeo = topojson.feature(countiesTopo, countiesTopo.objects.counties);
  } catch (e) {
    setStatus(`Failed to load boundary geometry: ${e.message}`, true);
    return;
  }

  // Initial query with the seeded defaults.
  const { filters } = readFilters();
  activeFilters = filters;
  activeGeoLayer = document.querySelector('input[name="geo"]:checked').value;
  _lastStates = DEFAULT_STATES;
  await runQuery(DEFAULT_STATES, /*newFilters=*/ true);
  lastQueryKey = queryKey(activeFilters, activeGeoLayer);
}

map.on("load", () => {
  labelLayerId = firstSymbolLayerId();
  boot();
});
map.on("error", (e) => console.warn("map error", e && e.error));
