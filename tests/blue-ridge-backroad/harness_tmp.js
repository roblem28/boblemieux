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

module.exports={HARNESS};
