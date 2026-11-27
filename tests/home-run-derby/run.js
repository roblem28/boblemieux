// Usage: node tests/home-run-derby/run.js <url>   (url should include ?debug&outs=3)
// Smoke test with Chromium's fake camera: tracker loads, raised-hands pose starts the game,
// on-time swing = home run, early swing = out, a pose-driven arm swing is detected,
// a taken pitch is not an out, the game ends after the outs, no page errors.
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8080/games/home-run-derby/?debug&outs=3';
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const r = {};
  await p.goto(url);
  await p.waitForFunction(() => window.__hr && window.__hr.poseReady, null, { timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(3000);
  r.poseReady = await p.evaluate(() => window.__hr.poseReady);
  r.camFps = await p.evaluate(() => Math.round(window.__hr.camFps));
  await p.screenshot({ path: '/tmp/hrd-menu.png' });

  // pose helper in page: shoulders 0.15 apart, hands at (hx, hy)
  await p.evaluate(() => {
    window.__mk = (hx, hy, up) => {
      const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.6, visibility: 0.9 }));
      lm[0] = { x: 0.5, y: 0.3, visibility: 0.99 };
      lm[11] = { x: 0.575, y: 0.42, visibility: 0.9 }; lm[12] = { x: 0.425, y: 0.42, visibility: 0.9 };
      lm[15] = { x: hx + 0.01, y: up ? 0.12 : hy, visibility: 0.9 }; lm[16] = { x: hx - 0.01, y: up ? 0.12 : hy, visibility: 0.9 };
      return [lm];
    };
    window.__waitPitch = () => new Promise(res => { const t = setInterval(() => { const g = window.__hr.game; if (g.phase === 'pitch' && g.pitch && !g.pitch.swung) { clearInterval(t); res(); } }, 10); });
    window.__at = (ms) => new Promise(res => { const tgt = window.__hr.arrivalTime() + ms; const t = setInterval(() => { if (performance.now() >= tgt) { clearInterval(t); res(); } }, 1); });
  });

  // 1. hands-up start
  await p.evaluate(() => window.__hr.setPoses(window.__mk(0.5, 0.6, true)));
  await p.waitForTimeout(1500);
  r.raisedStart = await p.evaluate(() => window.__hr.state);
  await p.evaluate(() => window.__hr.setPoses(window.__mk(0.62, 0.6, false))); // stance, hands still

  // 2. perfect swing = home run
  r.homer = await p.evaluate(async () => { await window.__waitPitch(); await window.__at(0); window.__hr.swing(performance.now(), 1); const g = window.__hr.game; return { type: g.hit && g.hit.type, dist: g.hit && g.hit.dist, hrs: g.hrs, outs: g.outs }; });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/hrd-homer.png' });

  // 3. way-early swing = out (whiff)
  r.early = await p.evaluate(async () => { await window.__waitPitch(); await window.__at(-420); window.__hr.swing(performance.now(), 1); const g = window.__hr.game; return { type: g.hit && g.hit.type, outs: g.outs }; });

  // 4. arm swing from pose landmarks gets detected and scored
  r.poseSwing = await p.evaluate(async () => {
    await window.__waitPitch(); await window.__at(-110);
    const n0 = window.__hr.game.log.length;
    for (let i = 0; i <= 8; i++) { window.__hr.setPoses(window.__mk(0.62 - i * 0.05, 0.6, false)); await new Promise(r => setTimeout(r, 18)); }
    const g = window.__hr.game;
    return { detected: g.log.length > n0, last: g.log[g.log.length - 1], type: g.hit && g.hit.type };
  });
  await p.evaluate(() => window.__hr.setPoses(window.__mk(0.62, 0.6, false)));

  // 5. taken pitch: not an out
  r.take = await p.evaluate(async () => { await window.__waitPitch(); const o = window.__hr.game.outs; await window.__at(600); return { outsBefore: o, outsAfter: window.__hr.game.outs, takes: window.__hr.game.takes }; });

  // 6. strike out the rest → game over
  await p.evaluate(async () => {
    while (window.__hr.state === 'playing') {
      await window.__waitPitch(); await window.__at(-450); window.__hr.swing(performance.now(), 1);
      await new Promise(r => setTimeout(r, 1300));
    }
  });
  await p.waitForTimeout(500);
  r.end = await p.evaluate(() => ({ state: window.__hr.state, hrs: window.__hr.game.hrs, outs: window.__hr.game.outs }));
  await p.screenshot({ path: '/tmp/hrd-over.png' });
  r.errs = errs;

  const ok = r.poseReady && r.camFps > 0 && r.raisedStart === 'playing' && r.homer.type === 'homer' && r.homer.hrs === 1
    && r.early.type === 'whiff' && r.early.outs === 1 && r.poseSwing.detected && r.take.outsAfter === r.take.outsBefore
    && r.end.state === 'over' && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(r));
  await b.close(); process.exit(ok ? 0 : 1);
})();
