import { clamp } from './util/mathx';

/**
 * The Hollow Creek Stage — a fixed two-mile timed run.
 *
 * The world is generated from a fixed seed, so a stage is nothing more than a
 * distance range along the road: the same two miles of mountain every single
 * time, which is what makes a time worth comparing.
 *
 * The clock starts when the truck first moves rather than on a countdown. A
 * time trial gets restarted constantly, and making the player sit through
 * "3, 2, 1" on every retry is a tax on the thing they are actually doing.
 */

export const STAGE_START_S = 1000; // metres along the road
export const STAGE_LENGTH = 2 * 1609.344; // exactly two miles
export const STAGE_NAME = 'Hollow Creek Stage';
/** Identity of the stage that ships with the game. */
export const DEFAULT_STAGE_ID = 'hollow-creek';

export interface StageDefinition {
    id: string;
    name: string;
    start: number;
    length: number;
}

export const DEFAULT_STAGE: StageDefinition = {
    id: DEFAULT_STAGE_ID,
    name: STAGE_NAME,
    start: STAGE_START_S,
    length: STAGE_LENGTH
};

/** Times are recorded at each of these fractions, for the live delta. */
const CHECKPOINTS = 24;

// Bests are stored per difficulty: an Expert time and an Easy one are not the
// same achievement, and a single leaderboard for both is worse than none. The
// version also moved with the road widening, which changed every time.
const STORE_PREFIX = 'brb.stage.v3.';

export type StageState = 'armed' | 'running' | 'finished';

interface StoredStage {
    best: number;
    splits: number[];
}

/**
 * Records are per difficulty *and* per stage. The stage that ships with the game
 * keeps the bare difficulty key it has always used, so existing times survive;
 * scouted stages get their identity appended.
 */
const keyFor = (difficulty: string, stageId: string): string =>
    stageId === DEFAULT_STAGE_ID ? STORE_PREFIX + difficulty : `${STORE_PREFIX}${difficulty}.${stageId}`;

const loadStored = (key: string): StoredStage | null => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const obj = parsed as Partial<StoredStage>;
        if (typeof obj.best !== 'number' || !(obj.best > 0) || !Array.isArray(obj.splits)) return null;
        if (obj.splits.length !== CHECKPOINTS + 1) return null;
        if (!obj.splits.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
        return { best: obj.best, splits: obj.splits };
    } catch {
        return null;
    }
};

export class Stage {
    state: StageState = 'armed';
    /** Seconds since the truck first moved. */
    elapsed = 0;
    /** 0 at the start line, 1 at the finish. */
    progress = 0;
    /** Seconds up or down against your best run at this point. NaN if no best. */
    delta = NaN;
    /** Best time for the stage, 0 when there is none. */
    best = 0;
    /** True when the recovery was used, which bars this run from setting a best. */
    assisted = false;

    /** Set on finishing, for the results panel. */
    resultTime = 0;
    resultDelta = NaN;
    resultIsBest = false;

    /** Elapsed time at each checkpoint of the run under way. */
    private readonly splits = new Float64Array(CHECKPOINTS + 1);
    /** ...and of the best run, or null when there is none. */
    private bestSplits: Float64Array | null = null;
    private nextCheckpoint = 0;

    private difficulty: string;
    private definition: StageDefinition = DEFAULT_STAGE;

    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.load();
    }

    get id(): string {
        return this.definition.id;
    }

    get name(): string {
        return this.definition.name;
    }

    get start(): number {
        return this.definition.start;
    }

    get length(): number {
        return this.definition.length;
    }

    /** Switch to a different stretch of road, with its own records. */
    setDefinition(definition: StageDefinition): void {
        this.definition = definition;
        this.load();
        this.arm();
    }

    /** Switch to another difficulty's records. */
    setDifficulty(difficulty: string): void {
        if (difficulty === this.difficulty) return;
        this.difficulty = difficulty;
        this.load();
        this.delta = NaN;
    }

    private load(): void {
        const stored = loadStored(keyFor(this.difficulty, this.definition.id));
        this.best = stored ? stored.best : 0;
        this.bestSplits = stored ? Float64Array.from(stored.splits) : null;
    }

    /** Put the truck on the line with the clock stopped, ready to go. */
    arm(): void {
        this.state = 'armed';
        this.elapsed = 0;
        this.progress = 0;
        this.delta = NaN;
        this.assisted = false;
        this.nextCheckpoint = 0;
        this.splits.fill(0);
    }

    /** Mark the run assisted; it can still be driven and timed, but not banked. */
    invalidate(): void {
        this.assisted = true;
    }

    get distanceRemaining(): number {
        return Math.max(0, this.definition.length * (1 - this.progress));
    }

    /**
     * Advance the stage. `s` is the vehicle's distance along the road and
     * `throttle` the applied throttle. Returns true on the frame it finishes.
     */
    update(dt: number, s: number, throttle: number): boolean {
        if (this.state === 'finished') return false;

        if (this.state === 'armed') {
            // The clock starts when you ask for it — first touch of the
            // throttle — not when the truck happens to roll. Nothing to wait
            // for, and nothing that starts it behind your back.
            if (throttle < 0.05) return false;
            this.state = 'running';
        }

        this.elapsed += dt;
        this.progress = clamp((s - this.definition.start) / this.definition.length, 0, 1);

        // Record the time at every checkpoint passed since the last frame, so a
        // fast run cannot skip one and leave a hole in the trace.
        while (this.nextCheckpoint <= CHECKPOINTS && this.progress >= this.nextCheckpoint / CHECKPOINTS) {
            this.splits[this.nextCheckpoint] = this.elapsed;
            this.nextCheckpoint += 1;
        }

        this.delta = this.deltaAgainstBest();

        if (this.progress >= 1) {
            this.finish();
            return true;
        }
        return false;
    }

    /** How far up or down on the best run's pace, at the current point. */
    private deltaAgainstBest(): number {
        const bs = this.bestSplits;
        if (!bs) return NaN;
        const x = this.progress * CHECKPOINTS;
        const i = Math.min(CHECKPOINTS - 1, Math.floor(x));
        const t = x - i;
        // Interpolate between checkpoints so the delta moves smoothly rather
        // than stepping every time one is crossed.
        const bestHere = bs[i] + (bs[i + 1] - bs[i]) * t;
        return this.elapsed - bestHere;
    }

    private finish(): void {
        this.state = 'finished';
        this.splits[CHECKPOINTS] = this.elapsed;
        this.resultTime = this.elapsed;
        this.resultDelta = this.best > 0 ? this.elapsed - this.best : NaN;
        this.resultIsBest = !this.assisted && (this.best === 0 || this.elapsed < this.best);
        if (this.resultIsBest) {
            this.best = this.elapsed;
            this.bestSplits = Float64Array.from(this.splits);
            this.save();
        }
    }

    private save(): void {
        try {
            const splits = this.bestSplits ? Array.from(this.bestSplits) : [];
            localStorage.setItem(
                keyFor(this.difficulty, this.definition.id),
                JSON.stringify({ best: this.best, splits })
            );
        } catch {
            /* private mode — the stage still runs, it just forgets */
        }
    }

    forgetBest(): void {
        this.best = 0;
        this.bestSplits = null;
        this.delta = NaN;
        try {
            localStorage.removeItem(keyFor(this.difficulty, this.definition.id));
        } catch {
            /* nothing to do */
        }
    }
}
