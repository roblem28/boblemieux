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
    // Advance in small steps until `pred()` is true (or `cap` seconds elapse),
    // instead of a hardcoded sim() duration derived by hand from CFG values
    // that live outside the test (spawn jitter, per-wave groupDelay, etc.).
    // A future change to any of those constants shifts how long this takes
    // to settle but cannot silently reintroduce a race against a stale
    // hardcoded wait, the way sim(11) did against wave 1's groupDelay:8.
    simUntil(pred, cap = 30, step = 0.25) {
      let t = 0;
      while (!pred() && t < cap) { this.sim(step); t += step; }
      return { ok: pred(), seconds: +t.toFixed(2) };
    },
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
           + g.fx.sparkPool.overflow + g.fx.boomPool.overflow + g.fx.debrisPool.overflow
           + g.cores.pool.overflow;    // SPEC 18.2: cores pool (capacity read live where it matters, see I9a/K)
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

  // --- A2b: Game.launched is false until the overlay is clicked (SPEC 3/15
  // pause semantics). A hidden tab must NOT pause and must NOT show PAUSED
  // while launched is false. Faking visibility requires overriding BOTH
  // document.hidden (what the game reads) and document.visibilityState
  // (what a human/other code sees) before dispatching visibilitychange.
  const preLaunch = await page.evaluate(async () => {
    const g = window.__game;
    const launchedBefore = g.launched;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 700));                 // well past CFG.pauseDelay (0.5s)
    const result = {
      launchedBefore,
      pausedFlag: g.paused,
      pausedOn: document.getElementById('paused').classList.contains('on'),
    };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    return result;
  });
  check(!preLaunch.launchedBefore && !preLaunch.pausedFlag && !preLaunch.pausedOn,
        'A2b hidden tab before launch does not pause (Game.launched=false)', JSON.stringify(preLaunch));

  await page.click('#overlay', { force: true });
  await page.waitForTimeout(1200);
  const gate = await page.evaluate(() => ({
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    touchOn: document.getElementById('touch').classList.contains('on'),
    locked: document.pointerLockElement !== null,
    launched: window.__game.launched,
  }));
  check(gate.overlayHidden && gate.locked && !gate.touchOn,
        'A3 overlay clears, lock engages, touch stays hidden', JSON.stringify(gate));
  check(gate.launched === true, 'A3b Game.launched becomes true once the overlay is cleared',
        `launched=${gate.launched}`);

  // --- A4a: pause is debounced by CFG.pauseDelay (0.5s); a hide shorter than
  // that must not pause (alt-tab bounce / focus blip / screenshot).
  const shortHide = await page.evaluate(async () => {
    const g = window.__game;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 300));                 // well under the 500ms debounce
    const midPaused = g.paused;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));       // cancels the pending debounce timer
    await new Promise(r => setTimeout(r, 400));                  // outlive the original timer either way
    return { midPaused, afterPaused: g.paused };
  });
  check(!shortHide.midPaused && !shortHide.afterPaused,
        'A4a a hide shorter than pauseDelay (0.5s) does not pause', JSON.stringify(shortHide));

  // --- A4b: a hide longer than pauseDelay pauses and shows PAUSED, which
  // must never coexist with the (already-cleared) launch overlay.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(700);                                // past the 500ms debounce
  const pausedGate = await page.evaluate(() => ({
    pausedFlag: window.__game.paused,
    pausedOn: document.getElementById('paused').classList.contains('on'),
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  }));
  check(pausedGate.pausedFlag && pausedGate.pausedOn && pausedGate.overlayHidden,
        'A4b a hide longer than pauseDelay pauses; PAUSED never coexists with the launch overlay',
        JSON.stringify(pausedGate));
  const pd1 = await page.evaluate(() => document.getElementById('tgt').textContent);
  await page.waitForTimeout(1200);
  const pd2 = await page.evaluate(() => document.getElementById('tgt').textContent);
  check(pd1 === pd2, 'A4c PAUSED halts the sim', `tgt ${pd1} -> ${pd2}`);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
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
  // SPEC v1.6 (§6): wave-1 base count 3 -> 4, so MEDIUM's waveDelta -1 (§7)
  // gives 4 + (-1) = 3 fighters, not 2.
  // SPEC v1.6 (§6, §17 amendment v1.6 item 2): wave 1 also gains
  // `groupDelay: 8` on its second spawn bearing, so a fighter queued in that
  // group can sit for up to jitter(2s) + groupDelay(8s) = 10s after
  // wave:start before it materialises -- and wave:start itself only fires
  // after Spawner.reset()'s own 1.5s wave-1 timer, for an 11.5s worst case
  // from reset(). A prior fixed sim(11) here (2s jitter + 8s groupDelay,
  // omitting that 1.5s timer) could therefore miss the last fighter; measured
  // 2/3 materialised at 11s, 3/3 at 13s over 3 runs. Sim past the spawn timer,
  // read `spawner.alive` for the committed count, then poll (simUntil) until
  // every committed fighter has materialised rather than hardcoding a wait,
  // so a future change to jitter/groupDelay/the wave-1 timer cannot
  // reintroduce this race silently.
  const w1 = await bp.evaluate(() => {
    const g = window.__game; g.relaunch(); window.__h.godMode();
    window.__h.sim(1.6);                           // past the 1.5s wave-1 spawn timer
    const committedAlive = g.spawner.alive;
    const wait = window.__h.simUntil(() => window.__h.enemies().length >= committedAlive);
    return { wave: g.spawner.waveIndex + 1, committedAlive, count: window.__h.enemies().length, waitSeconds: wait.seconds };
  });
  check(w1.wave === 1 && w1.committedAlive === 3 && w1.count === 3, 'B1 wave 1 spawns 3 fighters',
        `wave ${w1.wave}, spawner.alive=${w1.committedAlive} committed, ${w1.count} materialised after ${w1.waitSeconds}s`);

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

  // --- B3 reaches ATTACK_RUN and fires within 25 simulated seconds ---
  // SPEC v1.2 (§12, §17 amendment "v1.2" item 7): the 80->110u/s enemy speed
  // cut and 900-1200u spawn band push the old 15s threshold to 25s. This
  // runs at whatever difficulty is default (MEDIUM) in a fresh context.
  //
  // WARNING (v1.3, unresolved as of this review): §7's new, gentler EASY
  // tier (enemySpeed x0.70) closes so slowly against the 55 u/s cruise
  // player that its own time-to-first-shot blows past this 25s bound by a
  // wide margin -- measured ~79.5s on EASY vs ~15.2s on MEDIUM in an
  // out-of-suite probe. This test does not exercise EASY (it never calls
  // g.diff.set), so it is not itself asserting on that number, but the
  // finding is real and is reported separately; the 25s bound here is left
  // unchanged pending a design ruling, per instruction not to paper over it
  // by widening the window.
  const combat = await bp.evaluate(() => {
    const g = window.__game;
    let shots = 0, sawAttack = false, tAttack = null, tShot = null;
    const off1 = g.bus.on('enemy:fire', () => { shots++; if (tShot === null) tShot = t; });
    const off2 = g.bus.on('enemy:state', e => {
      if (e.state === 'ATTACK_RUN' && !sawAttack) { sawAttack = true; tAttack = t; }
    });
    let t = 0;
    for (let i = 0; i < 25 * 60; i++) { g.tick(1 / 60); t += 1 / 60; }
    off1(); off2();
    return { sawAttack, shots, tAttack: tAttack && +tAttack.toFixed(1), tShot: tShot && +tShot.toFixed(1) };
  });
  check(combat.sawAttack && combat.shots > 0, 'B3 reaches ATTACK_RUN and fires within 25s',
        `ATTACK_RUN at ${combat.tAttack}s, first shot ${combat.tShot}s, ${combat.shots} shots`);

  // --- B4 enemy laser damages the player ---
  // SPEC 4 added a 50-pt shield that absorbs before hull, so a single 8-dmg
  // bolt no longer touches hull with a full shield. B4's name promises hull
  // specifically, so the shield is depleted first here to keep that promise
  // literal; the shield-first mechanic itself is covered separately by
  // "M3-3 shield absorbs before hull".
  const hull = await bp.evaluate(() => {
    const g = window.__game;
    g.player.health.max = 100; g.player.health.cur = 100;
    g.player.shield = 0; g.player.sinceHit = 0;   // deplete shield so the bolt reaches hull (SPEC 4)
    const before = g.player.health.cur;
    window.__h.enemyShootPlayer();
    g.tick(1 / 60);
    const after = g.player.health.cur;
    window.__h.godMode();
    return { before, after };
  });
  check(hull.after < hull.before, 'B4 enemy laser reduces hull (shield depleted first, SPEC 4)',
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
  // SPEC v1.3 (§7): MEDIUM waveDelta -1 makes wave 2's base count of 4 (§6)
  // become 4 + (-1) = 3, not 4.
  // M3.2: fighters now trickle in over a 0-2s arrival jitter (CFG.spawn.jitter)
  // instead of materialising as a lump. `spawner.alive` is committed to the
  // FULL wave count the instant `wave:start` fires (so the wave cannot clear
  // early); `world.tagged('enemy').size` only ramps up to that count over the
  // jitter window. Assert the former right after the delayAfterClear timer
  // (3s) elapses, and the latter only after simulating a further >=2.5s past
  // that so every queued fighter has had time to materialise.
  const w2 = await bp.evaluate(() => {
    const g = window.__game;
    let started = null;
    const off = g.bus.on('wave:start', w => { started = w; });
    for (const e of window.__h.enemies()) { e.health.cur = 1; e.hit(1); }
    window.__h.sim(0.1);
    const cleared = window.__h.enemies().length;
    window.__h.sim(3.1);                           // past delayAfterClear (3s): wave:start fires
    const committedAlive = g.spawner.alive;        // full wave-2 count, committed immediately
    window.__h.sim(2.5);                           // past the 0-2s arrival jitter window
    off();
    return { cleared, wave: g.spawner.waveIndex + 1, committedAlive,
             count: window.__h.enemies().length, started };
  });
  check(w2.cleared === 0 && w2.wave === 2 && w2.committedAlive === 3 && w2.count === 3,
        'B6 wave 2 spawns after wave 1 clears (spawner.alive commits immediately; enemies materialise over the jitter window)',
        `cleared -> wave ${w2.wave}, spawner.alive=${w2.committedAlive} committed, ${w2.count} materialised (event ${JSON.stringify(w2.started)})`);

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
             bursts: g.fx.sparkBursts.length + g.fx.boomBursts.length, debris: g.fx.debris.length };
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
      bursts: g.fx.sparkBursts.length + g.fx.boomBursts.length,
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

  // --- C5 hit-test regression: #touch must not swallow pointer/touch events
  // below it (M3.2 fix). The old CSS had `#touch { position:fixed; inset:0;
  // z-index:2 }` with no `pointer-events` rule, so once shown it covered the
  // whole viewport and silently intercepted every pointer/touch event under
  // it -- including canvas look-drags and all HUD interaction. C2 above
  // dispatches a synthetic TouchEvent straight onto the canvas element, which
  // bypasses hit-testing entirely and could not have seen this class of bug;
  // these checks go through the browser's real hit-test / input pipeline
  // instead, at #touch on (from C1).
  const hitTest = await mp.evaluate(() => {
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const centreEl = document.elementFromPoint(cx, cy);
    const touchStyle = getComputedStyle(document.getElementById('touch'));
    const boostBtn = document.querySelector('#touch .boost');
    const r = boostBtn.getBoundingClientRect();
    const boostEl = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      centreTag: centreEl && centreEl.tagName,
      touchPointerEvents: touchStyle.pointerEvents,
      boostHitTestable: boostEl === boostBtn,
    };
  });
  check(hitTest.centreTag === 'CANVAS',
        'C5a screen-centre hit-test resolves to the canvas, not the #touch overlay',
        `document.elementFromPoint(centre).tagName = ${hitTest.centreTag}`);
  check(hitTest.touchPointerEvents === 'none',
        'C5b #touch has pointer-events:none so it cannot swallow events below its buttons',
        `getComputedStyle(#touch).pointerEvents = ${hitTest.touchPointerEvents}`);
  check(hitTest.boostHitTestable,
        'C5c #touch buttons remain individually hit-testable (pointer-events:auto)',
        `elementFromPoint(boost centre) === boost button: ${hitTest.boostHitTestable}`);

  // --- C5d a real touch input (Playwright's touchscreen, routed through the
  // browser's actual hit-testing, not a synthetic event aimed at an element)
  // must reach the canvas at screen centre. Under the old bug #touch would
  // have intercepted it and this listener would never fire.
  await mp.evaluate(() => {
    window.__sawCanvasTouch = false;
    document.querySelector('canvas').addEventListener('touchstart', () => { window.__sawCanvasTouch = true; }, { once: true });
  });
  const vpSize = mp.viewportSize();
  await mp.touchscreen.tap(vpSize.width / 2, vpSize.height / 2);
  await mp.waitForTimeout(150);
  const sawCanvasTouch = await mp.evaluate(() => window.__sawCanvasTouch);
  check(sawCanvasTouch === true,
        'C5d a real page.touchscreen.tap() at screen centre reaches the canvas, not swallowed by #touch',
        `canvas touchstart fired: ${sawCanvasTouch}`);

  await ctxC.close();

  /* ================= D. M3: difficulty, shield, radar, tracking ================= */
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await ctxD.newPage();
  const dErrs = [];
  dp.on('console', m => { if (m.type() === 'error') dErrs.push(m.text()); });
  dp.on('pageerror', e => dErrs.push('pageerror: ' + e.message.split('\n')[0]));

  // --- M3-1 difficulty persists across reload (SPEC 7: localStorage `ss.difficulty`) ---
  await dp.goto(URL, { waitUntil: 'load' });
  await dp.waitForTimeout(1500);
  const diffBefore = await dp.evaluate(() => {
    const g = window.__game;
    g.diff.set('HARD');
    return { name: g.diff.name, key: localStorage.getItem('ss.difficulty') };
  });
  await dp.reload({ waitUntil: 'load' });
  await dp.waitForTimeout(1500);
  const diffAfter = await dp.evaluate(() => ({
    name: window.__game.diff.name, key: localStorage.getItem('ss.difficulty'),
  }));
  check(diffBefore.name === 'HARD' && diffBefore.key === 'HARD' &&
        diffAfter.name === 'HARD' && diffAfter.key === 'HARD',
        'M3-1 difficulty persists across reload (ss.difficulty)',
        `set -> ${JSON.stringify(diffBefore)}, after reload -> ${JSON.stringify(diffAfter)}`);

  await dp.evaluate(HARNESS);

  // --- M3-2 EASY bolt nudges toward the bracketed target, ACE does not (SPEC 7) ---
  // In-flight homing (Laser#assist) is capped by BOTH a turn rate
  // (CFG.difficulty.assistTurn) and a total cone budget (assistDeg). Fire a
  // bolt straight down the nose at a synthetic stationary target placed well
  // off that line (~21deg), so the assist would need far more than any cone
  // allows, then measure the angle between the bolt's initial and final
  // velocity direction after several ticks.
  //
  // SPEC v1.3 (§7) reshaped the table to four tiers and shifted it one notch
  // easier: EASY is now 9deg cone (was the old 6deg EASY), and the zero-cone
  // "does not nudge" tier is the new ACE (0deg), not HARD (which is now 3deg
  // and DOES nudge). Retargeted from HARD to ACE for that reason.
  const assist = await dp.evaluate(() => {
    const g = window.__game;
    window.__h.godMode();
    g.spawner.pending = false; g.spawner.clear();   // no auto wave while we fire test bolts
    const fireAndMeasure = (diffName) => {
      g.diff.set(diffName);
      const fwd = g.player._fwd.clone().normalize();
      const V = fwd.constructor;
      const right = new V(1, 0, 0).applyQuaternion(g.player.object.quaternion);
      const pos = g.player.position.clone();
      const target = { alive: true,
        position: pos.clone().addScaledVector(fwd, 400).addScaledVector(right, 150),
        vel: new V(0, 0, 0) };
      g.tracker.target = target;
      g.bus.emit('player:fire', { muzzles: [pos.clone()], dir: fwd.clone(), vel: 0 });
      const l = [...g.world.tagged('projectile')].at(-1);
      const v0 = l.vel.clone().normalize();
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      const v1 = l.vel.clone().normalize();
      const dot = Math.max(-1, Math.min(1, v0.dot(v1)));
      return +(Math.acos(dot) * 180 / Math.PI).toFixed(2);
    };
    return { easyDeg: fireAndMeasure('EASY'), aceDeg: fireAndMeasure('ACE') };
  });
  check(assist.easyDeg > 0.5 && assist.easyDeg <= 9.05,
        'M3-2a EASY bolt nudges toward the bracketed target (<=9deg cone)', `turned ${assist.easyDeg} deg`);
  check(assist.aceDeg === 0,
        'M3-2b ACE bolt does not nudge toward the target (0deg cone)', `turned ${assist.aceDeg} deg`);

  // --- M3-3 shield absorbs before hull (SPEC 4) ---
  const shieldFirst = await dp.evaluate(() => {
    const g = window.__game;
    g.spawner.pending = false; g.spawner.clear();
    g.player.health.max = 100; g.player.health.cur = 100;
    g.player.shield = g.player.shieldMax; g.player.sinceHit = 0;
    const before = { shield: g.player.shield, hull: g.player.health.cur };
    g.player.takeDamage(30, null);                  // < shield (50): hull must stay untouched
    const partial = { shield: g.player.shield, hull: g.player.health.cur };
    g.player.takeDamage(30, null);                  // 20 shield left absorbs 20, 10 spills to hull
    const spill = { shield: g.player.shield, hull: g.player.health.cur };
    return { before, partial, spill };
  });
  check(shieldFirst.before.shield === 50 && shieldFirst.partial.shield === 20 && shieldFirst.partial.hull === 100,
        'M3-3a shield absorbs damage while hull stays untouched', JSON.stringify(shieldFirst.partial));
  check(shieldFirst.spill.shield === 0 && shieldFirst.spill.hull === 90,
        'M3-3b damage exceeding remaining shield spills into hull', JSON.stringify(shieldFirst.spill));

  // --- M3-4 shield AND hull restore on wave:start (SPEC 4, CFG.ship.restoreHullOnWave) ---
  // Neutralise the spawner first: it can fire its own wave:start mid-test and
  // restore the player behind the measurement.
  const restore = await dp.evaluate(() => {
    const g = window.__game;
    g.spawner.pending = false; g.spawner.clear();
    g.player.health.max = 100; g.player.health.cur = 35;
    g.player.shield = 10; g.player.sinceHit = 0;
    const before = { shield: g.player.shield, hull: g.player.health.cur };
    g.bus.emit('wave:start', { index: 99, count: 1 });   // Game wires wave:start -> player.restore()
    const after = { shield: g.player.shield, hull: g.player.health.cur, dead: g.player.health.dead };
    return { before, after };
  });
  check(restore.before.shield === 10 && restore.before.hull === 35 &&
        restore.after.shield === 50 && restore.after.hull === 100 && !restore.after.dead,
        'M3-4 shield and hull restore on wave:start', JSON.stringify(restore));

  // --- M3-5 radar draws one triangle per IN-RANGE enemy (SPEC 8) ---
  // SPEC v1.6 (§6): wave-1 base count 3 -> 4, so MEDIUM's waveDelta -1 (§7)
  // gives 4 + (-1) = 3 fighters, not 2.
  // SPEC v1.6 (§6, §17 amendment v1.6 item 2): wave 1's second spawn bearing
  // carries `groupDelay: 8`, so a queued fighter can take up to
  // jitter(2s) + groupDelay(8s) = 10s after wave:start to materialise -- on
  // top of Spawner.reset()'s own 1.5s wave-1 timer before wave:start fires
  // at all, for an 11.5s worst case. A prior fixed sim(11) omitted that
  // 1.5s and could miss the last fighter (same race as B1, above). Sim past
  // the spawn timer first and read `spawner.alive` for the committed wave
  // total, then poll (simUntil) until every committed fighter has
  // materialised, instead of a hardcoded wait.
  //
  // Per SPEC §8 the radar only plots contacts inside its current range
  // (default 1000u; only the Planatron gets the out-of-range edge marker),
  // so comparing radarCount against ALL live enemies is wrong in principle:
  // wave 1's second bearing now arrives late and can legitimately be far out
  // (e.g. mid-BREAK_OFF), so a live fighter can sit beyond radar.range while
  // the radar is behaving correctly. Measured across three runs at ~13s:
  // distances [135,181,833] -> 3/3 triangles; [255,339,752] -> 3/3;
  // [450,451,1134] -> 2/3 triangles (the 1134u fighter correctly omitted).
  // Expect against the same in-range test the radar itself applies, not raw
  // 3D distance: the radar's #project compares hypot(x,z) in the player's
  // local (right, forward) plane to radar.range, not full 3D distanceTo, so
  // a fighter offset mostly along the player's local "up" axis could in
  // principle sit within radar.range by 3D distance yet outside it -- or
  // vice versa -- and a plain distanceTo comparison would then disagree
  // with the real radar. Reproducing the identical projection keeps this a
  // real test of the radar (an actually-dropped in-range contact still
  // fails it) without importing that flakiness.
  //
  // A later change (reported by game-feel-critic) pins the SELECTED target
  // to the rim when it is out of dish range -- same treatment the Planatron
  // already got -- so raw inRange undercounts by exactly one whenever the
  // current tracker.target is alive, a REAL member of world.tagged('enemy')
  // (a stale non-entity reference, like a synthetic test target, is never
  // visited by the radar's own loop and cannot be pinned), and itself out of
  // range. Derived live below, not assumed: this is exactly the projection
  // Radar#draw performs on `this.tracker.target`.
  const radarCount = await dp.evaluate(() => {
    const g = window.__game;
    window.__h.godMode();
    g.diff.set('MEDIUM');        // M3-2 left difficulty on ACE; waveDelta would skew the spawn count
    g.relaunch();                // full reset; re-arms the wave-1 spawn timer (1.5s)
    window.__h.sim(1.6);         // past the 1.5s wave-1 spawn timer: wave:start fires
    const committedAlive = g.spawner.alive;
    const wait = window.__h.simUntil(() => window.__h.enemies().length >= committedAlive);
    const liveEnemies = window.__h.enemies().length;
    g.radar.tick(1);             // own 20Hz accumulator; dt=1 forces an immediate draw

    // Same in-range test as Radar#project: project onto the player's local
    // (right, forward) plane and compare the horizontal distance to
    // radar.range -- not raw 3D distanceTo (see comment above).
    const V = g.player.position.constructor;
    const q = g.player.object.quaternion;
    const fwd = new V(0, 0, -1).applyQuaternion(q);
    const right = new V(1, 0, 0).applyQuaternion(q);
    const rel = new V();
    const inR = e => {
      rel.subVectors(e.position, g.player.position);
      return Math.hypot(rel.dot(right), rel.dot(fwd)) <= g.radar.range;
    };
    let inRange = 0;
    for (const e of window.__h.enemies()) if (inR(e)) inRange++;

    const sel = g.tracker.target;
    const selIsRealEnemy = !!sel && window.__h.enemies().includes(sel);
    const pinnedExtra = (selIsRealEnemy && sel.alive && !inR(sel)) ? 1 : 0;

    return {
      committedAlive, liveEnemies, inRange, pinnedExtra,
      radarCount: g.radar.counts.enemies, waitSeconds: wait.seconds,
    };
  });
  check(radarCount.committedAlive === 3 && radarCount.liveEnemies === 3 &&
        radarCount.radarCount === radarCount.inRange + radarCount.pinnedExtra,
        'M3-5 radar draws one triangle per enemy within radar.range, plus one if the SELECTED ' +
        'target is out of range and pinned to the rim (post-jitter)',
        JSON.stringify(radarCount));

  // --- M3-5b radar actually exercises the pin, not just tolerates it: the
  // SELECTED target moved well beyond radar.range is drawn anyway (pinned to
  // the rim, counted), while a second, non-selected fighter pushed equally
  // far out is correctly dropped -- the dish "shows what is in range" for
  // everyone except the one target SPEC 3 requires every indicator to name.
  const pinned = await dp.evaluate(() => {
    const g = window.__game;
    const enemies = window.__h.enemies();
    if (enemies.length < 2) return { error: 'need >=2 live enemies', count: enemies.length };
    const V = g.player.position.constructor;
    const q = g.player.object.quaternion;
    const fwd = new V(0, 0, -1).applyQuaternion(q);
    const right = new V(1, 0, 0).applyQuaternion(q);
    const inR = e => {
      const rel = e.position.clone().sub(g.player.position);
      return Math.hypot(rel.dot(right), rel.dot(fwd)) <= g.radar.range;
    };

    const target = enemies[0], other = enemies[1];
    const far = g.radar.range * 1.5 + 200;             // well past the rim either way
    target.position.copy(g.player.position).addScaledVector(fwd, far);
    other.position.copy(g.player.position).addScaledVector(fwd, far).addScaledVector(right, 40);
    g.world.rebuildHash();
    g.tracker.target = target;

    let inRange = 0;
    for (const e of window.__h.enemies()) if (inR(e)) inRange++;
    const targetInRange = inR(target), otherInRange = inR(other);

    g.radar.acc = 0;                                   // ignore the 20Hz accumulator
    g.radar.tick(1);                                    // dt=1 forces an immediate draw

    return { count: enemies.length, inRange, targetInRange, otherInRange, radarCount: g.radar.counts.enemies };
  });
  check(!pinned.error, 'M3-5b setup: at least two live enemies to work with', JSON.stringify(pinned));
  check(!pinned.targetInRange && !pinned.otherInRange,
        'M3-5b setup: both the selected target and the other fighter are genuinely out of radar.range',
        JSON.stringify(pinned));
  check(pinned.radarCount === pinned.inRange + 1,
        'M3-5b radar pins the SELECTED out-of-range target to the rim (counted) but still drops ' +
        'the non-selected out-of-range fighter (not counted)',
        JSON.stringify(pinned));

  // --- M3-6 Tab cycles target (SPEC 3/8: tracker.cycle) ---
  // SPEC v1.6 (§6): wave 1 on MEDIUM is now 3 fighters (see M3-5), not 2, so
  // the cycle has three distinct stops before it wraps -- adapted from
  // "2 distinct then wrap on the 3rd" to "3 distinct then wrap on the 4th".
  // M3.2/v1.6: relies on M3-5 above having already simulated past the full
  // groupDelay+jitter arrival window, so all three wave-1 fighters exist to
  // cycle through (previously only the first spawn bearing had arrived).
  const cycleTest = await dp.evaluate(() => {
    const g = window.__game;
    g.tracker.target = null;
    const enemies = window.__h.enemies();
    const seen = [];
    for (let i = 0; i < 5; i++) {
      dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
      seen.push(g.tracker.target && enemies.indexOf(g.tracker.target));
    }
    return { n: enemies.length, seen,
             distinctFirstThree: new Set(seen.slice(0, 3)).size === 3, wraps: seen[3] === seen[0] };
  });
  check(cycleTest.n === 3 && cycleTest.distinctFirstThree && cycleTest.wraps,
        'M3-6 Tab key cycles the tracked target through live fighters', JSON.stringify(cycleTest));

  check(dErrs.length === 0, 'M3-7 no console errors during difficulty/shield/radar/tracking checks',
        dErrs.slice(0, 3).join(' | ') || 'clean');

  await ctxD.close();

  /* ================= G. M3.2: campaign end state (win card) =================
   * Not yet in SPEC.md v1.4 (§10's win card is scoped to the M4 boss fight);
   * this is the interim M3.2 "clear all 5 §6 waves" end state per the M3.2
   * brief, pending a SPEC amendment. Cited as "M3.2 brief" below rather than
   * a SPEC section number for that reason.
   */
  const ctxG = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gp = await ctxG.newPage();
  const gErrs = [];
  gp.on('console', m => { if (m.type() === 'error') gErrs.push(m.text()); });
  gp.on('pageerror', e => gErrs.push('pageerror: ' + e.message.split('\n')[0]));
  await gp.goto(URL, { waitUntil: 'load' });
  await gp.waitForTimeout(1500);
  await gp.evaluate(HARNESS);

  // --- G1 the win card appears after the final wave is cleared (M3.2 brief) ---
  // Drives the deterministic harness in 1s steps, killing every currently
  // materialised enemy each step, until `campaign:clear` fires or a generous
  // ceiling is hit. This doesn't hardcode per-wave counts/timings (which
  // depend on CFG.waves, CFG.difficulty.MEDIUM.waveDelta and the M3.2 arrival
  // jitter) -- it just keeps killing whatever is alive until the 5th and
  // final §6 wave clears.
  const winFlow = await gp.evaluate(() => {
    const g = window.__game;
    window.__h.godMode();
    g.diff.set('MEDIUM');
    g.relaunch();
    let cleared = false;
    const off = g.bus.on('campaign:clear', () => { cleared = true; });
    let seconds = 0;
    const CAP = 90;                              // generous vs. an observed ~25-30s clear
    while (!cleared && seconds < CAP) {
      window.__h.sim(1);
      seconds++;
      for (const e of window.__h.enemies()) { e.health.cur = 1; e.hit(1); }
    }
    off();
    return {
      cleared, seconds,
      winOn: document.getElementById('win').classList.contains('on'),
      won: g.won,
      winstats: document.getElementById('winstats').textContent,
    };
  });
  check(winFlow.cleared, 'G1a campaign:clear fires once the final (5th) wave is cleared',
        `cleared=${winFlow.cleared} after ${winFlow.seconds}s (CAP 90s)`);
  check(winFlow.won === true && winFlow.winOn === true,
        'G1b win card (#win.on) appears and Game.won is set',
        `won=${winFlow.won}, #win.on=${winFlow.winOn}`);
  const winstatsOk = /Score \d+/.test(winFlow.winstats) && /[\d.]+s/.test(winFlow.winstats) &&
        /\d+ shots/.test(winFlow.winstats) && /\d+% hits/.test(winFlow.winstats) &&
        winFlow.winstats.includes('MEDIUM');
  check(winstatsOk,
        'G1c #winstats reports score/time/shots/hit%/difficulty', JSON.stringify(winFlow.winstats));

  // --- G2 R resets to wave 1, clears the card, and clears Game.won (M3.2 brief) ---
  const rAfterWin = await gp.evaluate(() => {
    const g = window.__game;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
    return {
      won: g.won,
      winOn: document.getElementById('win').classList.contains('on'),
      waveIndex: g.spawner.waveIndex,
    };
  });
  check(!rAfterWin.won && !rAfterWin.winOn && rAfterWin.waveIndex === -1,
        'G2 R after a win resets to wave 1 (spawner.waveIndex=-1), clears the card and Game.won',
        JSON.stringify(rAfterWin));

  // --- G3 #win-next steps diff.name one notch along CFG.difficulty.order and
  // does not advance past ACE (M3.2 brief). Exercised directly against the
  // button's click handler (diff.set + relaunch), not a full second campaign
  // clear, since the stepping logic itself doesn't depend on win state.
  const nextDiff = await gp.evaluate(() => {
    const g = window.__game;
    const steps = [];
    for (const start of ['EASY', 'MEDIUM', 'HARD', 'ACE']) {
      g.diff.set(start);
      document.getElementById('win-next').click();
      steps.push({ from: start, to: g.diff.name });
    }
    return steps;
  });
  check(nextDiff[0].to === 'MEDIUM' && nextDiff[1].to === 'HARD' && nextDiff[2].to === 'ACE',
        'G3a #win-next advances diff.name one step along CFG.difficulty.order',
        JSON.stringify(nextDiff));
  check(nextDiff[3].to === 'ACE',
        'G3b #win-next does not advance past ACE', JSON.stringify(nextDiff[3]));

  check(gErrs.length === 0, 'G4 no console errors during campaign end-state checks',
        gErrs.slice(0, 3).join(' | ') || 'clean');

  await ctxG.close();

  /* ================= H. M3.3: resumeFlight re-acquires pointer lock (SPEC 10, real-input regression) =====
   * Bug from a real play session: the win/dead overlays call document.exitPointerLock() so
   * their buttons are clickable, but the relaunch path never re-requested it. Input.locked
   * stayed false, so mousemove never accumulated -- steering was dead while the keyboard
   * still worked (which is what made it read as half-broken, not frozen). Fix: every route
   * back into flight -- #win-next, #win-again, #dead click, R, N -- now goes through a single
   * Game.resumeFlight(next), which relaunches and then re-requests pointer lock.
   *
   * These checks use REAL input end-to-end (real page.click / page.mouse.move /
   * page.keyboard, real document.pointerLockElement) rather than synthetic dispatch: synthetic
   * input is exactly what let this bug ship, since writing to g.input.mouse.dx or dispatching
   * a KeyboardEvent bypasses the pointer-lock-gated mousemove listener the bug lived in.
   */
  // Each route gets its OWN browser context (its own real launch, its own pointer-lock
  // request budget). Chromium rate-limits requestPointerLock with "Too many pointer lock
  // requests in a short window of time" if a tab chains several lock/unlock cycles within a
  // few real seconds -- which four routes back-to-back in one tab does, purely because the
  // deterministic campaign-clear loop below runs in near-zero wall-clock time. A real player
  // does not click "Next difficulty" four times in two seconds, and the fix itself accounts
  // for a failed re-capture (SPEC 10 / brief: "only shows the lock hint"); isolating routes
  // avoids asserting on that browser-level rate limiter rather than on the bug.
  const routeCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message.split('\n')[0]));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    return { ctx, page, errs };
  };

  // Real launch click -- genuinely engages pointer lock (unlike the deterministic harness's
  // programmatic paths elsewhere in this file). If this precondition is false, the route's
  // remaining checks are not exercising the bug at all.
  const realLaunch = async page => {
    await page.click('#overlay', { force: true });
    await page.waitForTimeout(500);
    return page.evaluate(() => document.pointerLockElement !== null);
  };

  // Drive g.tick() directly to campaign:clear at `diffName`, killing each wave via e.hit(1),
  // per the deterministic pattern used by G1 above. Leaves the render loop stopped -- the
  // caller (realFlyCheck) restores it before doing any real input.
  const driveToCampaignClear = (page, diffName) => page.evaluate(diffName => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    window.__h.godMode();
    g.diff.set(diffName);
    g.relaunch();
    let cleared = false;
    const off = g.bus.on('campaign:clear', () => { cleared = true; });
    let seconds = 0;
    const CAP = 90;                           // generous vs. an observed ~25-30s clear (see G1)
    while (!cleared && seconds < CAP) {
      window.__h.sim(1); seconds++;
      for (const e of window.__h.enemies()) { e.health.cur = 1; e.hit(1); }
    }
    off();
    return { cleared, seconds, won: g.won,
             winOn: document.getElementById('win').classList.contains('on') };
  }, diffName);

  // Drive to player death via a real health hit (still deterministic, via g.tick machinery,
  // not a real enemy bolt). Leaves the render loop stopped, same contract as above.
  const driveToDeath = page => page.evaluate(() => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    g.spawner.pending = false; g.spawner.clear();
    g.player.health.max = 100; g.player.health.cur = 1;
    g.player.health.damage(1);                // -> player:died -> Game#playerDied()
    return { dead: g.dead,
             deadOn: document.getElementById('dead').classList.contains('on') };
  });

  // Restores the render loop, performs a REAL user gesture via `trigger()` (a page.click or
  // page.keyboard press), then drives the ship with a REAL page.mouse.move and a REAL held W
  // key and reads back observable state -- all within roughly a 1s wall-clock budget, per the
  // user's report ("ship responds to mouse and W within 1 s").
  //
  // NOTE on the *d checks (H1d/H2d/H3d/H4d) -- rescoped, not just re-numbered:
  // the previous version started `t0`, triggered, then unconditionally slept
  // 120ms + 450ms = 570ms and made ~10 CDP round-trips (4 evaluates, 7 mouse
  // moves, a keypress) before stopping the clock. That measured the harness'
  // own fixed padding and CDP latency, not the ship's response -- and once M3.5
  // added per-frame cost (core update/magnet, weapon HUD readout) each of those
  // round-trips got slower under SwiftShader, pushing a pass at 826ms (170ms of
  // headroom) to 1113-1167ms with no change in how fast the SHIP actually
  // responds. Fixed here by polling for the real observable events (pointer
  // lock landing, then yaw+speed actually changing) instead of sleeping a fixed
  // duration and hoping: the clock now stops the instant a poll observes the
  // response, so elapsedMs measures "time to observed response," the same
  // thing H1b/H1c/H1c already assert boolean-style, just timed. This also
  // removes the 120ms "let pointerlockchange land" guess -- CFG.ship.accel (90
  // u/s^2 into an exponential damp) reaches +5 speed in ~40ms of real ticks
  // once W is actually held, so the true budget is dominated by CDP/browser
  // event latency, not sim speed, and a fixed sleep either wastes it or races
  // it depending on machine load. Mouse deltas are only accumulated by the
  // game while pointer-locked (Input#mousemove, gated on `this.locked`), so
  // waiting for lock before sending them is a real precondition, not padding.
  const realFlyCheck = async (page, trigger) => {
    await page.evaluate(() => window.__game.renderer.setAnimationLoop(() => window.__game.frame()));
    const before = await page.evaluate(() => ({
      yaw: window.__game.player.object.quaternion.y, speed: window.__game.player.speed,
    }));
    const t0 = Date.now();
    await trigger();
    const deadline = t0 + 950;    // ~50ms slack inside the SPEC 1s budget for the post-timing reads below
    let locked = false;
    while (Date.now() < deadline) {
      locked = await page.evaluate(() => document.pointerLockElement !== null);
      if (locked) break;
      await page.waitForTimeout(10);
    }
    // Real cursor movement and a real held key, sent as soon as lock lands
    // (not after a fixed hold) -- delivering them is itself part of the
    // response being timed, not harness overhead.
    await page.mouse.move(640, 400);                                     // cursor origin
    for (let i = 1; i <= 6; i++) await page.mouse.move(640 + i * 30, 400);  // real movementX deltas
    await page.keyboard.down('w');
    let after = before;
    while (Date.now() < deadline) {
      after = await page.evaluate(() => ({
        yaw: window.__game.player.object.quaternion.y, speed: window.__game.player.speed,
      }));
      if (Math.abs(after.yaw - before.yaw) > 1e-4 && after.speed > before.speed + 5) break;
      await page.waitForTimeout(10);
    }
    const elapsedMs = Date.now() - t0;      // stopped the instant the response was observed (or the budget ran out)
    await page.keyboard.up('w');
    const diffHud = await page.evaluate(() => document.getElementById('diffhud').textContent);
    const deadOn = await page.evaluate(() => document.getElementById('dead').classList.contains('on'));
    return {
      locked, elapsedMs, diffHud, deadOn, before, after,
      yawMoved: Math.abs(after.yaw - before.yaw) > 1e-4,
      accelerated: after.speed > before.speed + 5,
    };
  };

  // --- H1: campaign clear -> real click #win-next ---
  {
    const { ctx, page, errs } = await routeCtx();
    const locked = await realLaunch(page);
    check(locked, 'H1-0 precondition: real launch click genuinely engages pointer lock',
          `document.pointerLockElement !== null: ${locked}` +
          (locked ? '' : '  -- NOT exercising the bug; H1 below would be meaningless'));
    await page.evaluate(HARNESS);
    const setup = await driveToCampaignClear(page, 'EASY');
    check(setup.cleared && setup.won && setup.winOn,
          'H1 setup: campaign cleared on EASY (precondition for H1)', JSON.stringify(setup));
    const h1 = await realFlyCheck(page, () => page.click('#win-next'));
    check(h1.locked, 'H1a real click #win-next re-acquires pointer lock',
          `document.pointerLockElement !== null: ${h1.locked}`);
    check(h1.yawMoved, 'H1b real click #win-next: ship yaws to a real mouse move within 1s',
          `quaternion.y ${h1.before.yaw.toFixed(5)} -> ${h1.after.yaw.toFixed(5)}`);
    check(h1.accelerated, 'H1c real click #win-next: ship accelerates to a real held W within 1s',
          `speed ${h1.before.speed.toFixed(1)} -> ${h1.after.speed.toFixed(1)}`);
    check(h1.elapsedMs < 1000, 'H1d real click #win-next: response measured inside a 1s budget',
          `elapsed ${h1.elapsedMs}ms`);
    check(h1.diffHud === 'Medium', 'H1e real click #win-next: #diffhud shows the NEXT tier (EASY -> MEDIUM)',
          `#diffhud = "${h1.diffHud}"`);
    check(errs.length === 0, 'H1f no console errors on the #win-next route', errs.slice(0, 3).join(' | ') || 'clean');
    await ctx.close();
  }

  // --- H2: campaign clear -> real click #win-again (difficulty must stay put) ---
  {
    const { ctx, page, errs } = await routeCtx();
    const locked = await realLaunch(page);
    check(locked, 'H2-0 precondition: real launch click genuinely engages pointer lock',
          `document.pointerLockElement !== null: ${locked}` +
          (locked ? '' : '  -- NOT exercising the bug; H2 below would be meaningless'));
    await page.evaluate(HARNESS);
    const setup = await driveToCampaignClear(page, 'MEDIUM');
    check(setup.cleared && setup.won && setup.winOn,
          'H2 setup: campaign cleared on MEDIUM (precondition for H2)', JSON.stringify(setup));
    const h2 = await realFlyCheck(page, () => page.click('#win-again'));
    check(h2.locked, 'H2a real click #win-again re-acquires pointer lock',
          `document.pointerLockElement !== null: ${h2.locked}`);
    check(h2.yawMoved, 'H2b real click #win-again: ship yaws to a real mouse move within 1s',
          `quaternion.y ${h2.before.yaw.toFixed(5)} -> ${h2.after.yaw.toFixed(5)}`);
    check(h2.accelerated, 'H2c real click #win-again: ship accelerates to a real held W within 1s',
          `speed ${h2.before.speed.toFixed(1)} -> ${h2.after.speed.toFixed(1)}`);
    check(h2.elapsedMs < 1000, 'H2d real click #win-again: response measured inside a 1s budget',
          `elapsed ${h2.elapsedMs}ms`);
    check(h2.diffHud === 'Medium', 'H2e real click #win-again: difficulty UNCHANGED (stays MEDIUM)',
          `#diffhud = "${h2.diffHud}"`);
    check(errs.length === 0, 'H2f no console errors on the #win-again route', errs.slice(0, 3).join(' | ') || 'clean');
    await ctx.close();
  }

  // --- H3: campaign clear -> real N keypress (difficulty steps again) ---
  {
    const { ctx, page, errs } = await routeCtx();
    const locked = await realLaunch(page);
    check(locked, 'H3-0 precondition: real launch click genuinely engages pointer lock',
          `document.pointerLockElement !== null: ${locked}` +
          (locked ? '' : '  -- NOT exercising the bug; H3 below would be meaningless'));
    await page.evaluate(HARNESS);
    const setup = await driveToCampaignClear(page, 'MEDIUM');
    check(setup.cleared && setup.won && setup.winOn,
          'H3 setup: campaign cleared on MEDIUM (precondition for H3)', JSON.stringify(setup));
    const h3 = await realFlyCheck(page, () => page.keyboard.press('n'));
    check(h3.locked, 'H3a real N keypress re-acquires pointer lock',
          `document.pointerLockElement !== null: ${h3.locked}`);
    check(h3.yawMoved, 'H3b real N keypress: ship yaws to a real mouse move within 1s',
          `quaternion.y ${h3.before.yaw.toFixed(5)} -> ${h3.after.yaw.toFixed(5)}`);
    check(h3.accelerated, 'H3c real N keypress: ship accelerates to a real held W within 1s',
          `speed ${h3.before.speed.toFixed(1)} -> ${h3.after.speed.toFixed(1)}`);
    check(h3.elapsedMs < 1000, 'H3d real N keypress: response measured inside a 1s budget',
          `elapsed ${h3.elapsedMs}ms`);
    check(h3.diffHud === 'Hard', 'H3e real N keypress: #diffhud shows the NEXT tier (MEDIUM -> HARD)',
          `#diffhud = "${h3.diffHud}"`);
    check(errs.length === 0, 'H3f no console errors on the N-key route', errs.slice(0, 3).join(' | ') || 'clean');
    await ctx.close();
  }

  // --- H4: player death -> real R keypress (difficulty must stay put, #dead must clear) ---
  {
    const { ctx, page, errs } = await routeCtx();
    const locked = await realLaunch(page);
    check(locked, 'H4-0 precondition: real launch click genuinely engages pointer lock',
          `document.pointerLockElement !== null: ${locked}` +
          (locked ? '' : '  -- NOT exercising the bug; H4 below would be meaningless'));
    await page.evaluate(HARNESS);
    // Set HARD before death so the "difficulty unchanged" assertion isn't just reading the default.
    await page.evaluate(() => window.__game.diff.set('HARD'));
    const setup = await driveToDeath(page);
    check(setup.dead && setup.deadOn, 'H4 setup: player death shows the #dead overlay (precondition for H4)',
          JSON.stringify(setup));
    const h4 = await realFlyCheck(page, () => page.keyboard.press('r'));
    check(h4.locked, 'H4a real R keypress re-acquires pointer lock',
          `document.pointerLockElement !== null: ${h4.locked}`);
    check(h4.yawMoved, 'H4b real R keypress: ship yaws to a real mouse move within 1s',
          `quaternion.y ${h4.before.yaw.toFixed(5)} -> ${h4.after.yaw.toFixed(5)}`);
    check(h4.accelerated, 'H4c real R keypress: ship accelerates to a real held W within 1s',
          `speed ${h4.before.speed.toFixed(1)} -> ${h4.after.speed.toFixed(1)}`);
    check(h4.elapsedMs < 1000, 'H4d real R keypress: response measured inside a 1s budget',
          `elapsed ${h4.elapsedMs}ms`);
    check(!h4.deadOn, 'H4e real R keypress: #dead overlay is gone', `#dead.on: ${h4.deadOn}`);
    check(h4.diffHud === 'Hard', 'H4f real R keypress: difficulty UNCHANGED (stays HARD)',
          `#diffhud = "${h4.diffHud}"`);
    check(errs.length === 0, 'H4g no console errors on the R-key (death) route', errs.slice(0, 3).join(' | ') || 'clean');
    await ctx.close();
  }

  /* ================= I. M3.5: pause, cores, weapon upgrades (SPEC 18) =================
   * I1 uses REAL input end-to-end (the same rationale as the H-series above): pause is
   * driven off a real keydown ('p') and pointerlockchange, and Resume is gated to the
   * button/P/Esc/background-click (SPEC 18.1) rather than any-input, so synthetic
   * dispatch would not exercise the shipped path. I2-I9 use the deterministic g.tick()
   * harness, per the pattern used throughout sections B/D/G, since cores/weapon math
   * does not depend on real browser input timing.
   */

  // --- I1 P pauses the sim; Resume restores lock and input within 1s (SPEC 18.1) ---
  {
    const { ctx, page, errs } = await routeCtx();
    const locked = await realLaunch(page);
    check(locked, 'I1-0 precondition: real launch click genuinely engages pointer lock',
          `document.pointerLockElement !== null: ${locked}` +
          (locked ? '' : '  -- NOT exercising the bug; I1 below would be meaningless'));

    await page.keyboard.press('p');
    await page.waitForTimeout(150);
    const paused = await page.evaluate(() => ({
      pausedFlag: window.__game.paused,
      pausedOn: document.getElementById('paused').classList.contains('on'),
      locked: document.pointerLockElement !== null,
    }));
    check(paused.pausedFlag && paused.pausedOn,
          'I1a real P keypress pauses the sim and shows the PAUSED overlay (SPEC 18.1)', JSON.stringify(paused));
    // SPEC 18.1: the pause overlay releases pointer lock when it appears -- it carries
    // buttons, and under lock every click goes to the canvas, making the menu unreachable
    // (the same class of fix already applied to the win/dead overlays).
    check(!paused.locked,
          'I1b PAUSED releases pointer lock so its menu buttons are clickable (SPEC 18.1)',
          `pointerLockElement !== null: ${paused.locked}`);

    const t1 = await page.evaluate(() => document.getElementById('tgt').textContent);
    await page.waitForTimeout(400);
    const t2 = await page.evaluate(() => document.getElementById('tgt').textContent);
    check(t1 === t2, 'I1c manual PAUSED halts the sim', `tgt ${t1} -> ${t2}`);

    // Real click on #pm-resume -- SPEC 18.1 item 2: resume is the Resume button, P, Esc,
    // or a click on the overlay BACKGROUND, not any input, so this must be the actual button.
    const resumeResult = await realFlyCheck(page, () => page.click('#pm-resume'));
    check(resumeResult.locked, 'I1d real click #pm-resume re-acquires pointer lock (resumeFlight path, SPEC 18.1)',
          `document.pointerLockElement !== null: ${resumeResult.locked}`);
    check(resumeResult.yawMoved, 'I1e Resume: ship yaws to a real mouse move within 1s',
          `quaternion.y ${resumeResult.before.yaw.toFixed(5)} -> ${resumeResult.after.yaw.toFixed(5)}`);
    check(resumeResult.accelerated, 'I1f Resume: ship accelerates to a real held W within 1s',
          `speed ${resumeResult.before.speed.toFixed(1)} -> ${resumeResult.after.speed.toFixed(1)}`);
    check(resumeResult.elapsedMs < 1000, 'I1g Resume: response measured inside a 1s budget',
          `elapsed ${resumeResult.elapsedMs}ms`);
    check(errs.length === 0, 'I1h no console errors on the pause/resume route', errs.slice(0, 3).join(' | ') || 'clean');
    await ctx.close();
  }

  const ctxI = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ip = await ctxI.newPage();
  const iErrs = [];
  ip.on('console', m => { if (m.type() === 'error') iErrs.push(m.text()); });
  ip.on('pageerror', e => iErrs.push('pageerror: ' + e.message.split('\n')[0]));
  await ip.goto(URL, { waitUntil: 'load' });
  await ip.waitForTimeout(1500);
  await ip.evaluate(HARNESS);

  // --- I2 a core spawns on enemy death (near the death point) and despawns at its
  // measured life (CFG.cores.life, SPEC 18.2). The life value is read off the freshly
  // spawned core itself rather than hardcoded, same reasoning as simUntil elsewhere in
  // this file: a future CFG.cores.life retune cannot silently desync this from the game.
  const coreDeath = await ip.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.diff.set('MEDIUM');
    window.__h.sim(1.6);                                       // past the 1.5s wave-1 spawn timer
    window.__h.simUntil(() => window.__h.enemies().length >= g.spawner.alive);  // let queued fighters materialise
    const e = window.__h.enemies()[0];
    const deathPos = e.position.clone();
    const beforeCount = g.world.tagged('pickup').size;
    e.health.cur = 1; e.hit(1);
    window.__h.sim(0.02);
    const core = [...g.world.tagged('pickup')].find(c => c.alive);
    const afterCount = g.world.tagged('pickup').size;
    const dist = core ? core.position.distanceTo(deathPos) : null;
    const life = core ? core.life : null;
    window.__h.sim(Math.max(0, life - 0.5));
    const aliveBeforeExpiry = core.alive;
    window.__h.sim(1.0);
    const goneAfterExpiry = !core.alive;
    return { beforeCount, afterCount, dist, life, aliveBeforeExpiry, goneAfterExpiry };
  });
  check(coreDeath.afterCount > coreDeath.beforeCount && coreDeath.dist !== null && coreDeath.dist < 5,
        'I2a enemy death spawns a Core pickup at the death point (SPEC 18.2)',
        `pickups ${coreDeath.beforeCount} -> ${coreDeath.afterCount}, distance from death point ${coreDeath.dist}`);
  check(coreDeath.aliveBeforeExpiry && coreDeath.goneAfterExpiry,
        'I2b core despawns at its measured life (CFG.cores.life, SPEC 18.2)',
        `life=${coreDeath.life}s, alive just before expiry: ${coreDeath.aliveBeforeExpiry}, gone after: ${coreDeath.goneAfterExpiry}`);

  // --- I3 magnet: a core ~40u out (inside the 45u magnetRange) homes in and is
  // collected on contact (SPEC 18.2). ---
  const magnet = await ip.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    const V = g.player.position.constructor;
    const fwd = g.player._fwd.clone().normalize();
    const pos = g.player.position.clone().addScaledVector(fwd, 40);
    const core = g.cores.drop(pos, new V(0, 0, 0));
    const startDist = core.position.distanceTo(g.player.position);
    let collectedType = null;
    const off = g.bus.on('core:collected', t => { collectedType = t; });
    const wait = window.__h.simUntil(() => !core.alive, 6, 0.1);
    off();
    return { startDist, collectedType, alive: core.alive, seconds: wait.seconds };
  });
  check(magnet.startDist <= 45 && magnet.startDist > 30,
        'I3 setup: core placed ~40u out, inside the 45u magnetRange', `startDist=${magnet.startDist}`);
  check(!magnet.alive && magnet.collectedType !== null,
        'I3 magnet pulls a core within 45u to the ship and it is collected on contact (SPEC 18.2)',
        `collected after ${magnet.seconds}s, type=${magnet.collectedType}, alive=${magnet.alive}`);

  // --- I4 shield core: +20 shield; overflow above max spills +5 to hull (SPEC 18.2) ---
  const shieldCore = await ip.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    const p = g.player;
    const V = p.position.constructor;
    // case A: shield has room for the full +20, hull must stay untouched
    p.shield = 10; p.health.max = 100; p.health.cur = 80;
    const c1 = g.cores.pool.get();
    c1.launch(p.position.clone(), new V(0, 0, 0), 'shield'); c1.ctxPlayer = p;
    g.world.add(c1);
    window.__h.sim(0.05);
    const a = { shield: p.shield, hull: p.health.cur };
    // case B: shield already at max -- the overflow must spill +5 to hull
    p.shield = p.shieldMax; p.health.cur = 80;
    const c2 = g.cores.pool.get();
    c2.launch(p.position.clone(), new V(0, 0, 0), 'shield'); c2.ctxPlayer = p;
    g.world.add(c2);
    window.__h.sim(0.05);
    const b = { shield: p.shield, hull: p.health.cur };
    return { a, b, shieldMax: p.shieldMax };
  });
  check(shieldCore.a.shield === 30 && shieldCore.a.hull === 80,
        'I4a Shield core raises shield by +20 with hull untouched when there is room (SPEC 18.2)',
        JSON.stringify(shieldCore.a));
  check(shieldCore.b.shield === shieldCore.shieldMax && shieldCore.b.hull === 85,
        'I4b Shield core overflow above max spills +5 to hull (SPEC 18.2)', JSON.stringify(shieldCore.b));

  // --- I5 weapon XP -> level thresholds, driven by whatever CFG.weapon.xpThresholds
  // currently is, capped at whatever CFG.weapon.maxLevel currently is (SPEC 18.3, v1.11) ---
  // I5a originally asserted xpForLevel === 4, a hardcoded copy of a SPEC constant the
  // balance audit could (and did, v1.10: 4 -> 3) legitimately retune. The v1.10 fix read
  // g.weapon.xpForLevel ONCE per test run and treated it as a constant span to re-grant --
  // which broke again in v1.11, when the flat per-level cost was replaced by a rising
  // curve (CFG.weapon.xpThresholds) and xpForLevel started returning a DIFFERENT span at
  // every level (and 0 at max level, not "the same number forever"). Fixed here by
  // re-reading g.weapon.xpForLevel fresh immediately before every single grant, treating
  // xpForLevel === 0 as the cap signal (not "grant nothing forever"), and never comparing
  // any result against a literal 2/3/4/5 -- only against other measured values. `Weapon`
  // has no `g.weapon.maxLevel` getter and `CFG` itself is module-scoped (unreachable from
  // page.evaluate), so maxLevel is discovered the same way, by behaviour.
  const xpLevels = await ip.evaluate(() => {
    const g = window.__game;
    g.diff.set('MEDIUM');           // avoid EASY's weaponXpMul skewing XP amounts
    g.weapon.reset();
    const levelEvents = [];
    const off = g.bus.on('weapon:level', lv => levelEvents.push(lv));  // attached before ANY XP grant below

    // I5a/I5a2: whatever span the CURRENT level (level 1, fresh off reset()) reports,
    // a shortfall of 1 XP against it must NOT advance the level, and the remaining 1 XP
    // must advance exactly one level. Read once here deliberately -- this is testing "one
    // specific level's span holds up", not the shape of the curve (that's I5b below).
    const span1 = g.weapon.xpForLevel;
    const levelBeforeSpan1 = g.weapon.level;
    let shortOfLevel = levelBeforeSpan1;
    if (span1 > 1) {
      g.weapon.addXp(span1 - 1);
      shortOfLevel = g.weapon.level;
    }
    g.weapon.addXp(span1 > 1 ? 1 : span1);   // completes exactly span1 XP granted in total
    const afterExact = g.weapon.level;

    // I5b/I5c/I5aCap: keep granting whatever xpForLevel CURRENTLY reports, re-read fresh
    // on every iteration (the whole point of this rewrite -- the span changes level to
    // level under the v1.11 curve). xpForLevel === 0 is the game's own cap signal; treat
    // it as such rather than looping on a stale cached span. `stuck` catches the case a
    // nonzero span is granted in full but the level fails to advance anyway -- a real bug,
    // not a cap, so it must not be silently absorbed into `capped`. Hard-bounded so a
    // curve that never reaches 0 (or a stuck level) cannot hang the loop.
    const seen = [afterExact];
    let capped = false, stuck = false, grants = 0;
    const CAP_GRANTS = 40;
    while (grants < CAP_GRANTS) {
      const span = g.weapon.xpForLevel;      // fresh read, every iteration -- never cached
      if (span === 0) { capped = true; break; }
      const before = g.weapon.level;
      g.weapon.addXp(span);
      grants++;
      const after = g.weapon.level;
      if (after === before) { stuck = true; break; }
      seen.push(after);
    }
    const maxLevel = g.weapon.level;
    const spanAtCap = g.weapon.xpForLevel;   // expected 0 once capped
    g.weapon.addXp(1);                       // one more grant past the discovered cap
    const finalLevel = g.weapon.level;
    off();
    return { span1, shortOfLevel, afterExact, seen, levelEvents,
             capped, stuck, grants, maxLevel, spanAtCap, finalLevel };
  });
  check(xpLevels.shortOfLevel === 1,
        'I5a a shortfall of 1 XP against the current level\'s measured span does not advance the level',
        `span1=${xpLevels.span1}, level held at ${xpLevels.shortOfLevel}`);
  check(xpLevels.afterExact === xpLevels.shortOfLevel + 1,
        'I5a2 granting the remaining 1 XP (total = the measured span) advances exactly one level',
        `span1=${xpLevels.span1}, level ${xpLevels.shortOfLevel} -> ${xpLevels.afterExact}`);
  check(!xpLevels.stuck,
        'I5aStuck no grant of a nonzero measured span ever failed to advance the level (would indicate a real bug, not a cap)',
        `stuck=${xpLevels.stuck} after ${xpLevels.grants} grants`);
  check(xpLevels.capped,
        'I5aCap xpForLevel actually reached 0 (the cap signal) within 40 grants, each re-read fresh',
        `capped=${xpLevels.capped} after ${xpLevels.grants} grants, maxLevel=${xpLevels.maxLevel}`);
  check(xpLevels.spanAtCap === 0,
        'I5aSpan xpForLevel reads 0 once the level is at cap', `spanAtCap=${xpLevels.spanAtCap}`);
  const expectedClimb = Array.from({ length: xpLevels.maxLevel - xpLevels.afterExact + 1 },
                                     (_, i) => xpLevels.afterExact + i);
  check(xpLevels.seen.join(',') === expectedClimb.join(','),
        'I5b weapon level advances in lockstep with fresh-read xpForLevel-sized grants, all the way to maxLevel (any curve shape)',
        JSON.stringify({ seen: xpLevels.seen, expectedClimb, maxLevel: xpLevels.maxLevel }));
  check(xpLevels.finalLevel === xpLevels.maxLevel,
        'I5c weapon level caps at maxLevel (measured) past the top threshold (SPEC 18.3)',
        `finalLevel=${xpLevels.finalLevel}, measured maxLevel=${xpLevels.maxLevel}`);
  check(xpLevels.levelEvents.join(',') === xpLevels.seen.join(','),
        'I5d weapon:level fires exactly once per level-up, in the same order as the levels observed',
        JSON.stringify({ levelEvents: xpLevels.levelEvents, seen: xpLevels.seen }));

  // --- I6 weapon level 2 (Quad) fires 4 bolts in one shot (SPEC 18.3) ---
  const l2fire = await ip.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.spawner.pending = false; g.spawner.clear();
    g.weapon.reset(); g.weapon.level = 2;
    for (const l of g.world.tagged('projectile')) l.destroy();
    g.world.step(0);
    const before = g.world.tagged('projectile').size;
    g.player.fireCd = 0;
    g.input.press('fire', true);
    g.tick(1 / 60);
    g.input.press('fire', false);
    const after = g.world.tagged('projectile').size;
    return { before, after, muzzles: g.weapon.stats.muzzles, name: g.weapon.stats.name };
  });
  check(l2fire.name === 'Quad' && l2fire.muzzles === 4 && (l2fire.after - l2fire.before) === 4,
        'I6 weapon L2 (Quad) fires 4 bolts in a single shot (SPEC 18.3)', JSON.stringify(l2fire));

  // --- I7 weapon level 4 (Heavy) splash damages a second enemy within 12u (SPEC 18.3) ---
  const splash = await ip.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.spawner.pending = false; g.spawner.clear();
    for (const e of window.__h.enemies()) e.destroy();
    g.world.step(0);
    g.weapon.reset(); g.weapon.level = 4;
    const V = g.player.position.constructor;
    const p0 = g.player.position.clone().addScaledVector(g.player._fwd, 100);
    const e1 = g.spawner.pool.get(); e1.position.copy(p0); e1.reset(g.ctx, 10, 1, null, 0); g.world.add(e1);
    const e2 = g.spawner.pool.get(); e2.position.copy(p0).add(new V(8, 0, 0)); e2.reset(g.ctx, 10, 1, null, 0); g.world.add(e2);
    g.world.rebuildHash();
    const before = { e1: e1.health.cur, e2: e2.health.cur };
    // A stationary laser carrying the current weapon level's damage/splash -- same
    // controlled-collision technique as the HARNESS's shootAt(), so the impact point
    // cannot travel past e1 within this tick.
    const l = g.lasers.pool.get().launch(p0, g.player._fwd.clone().normalize(), 0);
    l.vel.set(0, 0, 0);
    l.damage = g.weapon.stats.damage; l.splash = g.weapon.stats.splash;
    g.world.add(l); g.world.rebuildHash();
    g.tick(1 / 60);
    return {
      dist: e1.position.distanceTo(e2.position),
      before, after: { e1: e1.health.cur, e2: e2.health.cur },
      dmg: g.weapon.stats.damage, splashRadius: g.weapon.stats.splash, name: g.weapon.stats.name,
    };
  });
  check(splash.name === 'Heavy' && splash.dist < splash.splashRadius,
        'I7 setup: second enemy placed inside the L4 splash radius', JSON.stringify(splash));
  check(splash.after.e1 === splash.before.e1 - splash.dmg,
        'I7a directly-hit enemy takes the weapon\'s direct damage', JSON.stringify(splash));
  check(splash.after.e2 === splash.before.e2 - splash.dmg,
        'I7b weapon L4 (Heavy) splash damages a second enemy within 12u of the impact (SPEC 18.3)',
        JSON.stringify(splash));

  // --- I8 weapon level resets on relaunch (SPEC 18.3) ---
  const weaponResetOnRelaunch = await ip.evaluate(() => {
    const g = window.__game;
    g.weapon.reset(); g.weapon.level = 5; g.weapon.xp = 999;
    g.relaunch();
    return { level: g.weapon.level, xp: g.weapon.xp };
  });
  check(weaponResetOnRelaunch.level === 1 && weaponResetOnRelaunch.xp === 0,
        'I8 weapon level and XP reset on relaunch (SPEC 18.3)', JSON.stringify(weaponResetOnRelaunch));

  // --- I9 cores pool: measured capacity matches window.__CFG.cores.pool (read live, not
  // hardcoded -- it moved 32 -> 64 with the FX/core batching pass), and it is never
  // exceeded across a full 5-wave campaign clear (many core drops at realistic kill
  // pacing, SPEC 18.2) ---
  const poolCap = await ip.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.diff.set('MEDIUM');
    const capacity = g.cores.pool.capacity;
    const cfgCapacity = window.__CFG.cores.pool;
    let cleared = false, drops = 0, maxAlive = 0;
    const offDied = g.bus.on('enemy:died', () => drops++);
    const offClear = g.bus.on('campaign:clear', () => { cleared = true; });
    let seconds = 0; const CAP = 90;
    while (!cleared && seconds < CAP) {
      window.__h.sim(1); seconds++;
      for (const e of window.__h.enemies()) { e.health.cur = 1; e.hit(1); }
      maxAlive = Math.max(maxAlive, g.world.tagged('pickup').size);
    }
    offDied(); offClear();
    return { capacity, cfgCapacity, drops, maxAlive, overflow: g.cores.pool.overflow, seconds, cleared };
  });
  check(poolCap.capacity === poolCap.cfgCapacity,
        'I9a measured cores pool capacity matches window.__CFG.cores.pool (SPEC 18.2, read live)',
        `capacity=${poolCap.capacity}, window.__CFG.cores.pool=${poolCap.cfgCapacity}`);
  check(poolCap.overflow === 0 && poolCap.maxAlive <= poolCap.capacity,
        'I9b cores pool never overflows its capacity across a full 5-wave campaign clear',
        `overflow=${poolCap.overflow}, max concurrently-alive cores ${poolCap.maxAlive}/${poolCap.capacity}, ` +
        `${poolCap.drops} total drops over ${poolCap.seconds}s (campaign cleared=${poolCap.cleared})`);

  // --- I9c cores pool SIZING: an ACE campaign that kills every fighter on sight, with
  // every dropped core immediately pushed out of magnet/collision range so nothing is
  // ever collected, is the load that broke the OLD 32 cap (measured peak 33 concurrent).
  // Cap is read live from window.__CFG.cores.pool, per instruction not to hardcode 64
  // (or assume any other round number) here.
  const sizing = await ip.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.diff.set('ACE');
    let cleared = false, drops = 0, maxAlive = 0;
    const offDied = g.bus.on('enemy:died', () => drops++);
    const offClear = g.bus.on('campaign:clear', () => { cleared = true; });
    let seconds = 0; const CAP = 90;
    while (!cleared && seconds < CAP) {
      window.__h.sim(1); seconds++;
      for (const e of window.__h.enemies()) { e.health.cur = 1; e.hit(1); }
      // Kill on sight, collect nothing: every live pickup is pushed far out of magnet/
      // collision range the instant it exists, so the count reflects concurrent load,
      // not collection behaviour -- matching what was actually measured.
      for (const c of g.world.tagged('pickup')) if (c.alive) c.position.y += 1e6;
      maxAlive = Math.max(maxAlive, g.world.tagged('pickup').size);
    }
    offDied(); offClear();
    return { cap: window.__CFG.cores.pool, drops, maxAlive, overflow: g.cores.pool.overflow, seconds, cleared };
  });
  check(sizing.cleared, 'I9c setup: the ACE kill-on-sight campaign actually clears (precondition)',
        JSON.stringify(sizing));
  check(sizing.overflow === 0,
        'I9c cores pool overflow stays 0 under peak concurrent load (ACE, kill-on-sight, nothing ' +
        'collected -- the SIZING load that broke the old 32 cap at a measured peak of 33)',
        `overflow=${sizing.overflow}, cap=${sizing.cap} (window.__CFG.cores.pool), ` +
        `peak concurrent ${sizing.maxAlive}, ${sizing.drops} total drops over ${sizing.seconds}s`);

  // --- I9d cores pool RETURN PATH: N dropped cores, once destroyed, return exactly N
  // entries to the free list after one world sweep -- so a future leak shows up as a
  // short free list (a leak), not only as an eventual overflow under sustained load.
  const returnPath = await ip.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    const V = g.player.position.constructor;
    const N = 10;
    const freeBefore = g.cores.pool.free.length;
    const dropped = [];
    for (let i = 0; i < N; i++) {
      dropped.push(g.cores.drop(
        g.player.position.clone().addScaledVector(g.player._fwd, 500 + i * 3), new V(0, 0, 0)));
    }
    const freeAfterDrop = g.cores.pool.free.length;
    for (const c of dropped) c.destroy();          // marks dead; the world has not swept yet
    const freeBeforeSweep = g.cores.pool.free.length;
    g.tick(1 / 60);                                 // world.step() sweeps dead entities -> dispose() -> pool.put()
    const freeAfterSweep = g.cores.pool.free.length;
    return { N, freeBefore, freeAfterDrop, freeBeforeSweep, freeAfterSweep };
  });
  check(returnPath.freeBefore - returnPath.freeAfterDrop === returnPath.N,
        'I9d setup: N drop() calls draw exactly N entries down from the free list', JSON.stringify(returnPath));
  check(returnPath.freeBeforeSweep === returnPath.freeAfterDrop,
        'I9d setup: destroy() alone, before the world sweep runs, does not yet return anything',
        JSON.stringify(returnPath));
  check(returnPath.freeAfterSweep === returnPath.freeBefore,
        'I9d destroyed cores return exactly N to the free list after one world sweep (no leak)',
        JSON.stringify(returnPath));

  check(iErrs.length === 0, 'I10 no console errors during pause/core/weapon checks',
        iErrs.slice(0, 3).join(' | ') || 'clean');

  await ctxI.close();

  /* ================= F. M3.1: HUD layout editor (SPEC 16, SPEC 3 keep-out) ================= */

  // --- F1 no widget intrudes the firing keep-out zone, at three viewports (SPEC 3, 16) ---
  // §3: nothing but the reticle/bracket/lead ring/bracket line may sit within
  // 22% of min(viewport) from screen centre. Those four are not `.w` widgets,
  // so they are excluded from HudLayout.violations() by construction; every
  // registered widget must clear the zone on its own, including on a phone
  // viewport where HudLayout's #clamp/#evict must actively push things out.
  for (const [w, h, label] of [[1920, 1080, '1920x1080 desktop'],
                                [1366, 768, '1366x768 laptop'],
                                [390, 844, '390x844 phone']]) {
    const ctxV = await browser.newContext({ viewport: { width: w, height: h } });
    const vp = await ctxV.newPage();
    await vp.goto(URL, { waitUntil: 'load' });
    await vp.waitForTimeout(1200);
    const violations = await vp.evaluate(() => window.__game.layout.violations());
    check(violations.length === 0, `F1 no HUD widget intrudes the SPEC 3 keep-out zone at ${label}`,
          `violating widgets: ${JSON.stringify(violations)}`);
    await ctxV.close();
  }

  const ctxF = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const fp = await ctxF.newPage();
  const fErrs = [];
  fp.on('console', m => { if (m.type() === 'error') fErrs.push(m.text()); });
  fp.on('pageerror', e => fErrs.push('pageerror: ' + e.message.split('\n')[0]));
  await fp.goto(URL, { waitUntil: 'load' });
  await fp.waitForTimeout(1500);

  // --- F2 Data widget default rows (SPEC 16: "Default on: enemies remaining,
  // nearest distance, hit %"; the milestone brief further specifies hits ON
  // and closure/wavetime/heat OFF). Read on a pristine load, before any other
  // F-series test mutates layout state, so this reflects true defaults.
  const dataRows = await fp.evaluate(() => window.__game.layout.state.data.rows);
  check(dataRows.enemies === true && dataRows.nearest === true && dataRows.hits === true &&
        dataRows.closure === false && dataRows.wavetime === false && dataRows.heat === false,
        'F2 Data widget default rows: enemies/nearest/hits on, closure/wavetime/heat off',
        JSON.stringify(dataRows));

  // --- F3 keep-out rejection: a widget placed at screen centre is detected ---
  // by both intrudes() (raw geometry) and violations() (widget scan). Probe
  // intrudes() with a synthetic rect at dead centre, then force a real widget
  // element to centre via its DOM style (bypassing HudLayout#place/#evict, so
  // the auto-correction those add doesn't mask what's being tested) and
  // confirm violations() flags it. Restore + re-apply afterward so later
  // F-series tests start from a clean layout.
  const centreCheck = await fp.evaluate(() => {
    const g = window.__game;
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const centreRect = { left: cx - 5, right: cx + 5, top: cy - 5, bottom: cy + 5 };
    const intrudesCentre = g.layout.intrudes(centreRect);
    const el = g.layout.els.radar;
    const prevLeft = el.style.left, prevTop = el.style.top;
    el.style.left = '50%'; el.style.top = '50%';
    const violations = g.layout.violations();
    el.style.left = prevLeft; el.style.top = prevTop;
    g.layout.apply();                                    // resync real state back onto the DOM
    return { intrudesCentre, violations };
  });
  check(centreCheck.intrudesCentre === true,
        'F3a intrudes() flags a rect placed at screen centre', JSON.stringify(centreCheck));
  check(centreCheck.violations.includes('radar'),
        'F3b violations() flags a widget element placed at screen centre', JSON.stringify(centreCheck.violations));

  // --- F4/F5 drag persists after reload; hidden widget stays hidden after reload ---
  // Move the score widget to a corner well outside the keep-out zone and hide
  // the wave widget, via the same state+apply()+save() path a real drag/
  // visibility-toggle takes, then reload and confirm both survived.
  const beforeReload = await fp.evaluate(() => {
    const g = window.__game;
    g.layout.state.score.x = 6; g.layout.state.score.y = 6;
    g.layout.state.wave.visible = false;
    g.layout.apply();
    g.layout.save();
    return {
      scoreX: g.layout.state.score.x, scoreY: g.layout.state.score.y,
      waveVisible: g.layout.state.wave.visible, waveHidden: g.layout.els.wave.classList.contains('hidden'),
    };
  });
  await fp.reload({ waitUntil: 'load' });
  await fp.waitForTimeout(1200);
  const afterReload = await fp.evaluate(() => {
    const g = window.__game;
    return {
      scoreX: g.layout.state.score.x, scoreY: g.layout.state.score.y,
      waveVisible: g.layout.state.wave.visible, waveHidden: g.layout.els.wave.classList.contains('hidden'),
    };
  });
  check(Math.abs(afterReload.scoreX - beforeReload.scoreX) < 0.5 &&
        Math.abs(afterReload.scoreY - beforeReload.scoreY) < 0.5,
        'F4 dragged widget position persists in ss.hud.v1 after reload',
        `before (${beforeReload.scoreX},${beforeReload.scoreY}) -> after (${afterReload.scoreX},${afterReload.scoreY})`);
  check(!beforeReload.waveVisible && beforeReload.waveHidden && !afterReload.waveVisible && afterReload.waveHidden,
        'F5 hidden widget stays hidden after reload', JSON.stringify(afterReload));

  // --- F6 reset() restores defaults and clears ss.hud.v1 ---
  // Runs after F4/F5 left a real save in localStorage, so this also proves
  // reset() undoes a persisted layout, not just an in-memory one.
  const resetResult = await fp.evaluate(() => {
    const g = window.__game;
    g.layout.reset();
    return {
      scoreX: g.layout.state.score.x, scoreY: g.layout.state.score.y,
      waveVisible: g.layout.state.wave.visible,
      stored: localStorage.getItem('ss.hud.v1'),
    };
  });
  check(resetResult.scoreX === 92 && resetResult.scoreY === 8 && resetResult.waveVisible === true &&
        resetResult.stored === null,
        'F6 reset() restores default widget positions/visibility and clears ss.hud.v1',
        JSON.stringify(resetResult));

  // --- F7 H toggles layout mode, flips body.layout, and freezes the sim ---
  // Sim-freeze is asserted the same way A2/A4c do (via the ever-changing
  // #tgt readout under the real rAF loop), since layoutMode is only gated in
  // Game#frame(), not in Game#tick() itself -- calling tick() directly (as
  // the HARNESS does elsewhere in this file) would bypass that gate entirely
  // and give a false pass.
  const preH = await fp.evaluate(() => ({
    layoutMode: window.__game.layoutMode,
    bodyClass: document.body.classList.contains('layout'),
  }));
  await fp.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', bubbles: true })));
  const onH = await fp.evaluate(() => ({
    layoutMode: window.__game.layoutMode,
    bodyClass: document.body.classList.contains('layout'),
    mode: window.__game.layout.mode,
    tgt: document.getElementById('tgt').textContent,
  }));
  await fp.waitForTimeout(900);
  const frozenTgt = await fp.evaluate(() => document.getElementById('tgt').textContent);
  await fp.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', bubbles: true })));
  const offH = await fp.evaluate(() => ({
    layoutMode: window.__game.layoutMode,
    bodyClass: document.body.classList.contains('layout'),
    mode: window.__game.layout.mode,
  }));
  await fp.waitForTimeout(900);
  const resumedTgt = await fp.evaluate(() => document.getElementById('tgt').textContent);

  check(!preH.layoutMode && !preH.bodyClass, 'F7a layout mode is off by default', JSON.stringify(preH));
  check(onH.layoutMode && onH.bodyClass && onH.mode,
        'F7b H enters layout mode: Game.layoutMode true, body.layout class, HudLayout.mode true',
        JSON.stringify(onH));
  check(frozenTgt === onH.tgt, 'F7c layout mode freezes the sim (#tgt readout does not change while active)',
        `tgt ${onH.tgt} -> ${frozenTgt}`);
  check(!offH.layoutMode && !offH.bodyClass && !offH.mode,
        'F7d H exits layout mode and clears all three flags', JSON.stringify(offH));
  check(resumedTgt !== frozenTgt, 'F7e sim resumes ticking after exiting layout mode',
        `tgt ${frozenTgt} -> ${resumedTgt}`);

  check(fErrs.length === 0, 'F8 no console errors during HUD layout editor checks',
        fErrs.slice(0, 3).join(' | ') || 'clean');

  await ctxF.close();

  /* ================= E. SpatialHash bucket bound (leak fix) ================= */
  // SpatialHash.clear() used to iterate every bucket the Map had ever held,
  // and because the player flies continuously the Map grew without bound
  // (measured 1320 -> 3558 buckets, per-tick cost 0.081 -> 0.098 ms and still
  // rising, over 5 simulated minutes). The fix clears only the buckets it
  // filled this rebuild and drops the whole Map once its size exceeds
  // CFG.hash.maxCells (2048; hardcoded here per index.html:290, since CFG is
  // module-scoped and not exposed on window). Drive g.tick() directly so "5
  // simulated minutes" is exact wall-clock-independent sim time, matching the
  // deterministic pattern used elsewhere in this file (e.g. B9's 120s soak).
  const ctxE = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ep = await ctxE.newPage();
  const eErrs = [];
  ep.on('console', m => { if (m.type() === 'error') eErrs.push(m.text()); });
  ep.on('pageerror', e => eErrs.push('pageerror: ' + e.message.split('\n')[0]));
  await ep.goto(URL, { waitUntil: 'load' });
  await ep.waitForTimeout(1500);
  await ep.evaluate(HARNESS);

  const hashRun = await ep.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    const MAX_CELLS = 2048;                          // CFG.hash.maxCells (index.html:290)
    const minuteTicks = 60 * 60;
    const totalTicks = 5 * minuteTicks;              // 5 simulated minutes @ 60Hz
    let maxBuckets = 0;
    let sumFirst = 0, nFirst = 0, sumLast = 0, nLast = 0;
    for (let i = 0; i < totalTicks; i++) {
      // Keep the fight moving (kills, respawns, waves advancing) so the
      // entity population resembles real continuous play, not an idle scene.
      if (i % 30 === 0) { const e = [...g.world.tagged('enemy')][0]; if (e) e.hit(1); }
      const t0 = performance.now();
      g.tick(1 / 60);
      const dt = performance.now() - t0;
      const size = g.world.hash.buckets.size;
      if (size > maxBuckets) maxBuckets = size;
      if (i < minuteTicks) { sumFirst += dt; nFirst++; }
      if (i >= totalTicks - minuteTicks) { sumLast += dt; nLast++; }
    }
    return {
      maxCells: MAX_CELLS, maxBuckets,
      meanFirstMinuteMs: sumFirst / nFirst,
      meanLastMinuteMs: sumLast / nLast,
    };
  });
  // "no more than one rebuild's worth of growth" past maxCells: clear() only
  // drops the Map once size > maxCells *going into* a rebuild, so a single
  // tick's fresh inserts can transiently push it over that line before the
  // next clear() resets it. 1.5x is generous headroom for that one-tick
  // overshoot while still catching real unbounded growth (the pre-fix run
  // reached 3558, 1.74x maxCells, well outside this bound).
  check(hashRun.maxBuckets <= hashRun.maxCells * 1.5,
        'E1 SpatialHash bucket count stays bounded near maxCells over 5 simulated minutes',
        `maxBuckets ${hashRun.maxBuckets}, maxCells ${hashRun.maxCells}`);
  // "does not trend upward": tolerant of headless timing noise (up to +35%
  // relative, plus a small absolute floor), but the pre-fix regression's
  // measured +21% growth (0.081 -> 0.098 ms) would still fail a tighter human
  // read of this data; the point is flat-not-rising, not a specific number.
  const growthOk = hashRun.meanLastMinuteMs <= hashRun.meanFirstMinuteMs * 1.35 + 0.02;
  check(growthOk,
        'E2 mean per-tick cost does not trend upward across the run (first vs last minute)',
        `first-minute ${hashRun.meanFirstMinuteMs.toFixed(4)}ms, last-minute ${hashRun.meanLastMinuteMs.toFixed(4)}ms`);
  check(eErrs.length === 0, 'E3 no console errors during the 5-minute SpatialHash soak',
        eErrs.slice(0, 3).join(' | ') || 'clean');
  await ctxE.close();

  /* ================= J. M3.5 targeting fixes: Tab moves every readout onto the
   * newly selected target within one tick, the tracker never sticks on a dead
   * target, and the approach-speed floor is now a continuous fade (SPEC 3, 5, 8, 18).
   * Three landed changes under test here:
   *   1. Tracker#arrow -- the selected target claims an off-screen arrow slot
   *      before any other fighter (this._nArrow), so a full 6-slot arrow bank
   *      cannot starve the actual selection (measured: no tagged arrow on 3/10
   *      Tab presses at wave 4, 9 alive, before the fix).
   *   2. Radar._lastSel forces an immediate redraw on the tick the selection
   *      changes, instead of waiting up to 50ms for the next 20Hz slot.
   *   3. HUD Data widget's "Target" row (data-row="nearest", #d-nearest/
   *      #d-closure -- ids unchanged, only the label moved) follows
   *      tracker.target, not the nearest fighter.
   *   4. Game drops tracker.target on enemy:died so a pool-recycled object
   *      cannot silently inherit the old selection.
   *   5. Enemy#update's approach speed floor is now smoothstep-faded across
   *      CFG.enemies.approachBlend instead of switched at ai.fireRange.
   * CFG itself is module-scoped and unreachable from page.evaluate (see the
   * E1 comment above), so every expectation below is read off the running
   * game: THREE's own Vector3#project for screen position (the same call
   * Tracker#ndc makes), and Aitken's delta-squared extrapolation of the
   * exponential damp to recover Enemy#update's implied target speed without
   * knowing CFG.enemies.accel.
   */
  const ctxJ = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const jp = await ctxJ.newPage();
  const jErrs = [];
  jp.on('console', m => { if (m.type() === 'error') jErrs.push(m.text()); });
  jp.on('pageerror', e => jErrs.push('pageerror: ' + e.message.split('\n')[0]));
  await jp.goto(URL, { waitUntil: 'load' });
  await jp.waitForTimeout(1500);
  await jp.evaluate(HARNESS);

  // --- J1: bracket, lead ring, bracket->lead line, radar highlight and the HUD
  // Data "Target" row all move onto the newly-Tabbed target within one post-
  // render tracker pass. Two real fighters, A (nearer, dead-ahead-ish) and B
  // (farther, well off to the other side, with lateral velocity so its lead
  // point separates visibly from its bracket) -- both placed on screen so the
  // bracket/lead machinery actually renders.
  const j1 = await jp.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.diff.set('MEDIUM');
    g.spawner.pending = false; g.spawner.clear();
    const V = g.player.position.constructor;
    const playerPos = g.player.position.clone();
    const fwd = g.player._fwd.clone().normalize();
    const right = new V(1, 0, 0).applyQuaternion(g.player.object.quaternion);

    const mk = (df, dr, vel) => {
      const e = g.spawner.pool.get();
      e.position.copy(playerPos).addScaledVector(fwd, df).addScaledVector(right, dr);
      e.reset(g.ctx, 3, 1, null, 0);
      e.vel.copy(vel);
      g.world.add(e);
      return e;
    };
    const A = mk(260, 30, new V(0, 0, 0));                          // nearer
    const B = mk(420, -80, right.clone().multiplyScalar(60));       // farther, moving laterally
    g.world.rebuildHash();
    g.player.object.updateMatrixWorld(true);

    const proj = pos => {
      const v = pos.clone().project(g.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
    };
    const parseXY = tf => {
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(tf || '');
      return m ? { x: +m[1], y: +m[2] } : null;
    };

    g.tracker.target = null;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));   // -> A (nearest)
    const gotA = g.tracker.target === A;
    g.player.object.updateMatrixWorld(true);
    g.tracker.update(g.world, g.camera);
    g.hud.update(g.player, g.env, g.spawner, 1 / 60);
    const bracketAxy = parseXY(g.tracker.bracket.style.transform);

    // Deterministic baseline for the radar-latency check below: pretend a
    // draw JUST happened (acc=0) and poison lastMs, so any change to lastMs
    // on the very next tick can only come from the selection-change path,
    // not from dt alone.
    g.radar.acc = 0; g.radar.lastMs = -999;

    dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));   // -> B
    const gotB = g.tracker.target === B;
    g.player.object.updateMatrixWorld(true);
    g.tracker.update(g.world, g.camera);
    g.radar.tick(0.001);            // far below the 20Hz step -- would NOT draw on dt alone
    g.hud.update(g.player, g.env, g.spawner, 1 / 60);

    const bracketTf = g.tracker.bracket.style.transform;
    const bracketBxy = parseXY(bracketTf);
    const leadTf = g.tracker.lead.style.transform;
    const leadBxy = parseXY(leadTf);
    const lineTf = g.tracker.leadLine.style.transform;
    const lineStart = parseXY(lineTf);
    const projB = proj(B.position);
    const projA = proj(A.position);

    return {
      gotA, gotB,
      bracketAxy, bracketDisp: g.tracker.bracket.style.display, bracketBxy, projB, projA,
      leadDisp: g.tracker.lead.style.display, leadBxy,
      lineDisp: g.tracker.leadLine.style.display, lineStart,
      radarDrewImmediately: g.radar.lastMs !== -999,
      radarLastSelIsB: g.radar._lastSel === B,
      dNearest: document.getElementById('d-nearest').textContent,
      dRowLabel: document.querySelector('[data-row="nearest"] span').textContent,
      distB: B.position.distanceTo(g.player.position),
      distA: A.position.distanceTo(g.player.position),
    };
  });
  check(j1.gotA && j1.gotB, 'J1 setup: two successive Tabs select A then B (precondition)',
        `gotA=${j1.gotA}, gotB=${j1.gotB}`);
  const bracketMoved = j1.bracketAxy && j1.bracketBxy &&
        Math.hypot(j1.bracketBxy.x - j1.bracketAxy.x, j1.bracketBxy.y - j1.bracketAxy.y) > 5;
  const bracketOnB = j1.bracketDisp === 'block' && j1.bracketBxy &&
        Math.hypot(j1.bracketBxy.x - j1.projB.x, j1.bracketBxy.y - j1.projB.y) < 1 &&
        Math.hypot(j1.bracketBxy.x - j1.projA.x, j1.bracketBxy.y - j1.projA.y) > 20;
  check(bracketMoved && bracketOnB,
        'J1a bracket moves onto the newly-Tabbed target B (matches THREE Vector3#project(B), not A) within one tick',
        JSON.stringify({ bracketAxy: j1.bracketAxy, bracketBxy: j1.bracketBxy, projB: j1.projB, projA: j1.projA }));
  const leadSeparatesFromBracket = j1.leadBxy && j1.bracketBxy &&
        Math.hypot(j1.leadBxy.x - j1.bracketBxy.x, j1.leadBxy.y - j1.bracketBxy.y) > 8;
  check(j1.leadDisp === 'block' && leadSeparatesFromBracket,
        'J1b lead ring is shown for the new target B and leads its (laterally-moving) bracket position',
        JSON.stringify({ leadDisp: j1.leadDisp, leadBxy: j1.leadBxy, bracketBxy: j1.bracketBxy }));
  const lineOriginMatchesBracket = j1.lineStart && j1.bracketBxy &&
        Math.hypot(j1.lineStart.x - j1.bracketBxy.x, j1.lineStart.y - j1.bracketBxy.y) < 0.15;
  check(j1.lineDisp === 'block' && lineOriginMatchesBracket,
        'J1c bracket->lead line originates at B\'s (updated) bracket position', JSON.stringify(j1));
  check(j1.radarDrewImmediately,
        'J1d radar forces an immediate redraw the tick the selection changes (dt=0.001, far below the 20Hz step)',
        `lastMs after tiny-dt tick following Tab: ${j1.radarDrewImmediately} (poisoned at -999 beforehand)`);
  check(j1.radarLastSelIsB, 'J1e radar._lastSel tracks the newly-Tabbed target B', `radarLastSelIsB=${j1.radarLastSelIsB}`);
  check(j1.dNearest === Math.round(j1.distB) + ' m' && j1.dNearest !== Math.round(j1.distA) + ' m',
        'J1f HUD Data "Target" row (#d-nearest) follows the SELECTED target B, not nearest-overall A',
        `#d-nearest="${j1.dNearest}", distB=${j1.distB.toFixed(1)}, distA=${j1.distA.toFixed(1)}`);
  check(j1.dRowLabel === 'Target', 'J1g Data widget row label reads "Target" (SPEC 18: renamed from "Nearest")',
        `label="${j1.dRowLabel}"`);

  // --- J2: off-screen arrow priority. Oversubscribe the 6 arrow slots (read
  // live off tracker.arrows.length, never hardcoded) and Tab onto the LAST
  // fighter added to the world -- the exact ordering the old bug lost, since
  // slots used to fill in world-iteration order.
  const j2 = await jp.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.diff.set('MEDIUM');
    g.spawner.pending = false; g.spawner.clear();
    const nSlots = g.tracker.arrows.length;
    const V = g.player.position.constructor;
    const pos = g.player.position.clone();
    const back = g.player._fwd.clone().normalize().multiplyScalar(-1);   // behind: guaranteed off-screen
    const up = new V(0, 1, 0);
    let last = null;
    const N = nSlots + 3;
    for (let i = 0; i < N; i++) {
      const e = g.spawner.pool.get();
      e.position.copy(pos).addScaledVector(back, 200 + i * 5).addScaledVector(up, (i % 5) * 10);
      e.reset(g.ctx, 3, 1, null, 0);
      e.vel.set(0, 0, 0);
      g.world.add(e);
      last = e;
    }
    g.world.rebuildHash();
    g.player.object.updateMatrixWorld(true);

    g.tracker.target = last;               // simulate Tab landing on the last-iterated fighter
    g.tracker.update(g.world, g.camera);

    const visibleArrows = g.tracker.arrows.filter(a => a.style.display === 'block').length;
    const tgtArrow = g.tracker.arrows.some(a => a.classList.contains('tgt') && a.style.display === 'block');
    return { nSlots, aliveCount: window.__h.enemies().length, visibleArrows, tgtArrow };
  });
  check(j2.aliveCount > j2.nSlots,
        'J2 setup: genuinely oversubscribed (alive fighters > off-screen arrow slots)',
        `alive=${j2.aliveCount}, slots=${j2.nSlots}`);
  check(j2.visibleArrows <= j2.nSlots, 'J2a visible arrows never exceed the slot count',
        `visibleArrows=${j2.visibleArrows}, slots=${j2.nSlots}`);
  check(j2.tgtArrow === true,
        'J2b the selected target still claims an off-screen arrow slot when slots are oversubscribed (Tracker#arrow priority fix)',
        JSON.stringify(j2));

  // --- J3: aim assist follows the CURRENT (post-Tab) target, not whichever
  // was selected before. A and B on opposite sides, both beyond the assist
  // cone's reach (so the bolt cannot actually collide with either -- purely a
  // directional measurement, same technique as M3-2 above), Tab past A onto
  // B, then fire and confirm the bolt bends toward B's side.
  const j3 = await jp.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.diff.set('MEDIUM');
    g.spawner.pending = false; g.spawner.clear();
    const V = g.player.position.constructor;
    const fwd = g.player._fwd.clone().normalize();
    const right = new V(1, 0, 0).applyQuaternion(g.player.object.quaternion);
    const pos = g.player.position.clone();

    const mk = (df, dr) => {
      const e = g.spawner.pool.get();
      e.position.copy(pos).addScaledVector(fwd, df).addScaledVector(right, dr);
      e.reset(g.ctx, 3, 1, null, 0);
      e.vel.set(0, 0, 0);
      g.world.add(e);
      return e;
    };
    const A = mk(300, 60);     // nearer, right
    const B = mk(400, -140);   // farther, left
    g.world.rebuildHash();
    g.player.object.updateMatrixWorld(true);

    g.tracker.target = null;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));   // -> A (nearest)
    const gotA = g.tracker.target === A;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));   // -> B
    const gotB = g.tracker.target === B;

    const assistDeg = g.diff.p.assistDeg;
    g.bus.emit('player:fire', { muzzles: [pos.clone()], dir: fwd.clone(), vel: 0 });
    const l = [...g.world.tagged('projectile')].at(-1);
    for (let i = 0; i < 30; i++) g.tick(1 / 60);
    const finalDir = l.vel.clone().normalize();
    // Bearings measured LIVE, post-flight: both A/B (real, autonomously-flying
    // fighters) and the player itself move during the 30 ticks (SPEC 3: the
    // ship always cruises), so re-reading g.player.position here -- rather
    // than the stale pre-tick `pos` -- keeps this an honest "which side is
    // the bolt actually pointed toward, right now" comparison.
    const toA = A.position.clone().sub(g.player.position).normalize();
    const toB = B.position.clone().sub(g.player.position).normalize();
    const angTo = v => Math.acos(Math.max(-1, Math.min(1, finalDir.dot(v)))) * 180 / Math.PI;
    return { gotA, gotB, assistDeg, angToA: angTo(toA), angToB: angTo(toB), lateral: finalDir.dot(right) };
  });
  check(j3.gotA && j3.gotB, 'J3 setup: Tab selects A then B (precondition)', `gotA=${j3.gotA}, gotB=${j3.gotB}`);
  check(j3.assistDeg > 0, 'J3 precondition: MEDIUM has a nonzero assist cone (assistDeg read live from g.diff.p)',
        `assistDeg=${j3.assistDeg}`);
  check(j3.angToB < j3.angToA && j3.lateral < 0,
        'J3a aim assist bends the bolt toward the CURRENTLY selected target B, not the previously-selected A',
        `angToA=${j3.angToA.toFixed(2)}deg, angToB=${j3.angToB.toFixed(2)}deg, lateral(toward A side)=${j3.lateral.toFixed(3)}`);

  // --- J4 (Task C): when the tracked target dies, the tracker drops the
  // reference immediately (synchronously, inside the enemy:died handler) and
  // the next post-render tracker pass re-acquires the nearest surviving
  // fighter -- never left null while any enemy is alive. Kills the CURRENT
  // selection each round (not always the same fighter A/B/C), so this holds
  // regardless of which one #acquire happened to pick last round.
  const j4 = await jp.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.diff.set('MEDIUM');
    g.spawner.pending = false; g.spawner.clear();
    const V = g.player.position.constructor;
    const pos = g.player.position.clone();
    const fwd = g.player._fwd.clone().normalize();
    const right = new V(1, 0, 0).applyQuaternion(g.player.object.quaternion);

    const mk = (df, dr) => {
      const e = g.spawner.pool.get();
      e.position.copy(pos).addScaledVector(fwd, df).addScaledVector(right, dr);
      e.reset(g.ctx, 3, 1, null, 0);
      e.vel.set(0, 0, 0);
      g.world.add(e);
      return e;
    };
    const A = mk(200, -50), B = mk(350, 0), C = mk(500, 60);
    g.world.rebuildHash();
    g.player.object.updateMatrixWorld(true);
    // These three fighters are spawned directly, outside Spawner's own wave
    // bookkeeping (spawner.alive/waveIndex), so Spawner's global 'enemy:died'
    // listener must not see alive hit 0 and treat it as a real wave clear
    // (CFG.waves[-1] after relaunch's spawner.reset() -> waveIndex=-1, which
    // would throw). pending=true short-circuits that path without triggering
    // an actual auto-spawn, since this test never calls g.tick().
    g.spawner.pending = true;

    // Deliberately select the MIDDLE one first, not the nearest, so a naive
    // "just re-pick nearest" that ignores the drop-on-death event can't
    // accidentally look right by coincidence.
    g.tracker.target = B;

    const nearestAliveOf = list => {
      let best = null, bd = Infinity;
      for (const e of list) if (e.alive) {
        const d = e.position.distanceToSquared(g.player.position);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    };

    const order = [B, A, C];   // kill the current selection first, then the rest
    const steps = [];
    for (const victim of order) {
      const wasTarget = g.tracker.target === victim;
      victim.health.cur = 1; victim.hit(1);                 // -> #onDeath -> enemy:died (synchronous)
      const droppedImmediately = wasTarget ? g.tracker.target === null : null;
      const aliveBefore = [A, B, C].filter(e => e.alive);
      const expectedNearest = nearestAliveOf(aliveBefore);
      g.player.object.updateMatrixWorld(true);
      g.tracker.update(g.world, g.camera);                  // one post-render tracker pass
      steps.push({
        wasTarget, droppedImmediately,
        aliveCount: aliveBefore.length,
        targetIsAlive: !!g.tracker.target && g.tracker.target.alive,
        targetMatchesExpected: g.tracker.target === expectedNearest,
        nullWhileAliveExist: aliveBefore.length > 0 && g.tracker.target === null,
      });
    }

    // Pool-recycle hole: relaunch a new fighter (the pool very likely hands
    // back the just-freed C instance) and confirm the tracker does NOT
    // silently point at it -- selection is only ever set by cycle()/#acquire.
    const D = mk(300, 0);
    g.world.rebuildHash();
    const targetStillNullAfterRespawn = g.tracker.target === null;
    const recycledSameObject = D === C;

    return { steps, targetStillNullAfterRespawn, recycledSameObject };
  });
  j4.steps.forEach((s, i) => {
    check(!s.wasTarget || s.droppedImmediately === true,
          `J4a-${i} tracker.target is dropped to null synchronously the instant its current selection dies`,
          JSON.stringify(s));
    check(!s.nullWhileAliveExist,
          `J4b-${i} tracker never sits null while an enemy is alive (after one post-render pass)`, JSON.stringify(s));
    if (s.aliveCount > 0) {
      check(s.targetIsAlive, `J4c-${i} re-acquired target is alive`, JSON.stringify(s));
      check(s.targetMatchesExpected, `J4d-${i} re-acquired target is the nearest surviving fighter`, JSON.stringify(s));
    }
  });
  check(j4.targetStillNullAfterRespawn,
        'J4e pool-recycle hole: a fighter relaunched into a freed (possibly reused) object does not silently ' +
        'inherit the dropped selection', JSON.stringify(j4));

  // --- J5 (Task D): the approach speed floor is continuous across the blend
  // band -- no single-tick/step jump anywhere in the rising portion -- and
  // still reaches (and holds at) the floor well beyond it. Measured by
  // Aitken's delta-squared extrapolation of 3 consecutive ticks of the
  // exponential damp toward a target held fixed by pinning distance/state
  // each tick, which recovers Enemy#update's implied target speed exactly
  // without needing CFG.enemies.accel (module-scoped, unreachable here).
  const j5 = await jp.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.diff.set('MEDIUM');
    g.spawner.pending = false; g.spawner.clear();
    const fwd = g.player._fwd.clone().normalize();

    const e = g.spawner.pool.get();
    e.position.copy(g.player.position).addScaledVector(fwd, 1000);
    e.reset(g.ctx, 1e9, 1, null, 0);
    e.health.max = 1e9; e.health.cur = 1e9;
    g.world.add(e);
    g.world.rebuildHash();

    // Re-read g.player.position LIVE every tick (never a stale snapshot): the
    // player cruises forward every tick even at rest (SPEC 3), so a captured
    // position drifts out from under a multi-tick loop like this one and
    // silently corrupts "dist" for every sample after the first.
    const targetAt = dist => {
      const s = [];
      for (let i = 0; i < 3; i++) {
        e.setState('APPROACH');
        e.position.copy(g.player.position).addScaledVector(fwd, dist);
        g.tick(1 / 60);
        s.push(e.speed);
      }
      const denom = s[0] - 2 * s[1] + s[2];
      return Math.abs(denom) < 1e-9 ? s[2] : (s[0] * s[2] - s[1] * s[1]) / denom;
    };

    // Coarse geometric bracket for the rising band (avoids d<~10, which would
    // put the fixed test position inside the player/enemy collision radius).
    const coarseDists = [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800];
    const coarse = coarseDists.map(d => ({ d, t: targetAt(d) }));
    const lo = Math.min(...coarse.map(c => c.t)), hi = Math.max(...coarse.map(c => c.t));
    const tol = Math.max(0.05, (hi - lo) * 0.01);
    let dLow = coarse[0].d, dHigh = coarse[coarse.length - 1].d;
    for (const c of coarse) if (c.t <= lo + tol) dLow = c.d;
    for (let i = coarse.length - 1; i >= 0; i--) if (coarse[i].t >= hi - tol) dHigh = coarse[i].d;

    // Fine linear sweep across (and a little past) the discovered band.
    const N = 40, span = dHigh - dLow, pad = Math.max(20, span * 0.1);
    const fine = [];
    for (let i = 0; i <= N; i++) {
      const d = Math.max(1, dLow - pad + (span + 2 * pad) * (i / N));
      fine.push({ d, t: targetAt(d) });
    }
    let maxStep = 0, monotoneViolation = 0;
    for (let i = 1; i < fine.length; i++) {
      const step = fine[i].t - fine[i - 1].t;
      if (step > maxStep) maxStep = step;
      if (step < -tol) monotoneViolation++;
    }
    const range = hi - lo;

    // Well beyond the band: must sit at the floor and stay there.
    const farD = dHigh + span + 2000;
    const farTarget = targetAt(farD);

    // Independent live measurement of the floor: reset() sets a FRESH
    // enemy's speed directly to the floor ("spawn already closing"), so read
    // it straight off reset() before any tick touches it.
    const e2 = g.spawner.pool.get();
    e2.reset(g.ctx, 1, 1, null, 0);
    const freshFloor = e2.speed;
    e2.dispose();
    e.dispose();

    return { coarse, lo, hi, range, dLow, dHigh, maxStep, monotoneViolation, farD, farTarget, freshFloor };
  });
  check(j5.range > 1,
        'J5 setup: the coarse sweep found a real rising band between a low and a high plateau',
        JSON.stringify({ lo: j5.lo, hi: j5.hi, dLow: j5.dLow, dHigh: j5.dHigh }));
  check(j5.monotoneViolation === 0,
        'J5a approach floor target speed is non-decreasing with distance across the fine sweep',
        `monotoneViolation=${j5.monotoneViolation}`);
  check(j5.maxStep <= j5.range * 0.25 + 0.1,
        'J5b approach floor is continuous across the blend band -- no single-tick/step jump anywhere in the fine sweep',
        `maxStep=${j5.maxStep.toFixed(3)}, range=${j5.range.toFixed(3)} (cap = 25% of range = ${(j5.range * 0.25).toFixed(3)})`);
  const farTol = Math.max(0.5, j5.range * 0.02);
  check(Math.abs(j5.farTarget - j5.hi) < farTol,
        'J5c approach floor target speed reaches (and holds at) the floor well beyond fireRange+approachBlend',
        `farTarget=${j5.farTarget.toFixed(3)} at d=${j5.farD.toFixed(0)}, plateau hi=${j5.hi.toFixed(3)} (tol ${farTol.toFixed(3)})`);
  check(Math.abs(j5.freshFloor - j5.hi) < farTol,
        'J5d sweep-measured floor matches a freshly-reset enemy\'s own spawn-time floor speed (cross-check, no hardcoded CFG literal)',
        `freshFloor=${j5.freshFloor.toFixed(3)}, sweep hi=${j5.hi.toFixed(3)} (tol ${farTol.toFixed(3)})`);

  check(jErrs.length === 0, 'J6 no console errors during the M3.5 targeting-fix checks',
        jErrs.slice(0, 3).join(' | ') || 'clean');

  await ctxJ.close();

  /* ================= K. FX/core batching regression guard + radar counts (post-refactor) =====
   * FX and core rendering are now batched (ParticleBatch for sparks/booms, one InstancedMesh
   * per debris shard, one InstancedMesh per core type) specifically because the PREVIOUS
   * per-effect Points/Mesh design pushed real combat past the SPEC 11 120 draw-call cap
   * (measured mean 121.5, p95 155, max 165). Draw-call NUMBERS are perf-gatekeeper's job on
   * real Chrome -- SwiftShader is not valid for that -- but the underlying scene-graph
   * property IS checkable headlessly: only objects with actual renderable geometry
   * (Mesh/Points/InstancedMesh/Sprite) cost a draw call, and that subset must stay CONSTANT
   * as live bursts/debris/cores rise, however many are on screen.
   *
   * Note on scope, found while building this: raw scene.children.length is NOT that
   * property, and DOES grow with core count -- every Core, alive or not, is still added to
   * World.entities via World.add(), which unconditionally does scene.add(e.object); Core's
   * object is an empty, non-rendering THREE.Object3D transform node (matrixAutoUpdate=false),
   * so it costs zero draw calls but IS one more scene.children entry. Measured directly: 60
   * core drops -> scene.children +60, but the Mesh/Points/InstancedMesh/Sprite subset +0.
   * K1 below filters to that drawable subset rather than asserting on raw children, which
   * would be a false requirement for cores (bursts and debris, having no Entity/scene
   * presence at all, contribute 0 to either count).
   */
  const ctxK = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const kp = await ctxK.newPage();
  const kErrs = [];
  kp.on('console', m => { if (m.type() === 'error') kErrs.push(m.text()); });
  kp.on('pageerror', e => kErrs.push('pageerror: ' + e.message.split('\n')[0]));
  await kp.goto(URL, { waitUntil: 'load' });
  await kp.waitForTimeout(1500);
  await kp.evaluate(HARNESS);

  // --- K1: drawable scene-graph size does not grow with live burst/debris/core count ---
  const drawGraph = await kp.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.spawner.pending = false; g.spawner.clear();
    const drawableCount = () =>
      g.scene.children.filter(o => o.isMesh || o.isPoints || o.isInstancedMesh || o.isSprite).length;
    const before = { children: g.scene.children.length, drawable: drawableCount() };

    const pos = g.player.position.clone().addScaledVector(g.player._fwd, 200);
    const V = g.player.position.constructor;
    for (let i = 0; i < 60; i++) g.fx.spark(pos);             // beyond CFG.fx.spark.pool -- pools overflow-tolerate
    for (let i = 0; i < 30; i++) g.fx.explode(pos);           // each also drops several debris chunks
    for (let i = 0; i < 60; i++) g.cores.drop(pos, new V(0, 0, 0));
    g.fx.sync(); g.cores.sync(g.camera);                       // the once-per-render-frame batch build

    const after = { children: g.scene.children.length, drawable: drawableCount() };
    return {
      before, after,
      liveBursts: g.fx.sparkBursts.length + g.fx.boomBursts.length,
      liveDebris: g.fx.debris.length,
      livePickups: g.world.tagged('pickup').size,
    };
  });
  check(drawGraph.liveBursts >= 60 && drawGraph.liveDebris > 0 && drawGraph.livePickups >= 60,
        'K1 setup: genuinely many live bursts/debris/cores exist at once (not a vacuous check)',
        JSON.stringify(drawGraph));
  check(drawGraph.after.drawable === drawGraph.before.drawable,
        'K1 drawable scene children (Mesh/Points/InstancedMesh/Sprite -- the SPEC 11 draw-call ' +
        'proxy) do not grow with live burst/debris/core count: batching cannot silently regress ' +
        'to one object per effect',
        JSON.stringify(drawGraph));
  check(drawGraph.after.children - drawGraph.before.children === drawGraph.livePickups,
        'K1 note: raw scene.children DOES grow, by exactly the live pickup count -- each Core ' +
        'is still its own (non-rendering) transform node added via World.add(); expected, and ' +
        'why K1 above filters to the drawable subset instead of raw children.length',
        JSON.stringify(drawGraph));

  // --- K2: radar reports the same in-range contact counts as before the FX/core batching
  // pass (SPEC 8) -- drawing moved to baked/instanced canvases and batched fillRect calls,
  // but the underlying counting logic (world.tagged(...) + the local-frame in-range test)
  // is untouched. One of each contact type, all deliberately well within radar.range.
  const radarPost = await kp.evaluate(() => {
    const g = window.__game;
    g.relaunch(); window.__h.godMode();
    g.spawner.pending = false; g.spawner.clear();
    const V = g.player.position.constructor;
    const fwd = g.player._fwd.clone().normalize();
    const right = new V(1, 0, 0).applyQuaternion(g.player.object.quaternion);
    const inR = 300;   // comfortably inside the default radar.range

    for (let i = 0; i < 3; i++) {
      const e = g.spawner.pool.get();
      e.position.copy(g.player.position).addScaledVector(fwd, inR).addScaledVector(right, i * 20);
      e.reset(g.ctx, 3, 1, null, 0);
      e.vel.set(0, 0, 0);
      g.world.add(e);
    }
    window.__h.enemyShootPlayer();     // parks one enemy bolt right at the player -- well in range
    for (let i = 0; i < 3; i++) {
      g.cores.drop(g.player.position.clone().addScaledVector(fwd, inR + i * 5), new V(0, 0, 0));
    }
    g.world.rebuildHash();
    g.radar.acc = 0; g.radar.tick(1);   // force an immediate draw

    const q = g.player.object.quaternion;
    const rfwd = new V(0, 0, -1).applyQuaternion(q), rright = new V(1, 0, 0).applyQuaternion(q);
    const inRange = e => {
      const rel = e.position.clone().sub(g.player.position);
      return Math.hypot(rel.dot(rright), rel.dot(rfwd)) <= g.radar.range;
    };
    let expectEnemies = 0; for (const e of window.__h.enemies()) if (inRange(e)) expectEnemies++;
    let expectAst = 0; for (const a of g.world.tagged('asteroid')) if (a.alive && inRange(a)) expectAst++;
    let expectBolt = 0; for (const b of g.world.tagged('enemyProjectile')) if (b.alive && inRange(b)) expectBolt++;
    let expectCore = 0; for (const c of g.world.tagged('pickup')) if (c.alive && inRange(c)) expectCore++;

    return {
      counts: { ...g.radar.counts },
      expected: { enemies: expectEnemies, asteroids: expectAst, bolts: expectBolt, cores: expectCore },
    };
  });
  check(radarPost.expected.enemies > 0 && radarPost.expected.asteroids > 0 &&
        radarPost.expected.bolts > 0 && radarPost.expected.cores > 0,
        'K2 setup: genuine in-range contacts of all four kinds exist (not a vacuous check)',
        JSON.stringify(radarPost));
  check(radarPost.counts.enemies === radarPost.expected.enemies &&
        radarPost.counts.asteroids === radarPost.expected.asteroids &&
        radarPost.counts.bolts === radarPost.expected.bolts &&
        radarPost.counts.cores === radarPost.expected.cores,
        'K2 radar.counts (enemies/asteroids/bolts/cores) still matches the same in-range ' +
        'projection test post-batching (SPEC 8) -- drawing moved to baked/instanced canvases ' +
        'but the contact-counting logic did not',
        JSON.stringify(radarPost));

  check(kErrs.length === 0, 'K3 no console errors during the FX/core batching + radar checks',
        kErrs.slice(0, 3).join(' | ') || 'clean');

  await ctxK.close();

  console.log('\n================ SOLAR SAVERS ================');
  pass.forEach(p => console.log('  PASS  ' + p));
  fail.forEach(f => console.log('  FAIL  ' + f));
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED:', e); process.exit(2); });
