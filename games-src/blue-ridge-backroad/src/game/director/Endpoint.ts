import { CHAPTERS } from '../world/chapters';
import { PATCH_SCHEMA, SURFACE_NAMES, EVENT_IDS } from './patch';

/**
 * Where a patch comes from.
 *
 * Two implementations ship. `LocalEndpoint` needs nothing and always answers;
 * `HttpEndpoint` talks to a model. The interface exists so the rest of the
 * director never learns which one it has — the cadence, the validation, the
 * ramp-home and the failure handling are identical either way, which is the
 * only honest way to claim the game is unaffected when the model is down
 * (AI-DIRECTOR §9). It also means the whole state machine is testable without a
 * network.
 */

/** What the director tells the endpoint about the drive so far. */
export interface Brief {
    /** Distance driven this session, miles. */
    miles: number;
    /** Chapter and surface in force right now. */
    chapter: string;
    surface: string;
    /** Incidents since the last applied patch. */
    spins: number;
    excursions: number;
    recoveries: number;
    /**
     * Miles covered in that same window.
     *
     * Present because counts alone are not a signal. Measured over seven
     * minutes on each difficulty, two off-road excursions per window turned up
     * on a clean 120 mph run on Easy just as reliably as on a run that was
     * genuinely falling apart — the window is simply longer when the driving is
     * quick. A rate discriminates; a count does not.
     */
    windowMiles: number;
    /** Speed over the same window, mph. */
    meanMph: number;
    maxMph: number;
    /** Last completed mile, seconds, and how it compared to the best. 0 if none. */
    lastMile: number;
    lastMileDelta: number;
    /** Why the director woke up. */
    trigger: string;
}

export interface Endpoint {
    readonly kind: 'local' | 'http';
    /** Resolves to raw, unvalidated JSON. Throws or rejects on any failure. */
    propose(brief: Brief, signal: AbortSignal): Promise<unknown>;
}

/**
 * The brief, as prose. Small on purpose: §10 budgets ~40 output tokens to keep
 * the cadence comfortable on modest hardware, and there is no reason to be
 * lavish on the way in either.
 */
export function briefText(b: Brief): string {
    const lines = [
        `Driven ${b.miles.toFixed(1)} miles. Now: ${b.chapter}, surface ${b.surface}.`,
        `Over the last ${b.windowMiles.toFixed(1)} miles: ${b.spins} spins, ${b.excursions} off-road, ${b.recoveries} recoveries.`,
        `Speed ${Math.round(b.meanMph)} mph average, ${Math.round(b.maxMph)} peak.`
    ];
    if (b.lastMile > 0) {
        const delta = b.lastMileDelta;
        const cmp = delta === 0 ? 'no best yet' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}s vs best`;
        lines.push(`Last mile ${b.lastMile.toFixed(1)}s (${cmp}).`);
    }
    lines.push(`Woke up because: ${b.trigger}.`);
    return lines.join('\n');
}

/**
 * How the drive is going, in one word.
 *
 * The thresholds are measured, not guessed, and the measurement changed them
 * substantially. The first version asked for two off-road excursions since the
 * last change, which sounded like trouble and was not: over seven minutes on
 * each difficulty, a clean 120 mph run on Easy produced two excursions per
 * window just as reliably as a run that was genuinely coming apart, because a
 * fast window is a long window. Expressed as a rate the two separate cleanly —
 * ordinary quick driving sits at 0 to 1.5 excursions and under 1 spin per mile,
 * while the windows that were actually going badly measured 11 to 17 excursions
 * per mile at half the speed. The bar is set between those, not near either.
 *
 * Shared by the director's trigger clock and the built-in policy so the two
 * cannot drift apart and disagree about what is happening.
 */
export type Going = 'struggling' | 'cruising' | 'settled';

export function classify(b: Brief): Going {
    // Guard the divisor rather than the caller: the worst windows are the short
    // ones, and they are exactly the ones worth classifying.
    const perMile = Math.max(b.windowMiles, 0.1);
    if (b.recoveries >= 1 || b.excursions / perMile >= 4 || b.spins / perMile >= 3) return 'struggling';
    if (b.spins === 0 && b.excursions / perMile <= 1.5 && b.meanMph > 45) return 'cruising';
    return 'settled';
}

/** The standing instructions. Built from the tables so it cannot drift. */
export function systemPrompt(): string {
    const menu = CHAPTERS.map((c) => `- ${c.name}: ${c.label}`).join('\n');
    return [
        'You direct the pacing of a rally driving game on an endless gravel back road.',
        'Choose what the next stretch of road should be like, given how the drive is going.',
        '',
        'Chapters:',
        menu,
        '',
        `Surfaces: ${SURFACE_NAMES.join(', ')}. Set-pieces: ${EVENT_IDS.join(', ')}.`,
        '',
        'Aim for contrast and recovery, not escalation. After a bad stretch give the',
        'driver something open to rebuild on; after an easy fast one, ask a question.',
        'Never pick the chapter that is already in force.',
        'Reason must be one short sentence a player would find fair, in plain English.',
        'Answer with JSON only.'
    ].join('\n');
}

/**
 * No model: pick with the same taste the prose above asks for.
 *
 * This is not a placeholder. It is what runs when nobody has an endpoint
 * configured, which will be almost everybody, and it is the thing an endpoint
 * has to beat to be worth turning on. Writing the fallback as a real policy
 * rather than a random choice also gives the model something to be compared
 * against, which is the only way to find out whether the model is adding
 * anything — see AI-DIRECTOR §12.
 */
export class LocalEndpoint implements Endpoint {
    readonly kind = 'local';

    /**
     * The last few chapters picked. Without this the policy is monotonous:
     * measured over twelve minutes of driving, the first version visited three
     * of the eight chapters across eight patches, because "open the road out"
     * always resolves to the same two or three most open ones. A preference
     * with no memory is a rut.
     */
    private readonly recent: string[] = [];
    /** Rotates choices within a band, so the walk is deterministic but not fixed. */
    private n = 0;

    async propose(brief: Brief): Promise<unknown> {
        const going = classify(brief);
        const struggling = going === 'struggling';
        const cruising = going === 'cruising';
        this.n += 1;

        // Contrast and recovery: after trouble hand back something open to
        // rebuild on, after a clean fast stretch ask a harder question. The
        // *band* is chosen by how the drive is going; which member of the band
        // is chosen rotates, so the answer to "that was rough" is not the same
        // chapter every time.
        const ranked = [...CHAPTERS].sort((x, y) => x.twistiness - y.twistiness);
        const half = Math.ceil(ranked.length / 2);
        const band = struggling ? ranked.slice(0, half) : cruising ? ranked.slice(-half) : ranked;

        const notHere = band.filter((c) => c.name !== brief.chapter);
        const fresh = notHere.filter((c) => !this.recent.includes(c.name));
        const pool = fresh.length > 0 ? fresh : notHere.length > 0 ? notHere : ranked;
        const pick = pool[this.n % pool.length];

        this.recent.push(pick.name);
        if (this.recent.length > 3) this.recent.shift();

        // Surface is weather, and it is the lever the co-driver announces, so
        // it moves. Dry after trouble — taking grip away from someone already
        // struggling is the patronising move §5 rules out.
        const surface = struggling ? 'dry' : cruising ? (this.n % 2 === 0 ? 'greasy' : 'damp') : SURFACE_CYCLE[this.n % SURFACE_CYCLE.length];

        // Something to look at: earned after a clean stretch, and occasionally
        // just because a road with nothing on it for four miles is a dull road.
        const event = cruising || this.n % 3 === 0 ? SIGHTS[this.n % SIGHTS.length] : 'none';

        const reason = struggling
            ? `Rough couple of miles — ${pick.label.toLowerCase()} to get back into it.`
            : cruising
              ? `Clean and quick back there, so here is ${pick.label.toLowerCase()} to answer.`
              : `Time for a change of scene: ${pick.label.toLowerCase()}.`;

        return { chapter: pick.name, surface, event, reason };
    }
}

/** Surfaces the policy rotates through when nothing in particular is going on. */
const SURFACE_CYCLE = ['dry', 'damp', 'dry', 'loose'];
/** Set-pieces worth arriving at. Bridges and junked trucks turn up on their own. */
const SIGHTS = ['fire_tower', 'old_cabin', 'strange_lights', 'foggy_hollow'];

/**
 * A model over HTTP.
 *
 * Speaks Ollama's `/api/chat` — `format` carries the JSON schema, which is the
 * constrained-decoding route §10 asks for. The response is read defensively
 * from either Ollama's `message.content` or an OpenAI-compatible
 * `choices[0].message.content`, so a llama.cpp server in OpenAI mode works
 * without a second code path or another setting to get wrong.
 *
 * The endpoint URL is a plain HTTP address to a box on the user's own network.
 * That is deliberate and it is the reason this is off by default: the game is
 * served over HTTPS, and a browser will refuse the mixed-content request unless
 * the model host has TLS (§3.2). The failure is a rejected promise, which is
 * exactly the path a timeout takes, so nothing special happens — the director
 * simply reports itself unreachable.
 */
export class HttpEndpoint implements Endpoint {
    readonly kind = 'http';

    constructor(
        private readonly url: string,
        private readonly model: string
    ) {}

    async propose(brief: Brief, signal: AbortSignal): Promise<unknown> {
        const response = await fetch(this.url, {
            method: 'POST',
            signal,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                stream: false,
                format: PATCH_SCHEMA,
                // Sent under both names so one body works for Ollama and for an
                // OpenAI-compatible server.
                response_format: { type: 'json_schema', json_schema: { name: 'patch', schema: PATCH_SCHEMA } },
                options: { temperature: 0.7, num_predict: 120 },
                max_tokens: 120,
                messages: [
                    { role: 'system', content: systemPrompt() },
                    { role: 'user', content: briefText(brief) }
                ]
            })
        });
        if (!response.ok) throw new Error(`director endpoint ${response.status}`);
        const body = (await response.json()) as Record<string, unknown>;

        const message = body.message as Record<string, unknown> | undefined;
        const choices = body.choices as { message?: { content?: unknown } }[] | undefined;
        const content = message?.content ?? choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('director endpoint returned no content');

        // A model under a grammar returns bare JSON; one that ignores the schema
        // often wraps it in prose or a fence. Take the outermost object and let
        // `parsePatch` reject whatever that turns out to be.
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start < 0 || end <= start) throw new Error('director endpoint returned no JSON');
        return JSON.parse(content.slice(start, end + 1)) as unknown;
    }
}
