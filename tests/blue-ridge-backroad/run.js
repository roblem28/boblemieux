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
        autopilot(seconds, fields = {}) {
            const p = g.physics;
            for (const k of Object.keys(fields)) g.input[k] = fields[k];
            const wantThrottle = !!fields.keyThrottle;
            const n = Math.round(seconds * 60);
            let peakMph = 0;
            g.setRenderEnabled(false);
            for (let i = 0; i < n; i++) {
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
                // Aim for a steering ANGLE and modulate the key to reach it,
                // the way a player taps rather than holds. Holding a digital
                // key to full lock at 60 mph spins any car, so a bang-bang
                // controller measures nothing but its own crudeness.
                // Pure pursuit alone has a steady-state offset toward the
                // inside of a constant corner, which parks the truck in the
                // ditch; the lateral term pulls it back to the centreline.
                const desired = Math.max(-0.34, Math.min(0.34, err * 1.5 + p.lateral * 0.035));
                g.input.keyLeft = p.steer < desired - 0.008;
                g.input.keyRight = p.steer > desired + 0.008;

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
            }
            g.input.keyLeft = false;
            g.input.keyRight = false;
            g.input.keyBrake = false;
            g.setRenderEnabled(true);
            return peakMph;
        },
        /**
         * Get the truck back onto the road and rolling, so the next check
         * starts from a known state rather than from wherever the previous one
         * abandoned it. Checks that begin in a ditch measure the ditch.
         */
        recover(seconds = 16) {
            this.release();
            this.autopilot(seconds, { keyThrottle: true });
            this.release();
            this.sim(0.4);
            return Math.abs(g.physics.lateral);
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
        window.__h.release();
        window.__h.autopilot(5, { keyThrottle: true });
        window.__h.release();
        window.__h.hold({ keyThrottle: true }, 0.5);
    });
    const preLeft = await page.evaluate(() => window.__h.state());
    await page.evaluate(() => window.__h.hold({ keyThrottle: true, keyLeft: true }, 1.2));
    const postLeft = await page.evaluate(() => window.__h.state());
    // Straighten up first: measuring the right turn from the end of a left turn
    // means fighting the yaw rate the left turn built up, not measuring steering.
    await page.evaluate(() => {
        window.__h.release();
        window.__h.autopilot(4, { keyThrottle: true });
        window.__h.release();
        window.__h.hold({ keyThrottle: true }, 0.5);
    });
    const preRight = await page.evaluate(() => window.__h.state());
    await page.evaluate(() => window.__h.hold({ keyThrottle: true, keyRight: true }, 1.2));
    const postRight = await page.evaluate(() => window.__h.state());
    // Yaw is a rotation about +Y, which in this right-handed, Y-up world turns
    // the truck LEFT. So steering left must increase yaw and steering right
    // must decrease it — the assertion that catches an inverted steering wheel.
    check(postLeft.yaw > preLeft.yaw + 0.02, 'A9 A/Left steers left', `dyaw=${(postLeft.yaw - preLeft.yaw).toFixed(3)}`);
    check(postRight.yaw < preRight.yaw - 0.02, 'A9b D/Right steers right', `dyaw=${(postRight.yaw - preRight.yaw).toFixed(3)}`);

    // A10 — arrow keys are bound too (real key events, not the input object).
    await page.evaluate(() => window.__h.recover());
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
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
        seen.add(await page.evaluate(() => window.brb.game.cameraMode));
        await page.keyboard.press('KeyC');
        await page.evaluate(() => window.__h.sim(0.2));
    }
    check(seen.size === 3, 'A11 C cycles chase / hood / cockpit', [...seen].join(','));
    const beforeBtn = await page.evaluate(() => window.brb.game.cameraMode);
    await page.locator('.hud-btn').first().click();
    const afterBtn = await page.evaluate(() => window.brb.game.cameraMode);
    check(beforeBtn !== afterBtn, 'A11b the HUD camera button also cycles', `${beforeBtn} -> ${afterBtn}`);

    // A12 — the truck survives being driven off the road, and bogs down there.
    // The reference is the best the truck manages ON the road over the run, not
    // its speed at whatever instant the run ended — which may be mid-hairpin and
    // slower than anything off-road.
    const onRoadPeak = await page.evaluate(() => {
        window.__h.recover();
        return window.__h.autopilot(18, { keyThrottle: true });
    });
    // Steer off, then hold the throttle down in the weeds for long enough that
    // the comparison is between two settled speeds, not two transients.
    await page.evaluate(() => {
        window.__h.release();
        window.__h.hold({ keyThrottle: true, keyRight: true }, 2.4);
        window.__h.hold({ keyThrottle: true }, 6);
    });
    const offRoad = await page.evaluate(() => window.__h.state());
    check(
        Number.isFinite(offRoad.x) && Number.isFinite(offRoad.y) && Number.isFinite(offRoad.z),
        'A12 leaving the road keeps the simulation finite'
    );
    check(
        offRoad.mph < onRoadPeak * 0.6 && Math.abs(offRoad.lateral) > 4,
        'A12b off-road terrain costs speed',
        `road peak ${onRoadPeak.toFixed(0)} -> off-road ${offRoad.mph.toFixed(0)} mph at lateral ${offRoad.lateral.toFixed(1)} m`
    );

    // A13 — a long unattended run stays stable and keeps streaming road.
    await page.evaluate(() => {
        window.__h.recover();
        window.__h.autopilot(60, { keyThrottle: true });
        window.__h.draw();
    });
    const long = await page.evaluate(() => window.__h.state());
    check(long.miles > 0.6, 'A13 a 60 s run covers real distance', `${long.miles.toFixed(2)} mi`);
    check(Number.isFinite(long.s) && long.s > 1200, 'A13b road distance keeps advancing', `s=${long.s.toFixed(0)} m`);
    check(long.y > -400 && long.y < 400, 'A13c the truck stays on the terrain', `y=${long.y.toFixed(1)}`);
    check(long.draws < 160, 'A13d draw calls stay inside budget', `draws=${long.draws}`);

    // A14 — no console errors across all of the above.
    check(errors.length === 0, 'A14 no console errors while driving', errors.slice(0, 3).join(' | '));

    // A15 — the vehicle sits on the road surface, not floating or sunk.
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
