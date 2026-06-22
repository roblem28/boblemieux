/* Weather Map — React client component port of weather-map-app.
 *
 * MapLibre is a real npm dependency (imported below), NOT the unpkg window global.
 * The original vanilla app.js logic runs inside useEffect after mount and is torn
 * down on unmount. Fetches go to the in-repo API route /api/wfs (was the Netlify
 * function /.netlify/functions/wfs). All map/panel CSS is scoped to .wrapper via
 * WeatherMap.module.css — nothing targets html/body.
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

        // WFS vector layers, fetched through the proxy.
        const WFS_LAYERS: Record<string, any> = {
            warnings: { proxyLayer: 'wwa:warnings', sourceId: 'warnings-src', fillId: 'warnings-fill', lineId: 'warnings-line' },
            hazards: { proxyLayer: 'wwa:hazards', sourceId: 'hazards-src', fillId: 'hazards-fill', lineId: 'hazards-line' }
        };

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
            const before = map.getLayer(WFS_LAYERS.warnings.fillId) ? WFS_LAYERS.warnings.fillId : labelLayerId;
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

        // --- WFS alerts ----------------------------------------------------------
        async function fetchAlerts(key: string) {
            const cfg = WFS_LAYERS[key];
            const url = `/api/wfs?layer=${encodeURIComponent(cfg.proxyLayer)}`;
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error(`${cfg.proxyLayer}: HTTP ${res.status}`);
            const geojson = await res.json();
            const src = map.getSource(cfg.sourceId) as any;
            if (src) src.setData(geojson);
            return geojson.features ? geojson.features.length : 0;
        }

        async function refreshAlerts() {
            const btn = document.getElementById('refresh') as HTMLButtonElement;
            if (btn) btn.disabled = true;
            try {
                const counts = await Promise.allSettled([fetchAlerts('warnings'), fetchAlerts('hazards')]);
                const w = counts[0].status === 'fulfilled' ? counts[0].value : 'err';
                const h = counts[1].status === 'fulfilled' ? counts[1].value : 'err';
                const failed = counts.find((c) => c.status === 'rejected') as PromiseRejectedResult | undefined;
                if (w === 0 && h === 0) {
                    setStatus('No active alerts.');
                } else {
                    setStatus(`${w} warning(s), ${h} watch/hazard(s) · updated ${new Date().toLocaleTimeString()}`);
                }
                if (failed) {
                    setStatus(`Alert fetch error: ${failed.reason.message}.`, true);
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
            ['phenom', 'Phenom'],
            ['sig', 'Significance'],
            ['wfo', 'Office'],
            ['msg_type', 'Message'],
            ['onset', 'Onset'],
            ['ends', 'Ends'],
            ['expiration', 'Expires']
        ];

        function popupHtml(props: any) {
            const title = props.prod_type || props.event || 'Alert';
            let rows = '';
            for (const [k, label] of POPUP_FIELDS) {
                if (props[k] != null && props[k] !== '') {
                    rows += `<tr><td class="k">${label}</td><td>${escapeHtml(String(props[k]))}</td></tr>`;
                }
            }
            const link = props.url
                ? `<p><a href="${escapeHtml(props.url)}" target="_blank" rel="noopener">Full text →</a></p>`
                : '';
            return `<div class="popup"><h3>${escapeHtml(title)}</h3><table>${rows}</table>${link}</div>`;
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
            const cfg = WFS_LAYERS[key];
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
            } else if (WFS_LAYERS[key]) {
                map.setLayoutProperty(WFS_LAYERS[key].fillId, 'visibility', vis);
                map.setLayoutProperty(WFS_LAYERS[key].lineId, 'visibility', vis);
            }
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
        }

        // --- boot ----------------------------------------------------------------
        map.on('load', () => {
            labelLayerId = firstSymbolLayerId();

            addAlertLayers('warnings');
            addAlertLayers('hazards');
            addOrRefreshWms('radar');
            addOrRefreshWms('precip');

            (document.getElementById('radar-legend') as HTMLImageElement).src = legendUrl(WMS_LAYERS.radar);
            (document.getElementById('precip-legend') as HTMLImageElement).src = legendUrl(WMS_LAYERS.precip);
            buildAlertLegend();

            wireControls();
            refreshAlerts();

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
                <h1>Weather Map</h1>

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
                        <span>Warnings (WFS)</span>
                    </label>
                    <label className="toggle">
                        <input type="checkbox" id="t-hazards" defaultChecked />
                        <span>Watches / hazards (WFS)</span>
                    </label>
                </section>

                <section className="group">
                    <label className="slider">
                        Radar opacity
                        <input type="range" id="radar-opacity" min="0" max="1" step="0.05" defaultValue="0.7" />
                    </label>
                    <button id="refresh">↻ Refresh alerts &amp; radar</button>
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
                </section>

                <footer>Data: NOAA/NWS nowCOAST &amp; api.weather.gov · Not for operational use</footer>
            </div>
        </div>
    );
}
