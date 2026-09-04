import type { RoadPath } from '../road/RoadPath';
import { MILE_METRES } from '../splits';
import { clamp } from '../util/mathx';

/**
 * The scout: finds stretches of road that match a requested character.
 *
 * This is the piece the AI-director design calls "search in code, taste in the
 * model". The road is already infinite and deterministic, so *finding* three
 * miles that start fast and finish technical is not a creative act — it is
 * arithmetic over a few thousand samples, and it takes a couple of
 * milliseconds. A model has nothing to add to that. What a model could add
 * later is naming and justifying the pick from a shortlist, which is why this
 * returns a ranked list rather than a single answer.
 *
 * Everything here reads the **neutral** road, ignoring chapters, because that
 * is the road a timed stage runs on. A found stage is still the same road every
 * time you drive it, so its times stay comparable — which is the whole reason
 * selection beats perturbation.
 */

/** How far apart candidate starts are placed. */
const CANDIDATE_STEP = 220;
/** Resolution the road is measured at while searching. */
const SAMPLE_STEP = 25;
/** Where the search begins and how much road it considers. */
const SEARCH_START = 1200;
const SEARCH_LENGTH = 70000;

const MAX_KAPPA = 1 / 115;
const MAX_GRADE = 0.085;
const WIDTH_MIN = 7.3;
const WIDTH_MAX = 9.4;

export interface StageProfile {
    id: string;
    label: string;
    blurb: string;
    lengthMiles: number;
    /** 0 open, 1 as tight as this road gets. */
    twistiness: number;
    /** -1 opens out through the stage, 0 even, +1 tightens through. */
    progression: number;
    /** 0 flat, 1 as hilly as this road gets. */
    elevation: number;
    /** 0 no set-pieces wanted, 1 as many as the schedule ever puts in one stage. */
    events: number;
}

/**
 * Width is deliberately NOT a profile trait. It varies on a 300 m wavelength,
 * so averaged over two to four miles it converges to the same number
 * everywhere — measured across the whole search range, every candidate came out
 * between 0.42 and 0.57 on a 0..1 scale. Asking for "a narrow stage" is asking
 * for something this road does not have at stage scale, and scoring against it
 * would only add noise. It is still measured and shown, because it is true and
 * mildly interesting; it just cannot be searched for.
 */

export const PROFILES: readonly StageProfile[] = [
    {
        id: 'flowing',
        label: 'Flowing',
        blurb: 'Open, fast and rhythmic the whole way.',
        lengthMiles: 3,
        twistiness: 0.15,
        progression: 0,
        elevation: 0.4,
        events: 0.3
    },
    {
        id: 'technical',
        label: 'Technical',
        blurb: 'Tight and busy from the line to the finish.',
        lengthMiles: 2,
        twistiness: 0.9,
        progression: 0,
        elevation: 0.5,
        events: 0.3
    },
    {
        id: 'sting',
        label: 'Sting in the Tail',
        blurb: 'Fast opening, tightening hard through the second half.',
        lengthMiles: 3,
        twistiness: 0.55,
        progression: 0.9,
        elevation: 0.5,
        events: 0.3
    },
    {
        id: 'release',
        label: 'Late Release',
        blurb: 'Technical start that opens out and lets you run.',
        lengthMiles: 3,
        twistiness: 0.55,
        progression: -0.9,
        elevation: 0.5,
        events: 0.3
    },
    {
        id: 'mountain',
        label: 'Mountain Road',
        blurb: 'The biggest climbs and drops on the whole road.',
        lengthMiles: 4,
        twistiness: 0.55,
        progression: 0.2,
        elevation: 1,
        events: 0.3
    },
    {
        id: 'sightseeing',
        label: 'Sightseeing',
        blurb: 'Steady pace, and as much to look at as the road offers.',
        lengthMiles: 3,
        twistiness: 0.4,
        progression: 0,
        elevation: 0.5,
        events: 1
    }
];

export const profileFor = (id: string): StageProfile => PROFILES.find((p) => p.id === id) ?? PROFILES[0];

export interface StageCandidate {
    /** Where it starts, metres along the road. */
    start: number;
    /** Its length in metres. */
    length: number;
    /** Stable identity, used to key best times. */
    id: string;
    name: string;
    /** Lower is a better match. */
    score: number;
    /** Measured character, all normalised 0..1 except progression (-1..1). */
    twistiness: number;
    progression: number;
    elevation: number;
    events: number;
    /** Width is measured and shown but never searched for — see StageProfile. */
    width: number;
    /** Set-pieces inside the stage. */
    eventCount: number;
    /** Elevation range in metres, for display. */
    riseMetres: number;
    /** Mean carriageway width in metres, for display. */
    widthMetres: number;
}

const shape = { curvature: 0, grade: 0, width: 0 };
const slotScratch = { index: 0, s: 0, kind: -1, side: 1 };

/** How many discovery set-pieces the schedule puts inside a stretch of road. */
const countEvents = (path: RoadPath, from: number, to: number): number => {
    let count = 0;
    const first = Math.floor(from / 640) - 1;
    const last = Math.ceil(to / 640) + 1;
    for (let i = first; i <= last; i++) {
        path.eventSlot(i, slotScratch);
        if (slotScratch.kind >= 0 && slotScratch.s >= from && slotScratch.s < to) count += 1;
    }
    return count;
};

/**
 * Measure the neutral road once across the search range, then evaluate every
 * candidate window against that. Measuring per candidate would resample the
 * same road twenty times over.
 */
class RoadSurvey {
    readonly kappa: Float64Array;
    readonly width: Float64Array;
    /** Elevation relative to the survey start, metres. */
    readonly elevation: Float64Array;
    readonly count: number;

    constructor(path: RoadPath) {
        this.count = Math.floor(SEARCH_LENGTH / SAMPLE_STEP);
        this.kappa = new Float64Array(this.count);
        this.width = new Float64Array(this.count);
        this.elevation = new Float64Array(this.count);
        let y = 0;
        for (let i = 0; i < this.count; i++) {
            const s = SEARCH_START + i * SAMPLE_STEP;
            path.neutralShapeAt(s, shape);
            this.kappa[i] = Math.abs(shape.curvature);
            this.width[i] = shape.width;
            y += shape.grade * SAMPLE_STEP;
            this.elevation[i] = y;
        }
    }
}

let survey: RoadSurvey | null = null;
let surveyedSeed = -1;

/** Words for the heuristic namer. A model would replace exactly this. */
const PACE_WORDS = ['Run', 'Dash', 'Charge', 'Sweep', 'Gallop'];
const TIGHT_WORDS = ['Twist', 'Coil', 'Ladder', 'Staircase', 'Snake'];
const PLACE_WORDS = [
    'Hollow',
    'Ridge',
    'Creek',
    'Gap',
    'Holler',
    'Notch',
    'Bend',
    'Fork',
    'Knob',
    'Spur',
    'Draw',
    'Bluff'
];

const nameFor = (start: number, twistiness: number, progression: number, rise: number): string => {
    // Deterministic in the start distance, so the same stretch always has the
    // same name.
    const h = Math.abs(Math.round(start / CANDIDATE_STEP));
    const place = PLACE_WORDS[h % PLACE_WORDS.length];
    const noun = twistiness > 0.5 ? TIGHT_WORDS[(h >> 2) % TIGHT_WORDS.length] : PACE_WORDS[(h >> 2) % PACE_WORDS.length];
    let qualifier = '';
    if (rise > 55) qualifier = 'High ';
    else if (progression > 0.25) qualifier = 'Closing ';
    else if (progression < -0.25) qualifier = 'Opening ';
    return `${qualifier}${place} ${noun}`;
};

/**
 * Rank stretches of road against a profile. Returns the best few, best first.
 */
export const scout = (path: RoadPath, profile: StageProfile, limit = 5): StageCandidate[] => {
    if (!survey || surveyedSeed !== path.seed) {
        survey = new RoadSurvey(path);
        surveyedSeed = path.seed;
    }
    const sv = survey;

    const lengthMetres = profile.lengthMiles * MILE_METRES;
    const windowSamples = Math.floor(lengthMetres / SAMPLE_STEP);
    const stride = Math.max(1, Math.round(CANDIDATE_STEP / SAMPLE_STEP));
    const results: StageCandidate[] = [];

    for (let i = 0; i + windowSamples < sv.count; i += stride) {
        const half = i + (windowSamples >> 1);
        let kSum = 0;
        let kFirst = 0;
        let kSecond = 0;
        let wSum = 0;
        let lo = Infinity;
        let hi = -Infinity;
        for (let n = i; n < i + windowSamples; n++) {
            const k = sv.kappa[n];
            kSum += k;
            if (n < half) kFirst += k;
            else kSecond += k;
            wSum += sv.width[n];
            const y = sv.elevation[n];
            if (y < lo) lo = y;
            if (y > hi) hi = y;
        }
        const n1 = half - i;
        const n2 = i + windowSamples - half;
        const meanK = kSum / windowSamples;

        // Normalise everything to 0..1 so the weights mean something.
        const twistiness = clamp(meanK / (MAX_KAPPA * 0.45), 0, 1);
        const firstMean = kFirst / Math.max(1, n1);
        const secondMean = kSecond / Math.max(1, n2);
        // Wide enough not to saturate: at 0.25 every tightening stage pinned at
        // exactly 1.0 and the search could not tell degrees apart.
        const progression = clamp((secondMean - firstMean) / (MAX_KAPPA * 0.5), -1, 1);
        const riseMetres = hi - lo;
        // Measured across the whole search range, the hilliest stretches manage
        // about 34 m of range per mile, so that is what 1.0 means.
        const elevation = clamp(riseMetres / ((lengthMetres / MILE_METRES) * 34), 0, 1);
        const widthMetres = wSum / windowSamples;
        const width = clamp((widthMetres - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN), 0, 1);
        const start0 = SEARCH_START + i * SAMPLE_STEP;

        const eventCount = countEvents(path, start0, start0 + lengthMetres);
        // Six set-pieces in a stage is about as many as the schedule ever puts
        // in one, so that is what 1.0 means.
        const events = clamp(eventCount / 6, 0, 1);

        // Weighted by how much each trait defines the character of a stage.
        const score =
            2.6 * Math.abs(twistiness - profile.twistiness) +
            2.0 * Math.abs(progression - profile.progression) +
            1.1 * Math.abs(elevation - profile.elevation) +
            1.0 * Math.abs(events - profile.events);

        results.push({
            start: start0,
            length: lengthMetres,
            id: `s${Math.round(start0)}L${Math.round(lengthMetres)}`,
            name: nameFor(start0, twistiness, progression, riseMetres),
            score,
            twistiness,
            progression,
            elevation,
            events,
            width,
            eventCount,
            riseMetres,
            widthMetres
        });
    }

    results.sort((a, b) => a.score - b.score);

    // Keep the shortlist spread out: five near-identical windows overlapping the
    // same piece of road is not a choice.
    const spread: StageCandidate[] = [];
    for (const c of results) {
        if (spread.length >= limit) break;
        if (spread.some((k) => Math.abs(k.start - c.start) < lengthMetres * 0.75)) continue;
        spread.push(c);
    }
    return spread;
};

/** Drop the cached survey; used when the world seed changes. */
export const resetScout = (): void => {
    survey = null;
    surveyedSeed = -1;
};

void MAX_GRADE;
