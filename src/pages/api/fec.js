/* Next.js API route: OpenFEC (FEC campaign-finance) proxy.
 * (Mirrors the usaspending.js / wfs.js CORS-proxy pattern in this repo.)
 *
 * The OpenFEC API requires an `api_key` on every request. We keep that key
 * SERVER-SIDE only (process.env.FEC_API_KEY) and never ship it to the browser.
 * This route is a GENERIC proxy: the page passes an OpenFEC endpoint path plus
 * arbitrary query params, we inject the key, forward to api.open.fec.gov/v1,
 * and return the JSON verbatim.
 *
 *   GET /api/fec?endpoint=/candidates/search&q=cramer&per_page=20
 *   GET /api/fec?endpoint=/schedules/schedule_a&contributor_name=fisher&...
 *   GET /api/fec?health=1      → end-to-end key check (hits /candidates/search?q=cramer)
 *
 * Only an allow-listed set of endpoint prefixes may be proxied (no open proxy /
 * SSRF). FEC pagination params (per_page, page, last_index,
 * last_contribution_receipt_date, last_expenditure_date, etc.) are passed
 * through untouched so keyset pagination works.
 *
 * Uses the global `fetch` (Node 18+).
 */

const API_BASE = 'https://api.open.fec.gov/v1';

// Allow-list of endpoint PREFIXES. Any requested endpoint must start with one of
// these (after normalizing to a leading slash, no trailing slash).
const ALLOWED_PREFIXES = [
  '/candidates',
  '/candidate',
  '/committees',
  '/committee',
  '/schedules/schedule_a',
  '/schedules/schedule_b',
  '/schedules/schedule_e',
  '/filings',
  '/elections',
  '/totals'
];

// Params we never forward upstream (control params / our own key handling).
const RESERVED = new Set(['endpoint', 'health', 'api_key']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
}

function sendJson(res, statusCode, obj) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json(obj);
}

// Normalize "schedules/schedule_a/" → "/schedules/schedule_a" for prefix checks.
function normalizeEndpoint(ep) {
  let e = String(ep || '').trim();
  if (!e.startsWith('/')) e = '/' + e;
  e = e.replace(/\/+$/, ''); // strip trailing slashes
  return e;
}

function isAllowed(endpoint) {
  return ALLOWED_PREFIXES.some((p) => endpoint === p || endpoint.startsWith(p + '/'));
}

// Fetch upstream with retry/backoff on 429 (FEC rate limit). Returns the raw
// Response. Honors Retry-After when present; otherwise exponential backoff.
async function fetchWithBackoff(url, { maxRetries = 3 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (r.status !== 429 || attempt >= maxRetries) return r;

    const retryAfter = parseInt(r.headers.get('retry-after') || '', 10);
    const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 8000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt += 1;
  }
}

// OpenFEC requires a trailing slash on its endpoints.
function buildUpstream(endpoint, query, apiKey) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (RESERVED.has(k)) continue;
    if (v == null) continue;
    // URLSearchParams handles repeated params (arrays) so multi-value filters work.
    if (Array.isArray(v)) v.forEach((item) => params.append(k, item));
    else params.append(k, v);
  }
  params.set('api_key', apiKey);
  return `${API_BASE}${endpoint}/?${params.toString()}`;
}

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed; use GET.' });
  }

  const apiKey = process.env.FEC_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      error: 'Server is missing FEC_API_KEY',
      detail: 'Set FEC_API_KEY in .env.local (local) or as a Netlify environment variable (production).'
    });
  }

  const qp = req.query || {};

  // Health check: confirm the key works end to end.
  if (qp.health) {
    const url = buildUpstream('/candidates/search', { q: 'cramer', per_page: '1' }, apiKey);
    try {
      const r = await fetchWithBackoff(url);
      const data = await r.json();
      if (!r.ok) {
        return sendJson(res, r.status, { ok: false, status: r.status, detail: data });
      }
      return sendJson(res, 200, {
        ok: true,
        endpoint: '/candidates/search?q=cramer',
        count: data?.pagination?.count ?? null,
        sample: data?.results?.[0]?.name ?? null
      });
    } catch (err) {
      return sendJson(res, 502, { ok: false, error: 'Upstream FEC fetch failed', detail: String(err) });
    }
  }

  const endpoint = normalizeEndpoint(qp.endpoint);
  if (!qp.endpoint) {
    return sendJson(res, 400, { error: "Missing 'endpoint' query param", allowed: ALLOWED_PREFIXES });
  }
  if (!isAllowed(endpoint)) {
    return sendJson(res, 400, { error: `Endpoint '${endpoint}' is not allow-listed`, allowed: ALLOWED_PREFIXES });
  }

  const upstream = buildUpstream(endpoint, qp, apiKey);

  try {
    const r = await fetchWithBackoff(upstream);
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    // Short cache so repeat/paged loads don't hammer the rate-limited upstream.
    if (r.ok) res.setHeader('Cache-Control', 'public, max-age=60');
    if (r.status === 429) {
      return sendJson(res, 429, {
        error: 'FEC rate limit hit (429) after retries',
        detail: 'Too many requests to the OpenFEC API. Wait a moment and try again.'
      });
    }
    return res.status(r.status).send(body);
  } catch (err) {
    return sendJson(res, 502, { error: 'Upstream FEC fetch failed', detail: String(err) });
  }
}
