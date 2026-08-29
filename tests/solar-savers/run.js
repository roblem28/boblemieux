#!/usr/bin/env node
/**
 * Solar Savers — Playwright regression suite.
 *
 *   node tests/solar-savers/run.js [url]
 *
 * Defaults to http://127.0.0.1:8790/games/solar-savers/?debug — serve
 * `public/` on that port first, or pass a deployed URL. Requires the game to
 * be loaded with ?debug, which exposes `window.__game`.
 *
 * Requires playwright (npm i -D playwright && npx playwright install chromium).
 *
 * Section A covers the loop/pause/touch regressions; section B covers enemy
 * fighters, waves, combat and pooling. Deterministic tests stop the render
 * loop and drive Game.tick() directly, so "simulated seconds" are exact and
 * do not depend on wall-clock timing.
 */
const { chromium, devices } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:8790/games/solar-savers/?debug';
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const pass = [], fail = [];
const check = (ok, label, detail) => (ok ? pass : fail).push(label + (detail ? '  ->  ' + detail : ''));

// One-finger drag on the canvas, as a real TouchEvent sequence.
const DRAG = `(dx, dy) => {
  const c = document.querySelector('canvas');
  const mk = (x, y) => new Touch({ identifier: 1, target: c, clientX: x, clientY: y });
  const fire = (type, t) => c.dispatchEvent(new TouchEvent(type, {
    changedTouches: [t], touches: type === 'touchend' ? [] : [t], bubbles: true, cancelable: true }));
  fire('touchstart', mk(200, 400));
  for (let i = 1; i <= 10; i++) fire('touchmove', mk(200 + dx * i / 10, 400 + dy * i / 10));
  fire('touchend', mk(200 + dx, 400 + dy));
}`;

// Installed in the page: deterministic stepping + combat helpers.
const HARNESS = () => {
  const g = window.__game;
  g.renderer.setAnimationLoop(null);            // take manual control of time
  window.__h = {
    sim(seconds) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) g.tick(1 / 60); },
    godMode() { g.player.health.max = 1e9; g.player.health.cur = 1e9; },
    enemies() { return [...g.world.tagged('enemy')]; },
    // Park a stationary laser on the target. The real collide() rule, spatial
    // hash, Health and hit() all still run; only projectile travel is removed,
    // so the shot cannot fly past the target inside the same tick.
    shootAt(entity) {
      const l = g.lasers.pool.get().launch(entity.position, g.player._fwd.clone().normalize(), 0);
      l.vel.set(0, 0, 0);
      g.world.add(l); g.world.rebuildHash();
    },
    enemyShootPlayer() {
      const l = g.lasers.enemyPool.get().launch(g.player.position, g.player._fwd.clone().normalize(), 0);
      l.vel.set(0, 0, 0);
      g.world.add(l); g.world.rebuildHash();
    },
    overflow() {
      return g.spawner.pool.overflow + g.lasers.pool.overflow + g.lasers.enemyPool.overflow
           + g.fx.sparkPool.overflow + g.fx.boomPool.overflow + g.fx.debrisPool.overflow;
    },
  };
};

(async () => {
  const browser = await chromium.launch({ args: GL });

  /* ================= A. loop / pause / input regressions ================= */
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctxA.newPage();
  const errs = [], pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message.split('\n')[0]));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  check(errs.length === 0 && pageErrors.length === 0, 'A1 no console/page errors on load',
        errs.concat(pageErrors).join(' | ') || 'clean');

  const lockedBefore = await page.evaluate(() => document.pointerLockElement !== null);
  const d1 = await page.evaluate(() => document.getElementById('tgt').textContent);
  await page.waitForTimeout(2000);
  const d2 = await page.evaluate(() => document.getElementById('tgt').textContent);
  check(d1 !== d2 && !lockedBefore, 'A2 sim ticks with no pointer lock',
        `pointerLock=${lockedBefore}  tgt ${d1} -> ${d2}`);

  await page.click('#overlay', { force: true });
  await page.waitForTimeout(1200);
  const gate = await page.evaluate(() => ({
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    touchOn: document.getElementById('touch').classList.contains('on'),
    locked: document.pointerLockElement !== null,
  }));
  check(gate.overlayHidden && gate.locked && !gate.touchOn,
        'A3 overlay clears, lock engages, touch stays hidden', JSON.stringify(gate));

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  const pausedOn = await page.evaluate(() => document.getElementById('paused').classList.contains('on'));
  const pd1 = await page.evaluate(() => document.getElementById('tgt').textContent);
  await page.waitForTimeout(1200);
  const pd2 = await page.evaluate(() => document.getElementById('tgt').textContent);
  check(pausedOn && pd1 === pd2, 'A4 PAUSED shows and halts the sim', `tgt ${pd1} -> ${pd2}`);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.mouse.click(640, 300);
  await page.waitForTimeout(1000);
  const rd = await page.evaluate(() => document.getElementById('tgt').textContent);
  check(rd !== pd2, 'A5 resumes on input', `tgt ${pd2} -> ${rd}`);

  const life = await page.evaluate(async () => {
    const g = window.__game, dir = g.player._fwd.clone().normalize();
    for (let n = 0; n < 40; n++) {
      const p = g.player.position.clone().addScaledVector(dir, 8 + n * 3);
      g.world.add(g.lasers.pool.get().launch(p, dir.clone(), 0));
    }
    const spawned = g.world.tagged('projectile').size;
    const a = document.getElementById('tgt').textContent;
    await new Promise(r => setTimeout(r, 3200));           // past CFG.laser.life
    return { spawned, after: g.world.tagged('projectile').size,
             poolFree: g.lasers.pool.free.length, a, b: document.getElementById('tgt').textContent };
  });
  check(life.after < life.spawned && life.poolFree > 0 && life.a !== life.b,
        'A6 lasers expire, recycle, loop stays alive',
        `in flight ${life.spawned} -> ${life.after}, pool.free ${life.poolFree}`);
  await ctxA.close();

  /* ================= B. enemy fighters ================= */
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bp = await ctxB.newPage();
  const bErrs = [];
  bp.on('console', m => { if (m.type() === 'error') bErrs.push(m.text()); });
  bp.on('pageerror', e => bErrs.push('pageerror: ' + e.message.split('\n')[0]));
  await bp.goto(URL, { waitUntil: 'load' });
  await bp.waitForTimeout(1500);
  await bp.evaluate(HARNESS);

  // --- B1 wave 1 spawns ---
  const w1 = await bp.evaluate(() => {
    const g = window.__game; g.relaunch(); window.__h.godMode();
    window.__h.sim(3);
    return { wave: g.spawner.waveIndex + 1, count: window.__h.enemies().length,
             expected: g.constructor === Object ? 0 : 3 };
  });
  check(w1.wave === 1 && w1.count === 3, 'B1 wave 1 spawns 3 fighters',
        `wave ${w1.wave}, ${w1.count} enemies`);

  // --- B2 spawned outside the player's forward view ---
  const spawnAngles = await bp.evaluate(() => {
    const g = window.__game;
    return window.__h.enemies().map(e => {
      const to = e.position.clone().sub(g.player.position).normalize();
      return +(Math.acos(Math.max(-1, Math.min(1, to.dot(g.player._fwd)))) * 180 / Math.PI).toFixed(1);
    });
  });
  check(spawnAngles.every(a => a >= 60), 'B2 fighters spawn >=60deg off the nose',
        `angles ${spawnAngles.join(', ')}`);

  // --- B3 reaches ATTACK_RUN and fires within 15 simulated seconds ---
  const combat = await bp.evaluate(() => {
    const g = window.__game;
    let shots = 0, sawAttack = false, tAttack = null, tShot = null;
    const off1 = g.bus.on('enemy:fire', () => { shots++; if (tShot === null) tShot = t; });
    const off2 = g.bus.on('enemy:state', e => {
      if (e.state === 'ATTACK_RUN' && !sawAttack) { sawAttack = true; tAttack = t; }
    });
    let t = 0;
    for (let i = 0; i < 15 * 60; i++) { g.tick(1 / 60); t += 1 / 60; }
    off1(); off2();
    return { sawAttack, shots, tAttack: tAttack && +tAttack.toFixed(1), tShot: tShot && +tShot.toFixed(1) };
  });
  check(combat.sawAttack && combat.shots > 0, 'B3 reaches ATTACK_RUN and fires within 15s',
        `ATTACK_RUN at ${combat.tAttack}s, first shot ${combat.tShot}s, ${combat.shots} shots`);

  // --- B4 enemy laser damages the player ---
  const hull = await bp.evaluate(() => {
    const g = window.__game;
    g.player.health.max = 100; g.player.health.cur = 100;
    const before = g.player.health.cur;
    window.__h.enemyShootPlayer();
    g.tick(1 / 60);
    const after = g.player.health.cur;
    window.__h.godMode();
    return { before, after };
  });
  check(hull.after < hull.before, 'B4 enemy laser reduces hull',
        `hull ${hull.before} -> ${hull.after} (expected -8)`);

  // --- B5 three player lasers kill a fighter and emit enemy:died ---
  const kill = await bp.evaluate(() => {
    const g = window.__game;
    const e = window.__h.enemies()[0];
    if (!e) return { error: 'no enemy' };
    const hp0 = e.health.cur;
    let died = false;
    const off = g.bus.on('enemy:died', x => { if (x === e) died = true; });
    const hps = [];
    for (let i = 0; i < 3; i++) { window.__h.shootAt(e); g.tick(1 / 60); hps.push(e.health.cur); }
    off();
    return { hp0, hps, died };
  });
  check(!kill.error && kill.died && kill.hp0 === 3,
        'B5 three hits kill a fighter and emit enemy:died',
        `hp ${kill.hp0} -> ${JSON.stringify(kill.hps)}, died=${kill.died}`);

  // --- B6 wave 2 spawns after wave 1 is cleared ---
  const w2 = await bp.evaluate(() => {
    const g = window.__game;
    let started = null;
    const off = g.bus.on('wave:start', w => { started = w; });
    for (const e of window.__h.enemies()) { e.health.cur = 1; e.hit(1); }
    window.__h.sim(0.1);
    const cleared = window.__h.enemies().length;
    window.__h.sim(4);                             // delayAfterClear is 3s
    off();
    return { cleared, wave: g.spawner.waveIndex + 1, count: window.__h.enemies().length, started };
  });
  check(w2.cleared === 0 && w2.wave === 2 && w2.count === 4,
        'B6 wave 2 spawns after wave 1 clears',
        `cleared -> wave ${w2.wave} with ${w2.count} (event ${JSON.stringify(w2.started)})`);

  // --- B7 EVADE when hit outside an attack run ---
  const evade = await bp.evaluate(() => {
    const g = window.__game;
    const e = window.__h.enemies().find(x => x.state !== 'ATTACK_RUN') || window.__h.enemies()[0];
    e.setState('APPROACH');
    e.health.cur = 5;
    e.hit(1);
    return { state: e.state };
  });
  check(evade.state === 'EVADE', 'B7 hit outside ATTACK_RUN triggers EVADE', `state ${evade.state}`);

  // --- B8 asteroid avoidance, on a deliberate collision course ---
  const avoid = await bp.evaluate(() => {
    const g = window.__game;
    // Aim each live fighter straight at the biggest rock from 220u out.
    let rock = null;
    for (const a of g.world.tagged('asteroid')) if (!rock || a.radius > rock.radius) rock = a;
    const es = [...g.world.tagged('enemy')];
    if (!rock || !es.length) return { error: 'no setup' };
    const M = g.player.position.constructor;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      const off = new M(0, 1, 0).applyAxisAngle(new M(1, 0, 0), i * 1.3).multiplyScalar(0.001);
      e.position.copy(rock.position).add(new M(0, 0, 1).multiplyScalar(220)).add(off);
      e.object.lookAt(rock.position);            // nose pointed straight at it
      e.setState('APPROACH');
    }
    g.world.rebuildHash();
    let worst = Infinity, headOn = 0;
    for (let i = 0; i < 12 * 60; i++) {
      g.tick(1 / 60);
      for (const e of g.world.tagged('enemy')) {
        const gap = rock.position.distanceTo(e.position) - rock.radius - e.radius;
        if (gap < worst) worst = gap;
        if (gap < 40) headOn++;
      }
    }
    return { worst: +worst.toFixed(1), rockRadius: +rock.radius.toFixed(1), headOn };
  });
  check(!avoid.error && avoid.worst > 0, 'B8 fighters steered around a rock they were aimed at',
        `closest surface gap ${avoid.worst}u (rock r=${avoid.rockRadius})`);

  // --- B9 120 simulated seconds of play, clean ---
  const soak = await bp.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    let kills = 0;
    const off = g.bus.on('enemy:died', () => kills++);
    for (let i = 0; i < 120 * 60; i++) {
      g.tick(1 / 60);
      // keep the fight moving so waves advance
      if (i % 30 === 0) { const e = [...g.world.tagged('enemy')][0]; if (e) e.hit(1); }
    }
    off();
    return { kills, wave: g.spawner.waveIndex + 1, overflow: window.__h.overflow(),
             entities: g.world.entities.length,
             enemyLasers: g.world.tagged('enemyProjectile').size,
             bursts: g.fx.bursts.length, debris: g.fx.debris.length };
  });
  check(bErrs.length === 0, 'B9 no console errors after 120s of simulated play',
        bErrs.slice(0, 3).join(' | ') || `clean (${soak.kills} kills, reached wave ${soak.wave})`);
  check(soak.overflow === 0, 'B10 no pool overflowed its capacity',
        `overflow ${soak.overflow}, entities ${soak.entities}`);

  // --- B11 R resets the world ---
  const reset = await bp.evaluate(() => {
    const g = window.__game;
    g.player.health.max = 100; g.player.health.cur = 1;
    g.score = 4242;
    g.player.health.damage(1);                     // -> player:died
    const dead = { flag: g.dead, overlay: document.getElementById('dead').classList.contains('on') };
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
    const after = {
      dead: g.dead,
      overlay: document.getElementById('dead').classList.contains('on'),
      hull: g.player.health.cur,
      pos: +g.player.position.length().toFixed(2),
      score: g.score,
      enemies: g.world.tagged('enemy').size,
      asteroids: g.world.tagged('asteroid').size,
      lasers: g.world.tagged('projectile').size + g.world.tagged('enemyProjectile').size,
      bursts: g.fx.bursts.length,
      wave: g.spawner.waveIndex,
    };
    return { dead, after };
  });
  check(reset.dead.flag && reset.dead.overlay, 'B11 player death freezes and shows the overlay',
        JSON.stringify(reset.dead));
  check(!reset.after.dead && reset.after.hull === 100 && reset.after.pos === 0 &&
        reset.after.score === 0 && reset.after.enemies === 0 && reset.after.lasers === 0 &&
        reset.after.bursts === 0 && reset.after.asteroids === 60 && reset.after.wave === -1,
        'B12 R fully resets world, player, score and waves', JSON.stringify(reset.after));

  await ctxB.close();

  /* ================= C. mobile touch fallback ================= */
  const ctxC = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
  const mp = await ctxC.newPage();
  const mErrs = [];
  mp.on('pageerror', e => mErrs.push(e.message.split('\n')[0]));
  await mp.goto(URL, { waitUntil: 'load' });
  await mp.waitForTimeout(2200);
  await mp.tap('#overlay');
  await mp.waitForTimeout(400);
  const mGate = await mp.evaluate(() => ({
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    touchOn: document.getElementById('touch').classList.contains('on'),
  }));
  check(mGate.overlayHidden && mGate.touchOn, 'C1 mobile: touch pad appears', JSON.stringify(mGate));

  const yaw0 = await mp.evaluate(() => window.__game.player.object.quaternion.y);
  await mp.evaluate(`(${DRAG})(260, 0)`);
  await mp.waitForTimeout(300);
  const yaw1 = await mp.evaluate(() => window.__game.player.object.quaternion.y);
  check(Math.abs(yaw1 - yaw0) > 1e-4, 'C2 mobile: touch-drag yaws the ship',
        `quat.y ${yaw0.toFixed(5)} -> ${yaw1.toFixed(5)}`);

  const s0 = await mp.evaluate(() => +document.getElementById('spd').textContent);
  const bb = await mp.locator('#touch .boost').boundingBox();
  await mp.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await mp.mouse.down();
  await mp.waitForTimeout(1400);
  const s1 = await mp.evaluate(() => +document.getElementById('spd').textContent);
  await mp.mouse.up();
  check(s1 > s0 + 20, 'C3 mobile: on-screen BOOST accelerates', `speed ${s0} -> ${s1}`);
  check(mErrs.length === 0, 'C4 mobile: no uncaught errors', mErrs.join(' | ') || 'clean');
  await ctxC.close();

  console.log('\n================ SOLAR SAVERS ================');
  pass.forEach(p => console.log('  PASS  ' + p));
  fail.forEach(f => console.log('  FAIL  ' + f));
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED:', e); process.exit(2); });
