/* Next.js API route: WFS proxy (ported from weather-map-app/netlify/functions/wfs.js).
 * Browsers can't fetch the GeoServer WFS JSON directly (no CORS headers upstream),
 * so this proxies the request, forces GeoJSON output in EPSG:4326, and adds CORS.
 *
 *   GET /api/wfs?layer=wwa:warnings
 *   GET /api/wfs?layer=wwa:hazards&count=500&bbox=34,-84,36,-81,urn:ogc:def:crs:EPSG::4326
 *
 * Only an allow-listed set of layers is permitted (no open proxy / SSRF).
 * Uses the global `fetch` (Node 18+).
 */

const ENDPOINTS = {
  'wwa:warnings': 'https://opengeo.ncep.noaa.gov/geoserver/wwa/warnings/ows',
  'wwa:hazards': 'https://opengeo.ncep.noaa.gov/geoserver/wwa/hazards/ows'
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
}

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const qp = req.query || {};
  const layer = qp.layer || '';
  const endpoint = ENDPOINTS[layer];

  if (!endpoint) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(400).json({ error: "Unknown or missing 'layer'", allowed: Object.keys(ENDPOINTS) });
  }

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: layer,
    outputFormat: 'application/json',
    srsName: 'urn:ogc:def:crs:EPSG::4326' // GeoServer GeoJSON writer emits [lon, lat]
  });

  // Optional, safe passthroughs.
  if (qp.count) params.set('count', String(parseInt(qp.count, 10) || 1000));
  if (qp.bbox) params.set('bbox', qp.bbox);
  if (qp.cql_filter) params.set('cql_filter', qp.cql_filter);

  const upstream = `${endpoint}?${params.toString()}`;

  try {
    const r = await fetch(upstream, { headers: { Accept: 'application/json' } });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    // Short edge/browser cache so panning/repeat loads don't hammer upstream.
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(r.status).send(body);
  } catch (err) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(502).json({ error: 'Upstream WFS fetch failed', detail: String(err) });
  }
}
