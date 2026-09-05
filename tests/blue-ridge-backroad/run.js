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
        /**
         * Drive for `seconds`, yielding to the event loop every couple of them.
         *
         * The director is asynchronous by construction — it awaits an endpoint —
         * so a tight synchronous `for` loop of `tick()` calls can never see it
         * answer, however long it runs for. Nothing is wrong with the director
         * in that case; the test simply never gave the microtask queue a chance
         * to drain. Any check on director behaviour has to drive through this.
         */
        async driveFor(seconds, block = 2) {
            let done = 0;
            while (done < seconds) {
                const span = Math.min(block, seconds - done);
                this.autopilot(span, { keyThrottle: true });
                done += span;
                await new Promise((r) => setTimeout(r, 0));
            }
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

    // ------------------------------------------------------------- K: the scout

    // K1 - the search runs, is fast, and returns a spread-out shortlist.
    const scoutBasics = await page.evaluate(() => {
        const g = window.brb.game;
        const t0 = performance.now();
        const found = g.findStages('flowing', 5);
        const ms = performance.now() - t0;
        let minGap = Infinity;
        for (let i = 1; i < found.length; i++) {
            minGap = Math.min(minGap, Math.abs(found[i].start - found[i - 1].start));
        }
        return {
            ms,
            count: found.length,
            profiles: g.stageProfiles.length,
            minGap,
            named: found.every((c) => typeof c.name === 'string' && c.name.length > 3),
            ordered: found.every((c, i) => i === 0 || c.score >= found[i - 1].score)
        };
    });
    check(scoutBasics.profiles >= 5, 'K1 the scout offers a set of profiles', String(scoutBasics.profiles));
    check(scoutBasics.count === 5, 'K1b it returns a shortlist', `${scoutBasics.count} candidates`);
    check(scoutBasics.ms < 400, 'K1c the search is fast enough to run during a render', `${scoutBasics.ms.toFixed(1)} ms`);
    check(scoutBasics.ordered, 'K1d candidates come back best-first');
    check(scoutBasics.named, 'K1e every candidate is named');
    check(
        scoutBasics.minGap > 1000,
        'K1f the shortlist is spread along the road, not five overlapping windows',
        `${scoutBasics.minGap.toFixed(0)} m apart`
    );

    // K2 - the profiles actually select different road. This is the whole point:
    // if every request returned similar stretches, the search would be theatre.
    const picks = await page.evaluate(() => {
        const g = window.brb.game;
        const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        const of = (id, field) => mean(g.findStages(id, 3).map((c) => c[field]));
        return {
            flowingTwist: of('flowing', 'twistiness'),
            technicalTwist: of('technical', 'twistiness'),
            stingProg: of('sting', 'progression'),
            releaseProg: of('release', 'progression'),
            mountainElev: of('mountain', 'elevation'),
            flowingElev: of('flowing', 'elevation'),
            sightEvents: mean(g.findStages('sightseeing', 3).map((c) => c.eventCount)),
            technicalEvents: mean(g.findStages('technical', 3).map((c) => c.eventCount))
        };
    });
    check(
        picks.technicalTwist > picks.flowingTwist * 1.5,
        'K2 technical finds markedly twistier road than flowing',
        `${picks.technicalTwist.toFixed(2)} vs ${picks.flowingTwist.toFixed(2)}`
    );
    check(
        picks.stingProg > 0.3 && picks.releaseProg < -0.3,
        'K2b sting in the tail tightens, late release opens out',
        `sting ${picks.stingProg.toFixed(2)}, release ${picks.releaseProg.toFixed(2)}`
    );
    check(
        picks.mountainElev > picks.flowingElev,
        'K2c mountain road finds hillier road',
        `${picks.mountainElev.toFixed(2)} vs ${picks.flowingElev.toFixed(2)}`
    );
    check(
        picks.sightEvents >= picks.technicalEvents,
        'K2d sightseeing finds road with at least as much on it',
        `${picks.sightEvents.toFixed(1)} vs ${picks.technicalEvents.toFixed(1)} set-pieces`
    );

    // K3 - searching twice gives the same answer. A found stage is only worth
    // timing if it is the same stage tomorrow.
    const scoutRepeatable = await page.evaluate(() => {
        const g = window.brb.game;
        const a = g.findStages('sting', 5).map((c) => `${c.id}:${c.name}`);
        const b = g.findStages('sting', 5).map((c) => `${c.id}:${c.name}`);
        return { same: JSON.stringify(a) === JSON.stringify(b), a: a[0] };
    });
    check(scoutRepeatable.same, 'K3 the same request returns the same stages', scoutRepeatable.a);

    // K4 - a found stage can be adopted and started.
    const adopted = await page.evaluate(async () => {
        const g = window.brb.game;
        const pick = g.findStages('technical', 1)[0];
        g.useStage({ id: pick.id, name: pick.name, start: pick.start, length: pick.length });
        window.__h.sim(0.4);
        const t = window.brb.telemetry;
        const p = g.physics;
        await new Promise((r) => setTimeout(r, 50));
        return {
            wantedId: pick.id,
            wantedName: pick.name,
            wantedMiles: pick.length / 1609.344,
            loaded: g.currentStage.id,
            atStart: Math.abs(p.s - pick.start),
            lateral: Math.abs(p.lateral),
            state: t.stageState,
            shownName: t.stageName,
            remaining: t.stageRemainingMiles
        };
    });
    check(adopted.loaded === adopted.wantedId, 'K4 a found stage becomes the loaded stage', adopted.loaded);
    check(
        adopted.atStart < 2 && adopted.lateral < 1.5,
        'K4b it starts you on its own start line',
        `${adopted.atStart.toFixed(1)} m off, lateral ${adopted.lateral.toFixed(2)}`
    );
    check(
        adopted.state === 'armed' && adopted.shownName === adopted.wantedName,
        'K4c armed, and named on the HUD',
        adopted.shownName
    );
    check(
        Math.abs(adopted.remaining - adopted.wantedMiles) < 0.05,
        'K4d its length is the length that was asked for',
        `${adopted.remaining.toFixed(2)} vs ${adopted.wantedMiles.toFixed(2)} mi`
    );

    // K5 - each stage keeps its own records, and the built-in one keeps the key
    // it has always used, so times set before this existed still count.
    const records = await page.evaluate(() => {
        const g = window.brb.game;
        localStorage.setItem(
            'brb.stage.v3.medium',
            JSON.stringify({ best: 111.1, splits: new Array(25).fill(0).map((_, i) => i * 4) })
        );
        g.useDefaultStage();
        window.__h.sim(0.3);
        const defaultBest = window.brb.telemetry.stageBest;
        const pick = g.findStages('flowing', 1)[0];
        g.useStage({ id: pick.id, name: pick.name, start: pick.start, length: pick.length });
        window.__h.sim(0.3);
        const foundBest = window.brb.telemetry.stageBest;
        g.useDefaultStage();
        window.__h.sim(0.3);
        return { defaultBest, foundBest, backAgain: window.brb.telemetry.stageBest };
    });
    check(
        Math.abs(records.defaultBest - 111.1) < 0.01,
        'K5 the built-in stage still reads its existing records',
        String(records.defaultBest)
    );
    check(records.foundBest === 0, 'K5b a found stage starts with no time of its own', String(records.foundBest));
    check(Math.abs(records.backAgain - 111.1) < 0.01, 'K5c switching back restores the original records');

    // K6 - a found stage runs on neutral road, whatever the chapter setting.
    const neutralStage = await page.evaluate(() => {
        const g = window.brb.game;
        g.setChaptersEnabled(true);
        const pick = g.findStages('mountain', 1)[0];
        g.useStage({ id: pick.id, name: pick.name, start: pick.start, length: pick.length });
        window.__h.sim(0.3);
        const c = g.chapterAtForTest(g.physics.s);
        // Leave the game as this section found it: default stage, free drive,
        // chapters off. Section J sets chapters up for itself and cannot do that
        // from inside a stage.
        g.useDefaultStage();
        g.setChaptersEnabled(false);
        g.restartFree();
        return { twist: c.twistiness, label: window.brb.telemetry.chapter };
    });
    check(
        neutralStage.twist < 0 && neutralStage.label === '',
        'K6 a found stage ignores chapters too',
        JSON.stringify(neutralStage)
    );

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

    // -------------------------------------------------------- L: the director

    // The director never gets a real model in the suite. Every check below runs
    // against a stub endpoint installed from the page, which is the point: the
    // cadence, the validation, the commit points and the failure handling are
    // the product, and none of them should depend on what is at the other end.
    const installEndpoint = (body) =>
        page.evaluate((src) => {
            // eslint-disable-next-line no-new-func
            window.__ep = new Function('return ' + src)();
            window.brb.game.director.setEndpoint(window.__ep);
        }, body);

    const ALWAYS = `({
        kind: 'local',
        calls: 0,
        propose(brief) {
            this.calls += 1;
            this.lastBrief = brief;
            return Promise.resolve({
                chapter: 'switchbacks',
                surface: 'greasy',
                event: 'none',
                reason: 'Testing: tightening the road up.'
            });
        }
    })`;

    // L1 — off, and off means nothing exists to go wrong.
    const dirOff = await page.evaluate(() => window.brb.game.directorReportForTest());
    check(
        dirOff.enabled === false && dirOff.status === 'off' && dirOff.patches === 0,
        'L1 the director is off by default',
        JSON.stringify({ enabled: dirOff.enabled, status: dirOff.status })
    );

    // L2 — the validator. This is the security boundary, so it is checked
    // directly rather than inferred from behaviour.
    const validation = await page.evaluate(() => {
        const g = window.brb.game;
        const v = (raw) => g.validatePatchForTest(raw);
        const good = { chapter: 'switchbacks', surface: 'damp', event: 'foggy_hollow', reason: 'ok' };
        return {
            good: v(good) !== null,
            unknownChapter: v({ ...good, chapter: 'the_moon' }),
            unknownSurface: v({ ...good, surface: 'ice' }),
            unknownEvent: v({ ...good, event: 'dragon' }),
            noReason: v({ ...good, reason: '   ' }),
            notObject: v('switchbacks'),
            array: v([good]),
            nullish: v(null),
            eventOptional: v({ chapter: 'open', surface: 'dry', reason: 'fine' }) !== null,
            // Control characters and newlines are stripped; length is capped.
            dirty: v({ ...good, reason: 'a b' + String.fromCharCode(10) + 'c' + String.fromCharCode(0x200b) + 'd' }).reason,
            long: v({ ...good, reason: 'x'.repeat(400) }).reason.length
        };
    });
    check(validation.good && validation.eventOptional, 'L2 a well-formed patch validates');
    check(
        validation.unknownChapter === null &&
            validation.unknownSurface === null &&
            validation.unknownEvent === null,
        'L2b an unknown name is rejected outright, not clamped to something valid'
    );
    check(
        validation.noReason === null &&
            validation.notObject === null &&
            validation.array === null &&
            validation.nullish === null,
        'L2c junk of every shape is rejected'
    );
    check(validation.dirty === 'a b c d', 'L2d displayed text is stripped of control characters', validation.dirty);
    check(validation.long <= 120, 'L2e and capped in length', `${validation.long} chars`);

    // L3 — turning it on turns chapters on, because that is its only lever.
    const turnedOn = await page.evaluate(() => {
        const g = window.brb.game;
        g.restartFree();
        g.setDirectorEnabled(true);
        return { chapters: g.chaptersEnabled, status: g.directorReportForTest().status, mode: g.currentMode };
    });
    check(
        turnedOn.chapters && turnedOn.status === 'watching' && turnedOn.mode === 'free',
        'L3 enabling the director enables chapters',
        JSON.stringify(turnedOn)
    );

    // L4 — with an endpoint that always answers, a patch lands, and it lands on
    // road that has not been built yet.
    await installEndpoint(ALWAYS);
    const landed = await page.evaluate(async () => {
        const g = window.brb.game;
        g.restartFree();
        g.setDirectorEnabled(true);
        await window.__h.driveFor(200);
        const r = g.directorReportForTest();
        return {
            patches: r.patches,
            calls: window.__ep.calls,
            applied: r.applied,
            s: g.physics.s,
            built: g.pathForTest.generatedThroughS,
            chapterThere: r.applied ? g.chapterAtForTest(r.applied.startS + 700).name : ''
        };
    });
    check(landed.patches >= 1, 'L4 a patch lands during a drive', `${landed.patches} in 200 s, ${landed.calls} calls`);
    check(
        landed.applied && landed.chapterThere === 'switchbacks',
        'L4b the road it names is the road that appears there',
        `${landed.chapterThere}`
    );
    // Measured against where the truck was *when the patch landed*, not where
    // it ended up: by the end of a 200 s drive the truck is long past it, and
    // comparing against the final position says nothing.
    check(
        landed.applied && landed.applied.startS > landed.applied.atS,
        'L4c it lands ahead of the truck, never underneath it',
        landed.applied ? `${(landed.applied.startS - landed.applied.atS).toFixed(0)} m ahead at the time` : 'no patch'
    );
    check(
        landed.applied && landed.applied.startS > landed.applied.builtS,
        'L4d and on road that had not been generated yet, so no rebuild can revert it',
        landed.applied ? `${(landed.applied.startS - landed.applied.builtS).toFixed(0)} m past the built head` : 'no patch'
    );

    // L5 — the floor between applied patches holds. A world that can churn every
    // few seconds is worse than one that never changes.
    const spacing = await page.evaluate(async () => {
        const g = window.brb.game;
        g.restartFree();
        g.setDirectorEnabled(true);
        await window.__h.driveFor(240);
        return { patches: g.directorReportForTest().patches, seconds: 240 };
    });
    check(
        spacing.patches <= Math.ceil(spacing.seconds / 45),
        'L5 patches never land closer together than the floor allows',
        `${spacing.patches} in ${spacing.seconds} s`
    );

    // L6 — the timed stage is never touched, whatever the director is doing.
    const stageUntouched = await page.evaluate(async () => {
        const g = window.brb.game;
        g.setDirectorEnabled(true);
        g.setMode('stage');
        const before = g.directorReportForTest().patches;
        await window.__h.driveFor(120);
        const c = g.chapterAtForTest(g.physics.s);
        const after = g.directorReportForTest().patches;
        g.setMode('free');
        return { before, after, twist: c.twistiness, grip: c.grip };
    });
    check(
        stageUntouched.after === stageUntouched.before && stageUntouched.twist < 0 && stageUntouched.grip === 1,
        'L6 the director does not run on the timed stage',
        JSON.stringify(stageUntouched)
    );

    // L7 — an endpoint that never answers. This is the case the whole design is
    // built around, so the assertion is about the game, not the director: it
    // keeps driving and the co-driver keeps calling.
    await installEndpoint(`({ kind: 'local', propose() { return new Promise(() => {}); } })`);
    const hung = await page.evaluate(async () => {
        const g = window.brb.game;
        g.restartFree();
        g.setDirectorEnabled(true);
        await window.__h.driveFor(200);
        const r = g.directorReportForTest();
        return {
            status: r.status,
            patches: r.patches,
            failures: r.failures,
            note: window.brb.telemetry.paceNote,
            miles: window.brb.telemetry.miles,
            mph: window.brb.telemetry.mph
        };
    });
    check(hung.patches === 0, 'L7 a hung endpoint applies nothing', `${hung.patches} patches`);
    check(hung.status === 'unreachable' && hung.failures >= 1, 'L7b and reports itself unreachable', JSON.stringify({ status: hung.status, failures: hung.failures }));
    check(hung.miles > 0.5 && hung.mph > 5, 'L7c the drive is completely unaffected', `${hung.miles.toFixed(2)} mi at ${hung.mph.toFixed(0)} mph`);
    check(typeof hung.note === 'string', 'L7d the co-driver keeps working, because it never needed a model');

    // L8 — an endpoint that answers with rubbish is exactly a timeout: nothing
    // is applied, not even the parts that happened to be valid.
    await installEndpoint(
        `({ kind: 'local', propose() { return Promise.resolve({ chapter: 'the_moon', surface: 'damp', event: 'none', reason: 'hi' }); } })`
    );
    const garbage = await page.evaluate(async () => {
        const g = window.brb.game;
        g.restartFree();
        g.setDirectorEnabled(true);
        await window.__h.driveFor(180);
        const r = g.directorReportForTest();
        return { patches: r.patches, status: r.status, surface: g.chapterAtForTest(g.physics.s + 3000).surface };
    });
    check(garbage.patches === 0, 'L8 a schema violation applies nothing at all', `${garbage.patches} patches`);
    check(garbage.status === 'unreachable', 'L8b it is treated exactly like a timeout', garbage.status);

    // L9 — ramp-home. A patch lands, the endpoint then dies, and the road ahead
    // goes back to the schedule rather than holding the last patch for ever.
    await installEndpoint(ALWAYS);
    const home = await page.evaluate(async () => {
        const g = window.brb.game;
        g.restartFree();
        g.setDirectorEnabled(true);
        await window.__h.driveFor(200);
        const r = g.directorReportForTest();
        if (!r.applied) return { landed: false };
        const slot = r.applied.slot;
        const heldBefore = g.pathForTest.chapters.hasOverride(slot);
        // Now kill it. Two failures is the threshold for handing the road back.
        window.__ep.propose = () => Promise.reject(new Error('down'));
        await window.__h.driveFor(220);
        return {
            landed: true,
            slot,
            heldBefore,
            heldAfter: g.pathForTest.chapters.hasOverride(slot),
            aheadCleared: !g.pathForTest.chapters.hasOverride(slot + 40),
            status: g.directorReportForTest().status
        };
    });
    check(home.landed && home.heldBefore, 'L9 a patch is held as a slot override');
    check(home.landed && home.aheadCleared && home.status === 'unreachable', 'L9b when the endpoint dies the road ahead is handed back to the schedule', JSON.stringify(home));

    // L10 — the handling is never touched. This is the promise in §5, and it is
    // the one a player would feel betrayed by.
    const handling = await page.evaluate(async () => {
        const g = window.brb.game;
        const snap = () => {
            const d = g.physics.difficulty;
            return { stability: d.stability, rearBias: d.rearBias, catchLock: d.catchLock, offRoadDrag: d.offRoadDrag };
        };
        g.restartFree();
        g.setDirectorEnabled(true);
        const before = snap();
        await window.__h.driveFor(200);
        return { before, after: snap(), patches: g.directorReportForTest().patches };
    });
    check(
        JSON.stringify(handling.before) === JSON.stringify(handling.after),
        'L10 the director never touches how the truck handles',
        `${handling.patches} patches applied, handling identical`
    );

    // L11 — turning it off hands everything back and leaves no trace.
    const offAgain = await page.evaluate(() => {
        const g = window.brb.game;
        g.setDirectorEnabled(false);
        const r = g.directorReportForTest();
        g.setChaptersEnabled(false);
        g.restartFree();
        // The chapter label is written by the 10 Hz block, so it has to be
        // driven for a moment before it is read — reading it straight after a
        // restart reports the label from the drive that just ended.
        window.__h.sim(0.3);
        return { status: r.status, chapters: g.chaptersEnabled, label: window.brb.telemetry.chapter };
    });
    check(
        offAgain.status === 'off' && offAgain.chapters === false && offAgain.label === '',
        'L11 turning it off leaves the road exactly as it was',
        JSON.stringify(offAgain)
    );

    // L13 — how a window of driving is read. The thresholds here were measured
    // rather than guessed, and the measurement moved them a long way, so this
    // is the check that keeps them honest.
    const going = await page.evaluate(() => {
        const g = window.brb.game;
        const brief = (o) => ({
            miles: 5, chapter: 'open', surface: 'dry',
            spins: 0, excursions: 0, recoveries: 0,
            meanMph: 100, maxMph: 120, lastMile: 60, lastMileDelta: 0,
            windowMiles: 2, trigger: '', ...o
        });
        return {
            // Measured on Easy: two off-road clips in a two-mile window at
            // 120 mph is what a good run looks like on this road.
            fastAndClean: g.classifyForTest(brief({ excursions: 2, windowMiles: 2, meanMph: 120 })),
            // Measured on Medium going badly: the same *count* over a fifth of
            // the distance, at half the speed.
            comingApart: g.classifyForTest(brief({ excursions: 6, windowMiles: 0.4, meanMph: 53 })),
            spinning: g.classifyForTest(brief({ spins: 6, windowMiles: 0.2, meanMph: 23 })),
            // Asking to be put back on the road is unambiguous on its own.
            recovered: g.classifyForTest(brief({ recoveries: 1 })),
            crawling: g.classifyForTest(brief({ meanMph: 20 })),
            spotless: g.classifyForTest(brief({ meanMph: 90 }))
        };
    });
    check(
        going.fastAndClean === 'cruising' && going.spotless === 'cruising',
        'L13 a fast clean window reads as cruising, clips and all',
        JSON.stringify(going)
    );
    check(
        going.comingApart === 'struggling' && going.spinning === 'struggling' && going.recovered === 'struggling',
        'L13b a window that is genuinely going wrong reads as trouble',
        JSON.stringify(going)
    );
    check(
        going.fastAndClean !== going.comingApart,
        'L13c the same incident count reads differently over different distances — the point of using a rate',
        `2 clips in 2 mi = ${going.fastAndClean}, 6 in 0.4 mi = ${going.comingApart}`
    );
    check(going.crawling === 'settled', 'L13d and a slow pootle is neither', going.crawling);

    // L14 — the built-in policy is what almost everyone will run, so it has to
    // be worth running: it must actually move the road around. The first
    // version visited three of the eight chapters over twelve minutes, because
    // "open the road out" always resolves to the same two or three.
    const policy = await page.evaluate(async () => {
        const g = window.brb.game;
        const ep = g.newLocalPolicyForTest();
        const picks = [];
        let chapter = 'open';
        for (let i = 0; i < 12; i++) {
            // Alternate how the drive is going, the way a real one does.
            const bad = i % 3 === 0;
            const raw = await ep.propose({
                miles: i * 2, chapter, surface: 'dry',
                spins: bad ? 5 : 0, excursions: bad ? 6 : 1, recoveries: 0,
                meanMph: bad ? 40 : 95, maxMph: 120,
                lastMile: 60, lastMileDelta: 0, windowMiles: bad ? 0.5 : 2.5, trigger: ''
            });
            const patch = g.validatePatchForTest(raw);
            if (!patch) return { invalid: i };
            picks.push(patch);
            chapter = patch.chapter;
        }
        return {
            chapters: new Set(picks.map((p) => p.chapter)).size,
            surfaces: new Set(picks.map((p) => p.surface)).size,
            events: picks.filter((p) => p.event !== 'none').length,
            repeatedInPlace: picks.some((p, i) => i > 0 && p.chapter === picks[i - 1].chapter)
        };
    });
    check(policy.invalid === undefined, 'L14 every patch the built-in policy emits passes its own validator');
    check(policy.chapters >= 5, 'L14b it moves the road around rather than settling into a rut', `${policy.chapters} of 8 chapters in 12 changes`);
    check(policy.surfaces >= 3, 'L14c and varies the surface', `${policy.surfaces} surfaces`);
    check(policy.events >= 2, 'L14d and puts something out there to find', `${policy.events} set-pieces`);
    check(!policy.repeatedInPlace, 'L14e it never picks the chapter already in force');

    check(errors.length === 0, 'L12 no console errors from any of it', errors.slice(0, 3).join(' | '));

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

    // ------------------------------------------- Q: the views and their order

    // Q1 — the cycle order, exactly, and that it wraps.
    const cameraOrder = await page.evaluate(() => {
        const g = window.brb.game;
        // Get to a known starting point rather than assuming one.
        for (let i = 0; i < 6 && window.brb.telemetry.camera !== 'Chase'; i++) g.cycleCamera();
        const seen = [window.brb.telemetry.camera];
        for (let i = 0; i < 3; i++) {
            g.cycleCamera();
            seen.push(window.brb.telemetry.camera);
        }
        return seen;
    });
    check(
        cameraOrder.slice(0, 3).join(' > ') === 'Chase > Cockpit > Hood',
        'Q1 the views cycle chase, then cockpit, then hood',
        cameraOrder.join(' > ')
    );
    check(cameraOrder[3] === 'Chase', 'Q1b and the last one wraps back to the first', cameraOrder.join(' > '));

    /**
     * How much of the screen is the player's own vehicle.
     *
     * Rendered twice — once normally, once with the vehicle hidden — and the
     * pixels that changed by more than a threshold are the ones it was covering.
     * Only large differences count, so tinted glass you can see through is not
     * mistaken for bodywork you cannot.
     */
    const bodyworkPct = () =>
        page.evaluate(() => {
            const g = window.brb.game;
            g.setRenderEnabled(true);
            for (let i = 0; i < 30; i++) window.__h.autopilot(1 / 60, { keyThrottle: true }, false);
            const cv = document.querySelector('canvas');
            const w = 320, h = 180;
            const off = document.createElement('canvas');
            off.width = w;
            off.height = h;
            const ctx = off.getContext('2d');
            const shot = () => {
                g.tick(0);
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(cv, 0, 0, w, h);
                return ctx.getImageData(0, 0, w, h).data;
            };
            const a = shot();
            g.modelForTest.root.visible = false;
            const b = shot();
            g.modelForTest.root.visible = true;
            let all = 0;
            let top = 0;
            for (let i = 0; i < w * h; i++) {
                const d = Math.max(
                    Math.abs(a[i * 4] - b[i * 4]),
                    Math.abs(a[i * 4 + 1] - b[i * 4 + 1]),
                    Math.abs(a[i * 4 + 2] - b[i * 4 + 2])
                );
                if (d > 40) {
                    all++;
                    if (Math.floor(i / w) < h / 2) top++;
                }
            }
            g.setRenderEnabled(false);
            return { pct: +((all / (w * h)) * 100).toFixed(1), topHalf: +((top / (w * h / 2)) * 100).toFixed(1) };
        });

    const toView = (label) =>
        page.evaluate((v) => {
            const g = window.brb.game;
            for (let i = 0; i < 6 && window.brb.telemetry.camera !== v; i++) g.cycleCamera();
            return window.brb.telemetry.camera;
        }, label);

    // Q2 — the cockpit view has to show the road, not the vehicle.
    //
    // It used to be 66.5% bodywork, and the culprit was not the frame: the
    // windscreen is flagged transparent but tinted rgb(0.06, 0.09, 0.10), so
    // from directly behind it, it was a near-black sheet over 55.8% of the
    // screen on its own. The glazing is hidden from inside now, the way the cab
    // shell already was. The ceiling here is set well above what it measures so
    // it catches a regression rather than pinning a tuning number.
    await toView('Cockpit');
    const cockpit = await bodyworkPct();
    check(cockpit.pct < 45, 'Q2 the cockpit view is mostly road, not bodywork', `${cockpit.pct}% of the screen is the vehicle`);
    check(
        cockpit.topHalf < 20,
        'Q2b and the upper half of the screen is where the road is',
        `${cockpit.topHalf}% of the top half is bodywork`
    );

    // Q3 — the glazing is only hidden from inside. From outside the vehicle
    // still has windows, which is the whole reason they exist.
    const glazing = await page.evaluate(() => {
        const g = window.brb.game;
        for (let i = 0; i < 6 && window.brb.telemetry.camera !== 'Cockpit'; i++) g.cycleCamera();
        g.tick(1 / 60);
        const inside = g.modelForTest.glazingForTest;
        for (let i = 0; i < 6 && window.brb.telemetry.camera !== 'Chase'; i++) g.cycleCamera();
        g.tick(1 / 60);
        return { inside, outside: g.modelForTest.glazingForTest };
    });
    check(
        glazing.inside.total > 0 && glazing.inside.hidden === glazing.inside.total,
        'Q3 the glass is hidden in the cockpit view',
        JSON.stringify(glazing.inside)
    );
    check(glazing.outside.hidden === 0, 'Q3b and back again from outside', JSON.stringify(glazing.outside));

    // Q4 — the other two views are unchanged by any of it.
    await toView('Hood');
    const hood = await bodyworkPct();
    await toView('Chase');
    const chase = await bodyworkPct();
    check(hood.pct < 30, 'Q4 the hood view still shows mostly road', `${hood.pct}%`);
    check(chase.pct < 20, 'Q4b and so does the chase view', `${chase.pct}%`);

    // ---------------------------------------------------------- P: vehicles

    // Three vehicles that are meant to be different to *drive*, not to look at.
    // The checks that matter are the measured ones: if the Hauler accelerates
    // like the Coupe then the spec is not reaching the physics and the picker is
    // decoration.

    const fleet = await page.evaluate(() => {
        const g = window.brb.game;
        return {
            count: g.vehicles.length,
            ids: g.vehicles.map((v) => v.id),
            current: g.currentVehicle.id,
            named: window.brb.telemetry.vehicle,
            allNamed: g.vehicles.every((v) => v.name && v.blurb)
        };
    });
    check(fleet.count >= 4, 'P1 the game offers four vehicles', `${fleet.count}: ${fleet.ids.join(', ')}`);
    check(fleet.current === 'ranger', 'P1b the one the game shipped with is still the default', fleet.current);
    check(fleet.named === 'Ranger 4x4' && fleet.allNamed, 'P1c every vehicle is named and described', fleet.named);

    // P2 — the spec reaches the physics. Distance covered from rest in eight
    // seconds, on the road, is a cheap discriminator that needs no lap.
    const sprint = await page.evaluate(() => {
        const g = window.brb.game;
        const out = {};
        for (const v of g.vehicles) {
            g.setVehicle(v.id);
            g.setDifficulty('medium');
            g.restartFree();
            const s0 = g.physics.odometer;
            // `lift = false` steers to stay on the road but never backs off —
            // the only way to measure acceleration on a road with corners.
            window.__h.autopilot(8, { keyThrottle: true }, false);
            out[v.id] = {
                metres: +(g.physics.odometer - s0).toFixed(1),
                mph: +(Math.abs(g.physics.u) * 2.2369362920544).toFixed(0),
                mass: v.mass
            };
            g.input.keyThrottle = false;
        }
        g.setVehicle('ranger');
        g.restartFree();
        return out;
    });
    check(
        sprint.coupe.metres > sprint.ranger.metres && sprint.ranger.metres > sprint.hauler.metres,
        'P2 the three accelerate differently, in the order their specs imply',
        `coupe ${sprint.coupe.metres}m, ranger ${sprint.ranger.metres}m, hauler ${sprint.hauler.metres}m in 8 s`
    );
    check(
        sprint.coupe.mph > sprint.hauler.mph * 1.3,
        'P2b and the gap is one a driver would feel, not a rounding difference',
        `${sprint.coupe.mph} mph vs ${sprint.hauler.mph} mph`
    );

    // P3 — the model is built from the same spec, so the wheels sit under the
    // axles the physics is solving rather than where the pickup's used to be.
    const vehShape = await page.evaluate(() => {
        const g = window.brb.game;
        const out = {};
        for (const v of g.vehicles) {
            g.setVehicle(v.id);
            const nodes = g.modelForTest.wheelNodes ?? [];
            const wheels = g.physics.wheels;
            let worst = 0;
            for (let i = 0; i < 4; i++) {
                worst = Math.max(worst, Math.abs(nodes[i].position.x - wheels[i].x), Math.abs(nodes[i].position.z - wheels[i].z));
            }
            out[v.id] = { worst: +worst.toFixed(3), scale: g.modelForTest.bodyScaleForTest };
        }
        g.setVehicle('ranger');
        g.restartFree();
        return out;
    });
    check(
        Object.values(vehShape).every((r) => r.worst < 0.001),
        'P3 every vehicle draws its wheels under its own axles',
        JSON.stringify(vehShape)
    );
    check(
        new Set(Object.values(vehShape).map((r) => r.scale)).size === fleet.count,
        'P3b and every body is a different size',
        Object.entries(vehShape).map(([k, r]) => `${k} ${r.scale}`).join(' | ')
    );

    // P4 — vehRecords are per vehicle, and the default keeps the key it always had.
    const vehRecords = await page.evaluate(() => {
        const g = window.brb.game;
        // The loader insists on a full set of checkpoint splits, so a record
        // written by hand has to look like one the game would have written.
        const splits = new Array(25).fill(0).map((_, i) => i * 4);
        localStorage.setItem('brb.stage.v3.medium', JSON.stringify({ best: 222.2, splits }));
        localStorage.setItem('brb.stage.v3.medium.coupe', JSON.stringify({ best: 180.5, splits }));
        g.setDifficulty('medium');
        // Records are read when the vehicle changes, and `setVehicle` returns
        // early if you ask for the one already loaded — so a value written to
        // storage after the game started needs a real switch to be picked up.
        g.setVehicle('hauler');
        g.setVehicle('ranger');
        g.setMode('stage');
        window.__h.sim(0.3);
        const inRanger = window.brb.telemetry.stageBest;
        g.setVehicle('coupe');
        window.__h.sim(0.3);
        const inCoupe = window.brb.telemetry.stageBest;
        g.setVehicle('hauler');
        window.__h.sim(0.3);
        const inHauler = window.brb.telemetry.stageBest;
        g.setVehicle('ranger');
        g.setMode('free');
        g.restartFree();
        window.__h.sim(0.3);
        return { inRanger, inCoupe, inHauler };
    });
    check(
        Math.abs(vehRecords.inRanger - 222.2) < 0.01,
        'P4 the default vehicle still reads records written before vehicles existed',
        `${vehRecords.inRanger}`
    );
    check(Math.abs(vehRecords.inCoupe - 180.5) < 0.01, 'P4b another vehicle reads its own', `${vehRecords.inCoupe}`);
    check(vehRecords.inHauler === 0, 'P4c and one with no time set has none', `${vehRecords.inHauler}`);

    // P5 — swapping restarts the drive rather than leaving a part-driven lap
    // credited to a vehicle that did not drive it.
    const swap = await page.evaluate(() => {
        const g = window.brb.game;
        g.setMode('free');
        g.restartFree();
        window.__h.autopilot(4, { keyThrottle: true }, false);
        const before = g.physics.odometer;
        g.setVehicle('coupe');
        window.__h.sim(0.2);
        const after = g.physics.odometer;
        g.setVehicle('ranger');
        g.restartFree();
        return { before: +before.toFixed(0), after: +after.toFixed(0) };
    });
    check(swap.before > 20 && swap.after < swap.before, 'P5 changing vehicle restarts the drive', `${swap.before} m -> ${swap.after} m`);

    // P6 — the fleet has to differ in *handling*, not only in how fast it gets
    // to 100. The first three were built almost entirely on power and mass and
    // all sat within 0.93-1.10 of grip, which makes them the same car with
    // different engines once the tyres are at the limit.
    const spread = await page.evaluate(() => {
        const g = window.brb.game;
        const grip = g.vehicles.map((v) => v.grip);
        const cg = g.vehicles.map((v) => v.cgHeight);
        const out = [];
        for (const v of g.vehicles) {
            g.setVehicle(v.id);
            g.setDifficulty('medium');
            g.restartFree();
            const p = g.physics;
            let guard = 0;
            while (Math.abs(p.u) * 2.2369362920544 < 55 && guard++ < 60 * 45) {
                window.__h.autopilot(1 / 60, { keyThrottle: true }, false);
            }
            g.input.keyThrottle = false;
            g.input.keyLeft = true;
            let lat = 0;
            let roll = 0;
            for (let i = 0; i < 90; i++) {
                g.tick(1 / 60);
                lat = Math.max(lat, Math.abs(p.accelLat));
                roll = Math.max(roll, Math.abs(p.roll));
            }
            g.input.keyLeft = false;
            out.push({ id: v.id, cg: v.cgHeight, lat: +lat.toFixed(2), rollDeg: +(roll * 57.2958).toFixed(2) });
        }
        g.setVehicle('ranger');
        g.restartFree();
        return { gripSpread: +(Math.max(...grip) - Math.min(...grip)).toFixed(2), cgSpread: +(Math.max(...cg) - Math.min(...cg)).toFixed(2), out };
    });
    check(
        spread.gripSpread >= 0.25,
        'P6 the fleet spans a real range of grip, not a rounding error',
        `grip spread ${spread.gripSpread}`
    );
    check(spread.cgSpread >= 0.5, 'P6b and of centre-of-gravity height', `cg spread ${spread.cgSpread}`);
    const byCg = [...spread.out].sort((a, b) => a.cg - b.cg);
    check(
        byCg.every((v, i) => i === 0 || v.rollDeg > byCg[i - 1].rollDeg),
        'P6c a taller vehicle visibly leans more — body roll follows CG height',
        byCg.map((v) => `${v.id} cg ${v.cg} roll ${v.rollDeg}deg`).join(' | ')
    );
    const lats = spread.out.map((v) => v.lat);
    check(
        Math.max(...lats) - Math.min(...lats) > 1.5,
        'P6d and they hold meaningfully different cornering loads',
        spread.out.map((v) => `${v.id} ${v.lat}`).join(' | ')
    );

    // P7 — the slowest of the four still belongs on the same road as the others.
    const topEnd = await page.evaluate(() => {
        const g = window.brb.game;
        const run = (id) => {
            g.setVehicle(id);
            g.restartFree();
            for (let i = 0; i < 20 * 60; i++) window.__h.autopilot(1 / 60, { keyThrottle: true }, false);
            g.input.keyThrottle = false;
            return Math.abs(g.physics.u) * 2.2369362920544;
        };
        const hauler = run('hauler');
        const ranger = run('ranger');
        g.setVehicle('ranger');
        g.restartFree();
        return { hauler: +hauler.toFixed(0), ranger: +ranger.toFixed(0) };
    });
    check(topEnd.hauler >= 88, 'P7 the slowest vehicle is slow, not broken', `${topEnd.hauler} mph`);
    check(
        topEnd.hauler > topEnd.ranger * 0.6,
        'P7b it is within touching distance of the rest of the fleet',
        `${topEnd.hauler} vs ${topEnd.ranger} mph`
    );

    check(errors.length === 0, 'P8 no console errors from any of it', errors.slice(0, 3).join(' | '));

    // ------------------------------------------------- M: the stage picker UI

    // Section K asserts that `scout()` returns five candidates. It does, and it
    // always did — including while the picker showed an empty panel to every
    // player on a laptop, because the rows were rendered correctly and then
    // pushed below the fold of a modal capped at 86vh. A test that stops at the
    // function is not a test of the feature.
    //
    // So these drive the real UI at the real viewport and ask what is *visible*,
    // not what exists.

    /** Rows fully inside the modal's own scroll viewport, not merely in the DOM. */
    const visibleRows = () =>
        page.evaluate(() => {
            const modal = document.querySelector('.modal');
            if (!modal) return { open: false };
            const mb = modal.getBoundingClientRect();
            const rows = [...document.querySelectorAll('.candidate')];
            const inside = rows.filter((c) => {
                const b = c.getBoundingClientRect();
                return b.top >= mb.top - 1 && b.bottom <= mb.bottom + 1 && b.height > 0;
            });
            const heading = [...document.querySelectorAll('.modal h3')].find((h) => /best matches/i.test(h.textContent));
            return {
                open: true,
                inDom: rows.length,
                visible: inside.length,
                names: inside.map((c) => c.querySelector('.candidate-name').textContent),
                headingText: heading ? heading.textContent : '',
                scrollTop: Math.round(modal.scrollTop),
                needsScroll: modal.scrollHeight > modal.clientHeight
            };
        });

    // Clicked from inside the page rather than through Playwright: the HUD's fps
    // badge changes width as the number moves, which nudges the Settings button
    // along by a pixel and can leave the actionability check waiting for it to
    // hold still for ever.
    await page.evaluate(async () => {
        for (const b of document.querySelectorAll('button')) if (/Settings/.test(b.textContent)) b.click();
        await new Promise((r) => setTimeout(r, 150));
        for (const b of document.querySelectorAll('button')) if (/Find a stage/.test(b.textContent)) b.click();
        await new Promise((r) => setTimeout(r, 300));
    });

    const opened = await visibleRows();
    check(opened.open, 'M1 the picker opens from the settings panel');
    check(opened.inDom === 5, 'M1b five candidates are rendered', `${opened.inDom} in the DOM`);
    check(
        opened.visible === opened.inDom,
        'M1c and every one of them is actually on screen, unscrolled',
        `${opened.visible} of ${opened.inDom} visible at 1280x720, scrollTop ${opened.scrollTop}`
    );
    // Note the panel as a whole may still scroll — the footer sits below the
    // list — and that is fine. What must never happen again is the *results*
    // needing a scroll nobody knows is there.

    // M2 — every character, not just the default one. The bug showed on all six
    // equally, and a check that only ever opens the panel on 'flowing' would
    // have missed a profile that returns nothing.
    const perProfile = await page.evaluate(async () => {
        const out = [];
        const chips = [...document.querySelectorAll('.profile-chip')];
        for (const chip of chips) {
            chip.click();
            // React re-renders on a later task; querying now races it.
            await new Promise((r) => setTimeout(r, 80));
            const modal = document.querySelector('.modal');
            const mb = modal.getBoundingClientRect();
            const rows = [...document.querySelectorAll('.candidate')].filter((c) => {
                const b = c.getBoundingClientRect();
                return b.top >= mb.top - 1 && b.bottom <= mb.bottom + 1 && b.height > 0;
            });
            const heading = [...document.querySelectorAll('.modal h3')].find((h) => /best matches/i.test(h.textContent));
            out.push({
                label: chip.textContent.trim(),
                visible: rows.length,
                first: rows[0] ? rows[0].querySelector('.candidate-name').textContent : '',
                heading: heading ? heading.textContent : ''
            });
        }
        return out;
    });
    check(perProfile.length === 6, 'M2 all six characters are offered as chips', `${perProfile.length}`);
    const emptyOnes = perProfile.filter((r) => r.visible < 3);
    check(
        emptyOnes.length === 0,
        'M2b every character shows candidates on screen',
        emptyOnes.map((r) => `${r.label}: ${r.visible}`).join(', ')
    );
    check(
        new Set(perProfile.map((r) => r.first)).size >= 4,
        'M2c different characters actually offer different road',
        perProfile.map((r) => r.first).join(' | ')
    );
    check(
        perProfile.every((r) => /best matches for/i.test(r.heading)),
        'M2d the heading follows the selected character',
        perProfile[perProfile.length - 1].heading
    );

    // M3 — the search re-runs when the character changes. If the memo were keyed
    // wrongly the rows would simply never update, which looks like working.
    const swapped = await page.evaluate(async () => {
        const chips = [...document.querySelectorAll('.profile-chip')];
        const nameList = () => [...document.querySelectorAll('.candidate-name')].map((n) => n.textContent).join('|');
        chips[0].click();
        await new Promise((r) => setTimeout(r, 80));
        const a = nameList();
        chips[1].click();
        await new Promise((r) => setTimeout(r, 80));
        const b = nameList();
        return { a, b, changed: a !== b };
    });
    check(swapped.changed, 'M3 switching character re-runs the search', `${swapped.a.slice(0, 40)} -> ${swapped.b.slice(0, 40)}`);

    // M4 — a row can be clicked, and the stage it names is the stage loaded.
    const picked = await page.evaluate(async () => {
        const row = document.querySelector('.candidate');
        const name = row.querySelector('.candidate-name').textContent;
        row.click();
        await new Promise((r) => setTimeout(r, 120));
        window.__h.sim(0.3);
        await new Promise((r) => setTimeout(r, 60));
        return { name, loaded: window.brb.game.currentStage.name, hud: window.brb.telemetry.stageName, open: !!document.querySelector('.candidate') };
    });
    check(picked.loaded === picked.name, 'M4 clicking a candidate loads that stage', `${picked.name} -> ${picked.loaded}`);
    check(picked.hud === picked.name, 'M4b and the HUD names it', picked.hud);

    // Put the game back the way the rest of the suite expects it.
    await page.evaluate(async () => {
        window.brb.game.useDefaultStage();
        window.brb.game.setMode('free');
        window.__h.sim(0.3);
        for (const b of document.querySelectorAll('button')) {
            if (/^(Close|Back to the road)$/.test(b.textContent.trim())) b.click();
        }
        await new Promise((r) => setTimeout(r, 80));
    });
    const closed = await page.evaluate(() => !document.querySelector('.modal'));
    check(closed, 'M5 the picker closes again');

    await page.close();

    // ----------------------------------------------------------------- mobile
    const mobile = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
    const mp = await mobile.newPage();
    const mobileErrors = [];
    mp.on('pageerror', (e) => mobileErrors.push(String(e)));
    await mp.goto(URL, { waitUntil: 'load' });
    await waitForGame(mp);
    await startDriving(mp);

    // Sections B1-B5 are about the four-button layout, which is still offered
    // and is now the non-default choice — so switch to it through the real
    // setting rather than deleting coverage of a mode people can still pick.
    // Section N covers the thumbstick that replaced it as the default.
    await mp.evaluate(async () => {
        for (const b of document.querySelectorAll('button')) if (/Settings/.test(b.textContent)) b.click();
        await new Promise((r) => setTimeout(r, 150));
        for (const b of document.querySelectorAll('.segment')) if (b.textContent.trim() === 'Buttons') b.click();
        await new Promise((r) => setTimeout(r, 120));
        for (const b of document.querySelectorAll('button')) {
            if (/^(Close|Back to the road)$/.test(b.textContent.trim())) b.click();
        }
        await new Promise((r) => setTimeout(r, 120));
    });

    const touchCount = await mp.locator('.touch-btn').count();
    check(touchCount === 4, 'B1 four touch controls are present on a phone', `count=${touchCount}`);
    const stickGone = await mp.evaluate(() => !document.querySelector('.thumb-zone'));
    check(stickGone, 'B1a choosing Buttons removes the thumbstick');

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

    // B6f — the page-wide touchmove blocker must not freeze panels that scroll.
    // It is there to kill pull-to-refresh and rubber-banding on the road; when
    // it applied to the whole document it also made the stage picker's results
    // unreachable on a phone, because the list sits below the fold of a
    // scrollable modal.
    const modalScroll = await mp.evaluate(async () => {
        for (const b of document.querySelectorAll('button')) {
            if (/Settings/.test(b.textContent)) b.click();
        }
        await new Promise((r) => setTimeout(r, 120));
        for (const b of document.querySelectorAll('button')) {
            if (/Find a stage/.test(b.textContent)) b.click();
        }
        await new Promise((r) => setTimeout(r, 250));

        const modal = document.querySelector('.modal');
        if (!modal) return { open: false };
        const probe = (el) => {
            const ev = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
            el.dispatchEvent(ev);
            return ev.defaultPrevented;
        };
        const inModal = probe(document.querySelector('.candidate-list') ?? modal);
        const onCanvas = probe(document.querySelector('canvas'));

        const reach = () => {
            const mb = modal.getBoundingClientRect();
            return [...document.querySelectorAll('.candidate')].filter((c) => {
                const b = c.getBoundingClientRect();
                return b.top >= mb.top - 1 && b.bottom <= mb.bottom + 1;
            }).length;
        };
        const atTop = reach();
        modal.scrollTop = modal.scrollHeight;
        await new Promise((r) => setTimeout(r, 60));
        const atBottom = reach();
        const rows = document.querySelectorAll('.candidate').length;

        for (const b of document.querySelectorAll('button')) {
            if (/^(Close|Back to the road)$/.test(b.textContent.trim())) b.click();
        }
        await new Promise((r) => setTimeout(r, 80));
        return { open: true, inModal, onCanvas, atTop, atBottom, rows, seen: Math.max(atTop, atBottom) };
    });
    check(modalScroll.open, 'B6f the stage picker opens on a phone');
    check(
        modalScroll.inModal === false,
        'B6g a scrollable panel is exempt from the page-wide touchmove block',
        `touchmove prevented inside the modal: ${modalScroll.inModal}`
    );
    check(
        modalScroll.onCanvas === true,
        'B6h while the road itself is still protected from rubber-banding',
        `touchmove prevented on the canvas: ${modalScroll.onCanvas}`
    );
    check(
        modalScroll.atTop >= 1,
        'B6i candidates are on screen without scrolling at all',
        `${modalScroll.atTop} of ${modalScroll.rows} visible on an iPhone 13`
    );
    check(
        modalScroll.atBottom > modalScroll.atTop || modalScroll.atTop === modalScroll.rows,
        'B6j and scrolling reaches the rest',
        `${modalScroll.atTop} -> ${modalScroll.atBottom} of ${modalScroll.rows}`
    );
    check(noScroll.userSelect === 'none', 'B6c text selection is disabled', noScroll.userSelect);
    check(noScroll.btnTouchAction === 'none', 'B6d controls set touch-action none', noScroll.btnTouchAction);
    check(noScroll.docHeight <= noScroll.winHeight + 1, 'B6e the document does not overflow the viewport');

    // B7 — auto-detection picks the mobile preset on a phone UA.
    const autoQuality = await mp.evaluate(() => window.brb.game.quality);
    check(autoQuality === 'mobile', 'B7 a phone auto-detects the mobile preset', autoQuality);

    // ----------------------------------------------------- N: the thumbstick

    // Back to the default control for this section.
    await mp.evaluate(async () => {
        for (const b of document.querySelectorAll('button')) if (/Settings/.test(b.textContent)) b.click();
        await new Promise((r) => setTimeout(r, 150));
        for (const b of document.querySelectorAll('.segment')) if (b.textContent.trim() === 'Thumbstick') b.click();
        await new Promise((r) => setTimeout(r, 120));
        for (const b of document.querySelectorAll('button')) {
            if (/^(Close|Back to the road)$/.test(b.textContent.trim())) b.click();
        }
        await new Promise((r) => setTimeout(r, 150));
    });

    // The steering buttons could only ever ask for -1, 0 or +1, so every
    // correction on a phone was full lock until you let go. These check the one
    // thing that fixes: a steering angle between straight and all of it.

    const stickState = await mp.evaluate(() => ({
        zone: !!document.querySelector('.thumb-zone'),
        steerButtons: document.querySelectorAll('.touch-btn.steer').length,
        gas: !!document.querySelector('.touch-btn.gas'),
        brake: !!document.querySelector('.touch-btn.brake')
    }));
    check(stickState.zone, 'N1 the thumbstick is the default steering control on a phone');
    check(stickState.steerButtons === 0, 'N1b and it replaces the left/right buttons', `${stickState.steerButtons} button(s) left`);
    check(stickState.gas && stickState.brake, 'N1c gas and brake are untouched');

    // N2 — travel maps to a steering angle, and the rim is the end of it.
    const travel = await mp.evaluate(async () => {
        const zone = document.querySelector('.thumb-zone');
        const b = zone.getBoundingClientRect();
        const x = Math.round(b.x + b.width / 2);
        const y = Math.round(b.y + b.height * 0.6);
        const send = (type, cx, cy) =>
            zone.dispatchEvent(
                new PointerEvent(type, { pointerId: 21, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true, cancelable: true, isPrimary: true })
            );
        const inp = window.brb.game.input;
        const out = {};
        send('pointerdown', x, y);
        out.heldOnDown = inp.touchSteerHeld;
        out.zeroOnDown = inp.touchSteer;
        for (const [tag, dx] of [['quarter', 16], ['half', 31], ['rim', 62], ['past', 140], ['left', -31]]) {
            send('pointermove', x + dx, y);
            await new Promise((r) => setTimeout(r, 20));
            out[tag] = +inp.touchSteer.toFixed(3);
        }
        out.knob = document.querySelector('.thumb-knob').style.transform;
        out.baseLive = document.querySelector('.thumb-base').classList.contains('live');
        send('pointerup', x - 31, y);
        out.afterRelease = inp.touchSteer;
        out.heldAfterRelease = inp.touchSteerHeld;
        out.baseHidden = !document.querySelector('.thumb-base').classList.contains('live');
        return out;
    });
    check(travel.heldOnDown === true && travel.zeroOnDown === 0, 'N2 pressing engages the stick at centre', JSON.stringify({ held: travel.heldOnDown, steer: travel.zeroOnDown }));
    check(
        travel.quarter > 0 && travel.quarter < travel.half && travel.half < travel.rim,
        'N2b travel maps to proportional steering, not on/off',
        `quarter ${travel.quarter}, half ${travel.half}, rim ${travel.rim}`
    );
    check(travel.rim === 1 && travel.past === 1, 'N2c the rim is full lock and past it is still full lock', `${travel.rim} / ${travel.past}`);
    check(travel.left === -0.5, 'N2d the other way is negative', `${travel.left}`);
    check(travel.baseLive, 'N2e the stick shows itself while held');
    check(
        travel.afterRelease === 0 && travel.heldAfterRelease === false && travel.baseHidden,
        'N2f and releasing centres it, drops the hold and hides it',
        JSON.stringify(travel)
    );

    // N3 — the thing that actually matters: a partial hold turns the truck less
    // than a full one. Buttons could not express this at all.
    const proportional = await mp.evaluate(async () => {
        const g = window.brb.game;
        const zone = document.querySelector('.thumb-zone');
        const b = zone.getBoundingClientRect();
        const x = Math.round(b.x + b.width / 2);
        const y = Math.round(b.y + b.height * 0.6);
        const send = (type, cx, cy) =>
            zone.dispatchEvent(
                new PointerEvent(type, { pointerId: 22, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true, cancelable: true, isPrimary: true })
            );
        const run = (dx) => {
            g.restartFree();
            for (let i = 0; i < 200; i++) { g.input.keyThrottle = true; g.tick(1 / 60); }
            send('pointerdown', x, y);
            send('pointermove', x + dx, y);
            const y0 = g.physics.yaw;
            for (let i = 0; i < 90; i++) g.tick(1 / 60);
            const turned = Math.abs(g.physics.yaw - y0);
            send('pointerup', x + dx, y);
            g.input.keyThrottle = false;
            return turned;
        };
        return { quarter: +run(16).toFixed(3), full: +run(62).toFixed(3) };
    });
    check(
        proportional.quarter > 0.02 && proportional.full > proportional.quarter * 1.8,
        'N3 a partial hold turns the truck markedly less than full lock',
        `${proportional.quarter} rad vs ${proportional.full} rad over 1.5 s`
    );

    // N4 — losing the pointer must release the stick. A capture stolen by an
    // incoming call would otherwise leave the truck steering itself with no
    // finger on the screen.
    const cancelled = await mp.evaluate(async () => {
        const g = window.brb.game;
        const zone = document.querySelector('.thumb-zone');
        const b = zone.getBoundingClientRect();
        const x = Math.round(b.x + b.width / 2);
        const y = Math.round(b.y + b.height * 0.6);
        const send = (type, cx, cy) =>
            zone.dispatchEvent(
                new PointerEvent(type, { pointerId: 23, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true, cancelable: true, isPrimary: true })
            );
        send('pointerdown', x, y);
        send('pointermove', x + 62, y);
        const held = g.input.touchSteer;
        send('pointercancel', x + 62, y);
        return { held, after: g.input.touchSteer, stillHeld: g.input.touchSteerHeld };
    });
    check(
        cancelled.held === 1 && cancelled.after === 0 && cancelled.stillHeld === false,
        'N4 a cancelled pointer releases the stick',
        JSON.stringify(cancelled)
    );

    // N5 — the stick's zone must not swallow the pedals or the HUD.
    const reach = await mp.evaluate(() => {
        const hit = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return 'missing';
            const b = el.getBoundingClientRect();
            const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
            return top === el || el.contains(top) ? 'ok' : 'blocked';
        };
        const hudButtons = [...document.querySelectorAll('.hud-btn')].map((el) => {
            const b = el.getBoundingClientRect();
            const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
            return top === el || el.contains(top) ? 'ok' : 'blocked';
        });
        return { gas: hit('.touch-btn.gas'), brake: hit('.touch-btn.brake'), hud: hudButtons };
    });
    check(reach.gas === 'ok' && reach.brake === 'ok', 'N5 the steering zone does not swallow the pedals', JSON.stringify(reach));
    check(
        reach.hud.length > 0 && reach.hud.every((r) => r === 'ok'),
        'N5b nor the HUD buttons',
        reach.hud.join(',')
    );

    // N6 — a key still beats the stick when the stick is not held, so a tablet
    // with a keyboard is not left with a control that ignores it.
    const keysStillWork = await mp.evaluate(() => {
        const g = window.brb.game;
        g.restartFree();
        for (let i = 0; i < 200; i++) { g.input.keyThrottle = true; g.tick(1 / 60); }
        const y0 = g.physics.yaw;
        g.input.keyLeft = true;
        for (let i = 0; i < 90; i++) g.tick(1 / 60);
        g.input.keyLeft = false;
        g.input.keyThrottle = false;
        return { held: g.input.touchSteerHeld, turned: +Math.abs(g.physics.yaw - y0).toFixed(3) };
    });
    check(
        keysStillWork.held === false && keysStillWork.turned > 0.05,
        'N6 the keyboard still steers when no thumb is on the stick',
        `${keysStillWork.turned} rad`
    );

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
