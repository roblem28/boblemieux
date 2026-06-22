/* Next.js API route: USAspending.gov CORS proxy
 * (ported from usaspending-dashboard/netlify/functions/usaspending.js).
 *
 * The USAspending v2 API does not send CORS headers, so a browser POST from our
 * page is blocked. This function proxies the POST, passes the JSON body straight
 * through, and adds permissive CORS. Only the two endpoints this dashboard uses
 * are allow-listed (no open proxy / SSRF).
 *
 *   POST /api/usaspending?path=search/spending_by_geography
 *   POST /api/usaspending?path=search/spending_by_award
 *
 * Uses the global `fetch` (Node 18+).
 */

const API_BASE = 'https://api.usaspending.gov/api/v2';

// Allow-list: only these exact paths may be proxied.
const ALLOWED_PATHS = new Set(['search/spending_by_geography', 'search/spending_by_award']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
}

function sendJson(res, statusCode, obj) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json(obj);
}

export default async function handler(req, res) {
  applyCors(res);

  // Preflight.
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed; use POST.' });
  }

  const path = (req.query || {}).path || '';
  if (!ALLOWED_PATHS.has(path)) {
    return sendJson(res, 400, { error: "Unknown or missing 'path'", allowed: [...ALLOWED_PATHS] });
  }

  // USAspending requires a trailing slash on these endpoints.
  const upstream = `${API_BASE}/${path}/`;

  // Next.js parses JSON bodies into req.body; pass it through verbatim.
  const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

  try {
    const r = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: bodyStr
    });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(r.status).send(body);
  } catch (err) {
    return sendJson(res, 502, { error: 'Upstream USAspending fetch failed', detail: String(err) });
  }
}
