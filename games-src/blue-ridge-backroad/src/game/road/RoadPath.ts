import { Vector3 } from 'three';
import { fbm1 } from '../util/noise';
import { hashFloat } from '../util/rng';
import { clamp, smoothstep } from '../util/mathx';
import { ChapterSchedule } from '../world/chapters';

/**
 * THE ROAD COORDINATE SYSTEM.
 *
 * The road is arc-length parameterised: `s` (metres along the road) is the
 * primary coordinate and everything else is a function of it. Curvature and
 * grade come from deterministic seeded noise; heading and elevation are their
 * running integrals, so samples are generated strictly forward and stored in a
 * fixed-size ring buffer. Memory is bounded no matter how far you drive.
 *
 * Everything that needs to know where the ground is — the road ribbon, the
 * terrain skirt, the vehicle physics, prop placement — goes through
 * `sample()` + `crossHeight()`. There is exactly one height function, so those
 * consumers cannot disagree with each other.
 */

export const STEP = 2.0; // metres between samples
const RING = 4096; // 8.2 km of live road held in the table
const MIN_RADIUS = 115; // tightest curve the generator will make
const MAX_KAPPA = 1 / MIN_RADIUS;
const MAX_GRADE = 0.085;
const MAX_BANK = 0.091; // ~5.2 degrees

/** Cross-section geometry, shared by the mesh builders and the physics. */
export const SHOULDER_W = 1.35; // gravel shoulder beyond the carriageway
export const DITCH_W = 2.6; // drainage ditch beyond the shoulder
export const DITCH_DEPTH = 0.85;
export const TERRAIN_HALF_WIDTH = 62; // how far the conforming terrain skirt reaches
const CROWN = 0.075; // road crown drop at the edge

export const SURFACE_ROAD = 0;
export const SURFACE_SHOULDER = 1;
export const SURFACE_DITCH = 2;
export const SURFACE_GRASS = 3;

/** Discovery events. Kept here because the generator has to flatten the road
 *  for them *while* it is generating — see DECISIONS D0.10. */
export const EVENT_NONE = -1;
export const EVENT_BRIDGE = 0;
export const EVENT_GAS_STATION = 1;
export const EVENT_CABIN = 2;
export const EVENT_FIRE_TOWER = 3;
export const EVENT_JUNKED_TRUCK = 4;
export const EVENT_FOGGY_HOLLOW = 5;
export const EVENT_STRANGE_LIGHTS = 6;
export const EVENT_COUNT = 7;

export const EVENT_NAMES: readonly string[] = [
    'Creek Bridge',
    'Abandoned Gas Station',
    'Old Cabin',
    'Fire Tower',
    'Junked Truck',
    'Foggy Hollow',
    'Strange Lights'
];

const EVENT_SPACING = 640; // metres between candidate slots
/** A foggy hollow is a stretch of road, not a landmark you pass in a second. */
export const HOLLOW_SPAN = 320; // total length, metres
const HOLLOW_CORE = 100; // full density within this of the centre
const EVENT_FLAT_SPAN = 46; // fully flat road either side of the centre
const EVENT_TAPER = 55; // taper back to normal curvature over this distance

/** Events that must sit on genuinely flat, straight road. */
const FLATTENING_EVENTS = new Set([EVENT_BRIDGE, EVENT_GAS_STATION, EVENT_JUNKED_TRUCK]);

export interface RoadFrame {
    s: number;
    pos: Vector3;
    tangent: Vector3;
    /** Horizontal lateral axis (unbanked). Points to the driver's right. */
    right: Vector3;
    /** Lateral axis rotated by the bank angle — the surface across-vector. */
    surfaceRight: Vector3;
    /** Road surface normal (banked). */
    normal: Vector3;
    elevation: number;
    curvature: number;
    heading: number;
    width: number;
    bank: number;
    /** > 0 when the hillside rises on the right, < 0 when it rises on the left. */
    sideBias: number;
}

export const createFrame = (): RoadFrame => ({
    s: 0,
    pos: new Vector3(),
    tangent: new Vector3(0, 0, 1),
    right: new Vector3(-1, 0, 0),
    surfaceRight: new Vector3(-1, 0, 0),
    normal: new Vector3(0, 1, 0),
    elevation: 0,
    curvature: 0,
    heading: 0,
    width: 6,
    bank: 0,
    sideBias: 0
});

export interface ProjectResult {
    s: number;
    lateral: number;
}

export const createProjectResult = (): ProjectResult => ({ s: 0, lateral: 0 });

export interface EventSlot {
    /** Slot index; also the deterministic seed for the set-piece's own details. */
    index: number;
    /** Centre distance along the road. */
    s: number;
    /** One of the EVENT_* constants, or EVENT_NONE. */
    kind: number;
    /** Which side of the road it sits on: -1 left, +1 right. */
    side: number;
}

export class RoadPath {
    readonly seed: number;
    /**
     * Long-form character of the road. Consulted by the shape functions below,
     * and a pure function of distance, so regenerating the road from the origin
     * reproduces exactly the same road — which matters, because `rewind()` does
     * precisely that.
     */
    readonly chapters: ChapterSchedule;

    // Ring-buffer sample table. Index i lives at slot (i % RING).
    private readonly px = new Float64Array(RING);
    private readonly py = new Float64Array(RING);
    private readonly pz = new Float64Array(RING);
    private readonly headingArr = new Float64Array(RING);
    private readonly kappaArr = new Float64Array(RING);
    private readonly bankArr = new Float64Array(RING);
    private readonly widthArr = new Float64Array(RING);
    private readonly biasArr = new Float64Array(RING);

    /** Highest generated index (inclusive). */
    private head = -1;
    /** Lowest index still valid in the ring. */
    private tail = 0;

    constructor(seed: number) {
        this.seed = seed >>> 0;
        this.chapters = new ChapterSchedule(this.seed);
        this.ensure(1000);
    }

    // ------------------------------------------------------- event schedule

    /**
     * The event schedule is a pure function of the slot index, so it can be
     * evaluated *during* road generation. That is what lets the generator
     * flatten the road under a bridge instead of discovering afterwards that the
     * bridge landed mid-corner.
     */
    eventSlot(index: number, out: EventSlot): EventSlot {
        const r2 = hashFloat((index * 1597334677) ^ (this.seed * 22695477));
        out.index = index;
        // Jitter the centre so events do not feel metronomic.
        out.s = this.slotCentre(index);
        // The first slot is skipped so the drive starts on plain road.
        out.kind = this.slotKind(index);
        out.side = r2 < 0.5 ? -1 : 1;
        return out;
    }

    /** Slot index nearest to a distance. */
    static slotIndexFor(s: number): number {
        return Math.round(s / EVENT_SPACING);
    }

    /**
     * Set-pieces forced into slots.
     *
     * Consulted from `slotKind`, which means an override reaches the *generator*
     * — fog and the flattening under a bridge are computed from the schedule
     * while the road is being built, not applied to it afterwards. That is the
     * whole requirement in AI-DIRECTOR §3.4: a decision keyed by slot index and
     * fed back through the same generators survives a level-of-detail rebuild,
     * where anything applied imperatively to a live object would silently
     * revert.
     *
     * The corollary is that a slot may only be overridden while its road is
     * still ungenerated. The caller enforces that; `generatedThroughS` is how it
     * knows where the line is.
     */
    private readonly eventOverrides = new Map<number, number>();

    /** Force a set-piece into a slot, or `EVENT_NONE` to empty it. */
    overrideEventSlot(index: number, kind: number): void {
        this.eventOverrides.set(index, kind);
    }

    /** Drop forced set-pieces from `index` onward. The ramp-home path. */
    clearEventOverridesFrom(index: number): void {
        for (const key of [...this.eventOverrides.keys()]) if (key >= index) this.eventOverrides.delete(key);
    }

    /** What kind of event slot `index` holds. Pure function of the seed. */
    private slotKind(index: number): number {
        if (index <= 0) return EVENT_NONE;
        const forced = this.eventOverrides.get(index);
        if (forced !== undefined) return forced;
        const r = hashFloat((index * 2654435761) ^ (this.seed * 40503));
        return r < 0.62 ? Math.floor(r * 1000) % EVENT_COUNT : EVENT_NONE;
    }

    /** What kind of event slot `index` holds. Public so the director can find a free one. */
    kindOfSlot(index: number): number {
        return this.slotKind(index);
    }

    /** Where slot `index` sits, publicly. */
    centreOfSlot(index: number): number {
        return this.slotCentre(index);
    }

    /**
     * How far the sample ring has actually been built. Anything at or below this
     * is already baked into geometry someone may be looking at; anything above
     * it is still free to be decided.
     */
    get generatedThroughS(): number {
        return this.head < 0 ? 0 : this.head * STEP;
    }

    /** Where slot `index` sits along the road. */
    private slotCentre(index: number): number {
        const r2 = hashFloat((index * 1597334677) ^ (this.seed * 22695477));
        return index * EVENT_SPACING + (r2 - 0.5) * EVENT_SPACING * 0.45;
    }

    /**
     * Fog density at distance `s`: 0 on open road, 1 deep inside a hollow.
     *
     * Taken from the schedule rather than from the set-piece's mesh, so it does
     * not depend on that chunk still being streamed in — the hollow is longer
     * than the streaming window is deep behind you, and tying visibility to a
     * loaded object made the fog vanish the moment you were through it.
     */
    fogAt(s: number): number {
        const n = Math.round(s / EVENT_SPACING);
        let f = 0;
        for (let i = n - 1; i <= n + 1; i++) {
            if (this.slotKind(i) !== EVENT_FOGGY_HOLLOW) continue;
            const d = Math.abs(s - this.slotCentre(i));
            f = Math.max(f, 1 - smoothstep(HOLLOW_CORE, HOLLOW_SPAN * 0.5, d));
        }
        // A chapter can lay a baseline haze over everything; a hollow inside one
        // is thicker still.
        return Math.max(f, this.chapters.paramsAt(s).fogBias);
    }

    /**
     * 1 on ordinary road, 0 where an event demands flat straight ground.
     * Only the two nearest slots can possibly influence a given `s`.
     */
    private flatten(s: number): number {
        const n = Math.round(s / EVENT_SPACING);
        let f = 1;
        for (let i = n - 1; i <= n + 1; i++) {
            const kind = this.slotKind(i);
            if (kind === EVENT_NONE || !FLATTENING_EVENTS.has(kind)) continue;
            const d = Math.abs(s - this.slotCentre(i));
            if (d >= EVENT_FLAT_SPAN + EVENT_TAPER) continue;
            f = Math.min(f, smoothstep(EVENT_FLAT_SPAN, EVENT_FLAT_SPAN + EVENT_TAPER, d));
        }
        return f;
    }

    // ---------------------------------------------------------------- shape

    /**
     * The shape of the road at a distance, ignoring chapters and without
     * touching the sample ring.
     *
     * The scout needs to evaluate stretches of road it is nowhere near, and both
     * of the obvious ways to do that are traps: going through `sample()` clamps
     * to whatever the ring still holds, and toggling the chapter flag to read
     * the neutral road would invalidate the road the player is currently on.
     * These are pure functions of distance, so they can simply be asked
     * directly.
     */
    neutralShapeAt(s: number, out: { curvature: number; grade: number; width: number }): void {
        out.curvature = this.curvatureFrom(s, -1);
        out.grade = this.gradeFrom(s, 1);
        out.width = this.widthFrom(s, -1);
    }

    /** Signed curvature at s, rad/m. Pure function of s — no state. */
    private curvatureAt(s: number): number {
        return this.curvatureFrom(s, this.chapters.paramsAt(s).twistiness);
    }

    private curvatureFrom(s: number, twist: number): number {
        // A slow envelope opens genuine straights and closes twisty sections, so
        // the road has rhythm and there are places to reach top speed.
        const noiseEnv = 0.22 + 0.78 * smoothstep(-0.4, 0.5, fbm1(s / 1100, 2, this.seed + 3));
        // A chapter replaces the envelope; the noise then only adds local
        // variety within it, so the chapter's character always dominates.
        const env = twist < 0 ? noiseEnv : twist * (0.55 + 0.45 * noiseEnv);
        const k =
            0.66 * fbm1(s / 340, 1, this.seed + 11) +
            0.26 * fbm1(s / 140, 1, this.seed + 23) +
            0.08 * fbm1(s / 52, 1, this.seed + 37);
        return clamp(k * env * MAX_KAPPA * 1.5, -MAX_KAPPA, MAX_KAPPA) * this.flatten(s);
    }

    /** Longitudinal grade (rise/run) at s. */
    private gradeAt(s: number): number {
        return this.gradeFrom(s, this.chapters.paramsAt(s).gradeScale);
    }

    private gradeFrom(s: number, scale: number): number {
        const g =
            0.72 * fbm1(s / 430, 1, this.seed + 61) +
            0.28 * fbm1(s / 155, 1, this.seed + 71) +
            0.07 * fbm1(s / 48, 1, this.seed + 83);
        return clamp(g * scale * MAX_GRADE * 1.35, -MAX_GRADE, MAX_GRADE) * this.flatten(s);
    }

    private widthAt(s: number): number {
        return this.widthFrom(s, this.chapters.paramsAt(s).widthTarget);
    }

    private widthFrom(s: number, target: number): number {
        // 24 ft .. 31 ft. Wider than a real single-track mountain road, which
        // the original spec asked for at 16-22 ft — but at 90 mph on gravel
        // that left no room to place the truck, and playing it is the test that
        // matters. See DECISIONS D5.1.
        const n01 = 0.5 + 0.5 * fbm1(s / 300, 2, this.seed + 101);
        // A chapter sets the width and the noise varies it by half a metre or
        // so; with no chapter the noise owns the whole 24-31 ft range.
        return target < 0 ? 7.3 + 2.1 * n01 : target + (n01 - 0.5) * 0.9;
    }

    // ------------------------------------------------------------- generate

    /** Make sure samples exist through index `index`. */
    ensureIndex(index: number): void {
        if (index <= this.head) return;
        if (this.head < 0) {
            this.px[0] = 0;
            this.py[0] = 0;
            this.pz[0] = 0;
            this.headingArr[0] = 0;
            this.kappaArr[0] = this.curvatureAt(0);
            this.bankArr[0] = this.bankTarget(this.kappaArr[0]);
            this.widthArr[0] = this.widthAt(0);
            this.biasArr[0] = fbm1(0, 2, this.seed + 131);
            this.head = 0;
            this.tail = 0;
        }
        for (let i = this.head + 1; i <= index; i++) {
            const prev = (i - 1) % RING;
            const slot = i % RING;
            const sPrev = (i - 1) * STEP;
            const s = i * STEP;

            const kPrev = this.kappaArr[prev];
            const k = this.curvatureAt(s);
            // Trapezoidal integration of curvature -> heading; the midpoint
            // heading advances the position, which keeps the polyline centred
            // on the true arc.
            const h = this.headingArr[prev] + 0.5 * (kPrev + k) * STEP;
            const hMid = this.headingArr[prev] + 0.25 * (kPrev + k) * STEP;
            const grade = 0.5 * (this.gradeAt(sPrev) + this.gradeAt(s));

            this.headingArr[slot] = h;
            this.kappaArr[slot] = k;
            this.px[slot] = this.px[prev] + Math.sin(hMid) * STEP;
            this.pz[slot] = this.pz[prev] + Math.cos(hMid) * STEP;
            this.py[slot] = this.py[prev] + grade * STEP;
            // Rate-limit the bank so the ruled ribbon surface stays within a
            // couple of millimetres of the analytic height function.
            const target = this.bankTarget(k);
            const maxDelta = 0.0035 * STEP; // ~0.2 deg per metre
            const prevBank = this.bankArr[prev];
            this.bankArr[slot] = clamp(target, prevBank - maxDelta, prevBank + maxDelta);
            this.widthArr[slot] = this.widthAt(s);
            this.biasArr[slot] = fbm1(s / 330, 2, this.seed + 131);

            this.head = i;
            if (this.head - this.tail >= RING) this.tail = this.head - RING + 1;
        }
    }

    ensure(sMax: number): void {
        this.ensureIndex(Math.ceil(sMax / STEP) + 2);
    }

    private bankTarget(k: number): number {
        // Superelevation raises the OUTSIDE of the curve.
        //
        // In this right-handed, Y-up world a positive Y rotation turns left, so
        // positive curvature is a left-hand curve, whose outside is the driver's
        // right. `crossHeight` raises lateral offset `l` by `l * sin(bank)` and
        // `l` is positive to the right, so raising the right edge means a
        // positive bank. Getting this backwards banks every curve into the
        // ditch, which is exactly what it looks like.
        return clamp(k * 9.5, -MAX_BANK, MAX_BANK);
    }

    /**
     * Throw the sample table away and regenerate from the origin, so a distance
     * the ring has already pruned becomes addressable again.
     *
     * Samples are generated strictly forward because heading and elevation are
     * running integrals, and the ring keeps memory bounded by discarding what is
     * behind you. That is fine while driving, but it means you cannot jump back
     * to the stage start after a long free drive — the stage's own road is gone.
     * Regeneration is deterministic, so what comes back is identical, and
     * rebuilding a few hundred samples costs microseconds.
     */
    rewind(throughS: number): void {
        this.head = -1;
        this.tail = 0;
        this.ensure(Math.max(0, throughS) + 400);
    }

    get maxS(): number {
        return this.head * STEP;
    }

    get minS(): number {
        return this.tail * STEP;
    }

    // --------------------------------------------------------------- sample

    /** Fill `out` with the road frame at distance `s`. Allocation-free. */
    sample(s: number, out: RoadFrame): RoadFrame {
        const sClamped = Math.max(this.minS, s);
        this.ensure(sClamped + STEP * 2);
        const fi = sClamped / STEP;
        let i0 = Math.floor(fi);
        if (i0 < this.tail) i0 = this.tail;
        if (i0 > this.head - 1) i0 = Math.max(this.tail, this.head - 1);
        const t = clamp(fi - i0, 0, 1);
        const a = i0 % RING;
        const b = (i0 + 1) % RING;

        const x = this.px[a] + (this.px[b] - this.px[a]) * t;
        const y = this.py[a] + (this.py[b] - this.py[a]) * t;
        const z = this.pz[a] + (this.pz[b] - this.pz[a]) * t;
        // Heading is a running integral, so it never wraps and interpolates
        // linearly without any angle-difference handling.
        const h = this.headingArr[a] + (this.headingArr[b] - this.headingArr[a]) * t;
        const k = this.kappaArr[a] + (this.kappaArr[b] - this.kappaArr[a]) * t;
        const bk = this.bankArr[a] + (this.bankArr[b] - this.bankArr[a]) * t;
        const w = this.widthArr[a] + (this.widthArr[b] - this.widthArr[a]) * t;
        const bs = this.biasArr[a] + (this.biasArr[b] - this.biasArr[a]) * t;

        const dy = (this.py[b] - this.py[a]) / STEP; // grade
        const sh = Math.sin(h);
        const ch = Math.cos(h);
        const invLen = 1 / Math.sqrt(1 + dy * dy);

        out.s = sClamped;
        out.pos.set(x, y, z);
        out.tangent.set(sh * invLen, dy * invLen, ch * invLen);
        out.right.set(-ch, 0, sh);
        const cb = Math.cos(bk);
        const sb = Math.sin(bk);
        out.surfaceRight.set(-ch * cb, sb, sh * cb);
        // right x tangent = up, so surfaceRight x tangent is the banked normal.
        out.normal.crossVectors(out.surfaceRight, out.tangent).normalize();
        out.elevation = y;
        out.curvature = k;
        out.heading = h;
        out.width = w;
        out.bank = bk;
        out.sideBias = bs;
        return out;
    }

    // -------------------------------------------------------------- project

    /**
     * Map a world XZ position to (s, lateral). `hintS` must come from the
     * *previous projection*, never from an integrated guess, so spins and
     * reversing cannot desynchronise it. The window widens automatically when
     * the closest sample lands on its edge, which covers teleports and resumes.
     */
    project(worldX: number, worldZ: number, hintS: number, out: ProjectResult): ProjectResult {
        const hintIdx = clamp(Math.round(hintS / STEP), this.tail, this.head);
        let window = 20; // +/- 40 m
        let best = hintIdx;

        for (let attempt = 0; attempt < 5; attempt++) {
            const lo = Math.max(this.tail, hintIdx - window);
            const hi = Math.min(this.head, hintIdx + window);
            best = lo;
            let bestD = Infinity;
            for (let i = lo; i <= hi; i++) {
                const slot = i % RING;
                const dx = worldX - this.px[slot];
                const dz = worldZ - this.pz[slot];
                const d = dx * dx + dz * dz;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
            const onEdge = (best === lo && lo > this.tail) || (best === hi && hi < this.head);
            if (!onEdge) break;
            window *= 4;
        }

        // Refine along the segment by projecting onto the local tangent. This is
        // a dot product, not a Newton division, so there is no singularity at
        // the centre of curvature.
        const slot = best % RING;
        const h = this.headingArr[slot];
        const sh = Math.sin(h);
        const ch = Math.cos(h);
        const dx = worldX - this.px[slot];
        const dz = worldZ - this.pz[slot];
        const along = clamp(dx * sh + dz * ch, -STEP, STEP);

        out.s = clamp(best * STEP + along, this.minS, this.maxS);
        // right = (-cos h, sin h) in the horizontal plane.
        // Clamped well inside the minimum radius so the mapping never folds.
        out.lateral = clamp(dx * -ch + dz * sh, -TERRAIN_HALF_WIDTH * 1.6, TERRAIN_HALF_WIDTH * 1.6);
        return out;
    }

    // ------------------------------------------------------- cross section

    /**
     * Ground height at signed lateral offset `l`, relative to the centreline
     * elevation. One function, used by the road mesh, the terrain mesh, prop
     * placement and the physics — so they cannot disagree.
     */
    crossHeight(frame: RoadFrame, l: number): number {
        return this.crossHeightMacro(frame, l) + (Math.abs(l) <= frame.width * 0.5 ? this.roadDetail(frame.s, l) : 0);
    }

    /**
     * The cross-section without the fine road relief. Slopes are taken from
     * this, not from `crossHeight`: differentiating the ruts and potholes turns
     * a few centimetres of texture into a tenth of a g of pseudo-random lateral
     * gravity that flips sign every few metres, and the truck twitches. The
     * relief is still felt, through the per-wheel ground height.
     */
    crossHeightMacro(frame: RoadFrame, l: number): number {
        const hw = frame.width * 0.5;
        const a = Math.abs(l);
        // The whole cross-section tilts with the road.
        let y = l * Math.sin(frame.bank);

        if (a <= hw) {
            const u = a / hw;
            return y - CROWN * u * u; // crowned carriageway
        }
        y -= CROWN;

        const shoulderEnd = hw + SHOULDER_W;
        if (a <= shoulderEnd) {
            const u = (a - hw) / SHOULDER_W;
            return y - 0.16 * u; // shoulder falls away gently
        }
        y -= 0.16;

        const ditchEnd = shoulderEnd + DITCH_W;
        if (a <= ditchEnd) {
            const u = (a - shoulderEnd) / DITCH_W;
            const d = Math.sin(u * Math.PI);
            return y - DITCH_DEPTH * d * d * 1.15 + 0.22 * u;
        }
        y += 0.22;

        // Beyond the ditch the hillside takes over: one side is a cut bank
        // climbing away from the road, the other falls into the hollow.
        //
        // The slope eases in over the first dozen metres rather than starting at
        // its full angle right at the ditch lip. Real roads are graded that way,
        // and it also means a driver who runs wide lands on a survivable verge
        // instead of being flung down a 40-degree bank by gravity alone.
        const side = l > 0 ? 1 : -1;
        const rise = frame.sideBias * side; // +1 cut bank, -1 fill slope
        const out = a - ditchEnd;
        const slope = 0.1 + (0.16 + 0.45 * rise) * smoothstep(0, 15, out);
        const roll = fbm1((frame.s * 0.9 + l * 2.6) / 48, 3, this.seed + 211);
        return y + out * slope + roll * Math.min(out * 0.6, 7) * 0.6;
    }

    /**
     * Fine road-surface relief inside the carriageway: two compacted tire ruts,
     * plus washboard and shallow potholes. Amplitude is a few centimetres, which
     * the suspension feels as texture rather than as an obstacle. The physics and
     * the mesh both read it from here, so the wheels sit in the visible ruts.
     */
    roadDetail(s: number, l: number): number {
        // Tire ruts, roughly a track-width apart.
        const rut = Math.abs(l) - 0.95;
        const rutDepth = -0.022 * Math.exp(-rut * rut * 6);
        // Washboard: low-amplitude ripples that build up in the corners.
        const wash = 0.008 * Math.sin(s * 1.9) * (0.5 + 0.5 * fbm1(s / 30, 1, this.seed + 401));
        // Shallow potholes, sparse and deterministic.
        const ph = fbm1(s / 9 + l * 0.7, 2, this.seed + 409);
        const pot = ph > 0.62 ? -0.055 * (ph - 0.62) / 0.38 : 0;
        return rutDepth + wash + pot;
    }

    /**
     * The macro cross-slope, by central difference. This is what gravity is
     * resolved against, so it deliberately excludes the fine relief.
     */
    crossSlope(frame: RoadFrame, l: number): number {
        const e = 0.15;
        return (this.crossHeightMacro(frame, l + e) - this.crossHeightMacro(frame, l - e)) / (2 * e);
    }

    /** Which surface is at lateral offset `l`. */
    surfaceAt(frame: RoadFrame, l: number): number {
        const hw = frame.width * 0.5;
        const a = Math.abs(l);
        if (a <= hw) return SURFACE_ROAD;
        if (a <= hw + SHOULDER_W) return SURFACE_SHOULDER;
        if (a <= hw + SHOULDER_W + DITCH_W) return SURFACE_DITCH;
        return SURFACE_GRASS;
    }

    /** World position of a point on the ground at (frame, lateral). */
    surfacePoint(frame: RoadFrame, l: number, target: Vector3): Vector3 {
        target.copy(frame.pos);
        target.x += frame.right.x * l;
        target.z += frame.right.z * l;
        target.y += this.crossHeight(frame, l);
        return target;
    }
}
