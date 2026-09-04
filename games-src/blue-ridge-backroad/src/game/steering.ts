/**
 * Steering feel presets.
 *
 * The multiplier scales only how quickly steering input winds ON — not how much
 * lock is available. Sharp responds faster; it does not let you turn harder, so
 * no setting can steer the truck into a spin the others cannot.
 */

export type SteerLevel = 'relaxed' | 'standard' | 'sharp';

export interface SteerOption {
    name: SteerLevel;
    label: string;
    detail: string;
    multiplier: number;
}

export const STEER_LEVELS: readonly SteerOption[] = [
    {
        name: 'relaxed',
        label: 'Relaxed',
        detail: 'Slow, deliberate steering. Easiest to hold a line at speed on gravel.',
        multiplier: 0.68
    },
    {
        name: 'standard',
        label: 'Standard',
        detail: 'Progressive: lock winds on gradually and comes off quickly.',
        multiplier: 1
    },
    {
        name: 'sharp',
        label: 'Sharp',
        detail: 'Responds immediately. Quick to place the truck, quick to overdo it.',
        multiplier: 1.6
    }
];

const STORE_KEY = 'brb.steering';

export const multiplierFor = (level: SteerLevel): number =>
    STEER_LEVELS.find((l) => l.name === level)?.multiplier ?? 1;

export const loadSteerLevel = (): SteerLevel => {
    try {
        const v = localStorage.getItem(STORE_KEY);
        if (v === 'relaxed' || v === 'standard' || v === 'sharp') return v;
    } catch {
        /* private mode */
    }
    return 'standard';
};

export const saveSteerLevel = (level: SteerLevel): void => {
    try {
        localStorage.setItem(STORE_KEY, level);
    } catch {
        /* private mode */
    }
};
