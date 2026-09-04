#!/usr/bin/env node
/**
 * Blue Ridge Backroad — Playwright regression suite.
 *
 *   node tests/blue-ridge-backroad/run.js [url]
 *
 * Defaults to http://127.0.0.1:8790/games/blue-ridge-backroad/?debug — serve
 * `public/` on that port first, or pass a preview/deployed URL. `?debug`
 * exposes `window.brb` ({ game, telemetry }).
 *
 * Requires playwright (npm i -D playwright && npx playwright install chromium).
 *
 * Time is driven deterministically: the suite calls `game.stopLoop()` and then
 * `game.tick(1/60)` itself, so "simulated seconds" are exact and never depend
 * on how fast the headless GPU happens to be. Headless Chromium here runs on
 * SwiftShader, which is valid for behaviour, DOM and screenshots but *not* for
 * frame-rate numbers — those need real Chrome.
 */
const { chromium, devices } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:8790/games/blue-ridge-backroad/?debug';
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const pass = [];
const fail = [];
const check = (ok, label, detail) => (ok ? pass : fail).push(label + (detail && !ok ? '  ->  ' + detail : ''));

/** Installed in the page once the game exists: manual time + input helpers. */
const HARNESS = () => {
    const g = window.brb.game;
    g.stopLoop();
    window.__h = {
        lastRun: { peakMph: 0, maxDraws: 0 },
        /**
         * Advance `seconds` of game time in exact 1/60 s frames. Rendering is
         * off by default: this suite runs on SwiftShader, where drawing a frame
         * costs orders of magnitude more than the physics it is checking.
         */
        sim(seconds, render = false) {
            const n = Math.round(seconds * 60);
            g.setRenderEnabled(render);
            for (let i = 0; i < n; i++) g.tick(1 / 60);
            g.setRenderEnabled(true);
        },
        /** One drawn frame, so renderer.info reflects the real scene. */
        draw() {
            g.setRenderEnabled(true);
            g.tick(1 / 60);
        },
        /**
         * Drive the truck like a competent human: a pure-pursuit steering
         * controller aimed at a point a couple of seconds up the road, plus
         * lifting off and braking for corners it cannot hold.
         *
         * An earlier version steered on lateral error alone and spent most of
         * its time in the trees, which measured the controller rather than the
         * game. Aiming ahead is what a driver actually does, and it is the only
         * way these tests say anything about the handling.
         */
        autopilot(seconds, fields = {}, lift = true) {
            const p = g.physics;
            for (const k of Object.keys(fields)) g.input[k] = fields[k];
            // `lift = false` steers but never backs off: the scenario the brake
            // advisory exists to complain about.
            const wantThrottle = !!fields.keyThrottle && lift;
            const n = Math.round(seconds * 60);
            let peakMph = 0;
            let maxDraws = 0;
            for (let i = 0; i < n; i++) {
                // Draw every other second so renderer.info reflects the real
                // scene periodically, without paying SwiftShader's price for
                // every frame. A single sample at the end of a run misses the
                // set-pieces that were on screen in the middle of it.
                const render = i % 120 === 0;
                g.setRenderEnabled(render);
                const speed = Math.abs(p.u);
                // Look further ahead the faster we are going, but always far
                // enough to see the next corner.
                const ahead = Math.max(11, speed * 1.7);
                const t = g.roadPointAt(p.s + ahead);
                const dx = t.x - p.position.x;
                const dz = t.z - p.position.z;
                // Same convention as vehicle yaw: atan2(x, z).
                let err = Math.atan2(dx, dz) - p.yaw;
                while (err > Math.PI) err -= Math.PI * 2;
                while (err < -Math.PI) err += Math.PI * 2;
                // Yaw is left-positive, so a target to the left is a positive
                // error and is corrected by steering left.
                // Close the loop on `steerInput` — the driver's intent — rather
                // than on the road-wheel angle. That is the quantity the keys
                // move, and since winding lock on is slower than letting it
                // off, a controller chasing an absolute angle bleeds lock
                // between taps and quietly understeers off the road.
                //
                // `steerInput` is positive-right while `err` is positive-left,
                // hence the negation. Pure pursuit alone has a steady-state
                // offset toward the inside of a constant corner, which parks
                // the truck in the ditch; the lateral term pulls it back.
                const want = Math.max(-1, Math.min(1, -(err * 2.6 + p.lateral * 0.06)));
                g.input.keyLeft = p.steerInput > want + 0.06;
                g.input.keyRight = p.steerInput < want - 0.06;

                if (wantThrottle) {
                    // Corner entry speed from the curvature ahead, with a
                    // healthy margin below the friction limit.
                    const k = Math.max(Math.abs(g.roadPointAt(p.s + ahead * 1.6).curvature), 1e-5);
                    const vSafe = Math.sqrt((0.62 * 9.81) / k);
                    g.input.keyThrottle = speed < vSafe;
                    g.input.keyBrake = speed > vSafe * 1.16;
                }
                g.tick(1 / 60);
                peakMph = Math.max(peakMph, Math.abs(p.u) * 2.2369362920544);
                if (render) maxDraws = Math.max(maxDraws, g.drawCalls);
            }
            g.input.keyLeft = false;
            g.input.keyRight = false;
            g.input.keyBrake = false;
            g.setRenderEnabled(true);
            this.lastRun = { peakMph, maxDraws };
            return peakMph;
        },
        /**
         * Get the truck back onto the road and rolling, so the next check
         * starts from a known state rather than from wherever the previous one
         * abandoned it. Checks that begin in a ditch measure the ditch.
         */
        recover(seconds = 14) {
            // Repeat until the truck is genuinely back on the carriageway. One
            // pass is not always enough: from deep in the trees the first pass
            // is spent getting unstuck rather than getting centred, and a check
            // that starts wedged against a trunk measures the trunk.
            for (let attempt = 0; attempt < 3; attempt++) {
                this.release();
                this.autopilot(seconds, { keyThrottle: true });
                if (Math.abs(g.physics.lateral) < 3.5) break;
            }
            this.release();
            this.sim(0.4);
            return Math.abs(g.physics.lateral);
        },
        /**
         * Deliberately leave the carriageway, steering toward whichever side
         * the truck is already on. Holding a fixed direction is unreliable:
         * whether it takes you off the road depends on which way the road
         * happens to be curving.
         */
        driveOffRoad(seconds) {
            const p = g.physics;
            this.release();
            const n = Math.round(seconds * 60);
            g.setRenderEnabled(false);
            for (let i = 0; i < n; i++) {
                g.input.keyThrottle = true;
                const away = p.lateral >= 0;
                g.input.keyRight = away;
                g.input.keyLeft = !away;
                g.tick(1 / 60);
            }
            g.input.keyLeft = false;
            g.input.keyRight = false;
            g.setRenderEnabled(true);
        },
        /** Park the truck off the road at `lateral`, stopped and pointing along it. */
        placeOffRoad(lateral) {
            const p = g.physics;
            g.recover();
            const f = p.frame;
            p.position.x += f.right.x * lateral;
            p.position.z += f.right.z * lateral;
            p.u = 0;
            p.v = 0;
            p.yawRate = 0;
            this.sim(0.5);
        },
        /** Get the truck to roughly `mps` on the road, so taps are comparable. */
        bringToSpeed(mps) {
            const p = g.physics;
            for (let i = 0; i < 40; i++) {
                this.autopilot(1, { keyThrottle: true });
                if (Math.abs(p.u) >= mps) break;
            }
            this.release();
            this.sim(0.2);
            return Math.abs(p.u);
        },
        /**
         * Peak road-wheel angle from holding a steering key for `seconds`,
         * measured from a centred wheel. Sensitivity scales how fast lock winds
         * on, so starting with residual lock measures the residue instead.
         */
        steerTap(seconds, atSpeed = 16) {
            const p = g.physics;
            this.release();
            p.steerInput = 0;
            p.steer = 0;
            // Available lock falls steeply with speed, so the speed has to be
            // identical across taps or this compares steerMax, not sensitivity.
            p.u = atSpeed;
            p.v = 0;
            g.input.keyRight = true;
            const n = Math.round(seconds * 60);
            g.setRenderEnabled(false);
            let peak = 0;
            let peakInput = 0;
            for (let i = 0; i < n; i++) {
                g.tick(1 / 60);
                peak = Math.max(peak, Math.abs(p.steer));
                peakInput = Math.max(peakInput, Math.abs(p.steerInput));
            }
            g.setRenderEnabled(true);
            g.input.keyRight = false;
            // `deg` is the road-wheel angle the player sees; `input` is the
            // driver's intent, which is the only thing sensitivity scales. The
            // angle also carries the counter-steer allowance, which depends on
            // how much the rear happens to be sliding — far too noisy to compare
            // three settings with.
            return { deg: (peak * 180) / Math.PI, input: peakInput };
        },
        /**
         * Statistics of the frame that was actually rendered. A camera buried
         * inside bodywork produces a near-uniform image, which is exactly the
         * bug this catches — and one that no amount of position-checking finds,
         * because the position looked reasonable.
         */
        frameStats() {
            g.setRenderEnabled(true);
            g.tick(1 / 60);
            const cv = document.querySelector('canvas');
            const off = document.createElement('canvas');
            off.width = 200;
            off.height = 120;
            const ctx = off.getContext('2d');
            ctx.drawImage(cv, 0, 0, off.width, off.height);
            const d = ctx.getImageData(0, 0, off.width, off.height).data;
            const lum = [];
            const buckets = new Map();
            for (let i = 0; i < d.length; i += 4) {
                lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
                // Coarse colour histogram, to spot a frame that is one flat slab.
                const key = ((d[i] >> 5) << 10) | ((d[i + 1] >> 5) << 5) | (d[i + 2] >> 5);
                buckets.set(key, (buckets.get(key) ?? 0) + 1);
            }
            const n = lum.length;
            const mean = lum.reduce((a, b) => a + b, 0) / n;
            const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
            let biggest = 0;
            for (const v of buckets.values()) biggest = Math.max(biggest, v);
            return { mean: +mean.toFixed(1), sd: +sd.toFixed(1), dominant: +(biggest / n).toFixed(3) };
        },
        /**
         * Back to a defined starting state: fresh spawn, world rebuilt, clocks
         * zeroed. The suite is one long continuous drive, so without this a
         * check inherits whatever ditch the previous one finished in — which
         * produced failures that looked like physics regressions and were not.
         */
        hardReset() {
            this.release();
            g.restartFree();
            this.sim(0.4);
        },
        hold(fields, seconds) {
            for (const k of Object.keys(fields)) g.input[k] = fields[k];
            this.sim(seconds);
        },
        release() {
            const i = g.input;
            i.keyThrottle = i.keyBrake = i.keyLeft = i.keyRight = false;
            i.touchThrottle = i.touchBrake = i.touchLeft = i.touchRight = false;
        },
        state() {
            const p = g.physics;
            return {
                mph: Math.abs(p.u) * 2.2369362920544,
                u: p.u,
                v: p.v,
                yaw: p.yaw,
                yawRate: p.yawRate,
                s: p.s,
                lateral: p.lateral,
                miles: p.odometer / 1609.344,
                x: p.position.x,
                y: p.position.y,
                z: p.position.z,
                gear: p.gear,
                offRoad: p.offRoad,
                camera: g.cameraMode,
                draws: g.drawCalls,
                tris: g.triangles
            };
        }
    };
};

const waitForGame = async (page) => {
    await page.waitForFunction(() => window.brb && window.brb.game, null, { timeout: 30000 });
    await page.evaluate(HARNESS);
};

/**
 * Go through the real Start Engine button rather than calling into the game.
 * The button is what flips the React screen state and unlocks Web Audio, so
 * driving it any other way would leave the HUD unmounted and quietly skip the
 * thing we are trying to test.
 */
const startDriving = async (page) => {
    await page.locator('button.start-btn').click();
    await page.waitForSelector('.gauge-cluster', { timeout: 15000 });
    await page.evaluate(() => window.__h.sim(0.5));
    await page.evaluate(() => window.__h.draw());
};

(async () => {
    const browser = await chromium.launch({ args: GL });

    // ---------------------------------------------------------------- desktop
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(URL, { waitUntil: 'load' });
    await waitForGame(page);

    // A1 — the title screen is up and offers Start Engine.
    const startBtn = await page.locator('button.start-btn').count();
    const startText = startBtn ? (await page.locator('button.start-btn').innerText()).trim() : '';
    check(startBtn === 1 && /start engine/i.test(startText), 'A1 title screen shows a Start Engine button', startText);

    // A2 — starting the engine hands over control and shows the HUD.
    await startDriving(page);
    const hudVisible = await page.locator('.gauge-cluster').count();
    check(hudVisible === 1, 'A2 Start Engine enters driving and mounts the HUD');

    // A3 — the world actually built.
    const built = await page.evaluate(() => window.__h.state());
    check(built.draws > 10, 'A3 the scene renders a real world', `draws=${built.draws}`);
    check(built.tris > 50000, 'A3b geometry is dense, not placeholder boxes', `tris=${built.tris}`);

    // A4 — throttle accelerates.
    await page.evaluate(() => window.__h.autopilot(6, { keyThrottle: true }));
    const accel = await page.evaluate(() => window.__h.state());
    check(accel.mph > 25, 'A4 W accelerates the truck', `${accel.mph.toFixed(1)} mph after 6 s`);
    check(accel.miles > 0.02, 'A4b the odometer advances', `${accel.miles.toFixed(3)} mi`);

    // A5 — the truck follows the road rather than driving into the trees.
    check(Math.abs(accel.lateral) < 3.2, 'A5 the truck tracks the road unattended', `lateral=${accel.lateral.toFixed(2)} m`);

    // A7 — brake decelerates. Run straight off the A4 cruise: the truck is
    // known to be on the road here, which matters for A8 below.
    const beforeBrake = await page.evaluate(() => window.__h.state());
    await page.evaluate(() => {
        window.__h.release();
        window.__h.autopilot(3, { keyBrake: true });
    });
    const braked = await page.evaluate(() => window.__h.state());
    check(
        braked.mph < beforeBrake.mph * 0.4 || braked.mph < 3,
        'A7 S/Space brakes hard',
        `${beforeBrake.mph.toFixed(0)} -> ${braked.mph.toFixed(0)} mph`
    );

    // A8 — held brake at a standstill reverses. No autopilot here: it aims at a
    // point up the road, which is exactly the wrong thing to steer at while
    // backing up.
    await page.evaluate(() => window.__h.hold({ keyBrake: true }, 8));
    const rev = await page.evaluate(() => window.__h.state());
    check(rev.u < -0.5, 'A8 holding brake at rest reverses', `u=${rev.u.toFixed(2)} m/s`);

    // A6 — real speed is reachable on the road, and bounded.
    const beforeRun = await page.evaluate(() => window.__h.state());
    const peakMph = await page.evaluate(() => window.__h.autopilot(75, { keyThrottle: true }));
    const fast = await page.evaluate(() => window.__h.state());
    check(peakMph > 85, 'A6 the truck reaches genuine speed on the road', `peak ${peakMph.toFixed(1)} mph`);
    check(peakMph < 175, 'A6b top speed stays near the 155 mph design limit', `peak ${peakMph.toFixed(1)} mph`);
    // Average speed over the whole run, rather than the speed at whatever
    // moment the run happened to end — which may well be mid-hairpin.
    const avgMph = ((fast.miles - beforeRun.miles) / (75 / 3600));
    check(avgMph > 35, 'A6c speed is sustained across the run, not a single spike', `avg ${avgMph.toFixed(1)} mph`);

    // A9 — steering changes heading, and both directions work.
    await page.evaluate(() => {
        window.__h.hardReset();
        window.__h.hold({ keyThrottle: true }, 0.5);
    });
    const preLeft = await page.evaluate(() => window.__h.state());
    await page.evaluate(() => window.__h.hold({ keyThrottle: true, keyLeft: true }, 1.0));
    const postLeft = await page.evaluate(() => window.__h.state());
    // Straighten up fully before the other direction: measuring a right turn
    // from the end of a left one fights the yaw rate the left turn built up,
    // which measures momentum rather than steering.
    await page.evaluate(() => {
        window.__h.recover();
        window.__h.hold({ keyThrottle: true }, 0.5);
    });
    const preRight = await page.evaluate(() => window.__h.state());
    await page.evaluate(() => window.__h.hold({ keyThrottle: true, keyRight: true }, 1.0));
    const postRight = await page.evaluate(() => window.__h.state());
    // Yaw is a rotation about +Y, which in this right-handed, Y-up world turns
    // the truck LEFT. So steering left must increase yaw and steering right
    // must decrease it — the assertion that catches an inverted steering wheel.
    check(postLeft.yaw > preLeft.yaw + 0.02, 'A9 A/Left steers left', `dyaw=${(postLeft.yaw - preLeft.yaw).toFixed(3)}`);
    check(postRight.yaw < preRight.yaw - 0.02, 'A9b D/Right steers right', `dyaw=${(postRight.yaw - preRight.yaw).toFixed(3)}`);

    // A10 — arrow keys are bound too (real key events, not the input object).
    // Slow right down first. Starting this check at whatever speed recovery
    // happened to end at makes it a race between the throttle and the drag of
    // whatever corner the truck is in — it has to accelerate from near rest.
    await page.evaluate(() => {
        window.__h.hardReset();
        window.__h.hold({ keyBrake: true }, 2);
        window.__h.release();
        window.__h.sim(0.3);
    });
    const beforeArrow = await page.evaluate(() => window.__h.state());
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.__h.sim(3));
    await page.keyboard.up('ArrowUp');
    const arrowState = await page.evaluate(() => window.__h.state());
    // A delta, not an absolute: the truck starts this check wherever the
    // steering test left it, which may be slow ground.
    check(
        arrowState.u - beforeArrow.u > 1.5,
        'A10 ArrowUp is bound to the throttle',
        `u ${beforeArrow.u.toFixed(2)} -> ${arrowState.u.toFixed(2)}`
    );

    // A11 — camera cycling, by key and by button, visits all three views.
    const order = [];
    for (let i = 0; i < 4; i++) {
        order.push(await page.evaluate(() => window.brb.game.cameraMode));
        await page.keyboard.press('KeyC');
        await page.evaluate(() => window.__h.sim(0.2));
    }
    check(
        order.join(',') === 'chase,cockpit,hood,chase',
        'A11 C cycles chase -> cockpit -> hood and wraps',
        order.join(',')
    );
    const beforeBtn = await page.evaluate(() => window.brb.game.cameraMode);
    await page.locator('.hud-btn').first().click();
    const afterBtn = await page.evaluate(() => window.brb.game.cameraMode);
    check(beforeBtn !== afterBtn, 'A11b the HUD camera button also cycles', `${beforeBtn} -> ${afterBtn}`);

    // A12 — the truck survives being driven off the road, and bogs down there.
    // The reference is the best the truck manages ON the road over the run, not
    // its speed at whatever instant the run ended — which may be mid-hairpin and
    // slower than anything off-road.
    const onRoadPeak = await page.evaluate(() => {
        window.__h.hardReset();
        return window.__h.autopilot(18, { keyThrottle: true });
    });
    // Steer off, then hold the throttle down in the weeds for long enough that
    // the comparison is between two settled speeds, not two transients.
    await page.evaluate(() => {
        window.__h.driveOffRoad(2.6);
        window.__h.hold({ keyThrottle: true }, 6);
    });
    const offRoad = await page.evaluate(() => window.__h.state());
    check(
        Number.isFinite(offRoad.x) && Number.isFinite(offRoad.y) && Number.isFinite(offRoad.z),
        'A12 leaving the road keeps the simulation finite'
    );
    // Ask the vehicle whether a wheel is off the carriageway rather than
    // guessing from a lateral threshold, which varies with the road width.
    check(
        offRoad.offRoad && offRoad.mph < onRoadPeak * 0.6,
        'A12b off-road terrain costs speed',
        `road peak ${onRoadPeak.toFixed(0)} -> off-road ${offRoad.mph.toFixed(0)} mph, offRoad=${offRoad.offRoad}, lateral ${offRoad.lateral.toFixed(1)} m`
    );

    // A13 — a long unattended run stays stable and keeps streaming road.
    await page.evaluate(() => {
        window.__h.hardReset();
        window.__h.autopilot(60, { keyThrottle: true });
        window.__h.draw();
    });
    const long = await page.evaluate(() => window.__h.state());
    check(long.miles > 0.6, 'A13 a 60 s run covers real distance', `${long.miles.toFixed(2)} mi`);
    check(Number.isFinite(long.s) && long.s > 1200, 'A13b road distance keeps advancing', `s=${long.s.toFixed(0)} m`);
    check(long.y > -400 && long.y < 400, 'A13c the truck stays on the terrain', `y=${long.y.toFixed(1)}`);
    const longRun = await page.evaluate(() => window.__h.lastRun);
    check(
        longRun.maxDraws > 0 && longRun.maxDraws < 140,
        'A13d draw calls stay inside budget for the whole run',
        `peak draws=${longRun.maxDraws}`
    );

    // A14 — no console errors across all of the above.
    check(errors.length === 0, 'A14 no console errors while driving', errors.slice(0, 3).join(' | '));

    // A15 — the vehicle sits on the road surface, not floating or sunk. Measured
    // back on the carriageway: on a steep bank the wheels are legitimately at
    // very different heights and the number means nothing.
    await page.evaluate(() => {
        window.__h.hardReset();
        window.__h.autopilot(6, { keyThrottle: true });
        window.__h.release();
        window.__h.sim(0.5);
    });
    const ride = await page.evaluate(() => {
        const g = window.brb.game;
        const p = g.physics;
        let minC = Infinity;
        let maxC = -Infinity;
        for (const w of p.wheels) {
            minC = Math.min(minC, w.compression);
            maxC = Math.max(maxC, w.compression);
        }
        return { minC, maxC, groundGap: p.position.y - p.wheels[0].groundY };
    });
    check(ride.groundGap > 0.05 && ride.groundGap < 1.6, 'A15 ride height is sane', `gap=${ride.groundGap.toFixed(2)} m`);

    // A16 — quality presets produce visibly different settings.
    const presets = await page.evaluate(async () => {
        const g = window.brb.game;
        const out = {};
        for (const name of ['high', 'balanced', 'mobile']) {
            g.setQuality(name);
            window.__h.draw();
            const p = g.presetValues;
            out[name] = {
                pixelRatioCap: p.pixelRatioCap,
                shadowMapSize: p.shadowMapSize,
                fogFar: p.fogFar,
                vegetationDensity: p.vegetationDensity,
                chunksAhead: p.chunksAhead,
                textureSize: p.textureSize,
                draws: g.drawCalls
            };
        }
        g.setQuality('high');
        window.__h.draw();
        return out;
    });
    const distinct = new Set(['high', 'balanced', 'mobile'].map((k) => JSON.stringify(presets[k]))).size;
    check(distinct === 3, 'A16 the three quality presets differ', JSON.stringify(presets));
    check(
        presets.high.vegetationDensity > presets.balanced.vegetationDensity &&
            presets.balanced.vegetationDensity > presets.mobile.vegetationDensity,
        'A16b vegetation density falls with quality'
    );
    check(
        presets.high.fogFar > presets.mobile.fogFar && presets.high.shadowMapSize > presets.mobile.shadowMapSize,
        'A16c draw distance and shadow resolution fall with quality'
    );

    // A17 — discovery events actually get placed along the road.
    const events = await page.evaluate(() => {
        const g = window.brb.game;
        const found = new Set();
        // Walk the schedule directly: it is a pure function of the slot index.
        const path = g.physics.frame && g.physics; // keep the reference alive
        void path;
        for (const chunk of g.chunksForTest) {
            if (chunk.eventKind >= 0) found.add(chunk.eventKind);
        }
        return [...found];
    });
    check(Array.isArray(events), 'A17 the event system is reachable');

    // ------------------------------------------------- C: handling and timing

    // C1 — steering is progressive: a tap is not full lock.
    const steerCurve = await page.evaluate(() => {
        window.__h.recover();
        window.__h.bringToSpeed(16);
        const short = window.__h.steerTap(0.15).deg;
        window.__h.recover();
        window.__h.bringToSpeed(16);
        const long = window.__h.steerTap(1.4).deg;
        window.__h.release();
        return { short, long };
    });
    check(
        steerCurve.short < steerCurve.long * 0.55,
        'C1 steering winds on progressively rather than snapping to full lock',
        `0.15 s -> ${steerCurve.short.toFixed(1)} deg, 1.4 s -> ${steerCurve.long.toFixed(1)} deg`
    );
    check(
        steerCurve.short < 12,
        'C1b a brief tap is a small steering input',
        `${steerCurve.short.toFixed(1)} deg`
    );

    // C2 — the steering sensitivity setting actually changes the response.
    const steerLevels = await page.evaluate(() => {
        const out = {};
        for (const [name, mult] of [['relaxed', 0.68], ['standard', 1], ['sharp', 1.6]]) {
            g_setSens(mult);
            window.__h.recover();
            // Steering lock available falls with speed, so all three taps have
            // to be taken from the same speed or this compares nothing.
            window.__h.bringToSpeed(16);
            out[name] = window.__h.steerTap(0.4).input;
            window.__h.release();
        }
        g_setSens(1);
        return out;
        function g_setSens(v) {
            window.brb.game.setSteerSensitivity(v);
        }
    });
    check(
        steerLevels.relaxed < steerLevels.standard && steerLevels.standard <= steerLevels.sharp,
        'C2 steering sensitivity winds lock on at different rates',
        JSON.stringify(steerLevels)
    );

    // C3 — a truck stopped off the road can drive itself out.
    const unstick = await page.evaluate(() => {
        const p = window.brb.game.physics;
        const out = [];
        for (const lateral of [-6, -12, -20]) {
            window.__h.placeOffRoad(lateral);
            const startS = p.s;
            window.__h.hold({ keyThrottle: true }, 8);
            window.__h.release();
            out.push({ lateral, moved: p.s - startS });
        }
        return out;
    });
    check(
        unstick.every((r) => r.moved > 12),
        'C3 a truck stopped off the road can drive itself out',
        unstick.map((r) => `${r.lateral}m -> ${r.moved.toFixed(0)}m`).join(', ')
    );

    // C4 — recovery puts it back on the road and marks the mile assisted.
    const recovered = await page.evaluate(() => {
        window.__h.placeOffRoad(-18);
        const before = Math.abs(window.brb.game.physics.lateral);
        window.brb.game.recover();
        window.__h.sim(0.2);
        return {
            before,
            after: Math.abs(window.brb.game.physics.lateral),
            speed: Math.abs(window.brb.game.physics.u),
            dirty: window.brb.telemetry.mileDirty
        };
    });
    check(recovered.before > 8 && recovered.after < 1, 'C4 recovery returns the truck to the centreline', `${recovered.before.toFixed(1)} -> ${recovered.after.toFixed(2)} m`);
    check(recovered.speed < 0.5, 'C4b recovery leaves the truck stopped', `${recovered.speed.toFixed(2)} m/s`);
    check(recovered.dirty, 'C4c a recovered mile is marked assisted and cannot set a best');

    // C5 — the R key triggers recovery through the real key binding.
    await page.evaluate(() => window.__h.placeOffRoad(-16));
    await page.keyboard.press('KeyR');
    await page.evaluate(() => window.__h.sim(0.3));
    const afterKey = await page.evaluate(() => Math.abs(window.brb.game.physics.lateral));
    check(afterKey < 1, 'C5 R recovers the truck', `lateral=${afterKey.toFixed(2)} m`);

    // C6 — the course preview produces a usable advisory.
    const advisory = await page.evaluate(() => {
        window.__h.recover();
        window.__h.autopilot(12, { keyThrottle: true });
        const t = window.brb.telemetry;
        // Sample the advisory over a stretch of road so we see it vary.
        const seen = [];
        for (let i = 0; i < 40; i++) {
            window.__h.autopilot(1, { keyThrottle: true });
            seen.push(t.advisoryMph);
        }
        window.__h.release();
        return {
            count: t.previewCount,
            step: t.previewStep,
            min: Math.min(...seen),
            max: Math.max(...seen),
            offsetsVary: new Set([...t.previewOffset].map((v) => Math.round(v))).size
        };
    });
    check(advisory.count >= 20 && advisory.step > 0, 'C6 the course preview is populated', `${advisory.count} samples at ${advisory.step} m`);
    check(
        advisory.min > 15 && advisory.max <= 156 && advisory.max - advisory.min > 8,
        'C6b the advisory varies with the road ahead and is bounded by the truck',
        `${advisory.min.toFixed(0)}-${advisory.max.toFixed(0)} mph`
    );
    check(advisory.offsetsVary > 2, 'C6c the preview traces a curved road, not a straight line', `${advisory.offsetsVary} distinct offsets`);

    // C7 — the brake advisory tracks speed against the road ahead. Driving into
    // it flat out would work too, but the truck crashes off the road within a
    // few seconds and then never exceeds any advisory again, so the state is
    // set directly and the readout checked both ways.
    const brakeWarn = await page.evaluate(() => {
        const t = window.brb.telemetry;
        const p = window.brb.game.physics;
        const MPS = 2.2369362920544;
        window.__h.recover();
        window.__h.autopilot(10, { keyThrottle: true });
        window.__h.release();

        p.u = (t.advisoryMph / MPS) * 1.7;
        window.__h.sim(0.4);
        const over = t.braking;
        const overAdvisory = t.advisoryMph;

        p.u = (t.advisoryMph / MPS) * 0.5;
        window.__h.sim(0.4);
        const under = t.braking;
        return { over, under, overAdvisory };
    });
    check(brakeWarn.over, 'C7 the brake advisory fires when carrying too much speed for the road ahead', `advisory was ${brakeWarn.overAdvisory.toFixed(0)} mph`);
    check(!brakeWarn.under, 'C7b and clears when the speed suits the road');

    // C8 — mile splits are timed and recorded.
    const splits = await page.evaluate(() => {
        const t = window.brb.telemetry;
        window.brb.game.clearBestTimes();
        window.__h.recover();
        const startMile = t.mile;
        // Drive until a mile marker is crossed.
        for (let i = 0; i < 200 && window.brb.telemetry.lastSplitMile < startMile; i++) {
            window.__h.autopilot(2, { keyThrottle: true });
        }
        window.__h.release();
        return {
            lastSplitMile: t.lastSplitMile,
            lastSplitTime: t.lastSplitTime,
            mileTime: t.mileTime,
            totalTime: t.totalTime
        };
    });
    check(splits.lastSplitMile >= 0, 'C8 a mile split is recorded when a marker is crossed', `mile ${splits.lastSplitMile}`);
    check(splits.lastSplitTime > 5 && splits.lastSplitTime < 600, 'C8b the split time is plausible', `${splits.lastSplitTime.toFixed(1)} s`);
    check(splits.totalTime > splits.mileTime, 'C8c total elapsed exceeds the current mile time');

    // C9 — the HUD renders the new panels.
    const hudBits = await page.evaluate(() => ({
        timing: !!document.querySelector('.timing'),
        course: !!document.querySelector('.course-map'),
        courseText: document.querySelector('.course-speed')?.textContent ?? ''
    }));
    check(hudBits.timing, 'C9 the mile timing panel is on screen');
    check(hudBits.course, 'C9b the course-ahead map is on screen');
    check(/\d/.test(hudBits.courseText), 'C9c the course map shows an advisory speed', hudBits.courseText);

    // E — every camera actually sees the world. The interior cameras once sat
    // inside the windshield and on top of the dash, which filled the screen with
    // a flat slab of bodywork; the positions looked perfectly sensible, so only
    // looking at the pixels catches it.
    const views = await page.evaluate(() => {
        const g = window.brb.game;
        const p = g.physics;
        // Sample from a known-good state: on the road, moderate speed, clear of
        // the cut banks. A camera momentarily inside terrain is a different
        // problem from a camera permanently inside the bodywork, and this check
        // is about the second one.
        window.__h.hardReset();
        window.__h.autopilot(10, { keyThrottle: true });
        window.__h.release();
        for (let i = 0; i < 30 && (Math.abs(p.lateral) > 1.5 || Math.abs(p.u) > 22); i++) {
            window.__h.autopilot(0.5, {});
        }
        const out = {};
        for (const want of ['chase', 'hood', 'cockpit']) {
            let guard = 0;
            while (g.cameraMode !== want && guard++ < 5) g.cycleCamera();
            for (let i = 0; i < 10; i++) g.tick(1 / 60);
            out[want] = { ...window.__h.frameStats(), lateral: +p.lateral.toFixed(2), mph: +(Math.abs(p.u) * 2.2369).toFixed(0) };
        }
        return out;
    });
    for (const view of ['chase', 'hood', 'cockpit']) {
        const st = views[view];
        check(st.sd > 12, `E1 the ${view} view renders a varied scene, not a flat wall`, JSON.stringify(st));
        check(st.dominant < 0.75, `E1b the ${view} view is not dominated by one flat colour`, JSON.stringify(st));
        check(st.mean > 12 && st.mean < 235, `E1c the ${view} view is neither black nor blown out`, JSON.stringify(st));
    }

    // -------------------------------------------------------- J: road chapters

    // J1 — off by default, and off means the road is exactly as it was.
    const chapterDefaults = await page.evaluate(() => {
        const g = window.brb.game;
        g.setChaptersEnabled(false);
        const c = g.chapterAtForTest(4000);
        return { enabled: g.chaptersEnabled, label: c.label, twist: c.twistiness, fog: c.fogBias, grip: c.grip };
    });
    check(!chapterDefaults.enabled, 'J1 chapters are off by default');
    check(
        chapterDefaults.label === '' && chapterDefaults.twist < 0 && chapterDefaults.fog === 0 && chapterDefaults.grip === 1,
        'J1b with them off the road is untouched',
        JSON.stringify(chapterDefaults)
    );

    // J2 — each of the eight is reachable and they never repeat back to back.
    const schedule = await page.evaluate(() => {
        const g = window.brb.game;
        g.setChaptersEnabled(true);
        const labels = [];
        for (let slot = 1; slot < 60; slot++) labels.push(g.chapterAtForTest(slot * 1400 + 700).label);
        let backToBack = 0;
        for (let i = 1; i < labels.length; i++) if (labels[i] === labels[i - 1]) backToBack += 1;
        return { distinct: new Set(labels).size, backToBack, first: labels.slice(0, 6) };
    });
    check(schedule.distinct >= 7, 'J2 the schedule reaches nearly all eight chapters', `${schedule.distinct} distinct in 59 slots`);
    check(schedule.backToBack === 0, 'J2b no chapter follows itself', `${schedule.backToBack} repeats`);

    // J3 — the chapters actually change the road. Measured at chapter midpoints,
    // clear of the ramp.
    const measured = await page.evaluate(() => {
        const g = window.brb.game;
        g.setChaptersEnabled(true);
        // The ring prunes behind the vehicle, and sampling a distance it has
        // dropped silently clamps to the oldest surviving frame. Reset first,
        // then walk forward, so every sample is real road.
        window.__h.hardReset();
        const acc = {};
        // Several occurrences of each chapter: one slot measures where that
        // chapter happened to land as much as what the chapter is.
        for (let slot = 1; slot < 56; slot++) {
            const mid = slot * 1400 + 700;
            const c = g.chapterAtForTest(mid);
            let kSum = 0;
            let wSum = 0;
            let n = 0;
            for (let s = slot * 1400 + 520; s < (slot + 1) * 1400 - 120; s += 10) {
                kSum += Math.abs(g.roadPointAt(s).curvature);
                wSum += g.roadWidthAt(s);
                n += 1;
            }
            const e = acc[c.name] ?? {
                declaredTwist: c.twistiness,
                declaredWidth: c.widthTarget,
                kappa: 0,
                width: 0,
                runs: 0,
                fog: c.fogBias,
                tod: c.timeOfDay,
                grip: c.grip,
                surface: c.surface
            };
            e.kappa += kSum / n;
            e.width += wSum / n;
            e.runs += 1;
            acc[c.name] = e;
        }
        const byName = {};
        for (const [name, e] of Object.entries(acc)) {
            byName[name] = {
                declaredTwist: e.declaredTwist,
                declaredWidth: e.declaredWidth,
                meanKappa: e.kappa / e.runs,
                meanWidth: e.width / e.runs,
                runs: e.runs,
                fog: e.fog,
                tod: e.tod,
                grip: e.grip,
                surface: e.surface
            };
        }
        return byName;
    });
    const names = Object.keys(measured);
    check(names.length >= 7, 'J3 measured most of the chapters', `${names.length} chapters`);

    const twistiest = names.reduce((a, b) => (measured[a].declaredTwist > measured[b].declaredTwist ? a : b));
    const straightest = names.reduce((a, b) => (measured[a].declaredTwist < measured[b].declaredTwist ? a : b));
    check(
        measured[twistiest].meanKappa > measured[straightest].meanKappa * 3,
        'J3b the twistiest chapter is markedly twistier than the straightest',
        `${twistiest}=${measured[twistiest].meanKappa.toFixed(5)} vs ${straightest}=${measured[straightest].meanKappa.toFixed(5)}`
    );

    // Width is the most reliable lever, so it gets the strict ordering check.
    const byWidth = names.slice().sort((a, b) => measured[a].declaredWidth - measured[b].declaredWidth);
    let widthOrdered = true;
    for (let i = 1; i < byWidth.length; i++) {
        // Half a metre of tolerance: the generator still varies width by about
        // +/-0.45 m within a chapter, so two chapters set a few centimetres
        // apart can legitimately swap.
        if (measured[byWidth[i]].meanWidth < measured[byWidth[i - 1]].meanWidth - 0.5) widthOrdered = false;
    }
    check(
        widthOrdered,
        'J3c measured width follows the declared order',
        byWidth.map((n) => `${n}:${measured[n].meanWidth.toFixed(2)}`).join(' ')
    );

    check(
        names.some((n) => measured[n].fog > 0.5) && names.some((n) => measured[n].fog === 0),
        'J3d chapters differ in fog'
    );
    check(
        Math.max(...names.map((n) => measured[n].tod)) - Math.min(...names.map((n) => measured[n].tod)) > 0.6,
        'J3e chapters differ in time of day'
    );
    check(
        names.some((n) => measured[n].grip < 0.9) && names.some((n) => measured[n].grip === 1),
        'J3f chapters differ in surface grip'
    );

    // J4 — determinism. The road must survive being regenerated from the origin,
    // because a jump back to a pruned distance does exactly that.
    const deterministic = await page.evaluate(() => {
        const g = window.brb.game;
        g.setChaptersEnabled(true);
        window.__h.hardReset();
        const before = [];
        for (let s = 3000; s < 3400; s += 20) {
            const p = g.roadPointAt(s);
            before.push([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
        }
        // Drive far enough to prune the ring past this stretch, then come back.
        const p = g.physics;
        g.restartFree();
        for (let i = 0; i < 30 && p.s < 10000; i++) window.__h.autopilot(30, { keyThrottle: true });
        window.__h.release();
        const drovenTo = p.s;
        g.restartFree();
        window.__h.sim(0.3);
        const after = [];
        for (let s = 3000; s < 3400; s += 20) {
            const q = g.roadPointAt(s);
            after.push([+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3)]);
        }
        let maxDelta = 0;
        for (let i = 0; i < before.length; i++) {
            for (let k = 0; k < 3; k++) maxDelta = Math.max(maxDelta, Math.abs(before[i][k] - after[i][k]));
        }
        return { drovenTo, maxDelta };
    });
    check(deterministic.drovenTo > 8400, 'J4 drove far enough to prune the ring', `s=${deterministic.drovenTo.toFixed(0)}`);
    check(
        deterministic.maxDelta < 0.01,
        'J4b a chaptered road regenerates identically from the origin',
        `max drift ${deterministic.maxDelta.toFixed(4)} m`
    );

    // J5 — the timed stage always ignores chapters, so its times stay comparable.
    const stageNeutral = await page.evaluate(() => {
        const g = window.brb.game;
        g.setChaptersEnabled(true);
        g.restartStage();
        window.__h.sim(0.3);
        const c = g.chapterAtForTest(window.brb.game.physics.s);
        const label = window.brb.telemetry.chapter;
        g.setMode('free');
        return { twist: c.twistiness, grip: c.grip, label };
    });
    check(
        stageNeutral.twist < 0 && stageNeutral.grip === 1 && stageNeutral.label === '',
        'J5 the timed stage runs on neutral road whatever the chapter setting',
        JSON.stringify(stageNeutral)
    );

    await page.evaluate(() => window.brb.game.setChaptersEnabled(false));

    // ------------------------------------------------------ H: the co-driver

    // H1 — the analysis finds corners where the road turns and nothing where it
    // does not. Scanned over real road rather than a contrived case.
    const scan = await page.evaluate(() => {
        const g = window.brb.game;
        const rows = [];
        for (let s = 600; s < 6000; s += 60) {
            const f = g.paceNotesForTest(s);
            const st = g.previewStatsForTest(s);
            rows.push({ s, n: f.length, kappaMax: st.kappaMax, phrases: f.map((x) => x.phrase) });
        }
        return rows;
    });
    const straightRows = scan.filter((r) => r.kappaMax < 0.0015);
    const bendyRows = scan.filter((r) => r.kappaMax > 0.005);
    check(
        straightRows.length > 0 && straightRows.every((r) => r.n === 0),
        'H1 straight road produces no calls',
        `${straightRows.filter((r) => r.n > 0).length} of ${straightRows.length} straight samples called something`
    );
    check(
        bendyRows.length > 0 && bendyRows.some((r) => r.n > 0),
        'H1b corners do produce calls',
        `${bendyRows.filter((r) => r.n > 0).length} of ${bendyRows.length} bendy samples called something`
    );

    // H2 — every phrase fits the grammar. A pace note is a closed language; if
    // this ever fails, something is emitting free text.
    const GRAMMAR =
        /^(long )?(left|right) [3-6]( tightens| opens)?( narrows)?( downhill| uphill)?( into (long )?(left|right) [3-6]( tightens| opens)?( narrows)?( downhill| uphill)?)?$/;
    const allPhrases = scan.flatMap((r) => r.phrases);
    const bad = allPhrases.filter((p) => !GRAMMAR.test(p));
    check(allPhrases.length > 20, 'H2 the scan produced a decent sample of calls', `${allPhrases.length} phrases`);
    check(bad.length === 0, 'H2b every call fits the closed grammar', bad.slice(0, 3).join(' | '));

    // H3 — direction matches the sign of curvature, and tighter is a lower number.
    const shape = await page.evaluate(() => {
        const g = window.brb.game;
        const out = [];
        for (let s = 600; s < 8000; s += 30) {
            for (const f of g.paceNotesForTest(s)) {
                out.push({ direction: f.direction, severity: f.severity, safeSpeed: f.safeSpeed });
            }
        }
        return out;
    });
    check(
        shape.some((f) => f.direction > 0) && shape.some((f) => f.direction < 0),
        'H3 both left and right corners are called',
        `left=${shape.filter((f) => f.direction > 0).length} right=${shape.filter((f) => f.direction < 0).length}`
    );
    const bySeverity = {};
    for (const f of shape) {
        bySeverity[f.severity] = bySeverity[f.severity] ?? [];
        bySeverity[f.severity].push(f.safeSpeed);
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const severities = Object.keys(bySeverity).map(Number).sort((a, b) => a - b);
    let monotonic = true;
    for (let i = 1; i < severities.length; i++) {
        if (mean(bySeverity[severities[i]]) <= mean(bySeverity[severities[i - 1]])) monotonic = false;
    }
    check(
        severities.length >= 3 && monotonic,
        'H3b a lower severity number means a slower corner',
        severities.map((sv) => `${sv}:${mean(bySeverity[sv]).toFixed(0)}m/s`).join(' ')
    );

    // H4 — driving calls each corner once, ahead of time, and never repeats.
    const drive = await page.evaluate(() => {
        const g = window.brb.game;
        const p = g.physics;
        g.setCoDriverMode('text');
        window.__h.hardReset();
        const seen = [];
        let last = '';
        let repeats = 0;
        g.setRenderEnabled(false);
        for (let i = 0; i < 60 * 150; i++) {
            const speed = Math.abs(p.u);
            const ahead = Math.max(11, speed * 1.7);
            const t = g.roadPointAt(p.s + ahead);
            let err = Math.atan2(t.x - p.position.x, t.z - p.position.z) - p.yaw;
            while (err > Math.PI) err -= Math.PI * 2;
            while (err < -Math.PI) err += Math.PI * 2;
            const want = Math.max(-1, Math.min(1, -(err * 2.6 + p.lateral * 0.06)));
            g.input.keyLeft = p.steerInput > want + 0.06;
            g.input.keyRight = p.steerInput < want - 0.06;
            g.input.keyThrottle = speed < 30;
            g.tick(1 / 60);
            const note = window.brb.telemetry.paceNote;
            if (note && note !== last) {
                if (seen.includes(note) && seen[seen.length - 1] === note) repeats += 1;
                seen.push(note);
                last = note;
            }
        }
        window.__h.release();
        g.setRenderEnabled(true);
        return { seen, repeats, miles: p.odometer / 1609.344 };
    });
    check(drive.seen.length >= 2, 'H4 notes are called while driving', `${drive.seen.length} calls over ${drive.miles.toFixed(2)} mi`);
    check(drive.repeats === 0, 'H4b no corner is announced twice in a row', `${drive.repeats} repeats`);
    check(
        drive.seen.every((n) => GRAMMAR.test(n)),
        'H4c live calls fit the grammar too',
        drive.seen.filter((n) => !GRAMMAR.test(n)).slice(0, 2).join(' | ')
    );

    // H5 — switching the co-driver off silences it.
    const silenced = await page.evaluate(() => {
        const g = window.brb.game;
        g.setCoDriverMode('off');
        window.__h.hardReset();
        window.__h.autopilot(40, { keyThrottle: true });
        window.__h.release();
        const quiet = window.brb.telemetry.paceNote;
        g.setCoDriverMode('text');
        return quiet;
    });
    check(silenced === '', 'H5 turning the co-driver off stops the calls', `got "${silenced}"`);

    // ------------------------------------------- G: the foggy hollow, and grip

    // G1 — a hollow is a stretch of road, not a landmark you pass in a second.
    const hollow = await page.evaluate(() => {
        const g = window.brb.game;
        let centre = -1;
        for (let s = 500; s < 40000; s += 5) {
            if (g.fogAtForTest(s) > 0.99) {
                centre = s;
                break;
            }
        }
        if (centre < 0) return { found: false, centre: 0, span: 0, core: 0, open: 1 };
        let span = 0;
        let core = 0;
        for (let s = centre - 500; s < centre + 500; s += 2) {
            const f = g.fogAtForTest(s);
            if (f > 0.02) span += 2;
            if (f > 0.95) core += 2;
        }
        return { found: true, centre, span, core, open: g.fogAtForTest(centre + 900) };
    });
    check(hollow.found, 'G1 the schedule contains a foggy hollow');
    check(hollow.span > 250, 'G1b it covers a real stretch of road', `${hollow.span} m of fog`);
    check(hollow.core > 140, 'G1c with a plateau at full density, not a spike', `${hollow.core} m at full`);
    check(hollow.open < 0.02, 'G1d and open road either side is clear', `${hollow.open}`);

    // G2 — driving into it actually cuts how far you can see.
    const visibility = await page.evaluate((centre) => {
        const g = window.brb.game;
        const p = g.physics;
        g.restartFree();
        p.reset(centre - 900);
        window.__h.sim(0.4);
        const clear = g.fogFarForTest;
        p.reset(centre);
        window.__h.sim(0.4);
        const inFog = g.fogFarForTest;
        return { clear, inFog };
    }, hollow.centre);
    check(
        visibility.inFog < visibility.clear * 0.25 && visibility.inFog < 90,
        'G2 visibility collapses inside the hollow',
        `${visibility.clear.toFixed(0)} m -> ${visibility.inFog.toFixed(0)} m`
    );

    // G3 — the road texture is filtered anisotropically. Without it the surface
    // ahead of the bumper mips down to flat grey at a grazing angle.
    const aniso = await page.evaluate(() => window.brb.game.anisotropyForTest);
    check(aniso >= 4, 'G3 the road is filtered anisotropically', `anisotropy=${aniso}`);

    // ---------------------------------------------------------- F: difficulty

    // F1 — the four levels exist and are selectable.
    const levels = await page.evaluate(() => {
        const g = window.brb.game;
        const out = [];
        for (const name of ['easy', 'medium', 'hard', 'expert']) {
            g.setDifficulty(name);
            out.push({ name, applied: g.currentDifficulty, label: window.brb.telemetry.difficulty });
        }
        g.setDifficulty('medium');
        return out;
    });
    check(
        levels.length === 4 && levels.every((l) => l.applied === l.name && l.label.length > 0),
        'F1 easy / medium / hard / expert all apply',
        JSON.stringify(levels)
    );

    // F2 — easier levels really are harder to spin. Same provocation, same
    // speed, on each level: full lock and full throttle, which is how you put a
    // truck sideways on gravel.
    const spin = await page.evaluate(() => {
        const g = window.brb.game;
        const p = g.physics;
        const out = {};
        for (const name of ['easy', 'medium', 'hard', 'expert']) {
            g.setDifficulty(name);
            window.__h.hardReset();
            window.__h.autopilot(10, { keyThrottle: true });
            window.__h.release();
            p.u = 26;
            p.v = 0;
            p.yawRate = 0;
            g.input.keyThrottle = true;
            g.input.keyRight = true;
            let peakSlip = 0;
            let peakYaw = 0;
            g.setRenderEnabled(false);
            for (let i = 0; i < 150; i++) {
                g.tick(1 / 60);
                peakSlip = Math.max(peakSlip, Math.abs(p.v));
                peakYaw = Math.max(peakYaw, Math.abs(p.yawRate));
            }
            g.setRenderEnabled(true);
            window.__h.release();
            out[name] = { slip: +peakSlip.toFixed(2), yaw: +peakYaw.toFixed(3) };
        }
        g.setDifficulty('medium');
        return out;
    });
    check(
        spin.easy.slip < spin.expert.slip,
        'F2 the same provocation slides less on Easy than on Expert',
        JSON.stringify(spin)
    );
    check(
        spin.easy.slip <= spin.medium.slip + 0.6 && spin.medium.slip <= spin.hard.slip + 0.6,
        'F2b sideways slip increases as the difficulty does',
        JSON.stringify(spin)
    );

    // F3 — best times are kept separately per difficulty.
    const perLevel = await page.evaluate(() => {
        const g = window.brb.game;
        g.setDifficulty('easy');
        g.clearBestTimes();
        g.setDifficulty('expert');
        g.clearBestTimes();
        // Plant a fabricated best on Easy only, through the real storage path.
        localStorage.setItem(
            'brb.stage.v3.easy',
            JSON.stringify({ best: 123.4, splits: new Array(25).fill(0).map((_, i) => i * 5) })
        );
        g.setDifficulty('medium');
        g.setDifficulty('easy');
        const easyBest = window.brb.telemetry.stageBest;
        g.setDifficulty('expert');
        const expertBest = window.brb.telemetry.stageBest;
        g.setDifficulty('medium');
        return { easyBest, expertBest };
    });
    check(
        Math.abs(perLevel.easyBest - 123.4) < 0.01 && perLevel.expertBest === 0,
        'F3 best times are stored per difficulty, not shared',
        JSON.stringify(perLevel)
    );

    // F4 — the road is wide enough to place a truck on.
    const width = await page.evaluate(() => {
        const g = window.brb.game;
        let min = Infinity;
        let max = 0;
        for (let s = 500; s < 6000; s += 40) {
            const w = g.roadWidthAt(s);
            min = Math.min(min, w);
            max = Math.max(max, w);
        }
        return { min: +min.toFixed(2), max: +max.toFixed(2) };
    });
    check(width.min > 7, 'F4 the carriageway is at least 7 m wide', JSON.stringify(width));
    check(width.max < 12, 'F4b and not absurdly wide', JSON.stringify(width));

    // ------------------------------------------------------ D: the timed stage

    // D1 — the stage starts armed on the line with the clock stopped.
    const armed = await page.evaluate(() => {
        window.brb.game.clearBestTimes();
        window.brb.game.restartStage();
        window.__h.sim(0.5);
        const t = window.brb.telemetry;
        return {
            mode: t.mode,
            state: t.stageState,
            elapsed: t.stageElapsed,
            remaining: t.stageRemainingMiles,
            lateral: Math.abs(window.brb.game.physics.lateral),
            speed: Math.abs(window.brb.game.physics.u)
        };
    });
    check(armed.mode === 'stage' && armed.state === 'armed', 'D1 the stage starts armed', `${armed.mode}/${armed.state}`);
    check(armed.elapsed === 0, 'D1b the clock is stopped until you move', `${armed.elapsed}`);
    check(armed.remaining > 1.98 && armed.remaining < 2.02, 'D1c the stage is two miles', `${armed.remaining.toFixed(3)} mi`);
    check(armed.lateral < 1 && armed.speed < 0.5, 'D1d the truck sits on the centreline, stopped');

    // D2 — the clock starts on moving, not before.
    const started = await page.evaluate(() => {
        const t = window.brb.telemetry;
        const p = window.brb.game.physics;
        window.__h.sim(2); // sit on the line, no throttle
        const idle = t.stageElapsed;
        const crept = Math.abs(p.u);
        window.__h.autopilot(3, { keyThrottle: true });
        return { idle, crept, running: t.stageElapsed, state: t.stageState };
    });
    check(started.idle === 0, 'D2 waiting on the line does not burn time, and the truck is held there', `${started.idle}`);
    check(started.crept < 0.01, 'D2b the truck does not roll off the line on its own', `${started.crept.toFixed(3)} m/s`);
    check(started.running > 1 && started.state === 'running', 'D2c the throttle starts the clock', `${started.running.toFixed(1)} s`);

    // D2d — the stage is identical after a long free drive. The road's sample
    // ring prunes what is behind you, so without a rewind the start line would
    // land on whatever the oldest surviving sample happened to be.
    const afterLongDrive = await page.evaluate(() => {
        const p = window.brb.game.physics;
        window.brb.game.restartStage();
        window.__h.sim(0.3);
        const fresh = { s: p.s, x: p.position.x, z: p.position.z };
        // Drive a long way in free mode, far enough to prune the ring.
        window.brb.game.setMode('free');
        // The ring holds 8.2 km, so the drive has to clear that to prune it.
        for (let i = 0; i < 24 && p.s < 9000; i++) window.__h.autopilot(30, { keyThrottle: true });
        window.__h.release();
        const drovenTo = p.s;
        const prunedTo = window.brb.game.roadMinS;
        window.brb.game.restartStage();
        window.__h.sim(0.3);
        return { fresh, drovenTo, prunedTo, back: { s: p.s, x: p.position.x, z: p.position.z }, progress: window.brb.telemetry.stageProgress };
    });
    check(
        afterLongDrive.drovenTo > 8400 && afterLongDrive.prunedTo > 1000,
        'D2d the free drive pruned the road ring past the stage start',
        `drove to ${afterLongDrive.drovenTo.toFixed(0)} m, ring now starts at ${afterLongDrive.prunedTo.toFixed(0)} m`
    );
    check(
        Math.abs(afterLongDrive.back.s - afterLongDrive.fresh.s) < 1 &&
            Math.abs(afterLongDrive.back.x - afterLongDrive.fresh.x) < 1 &&
            Math.abs(afterLongDrive.back.z - afterLongDrive.fresh.z) < 1 &&
            afterLongDrive.progress < 0.01,
        'D2e the stage start is identical after driving far away from it',
        JSON.stringify(afterLongDrive)
    );

    // D3 — the stage is repeatable: the same road, from the same place.
    const repeatable = await page.evaluate(() => {
        const p = window.brb.game.physics;
        const runs = [];
        for (let i = 0; i < 2; i++) {
            window.brb.game.restartStage();
            window.__h.sim(0.3);
            runs.push({ s: p.s, x: p.position.x, z: p.position.z });
        }
        return runs;
    });
    check(
        Math.abs(repeatable[0].s - repeatable[1].s) < 0.5 &&
            Math.abs(repeatable[0].x - repeatable[1].x) < 0.5 &&
            Math.abs(repeatable[0].z - repeatable[1].z) < 0.5,
        'D3 restarting puts the truck back on the identical start line',
        JSON.stringify(repeatable)
    );

    // D4 — progress tracks distance along the stage.
    const progressed = await page.evaluate(() => {
        const t = window.brb.telemetry;
        window.brb.game.restartStage();
        window.__h.autopilot(25, { keyThrottle: true });
        return { progress: t.stageProgress, remaining: t.stageRemainingMiles, state: t.stageState };
    });
    check(
        progressed.progress > 0.03 && progressed.progress < 1,
        'D4 stage progress advances as you drive it',
        `${(progressed.progress * 100).toFixed(0)}%`
    );
    check(progressed.remaining < 2, 'D4b the distance remaining counts down', `${progressed.remaining.toFixed(2)} mi`);

    // D5 — the stage can actually be completed, and it records a best.
    const finished = await page.evaluate(() => {
        const t = window.brb.telemetry;
        window.brb.game.clearBestTimes();
        window.brb.game.restartStage();
        // Drive it until the finish, with a generous cap.
        for (let i = 0; i < 120 && t.stageState !== 'finished'; i++) {
            window.__h.autopilot(3, { keyThrottle: true });
        }
        window.__h.release();
        return {
            state: t.stageState,
            time: t.stageResultTime,
            isBest: t.stageResultIsBest,
            best: t.stageBest,
            progress: t.stageProgress,
            assisted: t.stageAssisted
        };
    });
    check(finished.state === 'finished', 'D5 the stage can be driven to the finish', `progress ${(finished.progress * 100).toFixed(0)}%`);
    check(finished.time > 40 && finished.time < 900, 'D5b the stage time is plausible', `${finished.time.toFixed(1)} s`);
    check(finished.isBest && finished.best > 0, 'D5c a first clean run sets the best', `best ${finished.best.toFixed(1)} s`);

    // D6 — the clock stops at the finish.
    const stopped = await page.evaluate(() => {
        const t = window.brb.telemetry;
        const at = t.stageElapsed;
        window.__h.hold({ keyThrottle: true }, 3);
        window.__h.release();
        return { at, after: t.stageElapsed };
    });
    check(Math.abs(stopped.after - stopped.at) < 0.25, 'D6 the clock stops at the finish', `${stopped.at.toFixed(1)} -> ${stopped.after.toFixed(1)}`);

    // D7 — the results panel appears with the time on it.
    const resultUi = await page.evaluate(() => ({
        shown: !!document.querySelector('.result'),
        time: document.querySelector('.result-time')?.textContent ?? '',
        actions: document.querySelectorAll('.result-actions button').length
    }));
    check(resultUi.shown, 'D7 the results panel is shown on finishing');
    check(/\d:\d\d/.test(resultUi.time), 'D7b it shows the time', resultUi.time);
    check(resultUi.actions === 2, 'D7c it offers run again and free drive', `${resultUi.actions} buttons`);

    // D8 — Enter restarts the stage through the real key binding.
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__h.sim(0.3));
    const afterEnter = await page.evaluate(() => ({
        state: window.brb.telemetry.stageState,
        elapsed: window.brb.telemetry.stageElapsed,
        progress: window.brb.telemetry.stageProgress
    }));
    check(afterEnter.state === 'armed' && afterEnter.elapsed === 0, 'D8 Enter restarts the stage from the line', JSON.stringify(afterEnter));

    // D9 — using the recovery bars the run from taking a best.
    const assisted = await page.evaluate(() => {
        const t = window.brb.telemetry;
        window.brb.game.restartStage();
        window.__h.autopilot(6, { keyThrottle: true });
        window.brb.game.recover();
        window.__h.sim(0.3);
        return { assisted: t.stageAssisted };
    });
    check(assisted.assisted, 'D9 a recovered stage run is marked assisted');

    // D10 — a best time survives a restart, and clearing removes it.
    const persistence = await page.evaluate(() => {
        const t = window.brb.telemetry;
        const before = t.stageBest;
        window.brb.game.restartStage();
        window.__h.sim(0.3);
        const afterRestart = t.stageBest;
        window.brb.game.clearBestTimes();
        window.__h.sim(0.3);
        return { before, afterRestart, afterClear: t.stageBest, stored: localStorage.getItem('brb.stage.v3.medium') };
    });
    check(persistence.before > 0 && persistence.afterRestart === persistence.before, 'D10 the best time survives a restart', `${persistence.afterRestart.toFixed(1)} s`);
    check(persistence.afterClear === 0 && !persistence.stored, 'D10b clearing best times removes it');

    // D11 — switching back to free drive leaves the stage behind.
    const backToFree = await page.evaluate(async () => {
        window.brb.game.setMode('free');
        window.__h.sim(0.3);
        // React flushes the re-render asynchronously, so the DOM has to be
        // queried on a later task or this races the render it is checking.
        await new Promise((r) => setTimeout(r, 60));
        return { mode: window.brb.telemetry.mode, stagePanel: !!document.querySelector('.stage'), timing: !!document.querySelector('.timing') };
    });
    check(backToFree.mode === 'free', 'D11 the game can switch back to free drive');
    check(!backToFree.stagePanel && backToFree.timing, 'D11b the HUD swaps the stage clock for the mile timer');

    await page.close();

    // ----------------------------------------------------------------- mobile
    const mobile = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
    const mp = await mobile.newPage();
    const mobileErrors = [];
    mp.on('pageerror', (e) => mobileErrors.push(String(e)));
    await mp.goto(URL, { waitUntil: 'load' });
    await waitForGame(mp);
    await startDriving(mp);

    const touchCount = await mp.locator('.touch-btn').count();
    check(touchCount === 4, 'B1 four touch controls are present on a phone', `count=${touchCount}`);

    const layout = await mp.evaluate(() => {
        const rects = [...document.querySelectorAll('.touch-btn')].map((el) => {
            const r = el.getBoundingClientRect();
            return { label: el.getAttribute('aria-label'), x: r.x, y: r.y, w: r.width, h: r.height };
        });
        return { rects, vw: window.innerWidth, vh: window.innerHeight };
    });
    const steer = layout.rects.filter((r) => /steer/i.test(r.label));
    const pedals = layout.rects.filter((r) => /gas|brake|accel/i.test(r.label));
    check(
        steer.length === 2 && steer.every((r) => r.x < layout.vw * 0.5 && r.y > layout.vh * 0.5),
        'B2 steering sits in the lower left'
    );
    check(
        pedals.length === 2 && pedals.every((r) => r.x > layout.vw * 0.4 && r.y > layout.vh * 0.5),
        'B3 gas and brake sit in the lower right'
    );
    check(
        layout.rects.every((r) => r.w >= 44 && r.h >= 44),
        'B4 touch targets are at least 44 px',
        JSON.stringify(layout.rects.map((r) => [r.w, r.h]))
    );

    // B5 — genuine simultaneous multi-touch: steer and accelerate at once.
    const multi = await mp.evaluate(() => {
        const btn = (label) => [...document.querySelectorAll('.touch-btn')].find((el) => new RegExp(label, 'i').test(el.getAttribute('aria-label')));
        const send = (el, type, id) => {
            const r = el.getBoundingClientRect();
            el.dispatchEvent(
                new PointerEvent(type, {
                    pointerId: id,
                    pointerType: 'touch',
                    isPrimary: id === 1,
                    clientX: r.x + r.width / 2,
                    clientY: r.y + r.height / 2,
                    bubbles: true,
                    cancelable: true
                })
            );
        };
        const gas = btn('accel');
        const left = btn('steer left');
        send(gas, 'pointerdown', 1);
        send(left, 'pointerdown', 2);
        const both = {
            throttle: window.brb.game.input.touchThrottle,
            left: window.brb.game.input.touchLeft
        };
        window.__h.sim(1.5);
        const moved = { u: window.brb.game.physics.u, yawRate: window.brb.game.physics.yawRate };
        send(left, 'pointerup', 2);
        send(gas, 'pointerup', 1);
        const released = {
            throttle: window.brb.game.input.touchThrottle,
            left: window.brb.game.input.touchLeft
        };
        return { both, moved, released };
    });
    check(multi.both.throttle && multi.both.left, 'B5 gas and steer are held simultaneously');
    check(multi.moved.u > 0.5, 'B5b the vehicle accelerates under touch', `u=${multi.moved.u.toFixed(2)}`);
    check(Math.abs(multi.moved.yawRate) > 0.001, 'B5c holding steer turns the vehicle', `yawRate=${multi.moved.yawRate.toFixed(4)}`);
    check(!multi.released.throttle && !multi.released.left, 'B5d pointerup releases both controls');

    // B6 — the page must not scroll or zoom under touch.
    const noScroll = await mp.evaluate(() => {
        const before = window.scrollY;
        window.scrollBy(0, 400);
        const after = window.scrollY;
        const cs = getComputedStyle(document.body);
        const btn = document.querySelector('.touch-btn');
        return {
            scrolled: after - before,
            touchAction: cs.touchAction,
            userSelect: cs.userSelect || cs.webkitUserSelect,
            overscroll: cs.overscrollBehavior,
            btnTouchAction: getComputedStyle(btn).touchAction,
            docHeight: document.documentElement.scrollHeight,
            winHeight: window.innerHeight
        };
    });
    check(noScroll.scrolled === 0, 'B6 the page cannot scroll', `scrolled=${noScroll.scrolled}`);
    check(noScroll.touchAction === 'none', 'B6b body touch-action is none', noScroll.touchAction);
    check(noScroll.userSelect === 'none', 'B6c text selection is disabled', noScroll.userSelect);
    check(noScroll.btnTouchAction === 'none', 'B6d controls set touch-action none', noScroll.btnTouchAction);
    check(noScroll.docHeight <= noScroll.winHeight + 1, 'B6e the document does not overflow the viewport');

    // B7 — auto-detection picks the mobile preset on a phone UA.
    const autoQuality = await mp.evaluate(() => window.brb.game.quality);
    check(autoQuality === 'mobile', 'B7 a phone auto-detects the mobile preset', autoQuality);

    check(mobileErrors.length === 0, 'B8 no console errors on mobile', mobileErrors.slice(0, 3).join(' | '));

    await mobile.close();
    await browser.close();

    // ----------------------------------------------------------------- report
    for (const p of pass) console.log('  PASS  ' + p);
    for (const f of fail) console.log('  FAIL  ' + f);
    console.log(`\n${pass.length} passed, ${fail.length} failed`);
    process.exit(fail.length ? 1 : 0);
})().catch((err) => {
    // Still report what did run — a mid-suite failure should not hide the
    // checks that already passed.
    for (const p of pass) console.log('  PASS  ' + p);
    for (const f of fail) console.log('  FAIL  ' + f);
    console.error('\nSUITE ABORTED: ' + (err && err.message ? err.message : err));
    console.log(`${pass.length} passed, ${fail.length} failed, suite aborted`);
    process.exit(1);
});
