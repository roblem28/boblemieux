// Usage: node tests/catch-the-vegetable/run.js <url>
// Smoke test: menu loads, game starts, basket moves vertically (mouse + keys), pause/resume works, game reaches game-over, no page errors.
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8080/games/catch-the-vegetable/';
  const b = await chromium.launch();
  let fail = 0;
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const p = await b.newPage({ viewport: vp });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(url);
    await p.click('#startBtn');
    await p.waitForTimeout(2000);
    const playing = await p.evaluate(() => window.__ctv.state);
    // vertical movement: basket rises toward pointer, and a falling item can be caught mid-air
    const y0 = await p.evaluate(() => window.__ctv.basket.y);
    await p.mouse.move(vp.width / 2, vp.height * 0.4);
    await p.waitForTimeout(600);
    const y1 = await p.evaluate(() => window.__ctv.basket.y);
    await p.keyboard.down('ArrowDown'); await p.waitForTimeout(1500); await p.keyboard.up('ArrowDown');
    const y2 = await p.evaluate(() => window.__ctv.basket.y);
    const vertical = y1 < y0 - vp.height * 0.2 && y2 > y1 + vp.height * 0.2;
    await p.keyboard.press('p');
    const paused = await p.evaluate(() => window.__ctv.state);
    await p.keyboard.press('p');
    await p.waitForTimeout(40000);
    const end = await p.evaluate(() => ({ state: window.__ctv.state, lives: window.__ctv.lives }));
    const ok = vertical && playing === 'playing' && paused === 'paused' && end.state === 'over' && errs.length === 0;
    console.log(`${vp.width}x${vp.height}`, ok ? 'PASS' : 'FAIL', JSON.stringify({ vertical: [Math.round(y0), Math.round(y1), Math.round(y2)], playing, paused, end, errs }));
    if (!ok) fail++;
    await p.close();
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
