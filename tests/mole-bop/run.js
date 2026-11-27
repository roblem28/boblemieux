// Usage: node tests/mole-bop/run.js <url>   (url should include ?debug&t=8)
// Smoke test with Chromium's fake camera:
//   body tracker loads and runs on live frames, synthetic raised-hands pose starts the game,
//   hand hits score, a parked hand can't farm a fresh mole, bombs subtract, mouse works,
//   round ends on time, no page errors.
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8080/games/mole-bop/?debug&t=8';
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const r = {};
  await p.goto(url);

  // 1. tracker loads and processes camera frames
  await p.waitForFunction(() => window.__mb && window.__mb.poseReady, null, { timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(3000);
  r.poseReady = await p.evaluate(() => window.__mb.poseReady);
  r.camFps = await p.evaluate(() => Math.round(window.__mb.camFps));
  await p.screenshot({ path: '/tmp/mole-bop-menu.png' });

  // 2. camera off, then a synthetic pose with both wrists above the nose starts the game
  await p.keyboard.press('c');
  await p.waitForTimeout(200);
  const pose = (up) => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    lm[0] = { x: 0.5, y: 0.35, visibility: 0.99 };
    lm[15] = { x: 0.6, y: up ? 0.15 : 0.7, visibility: 0.9 }; lm[19] = { x: 0.62, y: up ? 0.1 : 0.75, visibility: 0.9 };
    lm[16] = { x: 0.4, y: up ? 0.15 : 0.7, visibility: 0.9 }; lm[20] = { x: 0.38, y: up ? 0.1 : 0.75, visibility: 0.9 };
    return lm;
  };
  await p.evaluate((lm) => { window.__mb.poses = [lm]; }, pose(true));
  await p.waitForTimeout(1500);
  r.raisedStart = await p.evaluate(() => window.__mb.state);
  r.handsFromPose = await p.evaluate(() => window.__mb.getHands().length);
  await p.evaluate(() => { window.__mb.poses = []; });

  // 3. injected hand hits a mole
  await p.evaluate(() => { const g = window.__mb.game; g.nextSpawn = 1e12; window.__mb.holes.forEach(h => h.mole = null); });
  const s0 = await p.evaluate(() => window.__mb.score);
  await p.evaluate(() => { const h = window.__mb.holes[5]; window.__mb.forceMole(5); window.__mb.setInjected([{ id: 't1', x: h.x, y: h.y }]); });
  await p.waitForTimeout(150);
  r.hitScored = (await p.evaluate(() => window.__mb.score)) > s0;
  await p.evaluate(() => window.__mb.setInjected([]));
  await p.waitForTimeout(400);

  // 4. parked hand: mole spawned under it must not score until the hand leaves and returns
  const s1 = await p.evaluate(() => window.__mb.score);
  await p.evaluate(() => { const h = window.__mb.holes[0]; window.__mb.setInjected([{ id: 't2', x: h.x, y: h.y }]); });
  await p.waitForTimeout(100);
  await p.evaluate(() => { window.__mb.spawnAt(0); window.__mb.holes[0].mole.kind = 'mole'; window.__mb.holes[0].mole.life = 5000; });
  await p.waitForTimeout(400);
  r.parkedBlocked = (await p.evaluate(() => window.__mb.score)) === s1;
  await p.evaluate(() => window.__mb.setInjected([{ id: 't2', x: 5, y: 5 }]));
  await p.waitForTimeout(100);
  await p.evaluate(() => { const h = window.__mb.holes[0]; window.__mb.setInjected([{ id: 't2', x: h.x, y: h.y }]); });
  await p.waitForTimeout(150);
  r.reentryScores = (await p.evaluate(() => window.__mb.score)) > s1;
  await p.evaluate(() => window.__mb.setInjected([]));

  // 5. bomb subtracts
  await p.evaluate(() => { window.__mb.game.score = 20; window.__mb.forceMole(2, 'bomb'); const h = window.__mb.holes[2]; window.__mb.setInjected([{ id: 't3', x: h.x, y: h.y }]); });
  await p.waitForTimeout(150);
  r.bomb = await p.evaluate(() => ({ score: window.__mb.score, bombs: window.__mb.game.bombs }));
  await p.evaluate(() => window.__mb.setInjected([]));

  // 6. mouse hit
  await p.waitForTimeout(400);
  const s2 = await p.evaluate(() => window.__mb.score);
  const hole = await p.evaluate(() => { window.__mb.forceMole(7); const h = window.__mb.holes[7]; return { x: h.x, y: h.y }; });
  await p.mouse.move(5, 700); await p.mouse.move(hole.x, hole.y, { steps: 5 });
  await p.waitForTimeout(150);
  r.mouseHit = (await p.evaluate(() => window.__mb.score)) > s2;
  await p.screenshot({ path: '/tmp/mole-bop-play.png' });

  // 7. round ends
  await p.evaluate(() => { window.__mb.game.nextSpawn = 0; });
  await p.waitForFunction(() => window.__mb.state === 'over', null, { timeout: 15000 }).catch(() => {});
  r.end = await p.evaluate(() => window.__mb.state);
  await p.screenshot({ path: '/tmp/mole-bop-over.png' });
  r.errs = errs;

  const ok = r.poseReady && r.camFps > 0 && r.raisedStart === 'playing' && r.handsFromPose === 2 && r.hitScored
    && r.parkedBlocked && r.reentryScores && r.bomb.score === 15 && r.bomb.bombs === 1 && r.mouseHit && r.end === 'over' && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(r));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
