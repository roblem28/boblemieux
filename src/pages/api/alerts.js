/* Next.js API route: api.weather.gov proxy.
 *
 * api.weather.gov *sends* permissive CORS headers, so a browser could call it
 * directly — except it rejects every request that lacks a descriptive
 * `User-Agent`, and browsers will not let JS set that header. So we proxy
 * server-side: the UA is always attached here, and we add CORS + a short cache.
 *
 * Three resources, all SSRF-safe (upstream host + path are allow-listed — this
 * is never an open proxy):
 *   GET /api/alerts?resource=alerts               -> /alerts/active (GeoJSON: polygons + storm motion)
 *   GET /api/alerts?resource=point&lat=..&lon=..  -> /points/{lat},{lon} (forecast URL discovery)
 *   GET /api/alerts?resource=forecast&url=<url>   -> a /gridpoints/.../forecast URL from the point response
 *
 * Uses the global `fetch` (Node 18+).
 */

const BASE = 'https://api.weather.gov';
// Descriptive UA is mandatory; api.weather.gov 403s requests without one.
const USER_AGENT = 'boblemieux.ai weather map, contact roblem28@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
}

function finiteNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Resolve the validated upstream URL for a request, or throw a 400-worthy Error.
function resolveUpstream(qp) {
  const resource = qp.resource || 'alerts';

  if (resource === 'alerts') {
    // Active alerts; each feature carries geometry (polygon) and, for convective
    // products, parameters.eventMotionDescription. Optional `area` bounds the
    // result to a set of state/territory codes (the map sends the states in view)
    // so we don't pull the whole national feed. Validated to plain 2-letter codes.
    const area = String(qp.area || '').toUpperCase();
    if (area && /^[A-Z]{2}(,[A-Z]{2})*$/.test(area)) {
      return `${BASE}/alerts/active?area=${encodeURIComponent(area)}`;
    }
    return `${BASE}/alerts/active`;
  }

  if (resource === 'point') {
    const lat = finiteNum(qp.lat);
    const lon = finiteNum(qp.lon);
    if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      const e = new Error('Invalid or missing lat/lon');
      e.code = 400;
      throw e;
    }
    // api.weather.gov rejects coordinates with more than 4 decimals.
    return `${BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  if (resource === 'forecast') {
    const raw = qp.url || '';
    let u;
    try {
      u = new URL(raw);
    } catch {
      const e = new Error('Invalid forecast url');
      e.code = 400;
      throw e;
    }
    // SSRF guard: only api.weather.gov gridpoint forecast URLs (as returned by the point lookup).
    const okHost = u.protocol === 'https:' && u.host === 'api.weather.gov';
    const okPath = u.pathname.startsWith('/gridpoints/') && /\/forecast(\/hourly)?$/.test(u.pathname);
    if (!okHost || !okPath) {
      const e = new Error('Forecast url not allowed');
      e.code = 400;
      throw e;
    }
    return u.toString();
  }

  const e = new Error("Unknown 'resource'");
  e.code = 400;
  throw e;
}

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let upstream;
  try {
    upstream = resolveUpstream(req.query || {});
  } catch (err) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(err.code || 400).json({ error: err.message, allowed: ['alerts', 'point', 'forecast'] });
  }

  try {
    const r = await fetch(upstream, {
      headers: {
        'User-Agent': USER_AGENT,
        // geo+json keeps real GeoJSON geometry (needed to draw polygons on the map).
        Accept: 'application/geo+json'
      }
    });
    const body = await r.text();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    // Short cache: alerts/forecasts update on the order of minutes, not seconds.
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(r.status).send(body);
  } catch (err) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(502).json({ error: 'Upstream api.weather.gov fetch failed', detail: String(err) });
  }
}
