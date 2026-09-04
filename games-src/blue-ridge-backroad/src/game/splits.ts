/**
 * Mile-split timing.
 *
 * There is no lap on an endless road, so the stopwatch is per mile instead.
 * That still gives something to beat, and because the road is generated from a
 * fixed seed, mile 7 is always the same stretch of mountain — so a personal
 * best for a given mile is a real comparison, not a coincidence.
 *
 * A mile whose recovery button was used is still timed and shown, but never
 * recorded as a best.
 */

export const MILE_METRES = 1609.344;
const STORE_KEY = 'brb.splits.v1';
/** Keep bests for the first stretch of road; beyond that it is all new ground. */
const MAX_TRACKED_MILE = 200;

export type BestTimes = Record<number, number>;

export const loadBests = (): BestTimes => {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        const out: BestTimes = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            const index = Number(k);
            if (Number.isInteger(index) && typeof v === 'number' && v > 0 && Number.isFinite(v)) {
                out[index] = v;
            }
        }
        return out;
    } catch {
        return {};
    }
};

export const saveBests = (bests: BestTimes): void => {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(bests));
    } catch {
        /* private mode, or storage full — the timer still works, it just forgets */
    }
};

export const clearBests = (): void => {
    try {
        localStorage.removeItem(STORE_KEY);
    } catch {
        /* nothing to do */
    }
};

export interface SplitResult {
    /** Index of the mile that just finished, or -1 if none did. */
    completedMile: number;
    /** Its time in seconds. */
    time: number;
    /** Seconds against the previous best; NaN when there was none. */
    delta: number;
    /** True when this run set a new best for that mile. */
    isBest: boolean;
}

const NONE: SplitResult = { completedMile: -1, time: 0, delta: NaN, isBest: false };

/**
 * Watches the odometer and reports whenever a mile marker is crossed.
 * Allocation-free in the steady state: the result object is reused.
 */
export class SplitTimer {
    private bests: BestTimes = loadBests();
    private mileStart = 0;
    private lastMile = 0;
    private dirty = false;
    private readonly result: SplitResult = { completedMile: -1, time: 0, delta: NaN, isBest: false };

    /** Seconds spent driving so far. */
    elapsed = 0;

    reset(): void {
        this.elapsed = 0;
        this.mileStart = 0;
        this.lastMile = 0;
        this.dirty = false;
    }

    /** Mark the current mile as assisted, so it cannot set a best. */
    invalidate(): void {
        this.dirty = true;
    }

    get currentMile(): number {
        return this.lastMile;
    }

    /** Time spent in the mile currently under way. */
    get currentMileTime(): number {
        return this.elapsed - this.mileStart;
    }

    /** The standing best for the mile under way, or 0 if there is none. */
    get currentMileBest(): number {
        return this.bests[this.lastMile] ?? 0;
    }

    get currentMileDirty(): boolean {
        return this.dirty;
    }

    bestFor(mile: number): number {
        return this.bests[mile] ?? 0;
    }

    /** Advance the clock and check for a mile crossing. */
    update(dt: number, odometerMetres: number): SplitResult {
        this.elapsed += dt;
        const mile = Math.floor(odometerMetres / MILE_METRES);
        if (mile <= this.lastMile) return NONE;

        // Crossing more than one marker in a frame is not physically possible at
        // these speeds, but treat it as one split rather than losing the time.
        const completed = this.lastMile;
        const time = this.elapsed - this.mileStart;
        const previous = this.bests[completed] ?? 0;
        const eligible = !this.dirty && completed < MAX_TRACKED_MILE;
        const isBest = eligible && (previous === 0 || time < previous);
        if (isBest) {
            this.bests[completed] = time;
            saveBests(this.bests);
        }

        this.result.completedMile = completed;
        this.result.time = time;
        this.result.delta = previous > 0 ? time - previous : NaN;
        this.result.isBest = isBest;

        this.lastMile = mile;
        this.mileStart = this.elapsed;
        this.dirty = false;
        return this.result;
    }

    forgetBests(): void {
        this.bests = {};
        clearBests();
    }
}

/** m:ss.t — the format a stopwatch would show. */
export const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};

/** +2.4 / -0.8, for a delta against a best. */
export const formatDelta = (seconds: number): string => {
    if (!Number.isFinite(seconds)) return '';
    return `${seconds >= 0 ? '+' : '-'}${Math.abs(seconds).toFixed(1)}`;
};
