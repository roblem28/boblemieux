import { hashFloat } from '../util/rng';
import { clamp, smoothstep } from '../util/mathx';

/**
 * Road chapters — long stretches with a distinct character.
 *
 * The point of bundling parameters into named chapters, rather than exposing
 * six independent floats, is perceptibility. Most combinations of six floats
 * produce a road no player can tell from the last one; a chapter changes several
 * things at once, in a combination someone chose, so every transition is
 * noticeable by construction. It also makes a future director's job trivial: it
 * picks a name, not a vector.
 *
 * Ordered roughly by how strongly each lever registers with a player:
 * time of day > fog > width > curvature > grade > grip.
 *
 * **Grip is a surface property here, never a difficulty one.** The handling
 * parameters — stability, rear bias, catch lock — belong to the difficulty the
 * player chose and are never touched. What a chapter changes is what the road is
 * like, and the co-driver says so out loud. A hidden hand on the grip reads as
 * the game patronising you; "damp through here" reads as information.
 */

export type SurfaceName = 'dry' | 'damp' | 'greasy' | 'loose';

export interface Surface {
    name: SurfaceName;
    /** Multiplies tire grip. */
    grip: number;
    /** Multiplies rolling resistance. */
    drag: number;
    /** What the co-driver calls it. */
    call: string;
}

export const SURFACES: Record<SurfaceName, Surface> = {
    dry: { name: 'dry', grip: 1, drag: 1, call: 'surface dry' },
    damp: { name: 'damp', grip: 0.93, drag: 1.05, call: 'damp through here' },
    greasy: { name: 'greasy', grip: 0.85, drag: 1.1, call: 'greasy, careful' },
    loose: { name: 'loose', grip: 0.9, drag: 1.16, call: 'loose gravel' }
};

export interface Chapter {
    name: string;
    label: string;
    /**
     * How twisty this chapter is, 0 (dead straight) to 1 (as tight as the
     * generator goes). This *replaces* the generator's own twistiness envelope
     * rather than scaling its output — scaling was swamped by the envelope,
     * which already swings 0.22..1.0 on its own, so "Switchbacks" was not
     * reliably twistier than "Open Country".
     */
    twistiness: number;
    gradeScale: number;
    /**
     * Target carriageway width in metres, which the generator varies by about
     * +/-0.45 m around. Set rather than scaled, for the same reason as
     * `twistiness`: the underlying noise varies width by as much as a scale
     * factor would, so scaling did not reliably order the chapters.
     */
    widthTarget: number;
    /** Baseline fog on top of whatever the hollows contribute, 0..1. */
    fogBias: number;
    /** Target sun phase, 0 dawn .. 0.5 midday .. 1 dusk. */
    timeOfDay: number;
    surface: SurfaceName;
}

export const CHAPTERS: readonly Chapter[] = [
    {
        name: 'open',
        label: 'Open Country',
        twistiness: 0.18,
        gradeScale: 0.5,
        widthTarget: 9.6,
        fogBias: 0,
        timeOfDay: 0.5,
        surface: 'dry'
    },
    {
        name: 'switchbacks',
        label: 'The Switchbacks',
        twistiness: 1,
        gradeScale: 1.3,
        widthTarget: 7.5,
        fogBias: 0,
        timeOfDay: 0.42,
        surface: 'dry'
    },
    {
        name: 'haze',
        label: 'Morning Haze',
        twistiness: 0.5,
        gradeScale: 0.75,
        widthTarget: 8.5,
        fogBias: 0.34,
        timeOfDay: 0.12,
        surface: 'damp'
    },
    {
        name: 'golden',
        label: 'Golden Hour',
        twistiness: 0.62,
        gradeScale: 1,
        widthTarget: 8.2,
        fogBias: 0.04,
        timeOfDay: 0.88,
        surface: 'dry'
    },
    {
        name: 'hollow',
        label: 'The Long Hollow',
        twistiness: 0.7,
        gradeScale: 0.6,
        widthTarget: 7.9,
        fogBias: 0.66,
        timeOfDay: 0.2,
        surface: 'greasy'
    },
    {
        name: 'ridge',
        label: 'Ridge Run',
        twistiness: 0.4,
        gradeScale: 1.7,
        widthTarget: 9.1,
        fogBias: 0,
        timeOfDay: 0.56,
        surface: 'dry'
    },
    {
        name: 'washboard',
        label: 'Washboard',
        twistiness: 0.75,
        gradeScale: 0.85,
        widthTarget: 7.2,
        fogBias: 0,
        timeOfDay: 0.62,
        surface: 'loose'
    },
    {
        name: 'lastlight',
        label: 'Last Light',
        twistiness: 0.8,
        gradeScale: 1.05,
        widthTarget: 8.8,
        fogBias: 0.16,
        timeOfDay: 0.97,
        surface: 'damp'
    }
];

/** The road exactly as it is with chapters switched off. */
export const NEUTRAL: Chapter = {
    name: 'neutral',
    label: '',
    twistiness: -1, // < 0 means "leave the generator's own envelope alone"
    gradeScale: 1,
    widthTarget: -1,
    fogBias: 0,
    timeOfDay: -1, // < 0 means "leave the day cycle alone"
    surface: 'dry'
};

/** Metres per chapter, and the distance over which one blends into the next. */
export const CHAPTER_LENGTH = 1400;
export const CHAPTER_RAMP = 420;

/** The interpolated parameters in force at a distance. */
export interface ChapterParams {
    twistiness: number;
    gradeScale: number;
    widthTarget: number;
    fogBias: number;
    timeOfDay: number;
    grip: number;
    drag: number;
}

const scratch: ChapterParams = {
    twistiness: -1,
    gradeScale: 1,
    widthTarget: -1,
    fogBias: 0,
    timeOfDay: -1,
    grip: 1,
    drag: 1
};

/**
 * Which chapter occupies slot `n`. A pure function of the seed, so the schedule
 * survives the road being regenerated from the origin — which it is, whenever
 * the vehicle jumps back to a distance the sample ring has pruned. An override
 * map is consulted first, which is where a director would eventually write.
 */
export class ChapterSchedule {
    /** When false, the road is exactly as it would be with no chapters at all. */
    enabled = false;

    private readonly overrides = new Map<number, number>();
    /**
     * Resolved indices. The schedule steps forward by a non-zero offset from the
     * previous slot, which guarantees no chapter follows itself — but that makes
     * each slot depend on the one before, so results are memoised rather than
     * recomputed from slot zero on every road sample.
     */
    private readonly resolved = new Map<number, number>();

    constructor(private readonly seed: number) {}

    indexAt(slot: number): number {
        if (slot <= 0) return 0;
        const override = this.overrides.get(slot);
        if (override !== undefined) return override;
        const cached = this.resolved.get(slot);
        if (cached !== undefined) return cached;

        // Walk forward from the last slot we know, filling the cache.
        let known = slot - 1;
        while (known > 0 && !this.resolved.has(known) && this.overrides.get(known) === undefined) known -= 1;
        let previous = known <= 0 ? 0 : (this.overrides.get(known) ?? this.resolved.get(known) ?? 0);

        for (let n = known + 1; n <= slot; n++) {
            const forced = this.overrides.get(n);
            if (forced !== undefined) {
                previous = forced;
                continue;
            }
            const r = hashFloat((n * 2246822519) ^ (this.seed * 3266489917));
            // Step by 1..N-1, so the result can never equal the previous slot.
            const step = 1 + Math.floor(r * (CHAPTERS.length - 1));
            previous = (previous + step) % CHAPTERS.length;
            this.resolved.set(n, previous);
        }
        return previous;
    }

    /**
      * A surface forced onto a slot, independent of the chapter occupying it.
      *
      * Chapters carry a default surface, but surface is the one lever that is
      * genuinely weather rather than terrain — a greasy morning does not change
      * what the road is shaped like. Keeping it separately overridable lets the
      * director say "same road, but damp" without having to find a chapter that
      * happens to bundle those two together.
      */
    private readonly surfaceOverrides = new Map<number, SurfaceName>();

    /** Force a chapter into a slot. Slots already behind the vehicle are the caller's problem. */
    override(slot: number, chapterIndex: number): void {
        this.overrides.set(slot, clamp(chapterIndex, 0, CHAPTERS.length - 1));
        this.resolved.clear();
    }

    /** Force a surface onto a slot, leaving the chapter alone. */
    overrideSurface(slot: number, surface: SurfaceName): void {
        this.surfaceOverrides.set(slot, surface);
    }

    clearOverrides(): void {
        this.overrides.clear();
        this.surfaceOverrides.clear();
        this.resolved.clear();
    }

    /**
     * Drop every override from `slot` onward, leaving earlier road untouched.
     *
     * This is the ramp-home path (AI-DIRECTOR §9): when the director stops
     * answering, the road ahead reverts to the procedural schedule rather than
     * holding the last patch for ever. The decay is not abrupt — the chapter
     * ramp already blends across `CHAPTER_RAMP` metres, so the reverted stretch
     * eases in exactly like any other transition.
     */
    clearFrom(slot: number): void {
        for (const key of [...this.overrides.keys()]) if (key >= slot) this.overrides.delete(key);
        for (const key of [...this.surfaceOverrides.keys()]) if (key >= slot) this.surfaceOverrides.delete(key);
        this.resolved.clear();
    }

    /** Whether anything has been forced onto `slot`. */
    hasOverride(slot: number): boolean {
        return this.overrides.has(slot) || this.surfaceOverrides.has(slot);
    }

    /** The surface a slot ends up with: the override if there is one, else the chapter's. */
    surfaceForSlot(slot: number): SurfaceName {
        return this.surfaceOverrides.get(slot) ?? CHAPTERS[this.indexAt(slot)].surface;
    }

    chapterAt(s: number): Chapter {
        if (!this.enabled) return NEUTRAL;
        return CHAPTERS[this.indexAt(Math.floor(s / CHAPTER_LENGTH))];
    }

    labelAt(s: number): string {
        return this.chapterAt(s).label;
    }

    /**
     * Blended parameters at a distance. Writes into a shared scratch record —
     * this is called from the road generator, which runs for every sample.
     */
    paramsAt(s: number): ChapterParams {
        if (!this.enabled) {
            scratch.twistiness = -1;
            scratch.gradeScale = 1;
            scratch.widthTarget = -1;
            scratch.fogBias = 0;
            scratch.timeOfDay = -1;
            scratch.grip = 1;
            scratch.drag = 1;
            return scratch;
        }

        const slot = Math.floor(s / CHAPTER_LENGTH);
        const local = s - slot * CHAPTER_LENGTH;
        const here = CHAPTERS[this.indexAt(slot)];

        // Blend in from the previous chapter across the opening ramp.
        let t = 1;
        let from = here;
        if (local < CHAPTER_RAMP && slot > 0) {
            from = CHAPTERS[this.indexAt(slot - 1)];
            t = smoothstep(0, CHAPTER_RAMP, local);
        }

        const mix = (a: number, b: number): number => a + (b - a) * t;
        scratch.twistiness = mix(from.twistiness, here.twistiness);
        scratch.gradeScale = mix(from.gradeScale, here.gradeScale);
        scratch.widthTarget = mix(from.widthTarget, here.widthTarget);
        scratch.fogBias = mix(from.fogBias, here.fogBias);
        scratch.timeOfDay = mix(from.timeOfDay, here.timeOfDay);
        const sa = SURFACES[this.surfaceForSlot(local < CHAPTER_RAMP && slot > 0 ? slot - 1 : slot)];
        const sb = SURFACES[this.surfaceForSlot(slot)];
        scratch.grip = mix(sa.grip, sb.grip);
        scratch.drag = mix(sa.drag, sb.drag);
        return scratch;
    }

    /** The surface in force, for the co-driver to call. Not blended — it is a name. */
    surfaceAt(s: number): Surface {
        if (!this.enabled) return SURFACES.dry;
        return SURFACES[this.surfaceForSlot(Math.floor(s / CHAPTER_LENGTH))];
    }
}
