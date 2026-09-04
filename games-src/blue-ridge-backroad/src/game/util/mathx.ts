export const clamp = (v: number, lo: number, hi: number): number =>
    v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
    const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach. `rate` is roughly 1/seconds. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
    target + (current - target) * Math.exp(-rate * dt);

export const moveTowards = (current: number, target: number, maxDelta: number): number => {
    const d = target - current;
    if (d > maxDelta) return current + maxDelta;
    if (d < -maxDelta) return current - maxDelta;
    return target;
};

export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

export const MPS_TO_MPH = 2.2369362920544;
export const M_TO_MILES = 1 / 1609.344;
export const DEG = Math.PI / 180;
