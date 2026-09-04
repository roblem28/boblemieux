import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import {
    DITCH_W,
    SHOULDER_W,
    STEP,
    createFrame,
    type RoadFrame,
    type RoadPath
} from './RoadPath';
import { fbm1 } from '../util/noise';
import { clamp, smoothstep } from '../util/mathx';

/**
 * Builds the road ribbon and the terrain skirt for one chunk.
 *
 * Two things here are load-bearing:
 *
 *  1. **Geometry is chunk-local.** Vertices are relative to the chunk's own
 *     origin and the world offset lives in the mesh's `position` (a float64
 *     Object3D field). Three composes the model-view matrix in double
 *     precision, so the values that reach the GPU stay small and the road does
 *     not shimmer after 100 km.
 *  2. **Normals are analytic, never `computeVertexNormals()`.** A ghost row is
 *     evaluated past each end of the chunk so central differences at the seam
 *     use the very same height function the neighbouring chunk will use. Per
 *     chunk normal computation would leave a lit stripe every 100 m.
 */

export const CHUNK_LEN = 100; // metres
const ROAD_ROWS = CHUNK_LEN / STEP + 1; // 51
const TERRAIN_ROW_STEP = 2; // every other road sample -> 4 m
const TERRAIN_ROWS = CHUNK_LEN / (STEP * TERRAIN_ROW_STEP) + 1; // 26

/** Lateral column layout for the road ribbon: lateral = frac * halfWidth + abs. */
const D = DITCH_W;
const S = SHOULDER_W;
const ROAD_COLS: readonly (readonly [number, number])[] = [
    [-1, -(S + D)],
    [-1, -(S + 0.72 * D)],
    [-1, -(S + 0.36 * D)],
    [-1, -S],
    [-1, -0.45 * S],
    [-1, 0],
    [-0.78, 0],
    [-0.5, 0],
    [-0.22, 0],
    [0, 0],
    [0.22, 0],
    [0.5, 0],
    [0.78, 0],
    [1, 0],
    [1, 0.45 * S],
    [1, S],
    [1, S + 0.36 * D],
    [1, S + 0.72 * D],
    [1, S + D]
];
const ROAD_COL_N = ROAD_COLS.length;

/** Terrain skirt column offsets beyond the ditch lip, per side. */
const TERRAIN_OFFSETS: readonly number[] = [0, 1.6, 3.6, 6.6, 11, 17, 25, 36, 48, 62];
const TERRAIN_COL_N = TERRAIN_OFFSETS.length;

// -------------------------------------------------------------- scratch

// Sized for the larger of the two ribbons, with headroom: exact sizing meant
// that adding one column would silently read past the end and produce NaN
// normals rather than failing.
const MAX_ROWS = Math.max(ROAD_ROWS, TERRAIN_ROWS) + 4;
const MAX_COLS = Math.max(ROAD_COL_N, TERRAIN_COL_N) + 4;
// Ghost-padded position grid: (rows + 2) x (cols + 2) x 3.
const gx = new Float64Array(MAX_ROWS * MAX_COLS);
const gy = new Float64Array(MAX_ROWS * MAX_COLS);
const gz = new Float64Array(MAX_ROWS * MAX_COLS);
const frameA = createFrame();
const tmpPoint = new Vector3();

let sharedRoadIndex: BufferAttribute | null = null;
let sharedTerrainIndex: BufferAttribute | null = null;

const buildStripIndex = (rows: number, cols: number, offset: number, out: number[]): void => {
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const a = offset + r * cols + c;
            const b = a + 1;
            const d = a + cols;
            const e = d + 1;
            // Wind so that (dP/dl x dP/ds) — i.e. up — is the front face.
            out.push(a, b, d, b, e, d);
        }
    }
};

const getRoadIndex = (): BufferAttribute => {
    if (!sharedRoadIndex) {
        const arr: number[] = [];
        buildStripIndex(ROAD_ROWS, ROAD_COL_N, 0, arr);
        sharedRoadIndex = new BufferAttribute(new Uint16Array(arr), 1);
    }
    return sharedRoadIndex;
};

const getTerrainIndex = (): BufferAttribute => {
    if (!sharedTerrainIndex) {
        const arr: number[] = [];
        // Two independent strips (left verge and right verge) in one buffer.
        buildStripIndex(TERRAIN_ROWS, TERRAIN_COL_N, 0, arr);
        buildStripIndex(TERRAIN_ROWS, TERRAIN_COL_N, TERRAIN_ROWS * TERRAIN_COL_N, arr);
        sharedTerrainIndex = new BufferAttribute(new Uint16Array(arr), 1);
    }
    return sharedTerrainIndex;
};

export const createRoadGeometry = (): BufferGeometry => {
    const n = ROAD_ROWS * ROAD_COL_N;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setIndex(getRoadIndex());
    // The chunk spans 100 m of road and ~10 m either side of the centreline;
    // an oversized sphere just weakens frustum culling across all 13 chunks.
    g.boundingSphere = new Sphere(new Vector3(0, CHUNK_LEN * 0.5, CHUNK_LEN * 0.5), CHUNK_LEN);
    return g;
};

export const createTerrainGeometry = (): BufferGeometry => {
    const n = TERRAIN_ROWS * TERRAIN_COL_N * 2;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setIndex(getTerrainIndex());
    // The skirt reaches ~75 m either side and climbs the hillside with it.
    g.boundingSphere = new Sphere(new Vector3(0, CHUNK_LEN * 0.5, CHUNK_LEN * 0.5), 160);
    return g;
};

/** Lateral offset of road column `c` for a given half-width. */
const roadLateral = (c: number, hw: number): number => {
    const spec = ROAD_COLS[clamp(c, 0, ROAD_COL_N - 1)];
    let l = spec[0] * hw + spec[1];
    // Ghost columns step a little further out so the edge normal is centred.
    if (c < 0) l -= 0.6;
    if (c > ROAD_COL_N - 1) l += 0.6;
    return l;
};

/** Distance from the centreline of terrain column `idx` (ghost-safe). */
const terrainLateralAt = (idx: number, hw: number): number => {
    const lip = hw + SHOULDER_W + DITCH_W;
    let off: number;
    if (idx < 0) off = -1.2;
    else if (idx > TERRAIN_COL_N - 1) off = TERRAIN_OFFSETS[TERRAIN_COL_N - 1] + 14;
    else off = TERRAIN_OFFSETS[idx];
    return lip + off;
};

// The left strip walks its columns backwards so that lateral still increases
// with the column index — otherwise its triangles would wind the other way and
// be back-face culled.
const terrainLeft = (c: number, hw: number): number => -terrainLateralAt(TERRAIN_COL_N - 1 - c, hw);
const terrainRight = (c: number, hw: number): number => terrainLateralAt(c, hw);

/**
 * Fill the ghost-padded position grid, then write positions, analytic normals,
 * UVs and vertex colours into the geometry. `originX/Y/Z` is the chunk origin.
 */
const fillRibbon = (
    path: RoadPath,
    geo: BufferGeometry,
    vertexOffset: number,
    sStart: number,
    rows: number,
    rowStep: number,
    cols: number,
    lateralOf: (c: number, hw: number) => number,
    originX: number,
    originY: number,
    originZ: number,
    colorOf: (frame: RoadFrame, lateral: number, out: Float32Array) => void
): void => {
    const gcols = cols + 2;

    // 1. Positions on a grid padded by one ghost row/column on every side.
    for (let r = -1; r <= rows; r++) {
        const s = sStart + r * rowStep;
        path.sample(s, frameA);
        const hw = frameA.width * 0.5;
        for (let c = -1; c <= cols; c++) {
            const l = lateralOf(c, hw);
            path.surfacePoint(frameA, l, tmpPoint);
            const gi = (r + 1) * gcols + (c + 1);
            gx[gi] = tmpPoint.x - originX;
            gy[gi] = tmpPoint.y - originY;
            gz[gi] = tmpPoint.z - originZ;
        }
    }

    // 2. Interior vertices: copy positions, central-difference the normals.
    const pos = geo.getAttribute('position') as BufferAttribute;
    const nrm = geo.getAttribute('normal') as BufferAttribute;
    const uv = geo.getAttribute('uv') as BufferAttribute;
    const col = geo.getAttribute('color') as BufferAttribute;
    const pArr = pos.array as Float32Array;
    const nArr = nrm.array as Float32Array;
    const uArr = uv.array as Float32Array;
    const cArr = col.array as Float32Array;
    const rgb = colorScratch;

    for (let r = 0; r < rows; r++) {
        const s = sStart + r * rowStep;
        path.sample(s, frameA);
        const hw = frameA.width * 0.5;
        for (let c = 0; c < cols; c++) {
            const gi = (r + 1) * gcols + (c + 1);
            const vi = vertexOffset + r * cols + c;

            pArr[vi * 3] = gx[gi];
            pArr[vi * 3 + 1] = gy[gi];
            pArr[vi * 3 + 2] = gz[gi];

            // dP/ds and dP/dl from the ghost-padded grid.
            const sPrev = gi - gcols;
            const sNext = gi + gcols;
            const ax = gx[sNext] - gx[sPrev];
            const ay = gy[sNext] - gy[sPrev];
            const az = gz[sNext] - gz[sPrev];
            const bx = gx[gi + 1] - gx[gi - 1];
            const by = gy[gi + 1] - gy[gi - 1];
            const bz = gz[gi + 1] - gz[gi - 1];
            // n = dP/dl x dP/ds keeps the normal pointing up.
            let nx = by * az - bz * ay;
            let ny = bz * ax - bx * az;
            let nz = bx * ay - by * ax;
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len;
            ny /= len;
            nz /= len;
            if (ny < 0) {
                nx = -nx;
                ny = -ny;
                nz = -nz;
            }
            nArr[vi * 3] = nx;
            nArr[vi * 3 + 1] = ny;
            nArr[vi * 3 + 2] = nz;

            // UVs in metres along and across the road: continuous across chunks.
            const l = lateralOf(c, hw);
            uArr[vi * 2] = l;
            uArr[vi * 2 + 1] = s;

            colorOf(frameA, l, rgb);
            cArr[vi * 3] = rgb[0];
            cArr[vi * 3 + 1] = rgb[1];
            cArr[vi * 3 + 2] = rgb[2];
        }
    }

    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    uv.needsUpdate = true;
    col.needsUpdate = true;
};

const colorScratch = new Float32Array(3);

/** Road surface tint: compacted ruts, a looser crown, mud and damp patches. */
const roadColor = (frame: RoadFrame, l: number, out: Float32Array): void => {
    const hw = frame.width * 0.5;
    const a = Math.abs(l);
    if (a > hw + SHOULDER_W) {
        // Ditch: grassy and darker, blending out of the gravel.
        const t = smoothstep(hw + SHOULDER_W, hw + SHOULDER_W + 1.2, a);
        out[0] = 1 - t * 0.62;
        out[1] = 1 - t * 0.4;
        out[2] = 1 - t * 0.72;
        return;
    }
    // Wheel tracks are polished darker; the centre keeps loose pale gravel.
    const rut = Math.abs(a - 0.95);
    const track = Math.exp(-rut * rut * 2.2);
    const centre = Math.exp(-a * a * 3.4);
    const mud = clamp(fbm1(frame.s / 17 + l * 0.6, 2, 907) * 1.5 - 0.45, 0, 1);
    const shoulder = smoothstep(hw - 0.5, hw + SHOULDER_W, a);
    // Variation at two scales the texture cannot provide. Near the camera the
    // gravel map is sampled at a grazing angle and mips down to a flat average,
    // so without something in the vertex colours the road ahead of the bumper
    // reads as a sheet of grey. These are per-vertex, so no mip level can wash
    // them out. Both wavelengths stay well above the 2 m row spacing, or they
    // would simply alias.
    const grainWide = fbm1(frame.s / 41 - l * 0.2, 2, 917);
    const grainNear = fbm1(frame.s / 6 + l * 0.9, 2, 913);

    const base =
        1.06 + centre * 0.12 - track * 0.24 - mud * 0.3 - shoulder * 0.12 +
        grainWide * 0.075 + grainNear * 0.085;
    out[0] = base;
    out[1] = base * (1 - mud * 0.06) * (1 - track * 0.02);
    out[2] = base * (1 - mud * 0.16) * (1 - track * 0.05);
};

/** Terrain tint: greener in the hollows, browner and rockier up the cut banks. */
const terrainColor = (frame: RoadFrame, l: number, out: Float32Array): void => {
    const a = Math.abs(l);
    const lip = frame.width * 0.5 + SHOULDER_W + DITCH_W;
    const up = clamp((a - lip) / 40, 0, 1);
    const side = l > 0 ? 1 : -1;
    const bank = clamp(frame.sideBias * side, -1, 1);
    // Two noise scales rather than one: a single frequency aligned with the
    // terrain rows reads as banding across the hillside.
    const patch = fbm1((frame.s + l * 4) / 26, 2, 613);
    const broad = fbm1((frame.s * 0.35 - l * 1.7) / 95, 3, 617);
    const dry = clamp(0.5 + 0.34 * patch + 0.3 * broad + bank * 0.2, 0, 1);
    // Green undergrowth near the road, drier leaf litter and bare dirt as the
    // bank climbs away from it.
    out[0] = 0.62 + dry * 0.42 + up * 0.2;
    out[1] = 0.68 + dry * 0.22 - up * 0.02;
    out[2] = 0.54 + dry * 0.18 - up * 0.08;
};

export const buildRoadChunk = (
    path: RoadPath,
    geo: BufferGeometry,
    sStart: number,
    originX: number,
    originY: number,
    originZ: number
): void => {
    fillRibbon(
        path,
        geo,
        0,
        sStart,
        ROAD_ROWS,
        STEP,
        ROAD_COL_N,
        roadLateral,
        originX,
        originY,
        originZ,
        roadColor
    );
};

export const buildTerrainChunk = (
    path: RoadPath,
    geo: BufferGeometry,
    sStart: number,
    originX: number,
    originY: number,
    originZ: number
): void => {
    const stride = TERRAIN_ROWS * TERRAIN_COL_N;
    fillRibbon(
        path,
        geo,
        0,
        sStart,
        TERRAIN_ROWS,
        STEP * TERRAIN_ROW_STEP,
        TERRAIN_COL_N,
        terrainLeft,
        originX,
        originY,
        originZ,
        terrainColor
    );
    fillRibbon(
        path,
        geo,
        stride,
        sStart,
        TERRAIN_ROWS,
        STEP * TERRAIN_ROW_STEP,
        TERRAIN_COL_N,
        terrainRight,
        originX,
        originY,
        originZ,
        terrainColor
    );
};

