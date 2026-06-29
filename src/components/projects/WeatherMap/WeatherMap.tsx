/* Weather Map — React client component port of weather-map-app.
 *
 * MapLibre is a real npm dependency (imported below), NOT the unpkg window global.
 * The original vanilla app.js logic runs inside useEffect after mount and is torn
 * down on unmount. All map/panel CSS is scoped to .wrapper via WeatherMap.module.css
 * — nothing targets html/body.
 *
 * Data sources:
 *   - Radar / precip-type rasters: NOAA/NWS nowCOAST WMS (direct).
 *   - Alerts (warnings, watches, hazards) + storm motion: api.weather.gov, proxied
 *     through /api/alerts (the proxy attaches the mandatory User-Agent header).
 *   - Point forecast: api.weather.gov /points -> /gridpoints forecast, same proxy.
 *
 * Storm-motion arrows: convective alerts (tornado / severe-tstorm / some flash-flood
 * warnings) carry `parameters.eventMotionDescription`. dirDeg there is the direction
 * the storm moves *from* (meteorological); the heading we draw is (dirDeg + 180).
 */
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

import styles from './WeatherMap.module.css';

export default function WeatherMap() {
    const mapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const mapEl = mapRef.current;
        if (!mapEl) return;

        const GEOSERVER = 'https://opengeo.ncep.noaa.gov/geoserver';

        // WMS raster layers (discovered via GetCapabilities). Both expose a TIME dimension.
        const WMS_LAYERS: Record<string, any> = {
            radar: {
                base: `${GEOSERVER}/conus/conus_cref_qcd/ows`,
                layer: 'conus_cref_qcd',
                sourceId: 'radar-src',
                layerId: 'radar-lyr',
                legendImg: 'radar-legend'
            },
            precip: {
                base: `${GEOSERVER}/conus/conus_pcpn_typ/ows`,
                layer: 'conus_pcpn_typ',
                sourceId: 'precip-src',
                layerId: 'precip-lyr',
                legendImg: 'precip-legend'
            }
        };

        // Vector alert layers. Both are now fed from a single api.weather.gov fetch
        // (split client-side: anything ending in "Warning" -> warnings, else hazards).
        const ALERT_LAYERS: Record<string, any> = {
            warnings: { sourceId: 'warnings-src', fillId: 'warnings-fill', lineId: 'warnings-line' },
            hazards: { sourceId: 'hazards-src', fillId: 'hazards-fill', lineId: 'hazards-line' }
        };

        // Storm-motion arrow layer (symbol layer, above the polygons).
        const STORM_SOURCE = 'storms-src';
        const STORM_LAYER = 'storms-arrows';
        const STORM_ICON = 'storm-arrow';

        // Color by VTEC phenomenon code (`phenom`), with a sensible fallback.
        const PHENOM_COLORS: Record<string, string> = {
            TO: '#e53935', // Tornado
            SV: '#fb8c00', // Severe Thunderstorm
            FF: '#2e7d32', // Flash Flood
            FA: '#43a047', // Areal Flood
            FL: '#1b5e20', // Flood (river)
            MA: '#00897b', // Marine
            WS: '#3949ab', // Winter Storm
            WW: '#5c6bc0', // Winter Weather
            BZ: '#283593', // Blizzard
            HW: '#8e24aa', // High Wind
            WI: '#ab47bc', // Wind
            EH: '#d84315', // Excessive Heat
            HT: '#f4511e', // Heat
            FG: '#9e9e9e', // Dense Fog
            WC: '#0277bd' // Wind Chill
        };
        const DEFAULT_ALERT_COLOR = '#757575';
        const fillColorExpr = () => {
            const expr: any[] = ['match', ['get', 'phenom']];
            for (const [code, color] of Object.entries(PHENOM_COLORS)) expr.push(code, color);
            expr.push(DEFAULT_ALERT_COLOR);
            return expr;
        };

        // Map an api.weather.gov `event` string to one of the 2-letter phenom codes
        // above so the existing color ramp + legend keep working unchanged.
        function phenomFromEvent(event: string): string {
            const e = (event || '').toLowerCase();
            if (e.includes('tornado')) return 'TO';
            if (e.includes('severe thunderstorm')) return 'SV';
            if (e.includes('flash flood')) return 'FF';
            if (e.includes('areal flood') || e.includes('flood advisory')) return 'FA';
            if (e.includes('flood')) return 'FL';
            if (e.includes('marine') || e.includes('small craft')) return 'MA';
            if (e.includes('blizzard')) return 'BZ';
            if (e.includes('winter storm') || e.includes('ice storm')) return 'WS';
            if (e.includes('winter weather') || e.includes('snow')) return 'WW';
            if (e.includes('high wind')) return 'HW';
            if (e.includes('wind chill')) return 'WC';
            if (e.includes('wind')) return 'WI';
            if (e.includes('excessive heat')) return 'EH';
            if (e.includes('heat')) return 'HT';
            if (e.includes('fog')) return 'FG';
            return ''; // -> DEFAULT_ALERT_COLOR
        }

        const GREENVILLE: [number, number] = [-82.4, 34.85];

        // --- state ---------------------------------------------------------------
        let radarTimeISO = roundedNowISO(); // changing this busts the WMS tile cache → fresh radar
        const visible: Record<string, boolean> = { radar: true, precip: false, warnings: true, hazards: true };

        // Id of the basemap's lowest symbol (label) layer.
        let labelLayerId: string | undefined;

        const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

        const map = new maplibregl.Map({
            container: mapEl,
            style: BASEMAP_STYLE,
            center: GREENVILLE,
            zoom: 6
        });
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
        map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right');

        let refreshIntervalId: ReturnType<typeof setInterval> | undefined;

        // --- helpers -------------------------------------------------------------
        function firstSymbolLayerId() {
            const layers = map.getStyle().layers || [];
            for (const l of layers) if (l.type === 'symbol') return l.id;
            return undefined;
        }

        function roundedNowISO() {
            const d = new Date();
            d.setSeconds(0, 0);
            return d.toISOString();
        }

        function wmsTileUrl(cfg: any) {
            const p = new URLSearchParams({
                service: 'WMS',
                version: '1.1.1',
                request: 'GetMap',
                layers: cfg.layer,
                styles: '',
                format: 'image/png',
                transparent: 'true',
                width: '256',
                height: '256',
                srs: 'EPSG:3857',
                time: radarTimeISO
            });
            return `${cfg.base}?${p.toString()}&bbox={bbox-epsg-3857}`;
        }

        function legendUrl(cfg: any) {
            const p = new URLSearchParams({
                service: 'WMS',
                version: '1.3.0',
                request: 'GetLegendGraphic',
                format: 'image/png',
                layer: cfg.layer
            });
            return `${cfg.base}?${p.toString()}`;
        }

        function addOrRefreshWms(key: string) {
            const cfg = WMS_LAYERS[key];
            if (map.getLayer(cfg.layerId)) map.removeLayer(cfg.layerId);
            if (map.getSource(cfg.sourceId)) map.removeSource(cfg.sourceId);

            map.addSource(cfg.sourceId, {
                type: 'raster',
                tiles: [wmsTileUrl(cfg)],
                tileSize: 256,
                attribution: 'NOAA/NWS nowCOAST'
            });
            const before = map.getLayer(ALERT_LAYERS.warnings.fillId) ? ALERT_LAYERS.warnings.fillId : labelLayerId;
            map.addLayer(
                {
                    id: cfg.layerId,
                    type: 'raster',
                    source: cfg.sourceId,
                    paint: { 'raster-opacity': key === 'radar' ? currentRadarOpacity() : 0.7 },
                    layout: { visibility: visible[key] ? 'visible' : 'none' }
                },
                before
            );
        }

        function currentRadarOpacity() {
            return parseFloat((document.getElementById('radar-opacity') as HTMLInputElement).value);
        }

        function setStatus(msg: string, isError = false) {
            const el = document.getElementById('status');
            if (!el) return;
            el.textContent = msg;
            el.classList.toggle('error', isError);
        }

        // --- alerts (api.weather.gov) --------------------------------------------
        // Normalize an api.weather.gov alert feature's properties to the compact
        // shape the popup + color ramp expect, and stamp in the derived phenom code.
        function normalizeAlertProps(raw: any) {
            const usableUrl = raw.web && raw.web !== 'http://www.weather.gov' ? raw.web : raw['@id'] || '';
            return {
                event: raw.event || 'Alert',
                phenom: phenomFromEvent(raw.event),
                headline: raw.headline || '',
                severity: raw.severity || '',
                senderName: raw.senderName || '',
                messageType: raw.messageType || '',
                onset: raw.onset || raw.effective || '',
                ends: raw.ends || '',
                expires: raw.expires || '',
                url: usableUrl
            };
        }

        function isWarning(event: string) {
            return /warning$/i.test((event || '').trim());
        }

        // eventMotionDescription, e.g.
        //   "2026-06-29T21:17:00-00:00...storm...024DEG...17KT...33.61,-82.89"
        // (the "storm" token is extra vs. the docs; some strings list several
        // space-separated lat,lon points for a line of storms). Parse defensively.
        function parseMotion(emd: string): { dirDeg: number; speedKt: number; points: [number, number][] } | null {
            if (!emd || typeof emd !== 'string') return null;
            const dirM = emd.match(/(\d{1,3})\s*DEG/i);
            const spdM = emd.match(/(\d{1,3})\s*KT/i);
            if (!dirM || !spdM) return null;
            const dirDeg = parseInt(dirM[1], 10);
            const speedKt = parseInt(spdM[1], 10);
            // Coordinate pairs are "lat,lon" tokens; grab them all.
            const points: [number, number][] = [];
            const re = /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(emd))) {
                const lat = parseFloat(m[1]);
                const lon = parseFloat(m[2]);
                if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) points.push([lon, lat]);
            }
            if (!points.length || !Number.isFinite(dirDeg) || !Number.isFinite(speedKt)) return null;
            return { dirDeg, speedKt, points };
        }

        const KT_TO_MPH = 1.151;

        // Build the storm-arrow point features from any alerts carrying motion.
        function buildStormFeatures(features: any[]) {
            const out: any[] = [];
            for (const f of features) {
                const params = f.properties && f.properties.parameters;
                const emdArr = params && params.eventMotionDescription;
                const emd = Array.isArray(emdArr) ? emdArr[0] : emdArr;
                const motion = parseMotion(emd);
                if (!motion) continue; // no motion -> polygon only, never fabricate
                // dirDeg is where the storm comes FROM; heading is where it's GOING.
                const heading = (motion.dirDeg + 180) % 360;
                const speedMph = Math.round(motion.speedKt * KT_TO_MPH);
                for (const pt of motion.points) {
                    out.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: pt },
                        properties: {
                            event: f.properties.event || 'Storm',
                            dirDeg: motion.dirDeg,
                            heading,
                            speedKt: motion.speedKt,
                            speedMph
                        }
                    });
                }
            }
            return { type: 'FeatureCollection', features: out };
        }

        async function refreshAlerts() {
            const btn = document.getElementById('refresh') as HTMLButtonElement | null;
            if (btn) btn.disabled = true;
            try {
                // Trailing slash: next.config has trailingSlash:true, so this avoids a 308 redirect hop.
                const res = await fetch('/api/alerts/?resource=alerts', { headers: { Accept: 'application/geo+json' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const geojson = await res.json();
                const all: any[] = Array.isArray(geojson.features) ? geojson.features : [];

                // Only polygon-bearing alerts go to the fill/line layers.
                const polys = all.filter((f) => f.geometry);
                const warnings: any[] = [];
                const hazards: any[] = [];
                for (const f of polys) {
                    const feat = { ...f, properties: normalizeAlertProps(f.properties) };
                    (isWarning(f.properties.event) ? warnings : hazards).push(feat);
                }

                const wSrc = map.getSource(ALERT_LAYERS.warnings.sourceId) as any;
                const hSrc = map.getSource(ALERT_LAYERS.hazards.sourceId) as any;
                if (wSrc) wSrc.setData({ type: 'FeatureCollection', features: warnings });
                if (hSrc) hSrc.setData({ type: 'FeatureCollection', features: hazards });

                const storms = buildStormFeatures(all);
                const sSrc = map.getSource(STORM_SOURCE) as any;
                if (sSrc) sSrc.setData(storms);

                const arrowNote = storms.features.length ? ` · ${storms.features.length} storm-motion arrow(s)` : '';
                if (warnings.length === 0 && hazards.length === 0) {
                    setStatus(`No active alerts.${arrowNote}`);
                } else {
                    setStatus(
                        `${warnings.length} warning(s), ${hazards.length} watch/hazard(s)${arrowNote} · updated ${new Date().toLocaleTimeString()}`
                    );
                }
            } catch (e: any) {
                setStatus(`Alert fetch failed: ${e.message}`, true);
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        function refreshRadar() {
            radarTimeISO = roundedNowISO();
            addOrRefreshWms('radar');
            addOrRefreshWms('precip');
        }

        // --- popups --------------------------------------------------------------
        const POPUP_FIELDS: [string, string][] = [
            ['event', 'Event'],
            ['severity', 'Severity'],
            ['senderName', 'Office'],
            ['messageType', 'Message'],
            ['onset', 'Onset'],
            ['ends', 'Ends'],
            ['expires', 'Expires']
        ];

        function popupHtml(props: any) {
            const title = props.event || 'Alert';
            const sub = props.headline ? `<p class="sub">${escapeHtml(String(props.headline))}</p>` : '';
            let rows = '';
            for (const [k, label] of POPUP_FIELDS) {
                if (props[k] != null && props[k] !== '') {
                    rows += `<tr><td class="k">${label}</td><td>${escapeHtml(String(props[k]))}</td></tr>`;
                }
            }
            const link = props.url
                ? `<p><a href="${escapeHtml(props.url)}" target="_blank" rel="noopener">Full text →</a></p>`
                : '';
            return `<div class="popup"><h3>${escapeHtml(title)}</h3>${sub}<table>${rows}</table>${link}</div>`;
        }

        function stormPopupHtml(props: any) {
            return (
                `<div class="popup"><h3>${escapeHtml(props.event || 'Storm motion')}</h3>` +
                `<table>` +
                `<tr><td class="k">Heading</td><td>${props.heading}° (toward)</td></tr>` +
                `<tr><td class="k">From</td><td>${props.dirDeg}° (meteorological)</td></tr>` +
                `<tr><td class="k">Speed</td><td>${props.speedMph} mph (${props.speedKt} kt)</td></tr>` +
                `</table></div>`
            );
        }

        function escapeHtml(s: string) {
            return s.replace(
                /[&<>"']/g,
                (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])
            );
        }

        function wireAlertLayer(cfg: any) {
            map.on('click', cfg.fillId, (e: any) => {
                if (!e.features.length) return;
                new maplibregl.Popup({ closeButton: true })
                    .setLngLat(e.lngLat)
                    .setHTML(popupHtml(e.features[0].properties))
                    .addTo(map);
            });
            map.on('mouseenter', cfg.fillId, () => (map.getCanvas().style.cursor = 'pointer'));
            map.on('mouseleave', cfg.fillId, () => (map.getCanvas().style.cursor = ''));
        }

        function addAlertLayers(key: string) {
            const cfg = ALERT_LAYERS[key];
            map.addSource(cfg.sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addLayer(
                {
                    id: cfg.fillId,
                    type: 'fill',
                    source: cfg.sourceId,
                    paint: { 'fill-color': fillColorExpr() as any, 'fill-opacity': key === 'hazards' ? 0.2 : 0.35 },
                    layout: { visibility: visible[key] ? 'visible' : 'none' }
                },
                labelLayerId
            );
            map.addLayer(
                {
                    id: cfg.lineId,
                    type: 'line',
                    source: cfg.sourceId,
                    paint: { 'line-color': fillColorExpr() as any, 'line-width': key === 'warnings' ? 2 : 1 },
                    layout: { visibility: visible[key] ? 'visible' : 'none' }
                },
                labelLayerId
            );
            wireAlertLayer(cfg);
        }

        // --- storm-motion arrows -------------------------------------------------
        // A north-pointing (0°/up) arrow drawn to a canvas; icon-rotate spins it
        // clockwise to the storm heading, with icon-rotation-alignment:'map'.
        function addArrowImage() {
            if (map.hasImage(STORM_ICON)) return;
            const size = 48;
            const c = document.createElement('canvas');
            c.width = size;
            c.height = size;
            const ctx = c.getContext('2d');
            if (!ctx) return;
            ctx.translate(size / 2, size / 2);
            // Arrow polygon pointing up (negative y).
            const pts: [number, number][] = [
                [0, -18],
                [-10, -3],
                [-4, -3],
                [-4, 17],
                [4, 17],
                [4, -3],
                [10, -3]
            ];
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
            // White halo for contrast over any polygon/basemap, dark fill on top.
            ctx.lineJoin = 'round';
            ctx.lineWidth = 5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
            ctx.fillStyle = '#111111';
            ctx.fill();
            const img = ctx.getImageData(0, 0, size, size);
            map.addImage(STORM_ICON, img, { pixelRatio: 2 });
        }

        function addStormLayer() {
            addArrowImage();
            map.addSource(STORM_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addLayer({
                id: STORM_LAYER,
                type: 'symbol',
                source: STORM_SOURCE,
                layout: {
                    'icon-image': STORM_ICON,
                    'icon-rotate': ['get', 'heading'],
                    'icon-rotation-alignment': 'map',
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                    // Scale by speed: faster storm -> bigger arrow.
                    'icon-size': ['interpolate', ['linear'], ['get', 'speedKt'], 0, 0.6, 60, 1.5],
                    'text-field': ['concat', ['to-string', ['get', 'speedMph']], ' mph'],
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-size': 11,
                    'text-offset': [0, 1.4],
                    'text-anchor': 'top',
                    'text-optional': true,
                    'text-allow-overlap': false
                },
                paint: {
                    'text-color': '#111111',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.4
                }
            });

            map.on('click', STORM_LAYER, (e: any) => {
                if (!e.features.length) return;
                new maplibregl.Popup({ closeButton: true })
                    .setLngLat(e.lngLat)
                    .setHTML(stormPopupHtml(e.features[0].properties))
                    .addTo(map);
            });
            map.on('mouseenter', STORM_LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
            map.on('mouseleave', STORM_LAYER, () => (map.getCanvas().style.cursor = ''));
        }

        // --- point forecast panel ------------------------------------------------
        function showForecastCard() {
            const card = document.getElementById('forecast');
            if (card) card.hidden = false;
        }

        function setForecastBody(html: string) {
            const body = document.getElementById('forecast-body');
            if (body) body.innerHTML = html;
            showForecastCard();
        }

        async function loadForecast(lat: number, lon: number) {
            setForecastBody('<p class="fc-loading">Loading forecast…</p>');
            try {
                const pRes = await fetch(`/api/alerts/?resource=point&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
                if (!pRes.ok) return setForecastBody('<p class="fc-empty">No forecast for this location.</p>');
                const pj = await pRes.json();
                const furl = pj.properties && pj.properties.forecast;
                if (!furl) return setForecastBody('<p class="fc-empty">No forecast for this location.</p>');

                const fRes = await fetch(`/api/alerts/?resource=forecast&url=${encodeURIComponent(furl)}`);
                if (!fRes.ok) return setForecastBody('<p class="fc-empty">No forecast for this location.</p>');
                const fj = await fRes.json();
                const periods = fj.properties && fj.properties.periods;
                if (!periods || !periods.length)
                    return setForecastBody('<p class="fc-empty">No forecast for this location.</p>');

                const p = periods[0];
                const rl = pj.properties.relativeLocation && pj.properties.relativeLocation.properties;
                const place = rl && rl.city ? `${rl.city}, ${rl.state}` : `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
                setForecastBody(
                    `<div class="fc-place">${escapeHtml(place)}</div>` +
                        `<div class="fc-temp">${p.temperature}°${escapeHtml(p.temperatureUnit || 'F')}</div>` +
                        `<div class="fc-period">${escapeHtml(p.name || '')}</div>` +
                        `<div class="fc-short">${escapeHtml(p.shortForecast || '')}</div>` +
                        `<div class="fc-wind">Wind: ${escapeHtml(`${p.windSpeed || ''} ${p.windDirection || ''}`.trim())}</div>`
                );
            } catch (e: any) {
                setForecastBody(`<p class="fc-empty">Forecast unavailable: ${escapeHtml(e.message)}</p>`);
            }
        }

        function useMyLocation() {
            const btn = document.getElementById('locate') as HTMLButtonElement | null;
            if (!('geolocation' in navigator)) {
                setForecastBody('<p class="fc-empty">Geolocation is not available — tap the map instead.</p>');
                return;
            }
            if (btn) btn.disabled = true;
            setForecastBody('<p class="fc-loading">Locating…</p>');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    if (btn) btn.disabled = false;
                    const { latitude, longitude } = pos.coords;
                    map.flyTo({ center: [longitude, latitude], zoom: 9 });
                    loadForecast(latitude, longitude);
                },
                () => {
                    if (btn) btn.disabled = false;
                    setForecastBody('<p class="fc-empty">Location permission denied — tap the map to pick a point.</p>');
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
            );
        }

        // --- UI wiring ------------------------------------------------------------
        function buildAlertLegend() {
            const ul = document.getElementById('alert-legend');
            if (!ul) return;
            const items: [string, string][] = [
                ['TO', 'Tornado'],
                ['SV', 'Svr Thunderstorm'],
                ['FF', 'Flash Flood'],
                ['FA', 'Areal Flood'],
                ['WS', 'Winter Storm'],
                ['HW', 'High Wind'],
                ['EH', 'Excessive Heat']
            ];
            ul.innerHTML =
                items
                    .map(([c, label]) => `<li><span class="sw" style="background:${PHENOM_COLORS[c]}"></span>${label}</li>`)
                    .join('') + `<li><span class="sw" style="background:${DEFAULT_ALERT_COLOR}"></span>Other</li>`;
        }

        function setLayerVisibility(key: string, on: boolean) {
            visible[key] = on;
            const vis = on ? 'visible' : 'none';
            if (WMS_LAYERS[key]) {
                map.setLayoutProperty(WMS_LAYERS[key].layerId, 'visibility', vis);
                if (key === 'precip') (document.getElementById('precip-legend-block') as HTMLElement).hidden = !on;
            } else if (ALERT_LAYERS[key]) {
                map.setLayoutProperty(ALERT_LAYERS[key].fillId, 'visibility', vis);
                map.setLayoutProperty(ALERT_LAYERS[key].lineId, 'visibility', vis);
                // Storm arrows ride along with the warnings toggle (motion = warnings).
                if (key === 'warnings' && map.getLayer(STORM_LAYER)) {
                    map.setLayoutProperty(STORM_LAYER, 'visibility', vis);
                }
            }
        }

        // Narrow-viewport behavior: collapse the panel into a top bar by default.
        const narrowMq = window.matchMedia('(max-width: 640px)');
        function setPanelCollapsed(collapsed: boolean) {
            const panel = document.getElementById('panel');
            const toggle = document.getElementById('panel-toggle');
            if (panel) panel.classList.toggle('collapsed', collapsed);
            if (toggle) toggle.setAttribute('aria-expanded', String(!collapsed));
        }

        function wireControls() {
            (document.getElementById('t-radar') as HTMLInputElement).addEventListener('change', (e) =>
                setLayerVisibility('radar', (e.target as HTMLInputElement).checked)
            );
            (document.getElementById('t-precip') as HTMLInputElement).addEventListener('change', (e) =>
                setLayerVisibility('precip', (e.target as HTMLInputElement).checked)
            );
            (document.getElementById('t-warnings') as HTMLInputElement).addEventListener('change', (e) =>
                setLayerVisibility('warnings', (e.target as HTMLInputElement).checked)
            );
            (document.getElementById('t-hazards') as HTMLInputElement).addEventListener('change', (e) =>
                setLayerVisibility('hazards', (e.target as HTMLInputElement).checked)
            );

            (document.getElementById('radar-opacity') as HTMLInputElement).addEventListener('input', (e) => {
                map.setPaintProperty(WMS_LAYERS.radar.layerId, 'raster-opacity', parseFloat((e.target as HTMLInputElement).value));
            });

            (document.getElementById('refresh') as HTMLButtonElement).addEventListener('click', () => {
                refreshRadar();
                refreshAlerts();
            });

            (document.getElementById('locate') as HTMLButtonElement).addEventListener('click', useMyLocation);

            // Collapsible panel (matters on narrow screens; harmless on wide).
            const toggle = document.getElementById('panel-toggle');
            if (toggle)
                toggle.addEventListener('click', () => {
                    const panel = document.getElementById('panel');
                    setPanelCollapsed(!(panel && panel.classList.contains('collapsed')));
                });

            // Forecast card close button.
            const fClose = document.getElementById('forecast-close');
            if (fClose)
                fClose.addEventListener('click', () => {
                    const card = document.getElementById('forecast');
                    if (card) card.hidden = true;
                });

            // Default to collapsed on phones; expanded on wide. React to rotation/resize.
            setPanelCollapsed(narrowMq.matches);
            const onMq = (ev: MediaQueryListEvent) => setPanelCollapsed(ev.matches);
            if (narrowMq.addEventListener) narrowMq.addEventListener('change', onMq);
            else narrowMq.addListener(onMq); // older Safari
        }

        // --- boot ----------------------------------------------------------------
        map.on('load', () => {
            labelLayerId = firstSymbolLayerId();

            addAlertLayers('warnings');
            addAlertLayers('hazards');
            addStormLayer();
            addOrRefreshWms('radar');
            addOrRefreshWms('precip');

            (document.getElementById('radar-legend') as HTMLImageElement).src = legendUrl(WMS_LAYERS.radar);
            (document.getElementById('precip-legend') as HTMLImageElement).src = legendUrl(WMS_LAYERS.precip);
            buildAlertLegend();

            wireControls();
            refreshAlerts();

            // Tap/click anywhere on the map -> point forecast for that spot.
            map.on('click', (e: any) => loadForecast(e.lngLat.lat, e.lngLat.lng));

            // Alerts change frequently; auto-refresh every 5 minutes.
            refreshIntervalId = setInterval(() => {
                refreshRadar();
                refreshAlerts();
            }, 5 * 60 * 1000);
        });

        map.on('error', (e: any) => console.warn('map error', e && e.error));

        // Teardown on unmount.
        return () => {
            if (refreshIntervalId) clearInterval(refreshIntervalId);
            map.remove();
        };
    }, []);

    return (
        <div className={styles.wrapper}>
            <div id="map" ref={mapRef}></div>

            <div id="panel" className="panel">
                <div className="panel-head">
                    <h1>Weather Map</h1>
                    <button id="panel-toggle" type="button" className="panel-toggle" aria-expanded="true" aria-label="Toggle controls">
                        Layers
                    </button>
                </div>

                <div className="panel-body">
                    <section className="group">
                        <label className="toggle">
                            <input type="checkbox" id="t-radar" defaultChecked />
                            <span>Radar reflectivity (WMS)</span>
                        </label>
                        <label className="toggle">
                            <input type="checkbox" id="t-precip" />
                            <span>Precip type (WMS)</span>
                        </label>
                        <label className="toggle">
                            <input type="checkbox" id="t-warnings" defaultChecked />
                            <span>Warnings + storm motion</span>
                        </label>
                        <label className="toggle">
                            <input type="checkbox" id="t-hazards" defaultChecked />
                            <span>Watches / hazards</span>
                        </label>
                    </section>

                    <section className="group">
                        <label className="slider">
                            Radar opacity
                            <input type="range" id="radar-opacity" min="0" max="1" step="0.05" defaultValue="0.7" />
                        </label>
                        <button id="locate" type="button">📍 Use my location</button>
                        <button id="refresh" type="button">↻ Refresh alerts &amp; radar</button>
                        <div id="status" className="status">
                            Loading…
                        </div>
                    </section>

                    <section className="group legend">
                        <h2>Legend</h2>
                        <div className="legend-block">
                            <div className="legend-title">Radar reflectivity</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img id="radar-legend" alt="radar legend" />
                        </div>
                        <div className="legend-block" id="precip-legend-block" hidden>
                            <div className="legend-title">Precip type</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img id="precip-legend" alt="precip type legend" />
                        </div>
                        <div className="legend-block">
                            <div className="legend-title">Alerts (by hazard)</div>
                            <ul id="alert-legend" className="alert-legend"></ul>
                        </div>
                        <div className="legend-block">
                            <div className="legend-title">Storm motion</div>
                            <div className="motion-note">Arrows point where the storm is heading; label = speed (mph).</div>
                        </div>
                    </section>

                    <footer>Data: NOAA/NWS nowCOAST &amp; api.weather.gov · Not for operational use · Tap the map for a point forecast</footer>
                </div>
            </div>

            <div id="forecast" className="forecast" hidden>
                <div className="forecast-head">
                    <span className="forecast-title">Point forecast</span>
                    <button id="forecast-close" type="button" className="forecast-close" aria-label="Close forecast">
                        ✕
                    </button>
                </div>
                <div id="forecast-body" className="forecast-body"></div>
            </div>
        </div>
    );
}
