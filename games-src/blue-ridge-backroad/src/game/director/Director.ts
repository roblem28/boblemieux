import { EVENT_NONE, type RoadPath } from '../road/RoadPath';
import { MPS_TO_MPH } from '../util/mathx';
import { CHAPTERS, CHAPTER_LENGTH, SURFACES } from '../world/chapters';
import { chapterIndexOf, eventIndexOf, parsePatch, type DirectorPatch } from './patch';
import { classify, LocalEndpoint, type Brief, type Endpoint } from './Endpoint';

/**
 * The director: chooses what the road ahead should be like, on a slow cadence.
 *
 * Everything difficult about this is timing, not choosing. A round trip to a
 * model is 0.3–3 s and a physics step is 8.3 ms, so the model can never be *in*
 * the loop (AI-DIRECTOR §3.1). What it can be is a director on a slow cadence,
 * and that turns into **two clocks** (§9):
 *
 * - **Propose on triggers.** Something happens — a run of spins, a stretch with
 *   no incidents at all, or simply three minutes going by — and a request goes
 *   out. Triggers carry hysteresis: a condition must hold on two consecutive
 *   evaluations before it fires, so one bad corner does not redirect the world.
 * - **Apply on boundaries.** A validated patch waits for a commit point before
 *   it touches anything. Mile markers are the natural one — they already exist
 *   and already mean something to the player — with a floor of 45 s between
 *   applied patches so the world cannot churn.
 *
 * Separating the two is what makes a slow model harmless. The request can take
 * as long as it likes; it is landing at the next mile marker either way.
 *
 * **What it is allowed to touch.** The chapter schedule, the surface, and the
 * set-piece in one upcoming slot. Not the handling — `stability`, `rearBias` and
 * `catchLock` belong to the difficulty the player chose and the director never
 * sees them (§5). Not the timed stage, which runs on neutral road so its times
 * stay comparable (§3.3). And not anything already generated: every change is
 * written as an override keyed by slot index, ahead of the road that exists, and
 * takes effect through the ordinary generators (§3.4).
 */

/** How often triggers are evaluated. */
const TRIGGER_TICK = 1;
/** Consecutive evaluations a trigger must hold before it fires. */
const HYSTERESIS = 2;
/** Never apply patches closer together than this. */
const APPLY_FLOOR = 45;
/** Ask for something new at least this often, even with nothing going on. */
const REFRESH_CEILING = 180;
/** A request that has not answered by now is a failure. */
const REQUEST_TIMEOUT = 2;
/** Backoff after a failure, doubling, capped. */
const BACKOFF_BASE = 20;
const BACKOFF_MAX = 300;
/** Consecutive failures before the road is handed back to the schedule. */
const FAILURES_BEFORE_HOME = 2;
/**
 * A patch waiting this long without reaching a mile marker gives up waiting.
 * Mile markers are the right commit point, but a driver pottering along at
 * 20 mph is four minutes from the next one, and a director that never lands is
 * indistinguishable from one that is broken.
 */
const COMMIT_PATIENCE = 60;
/** Never write a change closer than this to the vehicle. */
const MIN_LEAD = 250;

export type DirectorStatus = 'off' | 'watching' | 'thinking' | 'ready' | 'unreachable';

export interface AppliedPatch extends DirectorPatch {
    /** Chapter slot it was written into. */
    slot: number;
    /** Where that slot begins, metres. */
    startS: number;
    /**
     * Where the truck was, and how far the road had been built, at the moment
     * it landed. Both are recorded rather than inferred later: the invariant
     * that matters is that a patch lands ahead of the vehicle *when it is
     * written*, and comparing `startS` against a position read minutes
     * afterwards says nothing at all.
     */
    atS: number;
    builtS: number;
    /** The chapter's display label, for the HUD. */
    label: string;
    /** What the co-driver should say about the surface, if it changed. */
    surfaceCall: string;
    surfaceChanged: boolean;
    /** Which endpoint produced it. */
    source: 'local' | 'http';
}

/** What the director needs to know each tick. */
export interface DirectorContext {
    /** Distance along the road, metres. */
    s: number;
    /** Miles driven this session. */
    miles: number;
    /** Speed, m/s. */
    speed: number;
    spinning: boolean;
    offRoad: boolean;
}

export class Director {
    private endpoint: Endpoint = new LocalEndpoint();
    private enabledFlag = false;

    private status: DirectorStatus = 'off';
    private sinceTrigger = 0;
    private sinceApplied = APPLY_FLOOR;
    private waiting = 0;

    /** Incidents since the last applied patch. */
    private spins = 0;
    private excursions = 0;
    private recoveries = 0;
    private speedSum = 0;
    private speedSamples = 0;
    private maxSpeed = 0;
    /** Distance covered in the incident window, metres. */
    private windowMetres = 0;
    private lastMile = 0;
    private lastMileDelta = 0;

    /** Edge detection, so a two-second slide is one spin and not two hundred. */
    private wasSpinning = false;
    private wasOffRoad = false;
    /** Set by `noteMile`, consumed at the next commit check. */
    private mileMarker = false;

    /** Trigger hysteresis counters, keyed by trigger name. */
    private readonly held = new Map<string, number>();

    /** One request in flight, ever. */
    private inFlight: AbortController | null = null;
    private pending: DirectorPatch | null = null;
    private pendingAge = 0;
    private failures = 0;
    private backoff = 0;
    private homed = true;

    private applied: AppliedPatch | null = null;
    private lastTrigger = '';
    /**
     * Patches landed on this drive. Reset with the rest of the session state,
     * because that is what the settings panel is counting — "the world has
     * changed three times since you set off", not a lifetime total that keeps
     * climbing across restarts and means nothing.
     */
    private appliedCount = 0;

    constructor(private readonly path: RoadPath) {}

    // ------------------------------------------------------------- settings

    setEnabled(enabled: boolean): void {
        if (enabled === this.enabledFlag) return;
        this.enabledFlag = enabled;
        if (enabled) {
            this.status = 'watching';
            this.reset();
        } else {
            this.abort();
            this.status = 'off';
            this.rampHome();
        }
    }

    get enabled(): boolean {
        return this.enabledFlag;
    }

    /** Swap the endpoint. Anything in flight is abandoned, not awaited. */
    setEndpoint(endpoint: Endpoint): void {
        this.abort();
        this.endpoint = endpoint;
        this.failures = 0;
        this.backoff = 0;
        if (this.enabledFlag) this.status = 'watching';
    }

    get endpointKind(): 'local' | 'http' {
        return this.endpoint.kind;
    }

    // ------------------------------------------------------------ reporting

    get state(): DirectorStatus {
        return this.status;
    }

    get lastApplied(): AppliedPatch | null {
        return this.applied;
    }

    get patchCount(): number {
        return this.appliedCount;
    }

    /** Everything the panel and the tests want, in one object. */
    report(): Record<string, unknown> {
        return {
            enabled: this.enabledFlag,
            status: this.status,
            source: this.endpoint.kind,
            patches: this.appliedCount,
            failures: this.failures,
            pending: this.pending !== null,
            sinceApplied: +this.sinceApplied.toFixed(1),
            trigger: this.lastTrigger,
            spins: this.spins,
            excursions: this.excursions,
            applied: this.applied
        };
    }

    // -------------------------------------------------------------- signals

    /** The player asked to be put back on the road. A strong signal. */
    noteRecovery(): void {
        this.recoveries += 1;
    }

    /** A mile finished. `delta` is versus the best, 0 if there is no best. */
    noteMile(time: number, delta: number): void {
        this.lastMile = time;
        this.lastMileDelta = delta;
        this.mileMarker = true;
    }

    /** Forget the session so far. Called on a restart. */
    reset(): void {
        this.appliedCount = 0;
        this.applied = null;
        this.spins = 0;
        this.excursions = 0;
        this.recoveries = 0;
        this.speedSum = 0;
        this.speedSamples = 0;
        this.maxSpeed = 0;
        this.windowMetres = 0;
        this.lastMile = 0;
        this.lastMileDelta = 0;
        this.sinceTrigger = 0;
        this.sinceApplied = APPLY_FLOOR;
        this.pending = null;
        this.pendingAge = 0;
        this.mileMarker = false;
        this.held.clear();
        this.wasSpinning = false;
        this.wasOffRoad = false;
    }

    // ----------------------------------------------------------------- loop

    /**
     * Advance the director. Returns a patch on the tick it lands, so the caller
     * can announce it; null otherwise.
     *
     * Called at the telemetry rate, not the physics rate — nothing here needs
     * to see every step, and the incident edges are debounced anyway.
     */
    update(dt: number, ctx: DirectorContext): AppliedPatch | null {
        if (!this.enabledFlag) return null;

        this.sinceTrigger += dt;
        this.sinceApplied += dt;
        if (this.pending) this.pendingAge += dt;
        if (this.backoff > 0) this.backoff = Math.max(0, this.backoff - dt);

        this.observe(dt, ctx);

        if (this.inFlight) {
            this.waiting += dt;
            if (this.waiting > REQUEST_TIMEOUT) this.fail('timeout');
        }

        if (this.sinceTrigger >= TRIGGER_TICK) {
            this.sinceTrigger = 0;
            this.evaluateTriggers(ctx);
        }

        return this.tryApply(ctx);
    }

    /** Accumulate what the drive is doing. Edges, not levels. */
    private observe(dt: number, ctx: DirectorContext): void {
        this.speedSum += ctx.speed * dt;
        this.speedSamples += dt;
        this.windowMetres += ctx.speed * dt;
        this.maxSpeed = Math.max(this.maxSpeed, ctx.speed);

        if (ctx.spinning && !this.wasSpinning) this.spins += 1;
        this.wasSpinning = ctx.spinning;
        if (ctx.offRoad && !this.wasOffRoad) this.excursions += 1;
        this.wasOffRoad = ctx.offRoad;
    }

    /**
     * Decide whether to ask for something new.
     *
     * Hysteresis is the whole point: `hold` only returns true once a condition
     * has survived two consecutive evaluations a second apart. A single spin on
     * a single corner is noise, and a world that rearranges itself around noise
     * feels arbitrary rather than responsive.
     */
    private evaluateTriggers(ctx: DirectorContext): void {
        if (this.inFlight || this.pending || this.backoff > 0) return;
        // No point asking for a patch that could not be applied for a minute.
        if (this.sinceApplied < APPLY_FLOOR * 0.5) return;

        const going = classify(this.buildBrief(ctx, ''));
        const trigger = this.hold('struggling', going === 'struggling')
            ? 'a run of trouble'
            : // A clean stretch is not a problem to be solved, so it is given
              // time to be enjoyed before anything is done about it.
              this.hold('cruising', going === 'cruising' && this.sinceApplied > 90)
              ? 'a clean fast stretch'
              : this.sinceApplied > REFRESH_CEILING
                ? 'time for a change'
                : '';
        if (trigger === '') return;

        this.lastTrigger = trigger;
        void this.request(ctx, trigger);
    }

    /** The window so far, as the endpoint sees it. */
    private buildBrief(ctx: DirectorContext, trigger: string): Brief {
        return {
            miles: ctx.miles,
            chapter: this.path.chapters.chapterAt(ctx.s).name,
            surface: this.path.chapters.surfaceAt(ctx.s).name,
            spins: this.spins,
            excursions: this.excursions,
            recoveries: this.recoveries,
            meanMph: (this.speedSamples > 0 ? this.speedSum / this.speedSamples : 0) * MPS_TO_MPH,
            maxMph: this.maxSpeed * MPS_TO_MPH,
            lastMile: this.lastMile,
            lastMileDelta: this.lastMileDelta,
            windowMiles: this.windowMetres / 1609.344,
            trigger
        };
    }

    private hold(key: string, condition: boolean): boolean {
        const n = condition ? (this.held.get(key) ?? 0) + 1 : 0;
        this.held.set(key, n);
        if (n >= HYSTERESIS) {
            this.held.set(key, 0);
            return true;
        }
        return false;
    }

    /**
     * One request, at most, ever in flight. No retries during a drive — a
     * struggling endpoint gets backoff, not a queue.
     */
    private async request(ctx: DirectorContext, trigger: string): Promise<void> {
        const controller = new AbortController();
        this.inFlight = controller;
        this.waiting = 0;
        this.status = 'thinking';

        const brief = this.buildBrief(ctx, trigger);

        try {
            const raw = await this.endpoint.propose(brief, controller.signal);
            if (this.inFlight !== controller) return; // superseded or aborted
            const patch = parsePatch(raw);
            if (!patch) {
                // A schema violation is a timeout. No partial application, ever.
                this.fail('invalid');
                return;
            }
            this.inFlight = null;
            this.failures = 0;
            this.backoff = 0;
            this.pending = patch;
            this.pendingAge = 0;
            this.status = 'ready';
        } catch {
            if (this.inFlight === controller) this.fail('unreachable');
        }
    }

    private fail(_why: string): void {
        this.abort();
        this.failures += 1;
        this.backoff = Math.min(BACKOFF_MAX, BACKOFF_BASE * 2 ** (this.failures - 1));
        this.status = 'unreachable';
        if (this.failures >= FAILURES_BEFORE_HOME) this.rampHome();
    }

    private abort(): void {
        if (this.inFlight) {
            this.inFlight.abort();
            this.inFlight = null;
        }
        this.waiting = 0;
        this.pending = null;
    }

    /**
     * Hand the road ahead back to the procedural schedule.
     *
     * The design called this "the last valid patch decays to neutral over ~4
     * chunks", which was written before chapters existed. With chapters it is
     * simpler and better: clearing the overrides from the first unwritten slot
     * lets the schedule resume its own sequence, and the existing chapter ramp
     * blends the reverted stretch in over 420 m exactly like any other
     * transition. Nothing behind the vehicle is touched, so the road already
     * driven stays the road that was driven.
     */
    private rampHome(): void {
        if (this.homed) return;
        const slot = this.firstFreeSlot(this.path.generatedThroughS);
        this.path.chapters.clearFrom(slot);
        this.path.clearEventOverridesFrom(Math.floor((slot * CHAPTER_LENGTH) / 640));
        this.homed = true;
        this.applied = null;
    }

    /** The first chapter slot whose road has not been built yet. */
    private firstFreeSlot(sNow: number): number {
        const clear = Math.max(sNow, this.path.generatedThroughS) + MIN_LEAD;
        return Math.floor(clear / CHAPTER_LENGTH) + 1;
    }

    /**
     * Land a waiting patch, if this is a moment to land one.
     *
     * The commit point is a mile marker. It is not arbitrary: the player is
     * already being shown a split there, so a change of scene reads as part of
     * the same beat rather than as the world twitching underneath them.
     */
    private tryApply(ctx: DirectorContext): AppliedPatch | null {
        const patch = this.pending;
        if (!patch) {
            // Do not bank a marker for a patch that does not exist yet, or a
            // request answered five minutes later would land the instant it
            // arrived, on a marker nobody remembers passing.
            this.mileMarker = false;
            return null;
        }
        if (this.sinceApplied < APPLY_FLOOR) return null;

        const atCommit = this.mileMarker || this.pendingAge > COMMIT_PATIENCE;
        this.mileMarker = false;
        if (!atCommit) return null;

        const slot = this.firstFreeSlot(ctx.s);
        const startS = slot * CHAPTER_LENGTH;
        const chapterIndex = chapterIndexOf(patch.chapter);
        if (chapterIndex < 0) {
            // Unreachable after `parsePatch`, but the cost of being wrong here
            // is a corrupt schedule, so it is checked rather than asserted.
            this.pending = null;
            return null;
        }

        const before = this.path.chapters.surfaceForSlot(slot);
        this.path.chapters.override(slot, chapterIndex);
        this.path.chapters.overrideSurface(slot, patch.surface);

        const eventKind = eventIndexOf(patch.event);
        if (eventKind >= 0) this.plantEvent(slot, eventKind);

        this.pending = null;
        this.pendingAge = 0;
        this.sinceApplied = 0;
        this.homed = false;
        this.appliedCount += 1;
        this.status = 'watching';

        // The window the next patch reasons about starts here.
        this.spins = 0;
        this.excursions = 0;
        this.recoveries = 0;
        this.speedSum = 0;
        this.speedSamples = 0;
        this.maxSpeed = 0;
        this.windowMetres = 0;

        this.applied = {
            ...patch,
            slot,
            startS,
            atS: ctx.s,
            builtS: this.path.generatedThroughS,
            label: CHAPTERS[chapterIndex].label,
            surfaceCall: SURFACES[patch.surface].call,
            surfaceChanged: before !== patch.surface,
            source: this.endpoint.kind
        };
        return this.applied;
    }

    /**
     * Put a set-piece in the first free event slot inside the chapter, provided
     * that slot's road has not been generated yet.
     *
     * "Free" means genuinely empty. Overwriting a set-piece the schedule already
     * placed would make the director destructive, and there is no need — a
     * chapter is 1400 m and event slots are 640 m apart, so there is nearly
     * always an empty one.
     */
    private plantEvent(slot: number, kind: number): void {
        const from = Math.ceil((slot * CHAPTER_LENGTH) / 640);
        const to = Math.floor(((slot + 1) * CHAPTER_LENGTH) / 640);
        const built = this.path.generatedThroughS;
        for (let i = from; i <= to; i++) {
            if (this.path.centreOfSlot(i) <= built) continue;
            if (this.path.kindOfSlot(i) !== EVENT_NONE) continue;
            this.path.overrideEventSlot(i, kind);
            return;
        }
    }
}
