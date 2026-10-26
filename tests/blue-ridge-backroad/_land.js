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
        g.teleportForTest(3000);
        window.__h.autopilot(2, { keyThrottle: true }, false);
        const L = g.landForTest;
        const stats = (v) => {
            v.sort((a, b) => a - b);
            return { median: +v[Math.floor(v.length*0.5)].toFixed(3), p90: +v[Math.floor(v.length*0.9)].toFixed(3),
                     p99: +v[Math.floor(v.length*0.99)].toFixed(3), max: +v[v.length-1].toFixed(3) };
        };
        const p = g.roadPointAt(3000);
        // Gradient of the full field, sampled on a world grid around the road.
        const grads = [], relief = [];
        for (let dx = -2500; dx <= 2500; dx += 100) {
            for (let dz = -2500; dz <= 2500; dz += 100) {
                const x = p.x + dx, z = p.z + dz;
                const h = L.heightAt(x, z, 3000);
                relief.push(h);
                const gx = (L.heightAt(x + 50, z, 3000) - L.heightAt(x - 50, z, 3000)) / 100;
                const gz = (L.heightAt(x, z + 50, 3000) - L.heightAt(x, z - 50, 3000)) / 100;
                grads.push(Math.hypot(gx, gz));
            }
        }
        // Shape alone, no baseline - the part that is genuinely world-space.
        const sgrads = [];
        for (let dx = -2500; dx <= 2500; dx += 100) {
            for (let dz = -2500; dz <= 2500; dz += 100) {
                const x = p.x + dx, z = p.z + dz;
                const gx = (L.shape(x + 50, z) - L.shape(x - 50, z)) / 100;
                const gz = (L.shape(x, z + 50) - L.shape(x, z - 50)) / 100;
                sgrads.push(Math.hypot(gx, gz));
            }
        }
        relief.sort((a, b) => a - b);
        return {
            gradientFull: stats(grads),
            gradientShapeOnly: stats(sgrads),
            reliefRange: +(relief[relief.length-1] - relief[0]).toFixed(1),
            coarseCount: L.coarseCount,
            distant: g.distantStatsForTest,
            seam: [g.seamProbeForTest(3000, 1), g.seamProbeForTest(3000, -1), g.seamProbeForTest(3400, 1)]
        };
    });
    const deg = (t) => (Math.atan(t) * 57.2958).toFixed(0);
    console.log('gradient, full field :', JSON.stringify(out.gradientFull), ` max ${deg(out.gradientFull.max)} deg`);
    console.log('gradient, shape only :', JSON.stringify(out.gradientShapeOnly), ` max ${deg(out.gradientShapeOnly.max)} deg`);
    console.log('relief range over 5km:', out.reliefRange, 'm   coarse polyline:', out.coarseCount);
    console.log('distant layer        :', JSON.stringify(out.distant));
    for (const s of out.seam) {
        console.log(`seam: ribbon ${s.ribbon.toFixed(4)}  field ${s.field.toFixed(4)}  diff ${(s.ribbon-s.field).toExponential(2)}  hint-independence ${(s.field-s.hintFar).toExponential(2)}`);
    }
    await browser.close();
})();
