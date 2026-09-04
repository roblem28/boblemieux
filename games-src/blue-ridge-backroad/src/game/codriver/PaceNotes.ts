/**
 * Pace notes, as a pure function of the road ahead.
 *
 * There is no model anywhere in here and there should not be one. A pace note is
 * a closed grammar over data the game already computes ten times a second —
 * direction, severity, and a handful of linking words. Putting a language model
 * in this path would add latency, nondeterminism and cost in exchange for
 * nothing, and it would stop working the moment the model was unreachable.
 *
 * Severity follows the rally convention where **lower is tighter**.
 *
 * Two things here were tuned against measurements of this specific road rather
 * than against what rally notes usually contain:
 *
 *  - **The severity bands are calibrated to the road that exists.** The
 *    generator clamps to a 115 m minimum radius, but in practice it rarely goes
 *    below ~140 m, and most corners land between 140 m and 560 m. Bands spread
 *    over that range, so the numbers actually distinguish corners. Textbook
 *    bands would have called almost everything a 6.
 *
 *  - **There are no crest calls, because there are no crests.** The first
 *    version detected turning points in the elevation profile. Measuring the
 *    road showed the largest turn-over inside the 360 m preview window is
 *    typically *zero* and never more than about 0.3 m — the grade noise works on
 *    140-430 m wavelengths, so what the road has is long smooth gradients, not
 *    brows. Calling "over crest" for a 0.2 m rise would be announcing a feature
 *    the player cannot feel. Gradient is called instead, which is both real and
 *    useful: a downhill corner needs braking earlier.
 */

/** Below this curvature the road is straight enough not to call. R = 460 m. */
const KAPPA_STRAIGHT = 1 / 460;
/** Grip reserved for cornering, matching CoursePreview so the two agree. */
const CORNER_GRIP = 0.62;
const G = 9.81;
/** A corner longer than this is called "long". */
const LONG_CORNER = 130;
/** Curvature must change by this fraction across a corner to be called. */
const TREND_FRACTION = 0.28;
/** Elevation change across a corner before its gradient is called, metres. */
const GRADIENT_CALL = 1.5;
/** Carriageway narrowing that earns a call, in metres. */
const NARROWS_BY = 0.55;

export interface RoadFeature {
    /** Metres ahead of the vehicle where it begins. */
    distance: number;
    /** Length in metres. */
    length: number;
    /** +1 left, -1 right. */
    direction: number;
    /** 3 (tightest this road produces) .. 6 (barely a kink). */
    severity: number;
    /** > 0 tightens through the corner, < 0 opens out. */
    trend: number;
    /** The speed it can be carried at, m/s. */
    safeSpeed: number;
    /** Elevation change across the corner, metres. Negative is downhill. */
    gradient: number;
    /** True when the carriageway narrows noticeably through it. */
    narrows: boolean;
}

export const createFeature = (): RoadFeature => ({
    distance: 0,
    length: 0,
    direction: 0,
    severity: 6,
    trend: 0,
    safeSpeed: 0,
    gradient: 0,
    narrows: false
});

/**
 * Radius in metres to a severity. Lower is tighter. Calibrated to this road's
 * measured range — see the note at the top of the file.
 */
export const severityForRadius = (radius: number): number => {
    if (radius <= 150) return 3;
    if (radius <= 200) return 4;
    if (radius <= 280) return 5;
    return 6;
};

/**
 * Read the sampled road ahead into a list of corners, writing into a
 * caller-owned pool. Returns how many were written.
 *
 * `curvature`, `rise` and `width` are parallel arrays; sample `i` sits
 * `(i + 1) * step` metres ahead of the vehicle.
 */
export const analysePreview = (
    curvature: Float32Array,
    rise: Float32Array,
    width: Float32Array,
    count: number,
    step: number,
    pool: RoadFeature[]
): number => {
    let written = 0;

    // Mean width, so "narrows" is relative to this road rather than absolute.
    let widthSum = 0;
    for (let i = 0; i < count; i++) widthSum += width[i];
    const meanWidth = count > 0 ? widthSum / count : 0;

    let i = 0;
    while (i < count && written < pool.length) {
        const k = curvature[i];
        if (Math.abs(k) < KAPPA_STRAIGHT) {
            i += 1;
            continue;
        }
        const sign = k > 0 ? 1 : -1;

        // A run starting at the very first sample is a corner already under way,
        // not one coming up: its "entry" is just the near edge of the preview
        // window, which tracks the vehicle. Calling those re-announces the same
        // corner every few metres the whole way through it.
        if (i === 0) {
            while (i < count && curvature[i] * sign >= KAPPA_STRAIGHT) i += 1;
            continue;
        }

        let j = i;
        let peak = 0;
        let minWidth = Infinity;
        while (j < count && curvature[j] * sign >= KAPPA_STRAIGHT) {
            const mag = Math.abs(curvature[j]);
            if (mag > peak) peak = mag;
            if (width[j] < minWidth) minWidth = width[j];
            j += 1;
        }

        const runLength = j - i;
        const mid = i + (runLength >> 1);
        let firstSum = 0;
        let secondSum = 0;
        for (let n = i; n < mid; n++) firstSum += Math.abs(curvature[n]);
        for (let n = mid; n < j; n++) secondSum += Math.abs(curvature[n]);
        const firstHalf = mid > i ? firstSum / (mid - i) : 0;
        const secondHalf = j > mid ? secondSum / (j - mid) : 0;

        const f = pool[written];
        f.distance = (i + 1) * step;
        f.length = runLength * step;
        f.direction = sign;
        f.severity = severityForRadius(peak > 0 ? 1 / peak : Infinity);
        f.trend = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : 0;
        f.safeSpeed = peak > 1e-5 ? Math.sqrt((CORNER_GRIP * G) / peak) : 90;
        f.gradient = rise[j - 1] - rise[i];
        f.narrows = minWidth < meanWidth - NARROWS_BY;
        written += 1;

        i = j;
    }

    return written;
};

const side = (direction: number): string => (direction > 0 ? 'left' : 'right');

/** One corner, without any linking. */
const phraseOne = (f: RoadFeature): string => {
    let out = '';
    if (f.length > LONG_CORNER) out += 'long ';
    out += `${side(f.direction)} ${f.severity}`;
    if (f.trend > TREND_FRACTION) out += ' tightens';
    else if (f.trend < -TREND_FRACTION) out += ' opens';
    if (f.narrows) out += ' narrows';
    if (f.gradient < -GRADIENT_CALL) out += ' downhill';
    else if (f.gradient > GRADIENT_CALL) out += ' uphill';
    return out;
};

/**
 * Turn one or two corners into a call. Two close together are linked with
 * "into", which is how they are actually delivered — a driver needs the pair as
 * one thought, not two calls a second apart.
 */
export const phrase = (f: RoadFeature, linked: RoadFeature | null): string => {
    const head = phraseOne(f);
    return linked ? `${head} into ${phraseOne(linked)}` : head;
};

/** Metres between two corners below which they are called as one. */
export const LINK_GAP = 55;

/** True when `next` follows `f` closely enough to be linked into one call. */
export const shouldLink = (f: RoadFeature, next: RoadFeature | null): boolean =>
    next !== null && next.distance - (f.distance + f.length) <= LINK_GAP;
