import {
    CanvasTexture,
    LinearMipmapLinearFilter,
    LinearFilter,
    NoColorSpace,
    RepeatWrapping,
    SRGBColorSpace,
    Texture
} from 'three';
import { hashFloat } from './rng';
import { clamp } from './mathx';

/**
 * Every texture in the game is generated here, on a canvas, at load time. No
 * binary assets ship, so there is nothing to hotlink and nothing to download.
 *
 * Two rules that are easy to get wrong and cost an afternoon each:
 *  - albedo maps are sRGB, normal/roughness maps are NOT (they are raw data);
 *  - canvas textures default to flipY = true, which inverts the green channel
 *    of a Sobel-derived normal map, so the map is baked with green inverted to
 *    compensate.
 */

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Tileable 2-D value noise with an integer period, so textures wrap seamlessly. */
const tileNoise = (x: number, y: number, period: number, seed: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const w = (n: number): number => ((n % period) + period) % period;
    const h = (px: number, py: number): number =>
        hashFloat((Math.imul(w(px), 374761393) ^ Math.imul(w(py), 668265263) ^ (seed * 2246822519)) | 0);
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
};

/** Tileable fbm in [0,1]. `base` is the lattice period at the first octave. */
const tileFbm = (u: number, v: number, base: number, octaves: number, seed: number): number => {
    let amp = 0.5;
    let freq = base;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += amp * tileNoise(u * freq, v * freq, freq, seed + o * 13);
        norm += amp;
        amp *= 0.52;
        freq *= 2;
    }
    return sum / norm;
};

const makeCanvas = (size: number): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
};

const finish = (canvas: HTMLCanvasElement, srgb: boolean, aniso: number): Texture => {
    const tex = new CanvasTexture(canvas);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = aniso;
    tex.needsUpdate = true;
    return tex;
};

/** Sobel a height field into a tangent-space normal map. */
const heightToNormal = (height: Float32Array, size: number, strength: number, aniso: number): Texture => {
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const at = (x: number, y: number): number => height[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx =
                at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
                (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
            const dy =
                at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
                (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
            const nx = dx * strength;
            const ny = dy * strength;
            const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
            const i = (y * size + x) * 4;
            d[i] = (nx * inv * 0.5 + 0.5) * 255;
            // Green is written inverted to cancel the canvas texture's flipY,
            // which would otherwise flip the lighting direction on every bump.
            d[i + 1] = (-ny * inv * 0.5 + 0.5) * 255;
            d[i + 2] = (inv * 0.5 + 0.5) * 255;
            d[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return finish(canvas, false, aniso);
};

export interface SurfaceMaps {
    map: Texture;
    normalMap: Texture;
    roughnessMap: Texture;
}

interface Layer {
    /** Returns [r, g, b] in 0..1 and a height in 0..1. */
    (u: number, v: number, out: Float32Array): void;
}

const buildSurface = (
    size: number,
    aniso: number,
    normalStrength: number,
    layer: Layer
): SurfaceMaps => {
    const albedo = makeCanvas(size);
    const actx = albedo.getContext('2d')!;
    const aimg = actx.createImageData(size, size);
    const rough = makeCanvas(size);
    const rctx = rough.getContext('2d')!;
    const rimg = rctx.createImageData(size, size);
    const height = new Float32Array(size * size);
    const out = new Float32Array(5); // r, g, b, height, roughness

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            layer(x / size, y / size, out);
            const i = (y * size + x) * 4;
            aimg.data[i] = clamp(out[0], 0, 1) * 255;
            aimg.data[i + 1] = clamp(out[1], 0, 1) * 255;
            aimg.data[i + 2] = clamp(out[2], 0, 1) * 255;
            aimg.data[i + 3] = 255;
            height[y * size + x] = out[3];
            const r = clamp(out[4], 0, 1) * 255;
            rimg.data[i] = r;
            rimg.data[i + 1] = r;
            rimg.data[i + 2] = r;
            rimg.data[i + 3] = 255;
        }
    }
    actx.putImageData(aimg, 0, 0);
    rctx.putImageData(rimg, 0, 0);

    return {
        map: finish(albedo, true, aniso),
        normalMap: heightToNormal(height, size, normalStrength, aniso),
        roughnessMap: finish(rough, false, aniso)
    };
};

// ------------------------------------------------------------------ surfaces

export const makeGravel = (size: number, aniso: number): SurfaceMaps =>
    buildSurface(size, aniso, 2.4, (u, v, out) => {
        const grain = tileFbm(u, v, 32, 4, 7);
        const patch = tileFbm(u, v, 4, 3, 19);
        const stones = tileNoise(u * 64, v * 64, 64, 41);
        // Scattered pale stones sitting proud of packed dirt.
        const stone = stones > 0.82 ? (stones - 0.82) / 0.18 : 0;
        const dust = 0.34 + 0.16 * patch;
        const base = dust + 0.22 * (grain - 0.5);
        const r = base * 1.06 + stone * 0.34;
        const g = base * 0.98 + stone * 0.32;
        const b = base * 0.86 + stone * 0.3;
        out[0] = r;
        out[1] = g;
        out[2] = b;
        out[3] = grain * 0.55 + stone * 0.9 + patch * 0.25;
        out[4] = 0.86 - stone * 0.18 + 0.08 * (patch - 0.5);
    });

export const makeGrass = (size: number, aniso: number): SurfaceMaps =>
    buildSurface(size, aniso, 1.7, (u, v, out) => {
        const blade = tileFbm(u, v, 48, 3, 3);
        const clump = tileFbm(u, v, 6, 4, 29);
        const dirt = tileFbm(u, v, 3, 2, 53);
        const dry = clamp(dirt * 1.4 - 0.35, 0, 1);
        // Appalachian summer green: muted and slightly olive, with dry patches
        // and leaf litter showing through. Saturated grass reads as astroturf.
        const r = 0.15 + 0.15 * clump + 0.07 * blade + dry * 0.2;
        const g = 0.19 + 0.19 * clump + 0.08 * blade + dry * 0.13;
        const b = 0.11 + 0.09 * clump + 0.04 * blade + dry * 0.06;
        out[0] = r;
        out[1] = g;
        out[2] = b;
        out[3] = blade * 0.7 + clump * 0.4;
        out[4] = 0.92 - clump * 0.08;
    });

export const makeDirt = (size: number, aniso: number): SurfaceMaps =>
    buildSurface(size, aniso, 2.0, (u, v, out) => {
        const grain = tileFbm(u, v, 40, 4, 61);
        const patch = tileFbm(u, v, 5, 3, 71);
        const base = 0.2 + 0.16 * patch + 0.12 * (grain - 0.5);
        out[0] = base * 1.24;
        out[1] = base * 0.98;
        out[2] = base * 0.72;
        out[3] = grain * 0.6 + patch * 0.35;
        out[4] = 0.9 + 0.06 * (grain - 0.5);
    });

export const makeRock = (size: number, aniso: number): SurfaceMaps =>
    buildSurface(size, aniso, 3.0, (u, v, out) => {
        const strata = tileFbm(u, v * 0.35, 8, 4, 83);
        const grain = tileFbm(u, v, 40, 3, 97);
        const crack = Math.abs(tileFbm(u, v, 10, 3, 101) - 0.5) < 0.035 ? 0.55 : 1;
        const base = (0.3 + 0.22 * strata + 0.1 * (grain - 0.5)) * crack;
        out[0] = base * 1.02;
        out[1] = base * 1.0;
        out[2] = base * 0.98;
        out[3] = strata * 0.75 + grain * 0.3;
        out[4] = 0.78 + 0.12 * strata;
    });

export const makeBark = (size: number, aniso: number): SurfaceMaps =>
    buildSurface(size, aniso, 3.2, (u, v, out) => {
        // Vertical fissures: stretch the noise hard along v.
        const fissure = tileFbm(u * 3.2, v * 0.22, 16, 4, 113);
        const grain = tileFbm(u, v * 0.4, 48, 3, 127);
        const groove = Math.pow(Math.abs(fissure - 0.5) * 2, 0.6);
        const base = 0.11 + 0.16 * groove + 0.07 * grain;
        out[0] = base * 1.25;
        out[1] = base * 1.05;
        out[2] = base * 0.86;
        out[3] = groove * 0.85 + grain * 0.2;
        out[4] = 0.95;
    });

export const makeWood = (size: number, aniso: number): SurfaceMaps =>
    buildSurface(size, aniso, 2.0, (u, v, out) => {
        const rings = (Math.sin((v * 26 + tileFbm(u, v, 8, 3, 131) * 6) * Math.PI) + 1) * 0.5;
        const grain = tileFbm(u * 0.3, v * 4, 32, 3, 137);
        const base = 0.16 + 0.13 * rings + 0.09 * grain;
        out[0] = base * 1.35;
        out[1] = base * 1.06;
        out[2] = base * 0.76;
        out[3] = rings * 0.6 + grain * 0.4;
        out[4] = 0.88;
    });

// -------------------------------------------------------------- alpha sheets

/** A leaf cluster sheet: irregular blobs with an alpha cut-out. */
export const makeLeafSheet = (size: number, aniso: number, tint: [number, number, number]): Texture => {
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;
            // Radial falloff so a quad reads as a rounded leaf mass, plus noise
            // so the silhouette is ragged rather than a disc.
            const dx = u - 0.5;
            const dy = v - 0.5;
            const r = Math.sqrt(dx * dx + dy * dy) * 2;
            const n = tileFbm(u, v, 6, 4, 149);
            const n2 = tileFbm(u, v, 22, 3, 151);
            const mask = 1 - r + (n - 0.5) * 0.95;
            const alpha = mask > 0.18 ? 1 : 0;
            const shade = 0.55 + 0.6 * n2 - 0.28 * r;
            const i = (y * size + x) * 4;
            d[i] = clamp(tint[0] * shade, 0, 1) * 255;
            d[i + 1] = clamp(tint[1] * shade, 0, 1) * 255;
            d[i + 2] = clamp(tint[2] * shade, 0, 1) * 255;
            d[i + 3] = alpha * 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = finish(canvas, true, aniso);
    return tex;
};

/** Soft round sprite for dust puffs and light glare. */
export const makeSoftSprite = (size: number, hardness = 2.2): Texture => {
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x / size - 0.5;
            const dy = y / size - 0.5;
            const r = clamp(Math.sqrt(dx * dx + dy * dy) * 2, 0, 1);
            const a = Math.pow(1 - r, hardness);
            const i = (y * size + x) * 4;
            d[i] = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
            d[i + 3] = a * 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
};
