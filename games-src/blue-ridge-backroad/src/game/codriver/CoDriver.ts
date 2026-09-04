import { analysePreview, createFeature, phrase, shouldLink, type RoadFeature } from './PaceNotes';
import { Speech } from './Speech';
import type { CoursePreview } from '../road/CoursePreview';

/**
 * Decides *when* to call a pace note, having decided *what* elsewhere.
 *
 * Timing is the whole job. A note delivered as you arrive at the corner is
 * useless, and one delivered too early is forgotten, so the call goes out at a
 * fixed number of seconds ahead — which means the distance moves with your
 * speed. Notes are keyed by their absolute road distance so the same corner is
 * never called twice, however many times the preview is recomputed on the way in.
 */

export type CoDriverMode = 'off' | 'text' | 'voice';

/** How far ahead, in seconds, a call is made. */
const LEAD_SECONDS = 3.2;
/** ...with a floor, so notes still arrive at a crawl. */
const MIN_LEAD = 30;
/** A call stays on screen this long. */
const NOTE_LIFE = 3.4;
/** Corners within this of an already-called one are the same corner. */
const SAME_CORNER = 40;
/** Nothing is called within this of the previous call. */
const MIN_GAP_SECONDS = 0.75;

const POOL_SIZE = 12;
const HISTORY = 16;

export class CoDriver {
    mode: CoDriverMode = 'text';

    /** The note currently on screen, or '' when there is none. */
    note = '';
    /** Seconds until the note fades. */
    noteAge = 0;

    private readonly pool: RoadFeature[] = [];
    /** Absolute road distances already called, as a small ring. */
    private readonly called = new Float64Array(HISTORY);
    private calledCount = 0;
    private sinceLastCall = 99;
    private readonly speech = new Speech();

    constructor() {
        for (let i = 0; i < POOL_SIZE; i++) this.pool.push(createFeature());
    }

    get speechAvailable(): boolean {
        return this.speech.available;
    }

    setMode(mode: CoDriverMode): void {
        this.mode = mode;
        if (mode !== 'voice') this.speech.stop();
    }

    /** Forget everything called; used when the drive restarts elsewhere. */
    reset(): void {
        this.calledCount = 0;
        this.called.fill(0);
        this.note = '';
        this.noteAge = 0;
        this.sinceLastCall = 99;
        this.speech.stop();
    }

    private alreadyCalled(roadDistance: number): boolean {
        for (let i = 0; i < this.calledCount; i++) {
            if (Math.abs(this.called[i] - roadDistance) < SAME_CORNER) return true;
        }
        return false;
    }

    private remember(roadDistance: number): void {
        if (this.calledCount < HISTORY) {
            this.called[this.calledCount] = roadDistance;
            this.calledCount += 1;
            return;
        }
        // Drop the oldest.
        this.called.copyWithin(0, 1);
        this.called[HISTORY - 1] = roadDistance;
    }

    /**
     * Called at the telemetry rate, not per frame. `s` is the vehicle's distance
     * along the road and `speed` its ground speed in m/s.
     */
    update(dt: number, s: number, speed: number, preview: CoursePreview): void {
        this.noteAge = Math.max(0, this.noteAge - dt);
        this.sinceLastCall += dt;
        if (this.mode === 'off') return;

        const count = analysePreview(
            preview.curvature,
            preview.rise,
            preview.width,
            preview.offset.length,
            preview.step,
            this.pool
        );
        if (count === 0) return;

        const lead = Math.max(MIN_LEAD, speed * LEAD_SECONDS);

        for (let i = 0; i < count; i++) {
            const f = this.pool[i];
            if (f.distance > lead) break; // features are sorted; nothing nearer left
            const roadDistance = s + f.distance;
            if (this.alreadyCalled(roadDistance)) continue;
            if (this.sinceLastCall < MIN_GAP_SECONDS) break;

            const next = i + 1 < count ? this.pool[i + 1] : null;
            const linked = shouldLink(f, next) ? next : null;
            const text = phrase(f, linked);

            this.remember(roadDistance);
            if (linked) this.remember(s + linked.distance);

            this.note = text;
            this.noteAge = NOTE_LIFE;
            this.sinceLastCall = 0;
            if (this.mode === 'voice') this.speech.say(text);
            return;
        }
    }

    dispose(): void {
        this.speech.dispose();
    }
}

const STORE_KEY = 'brb.codriver';

export const loadCoDriverMode = (): CoDriverMode => {
    try {
        const v = localStorage.getItem(STORE_KEY);
        if (v === 'off' || v === 'text' || v === 'voice') return v;
    } catch {
        /* private mode */
    }
    return 'text';
};

export const saveCoDriverMode = (mode: CoDriverMode): void => {
    try {
        localStorage.setItem(STORE_KEY, mode);
    } catch {
        /* private mode */
    }
};
