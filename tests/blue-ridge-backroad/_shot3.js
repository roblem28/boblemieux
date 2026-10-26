const { chromium } = require('playwright');
const { HARNESS } = require('./harness_tmp');
const OUT = 'C:/Users/roble/AppData/Local/Temp/claude/C--Users-roble-Projects-boblemieux/b5430337-3023-4beb-a95d-a19e806565f0/scratchpad/';
(async () => {
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.log('ERR', String(e)));
    await page.goto(process.argv[2], { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.brb && window.brb.game);
    await page.click('text=Start Engine');
    await page.waitForTimeout(1200);
    await page.evaluate(HARNESS);
    for (const [tag, s] of [['forest', 1500], ['farm', 4500], ['far', 7300]]) {
        const info = await page.evaluate((spot) => {
            const g = window.brb.game;
            for (let i = 0; i < 6 && window.brb.telemetry.camera !== 'Chase'; i++) g.cycleCamera();
            g.teleportForTest(spot);
            g.setRenderEnabled(true);
            let guard = 0;
            while (Math.abs(g.physics.u) * 2.2369362920544 < 45 && guard++ < 10) window.__h.autopilot(1.5, { keyThrottle: true }, false);
            // Let any in-flight rebuild finish.
            for (let i = 0; i < 40; i++) g.tick(1 / 60);
            return { biome: g.biomeAtForTest(g.physics.s).name, stats: g.distantStatsForTest };
        }, s);
        await page.screenshot({ path: `${OUT}p1-${tag}.png` });
        console.log(tag, info.biome, JSON.stringify(info.stats));
    }
    await browser.close();
})();
