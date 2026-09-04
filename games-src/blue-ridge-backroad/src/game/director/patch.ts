import { CHAPTERS, SURFACES, type SurfaceName } from '../world/chapters';
import { EVENT_NAMES } from '../road/RoadPath';

/**
 * What the director is allowed to say, and the only door model output comes
 * through.
 *
 * This file is the security boundary of the whole feature, so it is worth being
 * explicit about the shape of the trust:
 *
 * **Nothing here is ever executed.** The design deliberately rules out returning
 * JavaScript (AI-DIRECTOR §11), and this goes further — the patch carries no
 * numbers the game acts on either. Every field is a *name*, and every name is
 * looked up in a table that ships with the game. A model can choose among eight
 * chapters, four surfaces and seven set-pieces; it cannot invent a ninth, and it
 * cannot move a float. The worst a hostile or broken endpoint can do is pick a
 * combination that is merely dull, which the game already survives, because the
 * procedural schedule picks combinations at random.
 *
 * **One string is displayed, and it is treated as hostile.** `reason` is the
 * only free text, it exists so the player can see why the world changed, and it
 * is stripped of control characters, collapsed to one line, capped at 120
 * characters, and rendered as text. It is never spoken, never passed to the
 * co-driver's grammar, and never interpreted. What *is* spoken on a change is
 * the surface's own fixed call string from `SURFACES` — authored, not returned.
 *
 * **Validation is total and rejecting, not clamping.** An unknown chapter name
 * is a rejected patch, not a clamp to chapter zero. A patch that fails
 * validation is indistinguishable from a timeout by design (§9): no partial
 * application, ever, because a half-applied patch is a world state nothing
 * generated and nothing can reproduce.
 */

export interface DirectorPatch {
    /** A `CHAPTERS[].name`. */
    chapter: string;
    surface: SurfaceName;
    /**
     * A set-piece to plant in the next free slot, or 'none'.
     *
     * The design sketch had the model returning `slots: [{ n, event }]` with
     * absolute slot indices. That was dropped: the model has no way to know
     * which slots are still ahead of the generated road, so it would be
     * inventing integers that index straight into a determinism-critical map.
     * The game knows which slot is next and free; the model only says what goes
     * in it. One set-piece per patch is all the cadence supports anyway.
     */
    event: string;
    /** Free text, shown to the player. Untrusted — see above. */
    reason: string;
}

/** Names the model may use, built from the tables rather than duplicated. */
export const CHAPTER_NAMES: readonly string[] = CHAPTERS.map((c) => c.name);
export const SURFACE_NAMES: readonly string[] = Object.keys(SURFACES);
export const EVENT_IDS: readonly string[] = ['none', ...EVENT_NAMES.map(eventId)];

/** `EVENT_NAMES` are display strings; the wire wants stable lowercase ids. */
export function eventId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export const MAX_REASON = 120;

/**
 * Codepoints a layout would react to rather than display: C0 and C1 controls,
 * the zero-width and bidi-override block, the line/paragraph separators, and
 * the byte-order mark. Written as a codepoint test rather than a regexp
 * literal because a screenful of unicode escapes is unreadable and easy to
 * get subtly wrong.
 */
const displayable = (code: number): boolean =>
    !(
        code < 0x20 ||
        (code >= 0x7f && code <= 0x9f) ||
        (code >= 0x200b && code <= 0x200f) ||
        code === 0x2028 ||
        code === 0x2029 ||
        code === 0xfeff
    );

/**
 * The JSON schema handed to the endpoint for constrained decoding.
 *
 * Per AI-DIRECTOR §10, validity should come from constrained decoding rather
 * than from model quality — under a grammar even a small model emits valid
 * patches reliably. `parsePatch` still runs on everything that comes back,
 * because an endpoint that ignores the schema is exactly the case this has to
 * survive.
 */
export const PATCH_SCHEMA = {
    type: 'object',
    properties: {
        chapter: { type: 'string', enum: CHAPTER_NAMES },
        surface: { type: 'string', enum: SURFACE_NAMES },
        event: { type: 'string', enum: EVENT_IDS },
        reason: { type: 'string' }
    },
    required: ['chapter', 'surface', 'event', 'reason'],
    additionalProperties: false
} as const;

/** Collapse to one line, drop control characters, cap the length. */
export function sanitiseReason(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    let stripped = '';
    for (const ch of raw) stripped += displayable(ch.codePointAt(0) ?? 0) ? ch : ' ';
    const flat = stripped.replace(/\s+/g, ' ').trim();
    return flat.length > MAX_REASON ? `${flat.slice(0, MAX_REASON - 1).trimEnd()}…` : flat;
}

/**
 * Total, rejecting validation. Returns null for anything that is not exactly a
 * patch — a null is treated identically to a timeout by the caller.
 */
export function parsePatch(raw: unknown): DirectorPatch | null {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;

    const chapter = typeof o.chapter === 'string' ? o.chapter.trim() : '';
    if (!CHAPTER_NAMES.includes(chapter)) return null;

    const surface = typeof o.surface === 'string' ? o.surface.trim() : '';
    if (!SURFACE_NAMES.includes(surface)) return null;

    // `event` is the one optional-ish field: absent reads as 'none', because a
    // director that just changes the weather is a perfectly good patch.
    const event = o.event === undefined || o.event === null ? 'none' : typeof o.event === 'string' ? o.event.trim() : '';
    if (!EVENT_IDS.includes(event)) return null;

    const reason = sanitiseReason(o.reason);
    if (reason.length === 0) return null;

    return { chapter, surface: surface as SurfaceName, event, reason };
}

/** Index into `CHAPTERS` for a validated patch. Never -1 after `parsePatch`. */
export function chapterIndexOf(name: string): number {
    return CHAPTERS.findIndex((c) => c.name === name);
}

/** Index into `EVENT_NAMES`, or -1 for 'none'. */
export function eventIndexOf(id: string): number {
    if (id === 'none') return -1;
    return EVENT_NAMES.findIndex((n) => eventId(n) === id);
}
