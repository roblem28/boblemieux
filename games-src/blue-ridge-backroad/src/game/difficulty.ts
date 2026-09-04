/**
 * Difficulty levels.
 *
 * These change how forgiving the truck is, not how fast it is. Top speed,
 * engine, brakes and the road itself are identical at every level — what varies
 * is how much grip you have, how hard the truck fights a slide, and how much
 * leaving the road or hitting something costs you.
 *
 * `stability` is the important one. It is an electronic-stability-control
 * analogue: each substep it pulls the yaw rate a fraction of the way toward
 * what the steering angle alone would produce, and bleeds off sideways
 * velocity. At Expert it is zero and you get the raw tire model.
 */

export type DifficultyName = 'easy' | 'medium' | 'hard' | 'expert';

export interface Difficulty {
    name: DifficultyName;
    label: string;
    detail: string;
    /** Multiplies tire grip on every surface. */
    gripScale: number;
    /** Extra grip at the rear axle, which turns a snap into understeer. */
    rearBias: number;
    /** 0 = raw tire model, 1 = the truck refuses to rotate. */
    stability: number;
    /** Multiplies rolling resistance once you are off the carriageway. */
    offRoadDrag: number;
    /** Fraction of speed kept after hitting something. */
    collisionKeep: number;
    /** Extra steering lock available while catching a slide, in degrees. */
    catchLock: number;
}

export const DIFFICULTIES: readonly Difficulty[] = [
    {
        name: 'easy',
        label: 'Easy',
        detail: 'Plenty of grip and a firm hand on the back end. Hard to spin, gentle off-road.',
        gripScale: 1.26,
        rearBias: 1.2,
        stability: 0.55,
        offRoadDrag: 0.7,
        collisionKeep: 0.9,
        catchLock: 14
    },
    {
        name: 'medium',
        label: 'Medium',
        detail: 'The truck moves around underneath you, but it comes back when you ask.',
        gripScale: 1.13,
        rearBias: 1.1,
        stability: 0.32,
        offRoadDrag: 0.85,
        collisionKeep: 0.85,
        catchLock: 11
    },
    {
        name: 'hard',
        label: 'Hard',
        detail: 'Loose on gravel over 70. Slides are yours to catch.',
        gripScale: 1.02,
        rearBias: 1.03,
        stability: 0.13,
        offRoadDrag: 1,
        collisionKeep: 0.78,
        catchLock: 9
    },
    {
        name: 'expert',
        label: 'Expert',
        detail: 'No assistance at all. The raw tire model, and it will bite.',
        gripScale: 0.94,
        rearBias: 1,
        stability: 0,
        offRoadDrag: 1.12,
        collisionKeep: 0.7,
        catchLock: 8
    }
];

export const DEFAULT_DIFFICULTY: DifficultyName = 'medium';

export const difficultyFor = (name: DifficultyName): Difficulty =>
    DIFFICULTIES.find((d) => d.name === name) ?? DIFFICULTIES[1];

const STORE_KEY = 'brb.difficulty';

export const loadDifficulty = (): DifficultyName => {
    try {
        const v = localStorage.getItem(STORE_KEY);
        if (v === 'easy' || v === 'medium' || v === 'hard' || v === 'expert') return v;
    } catch {
        /* private mode */
    }
    return DEFAULT_DIFFICULTY;
};

export const saveDifficulty = (name: DifficultyName): void => {
    try {
        localStorage.setItem(STORE_KEY, name);
    } catch {
        /* private mode */
    }
};
