import { createFrame } from './RoadPath';
import type { RoadPath } from './RoadPath';
import { clamp } from '../util/mathx';

/**
 * The road ahead, as numbers the HUD can draw and the driver can act on.
 *
 * Two separate questions get answered here:
 *
 *  - *what shape is it?* — curvature sampled forward, integrated into a
 *    centreline the HUD renders as a small top-down map;
 *  - *should I be braking?* — for every sample, the speed that corner can be
 *    taken at, walked back through the braking distance available to reach it.
 *    The lowest such speed is the advisory. That is the useful number: a
 *    hairpin 300 m away does not mean brake now, and a hairpin 40 m away does.
 */

export const PREVIEW_SAMPLES = 30;
export const PREVIEW_STEP = 12; // metres between samples -> 360 m of look-ahead
export const PREVIEW_LENGTH = PREVIEW_SAMPLES * PREVIEW_STEP;

/** Grip reserved for cornering. Deliberately below the tire's real limit. */
const CORNER_GRIP = 0.62;
/** Deceleration assumed available for planning, m/s^2. */
const BRAKE_DECEL = 5.6;
/** The truck's own limit. A straight road advises this, not infinity. */
const TOP_SPEED = 69; // m/s, ~155 mph
const G = 9.81;

export class CoursePreview {
    /** Lateral offset of the centreline ahead, metres, vehicle-relative. */
    readonly offset = new Float32Array(PREVIEW_SAMPLES);
    /** 0 = flat out, 1 = as tight as this road gets. */
    readonly severity = new Float32Array(PREVIEW_SAMPLES);
    /** Elevation change ahead, metres, relative to the vehicle. */
    readonly rise = new Float32Array(PREVIEW_SAMPLES);

    /** Highest speed the road ahead allows right now, m/s. */
    advisorySpeed = 0;
    /** Distance to the corner that sets the advisory, metres. */
    advisoryDistance = 0;
    /** True when current speed exceeds what the road ahead allows. */
    braking = false;
    /** Signed curvature of the corner setting the advisory: <0 right, >0 left. */
    advisoryCurvature = 0;

    private readonly frame = createFrame();

    constructor(private readonly path: RoadPath) {}

    /**
     * Recompute from distance `s`. Called at the telemetry rate (10 Hz), not
     * per frame — the road does not change fast enough to need more.
     */
    update(s: number, speed: number): void {
        let heading = 0;
        let lateral = 0;
        let limit = Infinity;
        let limitDistance = 0;
        let limitCurvature = 0;
        const baseY = this.sampleY(s);

        for (let i = 0; i < PREVIEW_SAMPLES; i++) {
            const d = (i + 1) * PREVIEW_STEP;
            this.path.sample(s + d, this.frame);
            const k = this.frame.curvature;

            // Integrate the centreline into vehicle-relative space. Heading is
            // left-positive, and screen-right is negative lateral, so the map
            // comes out the way the driver sees the road.
            heading += k * PREVIEW_STEP;
            lateral -= Math.sin(heading) * PREVIEW_STEP;
            this.offset[i] = lateral;
            this.rise[i] = this.frame.pos.y - baseY;

            const absK = Math.abs(k);
            // Speed this corner can actually be carried through.
            const corner = absK > 1e-5 ? Math.sqrt((CORNER_GRIP * G) / absK) : Infinity;
            this.severity[i] = clamp(1 - (corner - 22) / 34, 0, 1);

            // Walk it back: how fast may I be going *now* and still slow to
            // `corner` by the time I arrive?
            const allowed = Math.sqrt(corner * corner + 2 * BRAKE_DECEL * d);
            if (allowed < limit) {
                limit = allowed;
                limitDistance = d;
                limitCurvature = k;
            }
        }

        this.advisorySpeed = Math.min(Number.isFinite(limit) ? limit : TOP_SPEED, TOP_SPEED);
        this.advisoryDistance = limitDistance;
        this.advisoryCurvature = limitCurvature;
        // A little hysteresis-free margin so the warning is not always half-on.
        this.braking = speed > this.advisorySpeed * 1.04;
    }

    private sampleY(s: number): number {
        this.path.sample(s, this.frame);
        return this.frame.pos.y;
    }
}
