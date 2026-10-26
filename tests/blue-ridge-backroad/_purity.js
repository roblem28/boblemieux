const { chromium } = require('playwright');
const { HARNESS } = require('./harness_tmp');
(async () => {
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.on('pageerror', (e) => console.log('ERR', String(e)));
    await page.goto(process.argv[2], { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.brb && window.brb.game);
    await page.click('text=Start Engine');
    await page.waitForTimeout(1000);
    await page.evaluate(HARNESS);

    const out = await page.evaluate(() => {
        const g = window.brb.game;
        // Probe points on a fixed stretch, chosen once.
        // Points near the leading edge of generation when cold: their
        // smoothing window reaches past what has been generated.
        const PROBE_S = [2200, 2600, 3000, 3400];
        const read = () => PROBE_S.map((s) => ({
            s,
            centre: g.crossHeightForTest(s, 0),
            edge: g.crossHeightForTest(s, 79),
            baseline: g.landForTest.baselineAtS(s)
        }));

        // A: cold. Only enough road generated to reach the probes.
        g.teleportForTest(1400);
        const cold = read();
        const coldPolyline = g.landForTest.coarseCount;
        const coldReach = coldPolyline * 150;

        // B: same points, after the road has been generated 50 km further.
        for (let s = 6000; s <= 50000; s += 4000) g.teleportForTest(s);
        const deepPolyline = g.landForTest.coarseCount;
        g.teleportForTest(1400);
        const deep = read();

        const diffs = cold.map((c, i) => ({
            s: c.s,
            centre: +(deep[i].centre - c.centre).toFixed(4),
            edge: +(deep[i].edge - c.edge).toFixed(4),
            baseline: +(deep[i].baseline - c.baseline).toFixed(4)
        }));
        return { coldPolyline, coldReach, deepPolyline, diffs,
                 worstEdge: Math.max(...diffs.map((d) => Math.abs(d.edge))),
                 worstCentre: Math.max(...diffs.map((d) => Math.abs(d.centre))) };
    });
    console.log(`polyline: cold ${out.coldPolyline} entries (reaches s=${out.coldReach}), after 50 km ${out.deepPolyline}`);
    for (const d of out.diffs) console.log(`  s=${d.s}  centre ${d.centre} m   edge(u=79) ${d.edge} m   baseline ${d.baseline} m`);
    console.log(`worst centre drift ${out.worstCentre} m, worst edge drift ${out.worstEdge} m`);
    console.log(out.worstEdge < 0.01 ? 'PURE' : 'NOT PURE - terrain moves with drive length');
    await browser.close();
})();
