import { hashFloat } from './rng';

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Deterministic 1-D value noise, C1-smooth, period-free. */
export const noise1 = (x: number, seed = 0): number => {
    const i = Math.floor(x);
    const f = x - i;
    // Math.imul, not `*`: at large seeds the float product exceeds 2^53 and the
    // low bits are lost before the truncation, collapsing the noise.
    const sk = Math.imul(seed, 668265263);
    const a = hashFloat((Math.imul(i, 374761393) + sk) | 0);
    const b = hashFloat((Math.imul(i + 1, 374761393) + sk) | 0);
    return a + (b - a) * fade(f);
};

/** Deterministic 2-D value noise in [0,1]. */
export const noise2 = (x: number, y: number, seed = 0): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const s = seed * 0x9e3779b9;
    const h = (px: number, py: number): number =>
        hashFloat((Math.imul(px, 374761393) ^ Math.imul(py, 668265263) ^ s) | 0);
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    const top = a + (b - a) * fx;
    const bot = c + (d - c) * fx;
    return top + (bot - top) * fy;
};

/** Fractal 2-D noise in [0,1]. */
export const fbm2 = (x: number, y: number, octaves = 4, seed = 0): number => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += amp * noise2(x * freq, y * freq, seed + o * 17);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
    }
    return sum / norm;
};

/** Fractal 1-D noise in [-1,1]. */
export const fbm1 = (x: number, octaves = 4, seed = 0): number => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += amp * (noise1(x * freq, seed + o * 31) * 2 - 1);
        norm += amp;
        amp *= 0.5;
        freq *= 2.07;
    }
    return sum / norm;
};
