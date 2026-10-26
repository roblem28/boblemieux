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
        // Road elevation over a long distance. Teleport to each block so the
        // ring holds it; the strict sampler will throw if that is wrong.
        const ys = [];
        for (let base = 0; base < 60000; base += 6000) {
            g.teleportForTest(base + 200);
            for (let s = base + 250; s < base + 6000; s += 50) ys.push({ s, y: g.roadPointAt(s).y });
        }
        const vals = ys.map((r) => r.y);
        const min = Math.min(...vals), max = Math.max(...vals);
        // How much does it move over a 3 km window - the silhouette's range?
        let worst3k = 0;
        for (let i = 0; i + 60 < ys.length; i++) {
            if (ys[i + 60].s - ys[i].s > 3100) continue;
            worst3k = Math.max(worst3k, Math.abs(ys[i + 60].y - ys[i].y));
        }
        return {
            n: vals.length,
            min: +min.toFixed(1), max: +max.toFixed(1), range: +(max - min).toFixed(1),
            worstOver3km: +worst3k.toFixed(1),
            ring: g.ringRangeForTest
        };
    });
    console.log(JSON.stringify(out));
    await browser.close();
})();
