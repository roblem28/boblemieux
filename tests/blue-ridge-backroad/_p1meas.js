const { chromium } = require('playwright');
const { HARNESS } = require('./harness_tmp');
(async () => {
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.log('ERR', String(e)));
    await page.goto(process.argv[2], { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.brb && window.brb.game);
    await page.click('text=Start Engine');
    await page.waitForTimeout(1200);
    await page.evaluate(HARNESS);

    const r = await page.evaluate(() => {
        const g = window.brb.game;
        for (let i = 0; i < 6 && window.brb.telemetry.camera !== 'Chase'; i++) g.cycleCamera();
        const cv = document.querySelector('canvas'), w = 320, h = 180;
        const off = document.createElement('canvas'); off.width = w; off.height = h;
        const ctx = off.getContext('2d');
        const shot = () => { g.tick(0); ctx.clearRect(0,0,w,h); ctx.drawImage(cv,0,0,w,h); return ctx.getImageData(0,0,w,h).data; };
        const changed = (a, b) => {
            let n = 0;
            for (let i = 0; i < w*h; i++) {
                const d = Math.max(Math.abs(a[i*4]-b[i*4]), Math.abs(a[i*4+1]-b[i*4+1]), Math.abs(a[i*4+2]-b[i*4+2]));
                if (d > 12) n++;
            }
            return (n / (w*h)) * 100;
        };
        // Deep Forest only, so this is like-for-like with the Phase 0 numbers.
        const SPOTS = [];
        for (let slot = 0; slot < 40 && SPOTS.length < 4; slot++) {
            const s = slot * 3000 + 1500;
            if (g.biomeAtForTest(s).id === 'forest') SPOTS.push(s);
        }

        let farPct = 0, verts = 0, tris = 0, draws = 0;
        g.setRenderEnabled(true);
        for (const spot of SPOTS) {
            g.teleportForTest(spot);
            let guard = 0;
            while (Math.abs(g.physics.u) * 2.2369362920544 < 45 && guard++ < 10) window.__h.autopilot(1.5, { keyThrottle: true }, false);
            for (let i = 0; i < 40; i++) g.tick(1 / 60);   // let any rebuild land

            const base = shot();
            const sNow = g.physics.s;
            // Geometry classifier: hide everything that represents ground more
            // than 100 m up the road, and count what changes.
            const far = g.chunksForTest.filter((c) => c.sStart - sNow > 100);
            for (const c of far) if (c.terrain) c.terrain.visible = false;
            const hadDistant = !!g.distantStatsForTest;
            if (hadDistant) g.setDistantLandVisible(false);
            const hidden = shot();
            for (const c of far) if (c.terrain) c.terrain.visible = true;
            if (hadDistant) g.setDistantLandVisible(true);
            farPct += changed(base, hidden);

            draws = Math.max(draws, g.drawCalls);
            let v = 0, t = 0;
            for (const c of g.chunksForTest) {
                for (const key of ['road', 'terrain']) {
                    const m = c[key];
                    if (!m) continue;
                    v += m.geometry.getAttribute('position').count;
                    const idx = m.geometry.getIndex();
                    t += idx ? idx.count / 3 : 0;
                }
            }
            const d = g.distantStatsForTest;
            if (d) { v += d.verts; t += d.tris; }
            verts = Math.max(verts, v);
            tris = Math.max(tris, t);
        }
        g.setRenderEnabled(false);

        const times = [];
        for (const spot of SPOTS) {
            g.teleportForTest(spot - 400);
            const t0 = performance.now();
            g.teleportForTest(spot);
            times.push((performance.now() - t0) / Math.max(1, g.chunksForTest.length));
        }
        times.sort((a, b) => a - b);

        return {
            farTerrainPct: +(farPct / SPOTS.length).toFixed(1),
            verts, tris: Math.round(tris), liveChunks: g.chunksForTest.length,
            drawCalls: draws,
            buildMsPerChunk: +times[Math.floor(times.length / 2)].toFixed(3),
            distant: g.distantStatsForTest ?? null
        };
    });
    console.log(JSON.stringify(r));
    await browser.close();
})();
