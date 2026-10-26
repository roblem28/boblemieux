import { fbm2 } from '../util/noise';
import { smoothstep } from '../util/mathx';

/**
 * The land the road was cut through — one field, shared by both layers.
 *
 * This exists to solve the seam. The conformed ribbon is generated in road
 * space `(s, u)` and the distant layer is a world-space grid, and open question
 * 4 of the terrain spec asks how two differently-parameterised surfaces can be
 * made to agree where they meet. The answer here is that they are not two
 * surfaces: both evaluate this one function of world position, so at the seam
 * they are computing the same number from the same input and agree to float
 * precision. No shared vertices, no stitching, no tolerance.
 *
 * ## Why there is a baseline at all
 *
 * A pure world-space heightfield cannot work on this road. Measured over 60 km
 * the road's elevation spans **350 m**, and moves by up to **108 m within a
 * single 3 km window** — so land that ignored the road would leave it in a
 * canyon on one hill and on a pillar at the next. The field therefore carries a
 * low-frequency term that follows the road's own elevation, and the shape rides
 * on top of that.
 *
 * ## Why the baseline is an average and not a lookup
 *
 * Taking the elevation of the nearest road sample gives a surface with a crease
 * along every bisector — visible as a fold running away from the road. An
 * inverse-distance weighting over many samples is smooth everywhere, and it
 * does something useful for free: where the road switchbacks, the land between
 * the legs settles to a sensible level rather than stepping between them.
 *
 * The kernel is **compactly supported**, which is what makes the whole thing
 * deterministic. A caller passes a hint so the scan can be windowed, but the
 * hint only chooses how much of the polyline to look at — every window wider
 * than the kernel radius contains every sample that can contribute, so the
 * result does not depend on the hint. That property is what lets the ribbon and
 * the grid, which arrive with different hints, agree exactly.
 */

/** Spacing of the coarse road polyline the baseline is built from. */
export const COARSE_STEP = 150;
/** Beyond this, a road sample contributes nothing to the baseline. */
const KERNEL_RADIUS = 3000;
/** Arc length the baseline is smoothed over. */
export const BASELINE_SMOOTH = 900;
/** Half the smoothing window, in coarse indices. */
const BASELINE_HALF = Math.round(BASELINE_SMOOTH / COARSE_STEP);
/**
 * Softening on the inverse-square weight. Without it the weight is unbounded at
 * a sample and the baseline pins to whichever one happens to be nearest,
 * reintroducing the crease the averaging is there to avoid.
 */
/** How far along the polyline a query scans. Comfortably wider than the kernel. */

/*
 * Shape: the land's own relief, in metres, as a pure function of world position.
 *
 * Wavelengths and amplitudes are chosen on the *gradient* distribution rather
 * than on amplitude, which is the finding from Phase 0 — `fbm2`'s octaves each
 * carry half the amplitude at 2.07x the frequency, so every octave contributes
 * roughly as much slope as the one before it and a field that looks right by
 * relief can be a cliff by slope.
 */
const SHAPE_WAVE_A = 1750;
const SHAPE_AMP_A = 115;
const SHAPE_WAVE_B = 720;
const SHAPE_AMP_B = 34;
const SHAPE_OCTAVES = 2;
/**
 * How far from the road the shape fades in.
 *
 * Without this the land has its own elevation right where the road is, and the
 * road has to climb a wall of whatever the difference happens to be - up to the
 * full amplitude inside one ribbon width. Fading the shape out at the road lets
 * the amplitude be large enough to read as country at a kilometre while the
 * bank beside the car stays a bank. It is also what puts the road on its own
 * terrain: at zero distance the height is the baseline, which is the road.
 */
const SHAPE_FADE = 260;

export interface LandSample {
    baseline: number;
    nearDistance: number;
    nearS: number;
    nearY: number;
}

export const createLandSample = (): LandSample => ({
    baseline: 0,
    nearDistance: 0,
    nearS: 0,
    nearY: 0
});

const scratch = createLandSample();

export class LandField {
    /** Coarse road polyline: world x, y, z at every `COARSE_STEP` metres. */
    private readonly cx: number[] = [];
    private readonly cy: number[] = [];
    private readonly cz: number[] = [];
    /** Highest coarse index written, so gaps are never read as zeroes. */
    private filled = -1;
    /** Baseline per coarse index, written once by `finalise`. */
    private readonly baselineArr: number[] = [];
    /** Highest index whose baseline is settled. */
    private finalised = -1;

    constructor(private readonly seed: number) {}

    /**
     * Record a road sample into the coarse polyline.
     *
     * Called from the road generator as it produces samples, so the polyline is
     * a by-product of road generation rather than a second traversal, and it is
     * built in the same order and from the same numbers. It is never pruned:
     * the ring holds 8.2 km because it carries per-sample road geometry, while
     * this is three floats every 150 m and 60 km of it is under 4,000 numbers.
     */
    record(s: number, x: number, y: number, z: number): void {
        if (s < 0) return;
        const i = Math.round(s / COARSE_STEP);
        if (Math.abs(i * COARSE_STEP - s) > 0.01) return;
        this.cx[i] = x;
        this.cy[i] = y;
        this.cz[i] = z;
        if (i > this.filled) this.filled = i;
        this.finalise();
    }

    /** Drop the polyline. Called when the road is regenerated from the origin. */
    reset(): void {
        this.cx.length = 0;
        this.cy.length = 0;
        this.cz.length = 0;
        this.filled = -1;
        this.baselineArr.length = 0;
        this.finalised = -1;
    }

    get coarseCount(): number {
        return this.filled + 1;
    }

    /**
     * Elevation the land settles to near `(x, z)`, following the road.
     *
     * `hintS` bounds the scan and nothing else — see the class comment.
     */
    /**
     * Baseline elevation and nearest road, in one pass over the polyline.
     *
     * Fused because both want the same scan and this runs for every vertex of
     * the distant grid: three separate scans measured 8.4 ms per rebuild, which
     * is a visible hitch on a layer that rebuilds every 150 m of travel.
     *
     * `hintS` bounds the scan and nothing else - see the class comment.
     */
    /**
     * The elevation the land settles to: a low pass of the road's own elevation
     * over arc length, written once during generation and never recomputed.
     *
     * The averaging window reaches half its width either side, so the value for
     * an index is only knowable once the road beyond it exists. Computing it on
     * demand therefore gave a different answer depending on how far the drive
     * happened to have got — terrain built near the leading edge of generation
     * did not match the same terrain rebuilt later, which is what the chunk
     * rebuild, lattice and floating scatter failures were all reporting.
     *
     * Forcing generation from the read path was tried and is unsafe:
     * `crossHeight` runs inside the physics step and inside road sampling, and
     * extending the ring from there prunes its tail under callers holding a
     * frame. It took the suite from 9 failures to 31, including the truck
     * leaving the road entirely.
     *
     * So the value is produced where the data is: as samples are recorded, in
     * order, each index finalised the moment its window is complete. Written
     * once, never revised, and a pure function of the seed. The loop is
     * responsible for keeping generation ahead of anything that reads it — see
     * `LAND_LOOKAHEAD` in ChunkManager.
     */
    private finalise(): void {
        const half = BASELINE_HALF;
        while (this.finalised < this.filled - half) {
            const k = this.finalised + 1;
            let sum = 0;
            let n = 0;
            for (let i = k - half; i <= k + half; i++) {
                if (i < 0) continue;
                const y = this.cy[i];
                if (y === undefined) continue;
                // Triangular weighting, so a sample at the edge of the window
                // arrives with zero weight rather than as a step.
                const w = 1 - Math.abs(i - k) / (half + 1);
                sum += y * w;
                n += w;
            }
            this.baselineArr[k] = n === 0 ? (this.cy[k] ?? 0) : sum / n;
            this.finalised = k;
        }
    }

    /**
     * Baseline at a coarse index.
     *
     * Ahead of the finalised frontier this clamps to the last settled value
     * rather than inventing a provisional one, because a provisional value is
     * exactly what used to change underneath a rebuild. Nothing should be
     * reading up there: the loop generates far enough ahead that every chunk it
     * builds is behind the frontier, and `frontierS` is exposed so a test can
     * assert that rather than assume it.
     */
    baselineAtIndex(index: number): number {
        if (this.finalised < 0) return this.cy[0] ?? 0;
        const i = Math.min(Math.max(index, 0), this.finalised);
        return this.baselineArr[i];
    }

    /** Arc position through which the baseline is settled and will not change. */
    get frontierS(): number {
        return this.finalised < 0 ? -1 : this.finalised * COARSE_STEP;
    }

    /** Baseline at an arc position, interpolated between coarse indices. */
    baselineAtS(s: number): number {
        if (this.filled < 0) return 0;
        const f = Math.max(0, s) / COARSE_STEP;
        const i = Math.floor(f);
        const t = f - i;
        return this.baselineAtIndex(i) * (1 - t) + this.baselineAtIndex(i + 1) * t;
    }

    /**
     * Height for a point the caller already knows in road space.
     *
     * The ribbon takes this path: it knows its own `s` and lateral offset, so
     * it needs no search whatsoever and stays O(1).
     */
    heightAtRoad(s: number, lateral: number, x: number, z: number): number {
        return (
            this.baselineAtS(s) + this.shape(x, z) * LandField.shapeWeight(Math.abs(lateral))
        );
    }

    /**
     * The road sample nearest a world point, by brute force over the polyline.
     *
     * Only the distant grid takes this path, and only for 1,681 vertices spread
     * over several frames, so an O(n) scan over a few hundred entries is
     * affordable here in a way it never was inside `crossHeight`.
     */
    nearest(x: number, z: number, out: LandSample): LandSample {
        let best = Infinity;
        let bestI = -1;
        for (let i = 0; i <= this.filled; i++) {
            const sx = this.cx[i];
            if (sx === undefined) continue;
            const dx = x - sx;
            if (dx > KERNEL_RADIUS || dx < -KERNEL_RADIUS) continue;
            const dz = z - this.cz[i];
            if (dz > KERNEL_RADIUS || dz < -KERNEL_RADIUS) continue;
            const d2 = dx * dx + dz * dz;
            if (d2 < best) {
                best = d2;
                bestI = i;
            }
        }
        if (bestI < 0) {
            out.nearDistance = Infinity;
            out.nearS = 0;
            out.nearY = 0;
            out.baseline = 0;
            return out;
        }
        out.nearDistance = Math.sqrt(best);
        out.nearS = bestI * COARSE_STEP;
        out.nearY = this.cy[bestI];
        out.baseline = this.baselineAtIndex(bestI);
        return out;
    }

    /** The land's own relief, before it is faded out near the road. */
    shape(x: number, z: number): number {
        const a = fbm2(x / SHAPE_WAVE_A, z / SHAPE_WAVE_A, SHAPE_OCTAVES, this.seed + 811);
        const b = fbm2(x / SHAPE_WAVE_B, z / SHAPE_WAVE_B, SHAPE_OCTAVES, this.seed + 827);
        return a * SHAPE_AMP_A + b * SHAPE_AMP_B;
    }

    /** How much of the shape applies at a given distance from the road. */
    static shapeWeight(distance: number): number {
        return smoothstep(0, SHAPE_FADE, distance);
    }

    /** Height at a world position, for callers that do not know their `s`. */
    heightAt(x: number, z: number): number {
        const n = this.nearest(x, z, scratch);
        return n.baseline + this.shape(x, z) * LandField.shapeWeight(n.nearDistance);
    }
}
