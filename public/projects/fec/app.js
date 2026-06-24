/* FEC Campaign Finance Explorer — vanilla JS.
 *
 * Six tabs, all driven by ONE backend proxy: the in-repo Next.js API route
 * /api/fec, which injects the server-side FEC_API_KEY and forwards to the
 * OpenFEC API. The browser never sees the key.
 *
 *   Contributions  → /schedules/schedule_a   (keyset pagination)
 *   Committees     → /committees             (offset pagination)
 *   Candidates     → /candidates/search      (offset pagination)
 *   Expenditures   → /schedules/schedule_e   (keyset pagination)
 *   Filings        → /filings                (offset pagination)
 *   Cross-Reference→ /schedules/schedule_a  +  /api/usaspending (contract join)
 *
 * Each results table supports client-side column sort and CSV + Excel export
 * (SheetJS, loaded via CDN — same as the spending dashboard).
 */

const FEC_PROXY = '/api/fec';
const USA_PROXY = '/api/usaspending'; // reuse the existing in-repo USAspending route
const PER_PAGE = 30;

// ---- generic helpers -----------------------------------------------------
function fmtUSD(n) {
  if (n == null || n === '' || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtDate(s) {
  if (!s) return '—';
  return String(s).slice(0, 10);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function csvList(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
}
function fecCommitteeLink(id, label) {
  if (!id) return escapeHtml(label) || '—';
  return `<a href="https://www.fec.gov/data/committee/${encodeURIComponent(id)}/" target="_blank" rel="noopener">${escapeHtml(label || id)}</a>`;
}
function fecCandidateLink(id, label) {
  if (!id) return escapeHtml(label) || '—';
  return `<a href="https://www.fec.gov/data/candidate/${encodeURIComponent(id)}/" target="_blank" rel="noopener">${escapeHtml(label || id)}</a>`;
}

// ---- proxy calls ---------------------------------------------------------
async function fecGet(endpoint, params) {
  const qs = new URLSearchParams({ endpoint });
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, item));
    else qs.append(k, v);
  }
  const res = await fetch(`${FEC_PROXY}?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || data.error || `HTTP ${res.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data;
}

async function usaPost(path, body) {
  const res = await fetch(`${USA_PROXY}?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  return data;
}

// ---- per-tab configuration ----------------------------------------------
// Each tab: endpoint, pagination type, param builder, row mapper, and a `fmt`
// map of column-key → cell renderer (defaults to escaped text).
const TABS = {
  contributions: {
    endpoint: '/schedules/schedule_a',
    pagination: 'keyset',
    sort: '-contribution_receipt_date',
    buildParams() {
      const p = { per_page: PER_PAGE, sort: '-contribution_receipt_date' };
      if (val('c_name')) p.contributor_name = val('c_name');
      if (val('c_employer')) p.contributor_employer = val('c_employer');
      if (val('c_occupation')) p.contributor_occupation = val('c_occupation');
      if (val('c_state')) p.contributor_state = val('c_state').toUpperCase();
      if (val('c_committee')) p.committee_id = val('c_committee').toUpperCase();
      if (val('c_min_date')) p.min_date = val('c_min_date');
      if (val('c_max_date')) p.max_date = val('c_max_date');
      if (val('c_min_amt')) p.min_amount = val('c_min_amt');
      if (val('c_max_amt')) p.max_amount = val('c_max_amt');
      return p;
    },
    mapRow: (r) => r,
    fmt: {
      contribution_receipt_amount: (r) => fmtUSD(r.contribution_receipt_amount),
      contribution_receipt_date: (r) => fmtDate(r.contribution_receipt_date),
      committee_name: (r) => fecCommitteeLink(r.committee_id, r.committee_name)
    }
  },

  committees: {
    endpoint: '/committees',
    pagination: 'offset',
    buildParams() {
      const p = { per_page: PER_PAGE };
      if (val('cm_q')) p.q = val('cm_q');
      if (val('cm_state')) p.state = val('cm_state').toUpperCase();
      if (val('cm_type')) p.committee_type = val('cm_type');
      return p;
    },
    mapRow: (r) => r,
    fmt: {
      name: (r) => fecCommitteeLink(r.committee_id, r.name)
    }
  },

  candidates: {
    endpoint: '/candidates/search',
    pagination: 'offset',
    buildParams() {
      const p = { per_page: PER_PAGE };
      if (val('cd_q')) p.q = val('cd_q');
      if (val('cd_state')) p.state = val('cd_state').toUpperCase();
      if (val('cd_office')) p.office = val('cd_office');
      if (val('cd_cycle')) p.cycle = val('cd_cycle');
      return p;
    },
    mapRow: (r) => r,
    fmt: {
      name: (r) => fecCandidateLink(r.candidate_id, r.name),
      candidate_id: (r) => {
        const profile = fecCandidateLink(r.candidate_id, 'FEC profile + totals');
        const pcs = (r.principal_committees || [])
          .map((c) => fecCommitteeLink(c.committee_id, c.name || c.committee_id))
          .join(', ');
        return pcs ? `${profile}<br>${pcs}` : profile;
      }
    }
  },

  expenditures: {
    endpoint: '/schedules/schedule_e',
    pagination: 'keyset',
    sort: '-expenditure_date',
    buildParams() {
      const p = { per_page: PER_PAGE, sort: '-expenditure_date' };
      if (val('e_candidate')) p.candidate_name = val('e_candidate');
      if (val('e_committee')) p.committee_id = val('e_committee').toUpperCase();
      if (val('e_support')) p.support_oppose_indicator = val('e_support');
      if (val('e_min_date')) p.min_date = val('e_min_date');
      if (val('e_max_date')) p.max_date = val('e_max_date');
      return p;
    },
    mapRow: (r) => r,
    fmt: {
      support_oppose_indicator: (r) => (r.support_oppose_indicator === 'S' ? 'Support' : r.support_oppose_indicator === 'O' ? 'Oppose' : '—'),
      expenditure_amount: (r) => fmtUSD(r.expenditure_amount),
      expenditure_date: (r) => fmtDate(r.expenditure_date),
      committee_name: (r) => fecCommitteeLink(r.committee_id, r.committee_name)
    }
  },

  filings: {
    endpoint: '/filings',
    pagination: 'offset',
    sort: '-receipt_date',
    buildParams() {
      const p = { per_page: PER_PAGE, sort: '-receipt_date' };
      if (val('f_committee')) p.committee_id = val('f_committee').toUpperCase();
      if (val('f_candidate')) p.candidate_id = val('f_candidate').toUpperCase();
      if (val('f_cycle')) p.cycle = val('f_cycle');
      return p;
    },
    mapRow: (r) => r,
    fmt: {
      committee_name: (r) => fecCommitteeLink(r.committee_id, r.committee_name),
      coverage_end_date: (r) => fmtDate(r.coverage_end_date),
      receipt_date: (r) => fmtDate(r.receipt_date),
      total_receipts: (r) => fmtUSD(r.total_receipts),
      pdf_url: (r) => (r.pdf_url ? `<a href="${escapeHtml(r.pdf_url)}" target="_blank" rel="noopener">PDF</a>` : '—')
    }
  }
};

// ---- per-tab runtime state ----------------------------------------------
const state = {};
function initState(name) {
  state[name] = {
    rows: [],
    page: 1,
    cursorStack: [{}], // keyset cursors; cursorStack[i] fetches page i+1
    hasNext: false,
    totalCount: null,
    sort: { key: null, dir: 'desc' },
    lastParams: null
  };
}
Object.keys(TABS).forEach(initState);

// ---- table rendering (generic, driven by <thead> data-key) --------------
function columnsFor(name) {
  const table = document.querySelector(`table[data-table="${name}"]`);
  return [...table.querySelectorAll('thead th')].map((th) => ({
    key: th.dataset.key,
    label: th.textContent.replace(/[▲▼]/g, '').trim(),
    num: th.classList.contains('num'),
    nosort: th.classList.contains('nosort')
  }));
}

function setStatus(name, msg, cls) {
  const el = document.querySelector(`[data-status="${name}"]`);
  el.textContent = msg || '';
  el.className = 'status' + (cls ? ' ' + cls : '');
}

function renderTable(name) {
  const cfg = TABS[name] || {};
  const st = state[name];
  const table = document.querySelector(`table[data-table="${name}"]`);
  const tbody = table.querySelector('tbody');
  const empty = table.parentElement.querySelector('.empty');
  const cols = columnsFor(name);

  const rows = sortedRows(name);
  if (!rows.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
  } else {
    empty.hidden = true;
    tbody.innerHTML = rows
      .map((r) => {
        const tds = cols
          .map((c) => {
            const fmt = cfg.fmt && cfg.fmt[c.key];
            const cell = fmt ? fmt(r) : escapeHtml(r[c.key] != null && r[c.key] !== '' ? r[c.key] : '—');
            return `<td class="${c.num ? 'num' : ''}">${cell}</td>`;
          })
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');
  }
  updateHeaderArrows(name);
  updatePager(name);
}

function sortedRows(name) {
  const st = state[name];
  if (!st.sort.key) return st.rows;
  const { key, dir } = st.sort;
  const mult = dir === 'asc' ? 1 : -1;
  return [...st.rows].sort((a, b) => {
    let av = a[key];
    let bv = b[key];
    const an = typeof av === 'number';
    const bn = typeof bv === 'number';
    if (an || bn) return (((av == null ? -Infinity : av)) - ((bv == null ? -Infinity : bv))) * mult;
    return String(av == null ? '' : av).localeCompare(String(bv == null ? '' : bv)) * mult;
  });
}

function updateHeaderArrows(name) {
  const st = state[name];
  document.querySelectorAll(`table[data-table="${name}"] thead th`).forEach((th) => {
    const arrow = th.querySelector('.arrow');
    if (arrow) arrow.remove();
    if (th.dataset.key === st.sort.key) {
      const s = document.createElement('span');
      s.className = 'arrow';
      s.textContent = st.sort.dir === 'asc' ? ' ▲' : ' ▼';
      th.appendChild(s);
    }
  });
}

function updatePager(name) {
  const st = state[name];
  const info = document.querySelector(`[data-pageinfo="${name}"]`);
  if (info) {
    const cnt = st.totalCount != null ? ` · ${st.totalCount.toLocaleString()} total` : '';
    info.textContent = st.rows.length ? `Page ${st.page} · ${st.rows.length} rows${cnt}` : '';
  }
  const prev = document.querySelector(`[data-prev="${name}"]`);
  const next = document.querySelector(`[data-next="${name}"]`);
  if (prev) prev.disabled = st.page <= 1;
  if (next) next.disabled = !st.hasNext;
}

// ---- search + pagination (standard tabs) --------------------------------
async function runSearch(name, direction) {
  const cfg = TABS[name];
  const st = state[name];
  const btn = document.querySelector(`[data-search="${name}"]`);
  if (btn) btn.disabled = true;
  setStatus(name, 'Querying OpenFEC…');

  try {
    // Reset to page 1 on a fresh search.
    if (!direction) {
      st.page = 1;
      st.cursorStack = [{}];
      st.lastParams = cfg.buildParams();
    } else if (direction === 'next') {
      st.page += 1;
    } else if (direction === 'prev') {
      st.page = Math.max(1, st.page - 1);
    }

    const params = { ...st.lastParams };
    if (cfg.pagination === 'offset') {
      params.page = st.page;
    } else {
      // keyset: apply the cursor for the requested page.
      const cursor = st.cursorStack[st.page - 1] || {};
      Object.assign(params, cursor);
    }

    const data = await fecGet(cfg.endpoint, params);
    const results = (data.results || []).map(cfg.mapRow);
    st.rows = results;
    st.totalCount = data.pagination ? data.pagination.count : null;

    if (cfg.pagination === 'offset') {
      const pg = data.pagination || {};
      st.hasNext = pg.page != null && pg.pages != null ? pg.page < pg.pages : results.length === PER_PAGE;
    } else {
      const li = (data.pagination && data.pagination.last_indexes) || null;
      // Store the cursor that fetches the NEXT page.
      st.cursorStack[st.page] = li ? sanitizeCursor(li) : null;
      st.hasNext = !!li && results.length === PER_PAGE;
    }

    renderTable(name);
    const shown = results.length;
    setStatus(name, shown ? `Showing ${shown} of ${st.totalCount != null ? st.totalCount.toLocaleString() : '?'} record(s).` : 'No records match these filters.');
  } catch (e) {
    setStatus(name, `Query failed: ${e.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// last_indexes → plain query params (drop the sort_null_only helper flag unless set).
function sanitizeCursor(li) {
  const out = {};
  for (const [k, v] of Object.entries(li)) {
    if (v == null) continue;
    out[k] = typeof v === 'boolean' ? String(v) : v;
  }
  return out;
}

// ---- CROSS-REFERENCE -----------------------------------------------------
async function runXref() {
  const name = 'xref';
  const st = state[name];
  const btn = document.querySelector(`[data-search="${name}"]`);
  btn.disabled = true;
  setStatus(name, 'Pulling FEC contributions…');

  try {
    const names = csvList(val('x_names'));
    const employer = val('x_employer');
    const states = csvList(val('x_states')).map((s) => s.toUpperCase());
    const excludes = csvList(val('x_exclude')).map((s) => s.toLowerCase());
    const naics = csvList(val('x_naics'));

    if (!names.length) {
      setStatus(name, 'Enter at least one contributor name.', 'error');
      return;
    }

    // 1) One Schedule A query per name (employer-scoped, broad enough to catch
    //    name-only matches for review). Bounded: names.length calls.
    let all = [];
    for (const nm of names) {
      const params = { contributor_name: nm, per_page: 100, sort: '-contribution_receipt_date' };
      if (employer) params.contributor_employer = employer;
      const data = await fecGet('/schedules/schedule_a', params);
      all = all.concat((data.results || []).map((r) => ({ ...r, _query_name: nm })));
    }

    // 2) Exclude unrelated names/employers (e.g. Fisher Investments / Ken Fisher).
    const kept = all.filter((r) => {
      const hay = `${r.contributor_name || ''} ${r.contributor_employer || ''}`.toLowerCase();
      return !excludes.some((x) => x && hay.includes(x));
    });

    // 3) Confidence score (0–100) from employer / occupation / state / name.
    const empLc = employer.toLowerCase();
    const scored = kept.map((r) => {
      const emp = (r.contributor_employer || '').toLowerCase();
      const employerHit = empLc && emp.includes(empLc);
      const stateHit = states.length ? states.includes((r.contributor_state || '').toUpperCase()) : false;
      const occHit = !!(r.contributor_occupation && r.contributor_occupation.trim());

      let score = 30; // queried by name → name signal present
      if (employerHit) score += 40;
      if (stateHit) score += 20;
      if (occHit) score += 10;
      score = Math.min(100, score);

      const review = !employerHit && !stateHit; // name-only
      return {
        score,
        review,
        contributor_name: r.contributor_name,
        contributor_employer: r.contributor_employer,
        contributor_occupation: r.contributor_occupation,
        contributor_state: r.contributor_state,
        contribution_receipt_amount: r.contribution_receipt_amount,
        contribution_receipt_date: r.contribution_receipt_date,
        committee_name: r.committee_name,
        committee_id: r.committee_id,
        award_total: null
      };
    });

    // 4) Join federal contract awards for the employer (recipient) via the
    //    existing USAspending route. One lookup; total attached to every row.
    let awardTotal = null;
    let awardNote = '';
    if (employer) {
      setStatus(name, `${scored.length} contributions scored. Joining USAspending contract awards…`);
      try {
        const body = {
          filters: {
            recipient_search_text: [employer],
            award_type_codes: ['A', 'B', 'C', 'D'],
            time_period: [{ start_date: '2008-01-01', end_date: '2026-09-30' }]
          },
          fields: ['Award Amount', 'Recipient Name'],
          page: 1,
          limit: 100,
          sort: 'Award Amount',
          order: 'desc'
        };
        if (naics.length) body.filters.naics_codes = naics;
        const usa = await usaPost('search/spending_by_award', body);
        const awards = usa.results || [];
        awardTotal = awards.reduce((s, a) => s + (Number(a['Award Amount']) || 0), 0);
        awardNote = ` · USAspending: ${fmtUSD(awardTotal)} across ${awards.length}${awards.length === 100 ? '+' : ''} award(s) to "${employer}"`;
      } catch (e) {
        awardNote = ` · USAspending join failed (${e.message})`;
      }
    }
    scored.forEach((r) => (r.award_total = awardTotal));

    // Sort by score desc by default.
    scored.sort((a, b) => b.score - a.score || (b.contribution_receipt_amount || 0) - (a.contribution_receipt_amount || 0));

    st.rows = scored;
    st.totalCount = scored.length;
    st.hasNext = false;
    st.page = 1;
    renderTable(name);

    const reviewCount = scored.filter((r) => r.review).length;
    setStatus(name, `${scored.length} contribution(s) matched (${reviewCount} flagged REVIEW — name-only)${awardNote}.`);
  } catch (e) {
    setStatus(name, `Cross-reference failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

// Custom renderers for the xref table.
TABS.xref = {
  fmt: {
    score: (r) => {
      const cls = r.score >= 70 ? 'score-high' : r.score >= 40 ? 'score-med' : 'score-low';
      return `<span class="score ${cls}">${r.score}</span>${r.review ? '<span class="flag-review">REVIEW</span>' : ''}`;
    },
    contribution_receipt_amount: (r) => fmtUSD(r.contribution_receipt_amount),
    contribution_receipt_date: (r) => fmtDate(r.contribution_receipt_date),
    committee_name: (r) => fecCommitteeLink(r.committee_id, r.committee_name),
    award_total: (r) => (r.award_total == null ? '—' : fmtUSD(r.award_total))
  }
};

// ---- export (CSV + Excel) -----------------------------------------------
function exportRows(name, kind) {
  const st = state[name];
  if (!st.rows.length) {
    setStatus(name, 'Nothing to export — table is empty.', 'warn');
    return;
  }
  const cols = columnsFor(name);
  // Build plain rows from raw values (not the HTML cells).
  const aoa = sortedRows(name).map((r) => {
    const o = {};
    cols.forEach((c) => {
      o[c.label] = r[c.key] == null ? '' : r[c.key];
    });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(aoa);
  if (kind === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fec-${name}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, name);
    XLSX.writeFile(wb, `fec-${name}.xlsx`);
  }
}

// ---- wiring --------------------------------------------------------------
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel-view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
}

function wire() {
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  document.querySelectorAll('[data-search]').forEach((b) => {
    const name = b.dataset.search;
    b.addEventListener('click', () => (name === 'xref' ? runXref() : runSearch(name)));
  });
  document.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => runSearch(b.dataset.next, 'next')));
  document.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => runSearch(b.dataset.prev, 'prev')));
  document.querySelectorAll('[data-csv]').forEach((b) => b.addEventListener('click', () => exportRows(b.dataset.csv, 'csv')));
  document.querySelectorAll('[data-xlsx]').forEach((b) => b.addEventListener('click', () => exportRows(b.dataset.xlsx, 'xlsx')));

  // Column sort on every data table.
  document.querySelectorAll('table.data').forEach((table) => {
    const name = table.dataset.table;
    table.querySelectorAll('thead th').forEach((th) => {
      if (th.classList.contains('nosort')) return;
      th.addEventListener('click', () => {
        const st = state[name];
        const key = th.dataset.key;
        if (st.sort.key === key) st.sort.dir = st.sort.dir === 'asc' ? 'desc' : 'asc';
        else {
          st.sort.key = key;
          st.sort.dir = th.classList.contains('num') ? 'desc' : 'asc';
        }
        renderTable(name);
      });
    });
  });

  // Enter key submits the active tab's search.
  document.querySelectorAll('.filters input').forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const view = inp.closest('.panel-view');
      const btn = view && view.querySelector('[data-search]');
      if (btn) btn.click();
    });
  });
}

wire();
