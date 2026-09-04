import {
    BufferGeometry,
    CylinderGeometry,
    IcosahedronGeometry,
    InstancedMesh,
    Material,
    Matrix4,
    Object3D,
    PlaneGeometry,
    Scene,
    Sphere,
    Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../util/rng';
import type { Assets } from './Assets';

/**
 * All vegetation lives in a handful of global InstancedMeshes, one per species
 * and level of detail, so ~2000 plants cost about a dozen draw calls.
 *
 * Chunks do not own meshes; they own a *block* of contiguous instance slots in
 * each pool. Blocks are fixed-size and recycled, which keeps `InstancedMesh.count`
 * tight — a per-instance free list would fragment and force `count` up to the
 * highest used index forever.
 *
 * Instance matrices are stored relative to `origin`, a float64 world offset
 * carried on the mesh. Instance matrices are float32, so without this the whole
 * forest would start to shimmer after a few tens of kilometres. `rebase()`
 * shifts the origin and fixes up every live matrix in one linear pass.
 */

const IDENTITY_ZERO = new Matrix4().makeScale(0, 0, 0);

export class InstancePool {
    readonly mesh: InstancedMesh;
    readonly blockSize: number;
    readonly blockCount: number;
    private readonly blockUsed: Uint8Array;
    private readonly freeBlocks: number[] = [];
    private maxActiveBlock = -1;

    constructor(geometry: BufferGeometry, material: Material, blockSize: number, blockCount: number) {
        this.blockSize = blockSize;
        this.blockCount = blockCount;
        this.mesh = new InstancedMesh(geometry, material, blockSize * blockCount);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        // One mesh has one bounding sphere; leaving culling on would pop the
        // entire forest out of existence the moment that sphere left the view.
        this.mesh.frustumCulled = false;
        this.mesh.boundingSphere = new Sphere(new Vector3(), 1e6);
        this.mesh.count = 0;
        this.blockUsed = new Uint8Array(blockCount);
        for (let i = blockCount - 1; i >= 0; i--) this.freeBlocks.push(i);
        // Everything starts collapsed so unwritten slots draw nothing.
        for (let i = 0; i < blockSize * blockCount; i++) this.mesh.setMatrixAt(i, IDENTITY_ZERO);
    }

    allocBlock(): number {
        const b = this.freeBlocks.pop();
        if (b === undefined) return -1;
        this.blockUsed[b] = 1;
        if (b > this.maxActiveBlock) this.maxActiveBlock = b;
        this.mesh.count = (this.maxActiveBlock + 1) * this.blockSize;
        return b;
    }

    freeBlock(b: number): void {
        if (b < 0 || this.blockUsed[b] === 0) return;
        this.blockUsed[b] = 0;
        this.freeBlocks.push(b);
        const base = b * this.blockSize;
        for (let i = 0; i < this.blockSize; i++) this.mesh.setMatrixAt(base + i, IDENTITY_ZERO);
        if (b === this.maxActiveBlock) {
            let m = -1;
            for (let i = this.blockCount - 1; i >= 0; i--) {
                if (this.blockUsed[i]) {
                    m = i;
                    break;
                }
            }
            this.maxActiveBlock = m;
            this.mesh.count = (m + 1) * this.blockSize;
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /** Write one instance inside a block. `i` must be < blockSize. */
    set(block: number, i: number, matrix: Matrix4): void {
        if (i >= this.blockSize) return;
        this.mesh.setMatrixAt(block * this.blockSize + i, matrix);
    }

    /** Collapse the unused tail of a block after a partial fill. */
    clearFrom(block: number, i: number): void {
        const base = block * this.blockSize;
        for (let k = i; k < this.blockSize; k++) this.mesh.setMatrixAt(base + k, IDENTITY_ZERO);
    }

    flush(): void {
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /** Shift every live instance by -delta and move the mesh origin instead. */
    rebase(dx: number, dy: number, dz: number): void {
        const arr = this.mesh.instanceMatrix.array as Float32Array;
        const n = this.mesh.count * 16;
        for (let o = 0; o < n; o += 16) {
            // Skip collapsed slots: their scale is exactly zero.
            if (arr[o] === 0 && arr[o + 5] === 0 && arr[o + 10] === 0) continue;
            arr[o + 12] -= dx;
            arr[o + 13] -= dy;
            arr[o + 14] -= dz;
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.mesh.dispose();
    }
}

// --------------------------------------------------------------- geometry

const tmpObj = new Object3D();

/** A tapered, slightly irregular trunk with a couple of branch stubs. */
const makeTrunk = (
    height: number,
    baseRadius: number,
    topRatio: number,
    branches: number,
    seed: number
): BufferGeometry => {
    const rng = new Rng(seed);
    const parts: BufferGeometry[] = [];

    const trunk = new CylinderGeometry(baseRadius * topRatio, baseRadius, height, 7, 4, false);
    // Push vertices around so the trunk is not a perfect lathe.
    const pos = trunk.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = (y + height * 0.5) / height;
        const wob = 1 + 0.11 * Math.sin(t * 7.3 + seed) + 0.07 * Math.sin(t * 17.1 + seed * 2);
        pos.setX(i, pos.getX(i) * wob + Math.sin(t * 2.4 + seed) * baseRadius * 1.6 * t);
        pos.setZ(i, pos.getZ(i) * wob + Math.cos(t * 1.9 + seed) * baseRadius * 1.3 * t);
    }
    trunk.translate(0, height * 0.5, 0);
    trunk.computeVertexNormals();
    parts.push(trunk);

    for (let i = 0; i < branches; i++) {
        const h = height * rng.range(0.45, 0.86);
        const len = height * rng.range(0.16, 0.3);
        const r = baseRadius * rng.range(0.2, 0.36);
        const b = new CylinderGeometry(r * 0.4, r, len, 5, 1, false);
        b.translate(0, len * 0.5, 0);
        tmpObj.position.set(0, h, 0);
        tmpObj.rotation.set(rng.range(0.6, 1.15), rng.range(0, Math.PI * 2), 0, 'YXZ');
        tmpObj.rotation.order = 'YXZ';
        tmpObj.rotation.y = rng.range(0, Math.PI * 2);
        tmpObj.rotation.x = rng.range(0.7, 1.2);
        tmpObj.scale.set(1, 1, 1);
        tmpObj.updateMatrix();
        b.applyMatrix4(tmpObj.matrix);
        b.computeVertexNormals();
        parts.push(b);
    }

    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged ?? parts[0];
};

/** Broadleaf canopy: leaf cards scattered over a squashed sphere. */
const makeBroadCanopy = (
    height: number,
    radius: number,
    cards: number,
    cardSize: number,
    seed: number
): BufferGeometry => {
    const rng = new Rng(seed);
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < cards; i++) {
        const size = cardSize * rng.range(0.7, 1.25);
        const p = new PlaneGeometry(size, size);
        // Fibonacci-ish distribution keeps the canopy from clumping.
        const t = (i + 0.5) / cards;
        const phi = Math.acos(1 - 1.55 * t);
        const theta = i * 2.39996;
        const r = radius * rng.range(0.45, 1);
        tmpObj.position.set(
            Math.sin(phi) * Math.cos(theta) * r,
            height + Math.cos(phi) * radius * 0.72,
            Math.sin(phi) * Math.sin(theta) * r
        );
        tmpObj.rotation.set(rng.range(-0.6, 0.6), rng.range(0, Math.PI * 2), rng.range(-0.5, 0.5));
        tmpObj.scale.set(1, 1, 1);
        tmpObj.updateMatrix();
        p.applyMatrix4(tmpObj.matrix);
        parts.push(p);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged ?? parts[0];
};

/** Conifer canopy: whorls of drooping branch cards, narrowing toward the top. */
const makeConiferCanopy = (
    baseHeight: number,
    topHeight: number,
    baseRadius: number,
    whorls: number,
    seed: number
): BufferGeometry => {
    const rng = new Rng(seed);
    const parts: BufferGeometry[] = [];
    for (let w = 0; w < whorls; w++) {
        const t = w / (whorls - 1);
        const y = baseHeight + (topHeight - baseHeight) * t;
        const r = baseRadius * (1 - t * 0.86) * rng.range(0.9, 1.1);
        const perWhorl = Math.max(3, Math.round(6 - t * 3));
        for (let i = 0; i < perWhorl; i++) {
            const a = (i / perWhorl) * Math.PI * 2 + w * 0.7;
            const len = r * rng.range(1.5, 2.1);
            const p = new PlaneGeometry(len, len * 0.62);
            tmpObj.position.set(Math.cos(a) * r * 0.55, y, Math.sin(a) * r * 0.55);
            tmpObj.rotation.set(rng.range(0.25, 0.5), -a, 0, 'YXZ');
            tmpObj.scale.set(1, 1, 1);
            tmpObj.updateMatrix();
            p.applyMatrix4(tmpObj.matrix);
            parts.push(p);
        }
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged ?? parts[0];
};

/** Low scrub: a few crossed cards near the ground. */
const makeScrub = (size: number, cards: number, seed: number): BufferGeometry => {
    const rng = new Rng(seed);
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < cards; i++) {
        const w = size * rng.range(0.75, 1.3);
        const p = new PlaneGeometry(w, w * rng.range(0.6, 0.95));
        tmpObj.position.set(rng.range(-size * 0.3, size * 0.3), w * 0.36, rng.range(-size * 0.3, size * 0.3));
        tmpObj.rotation.set(rng.range(-0.25, 0.25), rng.range(0, Math.PI * 2), rng.range(-0.2, 0.2));
        tmpObj.scale.set(1, 1, 1);
        tmpObj.updateMatrix();
        p.applyMatrix4(tmpObj.matrix);
        parts.push(p);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged ?? parts[0];
};

/** Irregular boulder. */
const makeBoulder = (seed: number): BufferGeometry => {
    const g = new IcosahedronGeometry(1, 1);
    const rng = new Rng(seed);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const k = 0.68 + rng.next() * 0.55;
        pos.setXYZ(i, pos.getX(i) * k * 1.15, pos.getY(i) * k * 0.72, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
};

/** Fallen branch / log. */
const makeLog = (seed: number): BufferGeometry => {
    const rng = new Rng(seed);
    const g = new CylinderGeometry(rng.range(0.1, 0.2), rng.range(0.14, 0.26), rng.range(2.4, 5), 6, 2);
    g.rotateZ(Math.PI * 0.5);
    g.computeVertexNormals();
    return g;
};

// ----------------------------------------------------------------- species

export const SPECIES_OAK = 0;
export const SPECIES_PINE = 1;
export const SPECIES_BIRCH = 2;
export const SPECIES_SNAG = 3;
export const SPECIES_BUSH = 4;
export const SPECIES_FERN = 5;
export const SPECIES_COUNT = 6;

export interface VegetationBlocks {
    /** Trunk block index per species (-1 where the species has no trunk). */
    trunk: Int16Array;
    /** Foliage block index per species. */
    foliage: Int16Array;
    /** Count written into each species' block. */
    used: Int16Array;
    rock: number;
    rockUsed: number;
    log: number;
    logUsed: number;
}

export const createBlocks = (): VegetationBlocks => ({
    trunk: new Int16Array(SPECIES_COUNT).fill(-1),
    foliage: new Int16Array(SPECIES_COUNT).fill(-1),
    used: new Int16Array(SPECIES_COUNT),
    rock: -1,
    rockUsed: 0,
    log: -1,
    logUsed: 0
});

export const TREE_BLOCK = 48;
export const SCRUB_BLOCK = 64;
export const ROCK_BLOCK = 26;
export const LOG_BLOCK = 12;

export class Vegetation {
    readonly trunkPools: (InstancePool | null)[] = [];
    readonly foliagePools: InstancePool[] = [];
    readonly rocks: InstancePool;
    readonly logs: InstancePool;
    readonly origin = new Vector3();

    private readonly all: InstancePool[] = [];
    private readonly root: Object3D;

    constructor(scene: Scene, assets: Assets, blockCount: number) {
        // Shadow casters are budgeted below: a pool's shadow pass draws its
        // whole `count`, which spans road a kilometre ahead, far outside any
        // shadow camera. Only the trunks and broadleaf canopies earn it.
        this.root = new Object3D();
        this.root.matrixAutoUpdate = true;
        scene.add(this.root);

        const trunkGeos: (BufferGeometry | null)[] = [
            makeTrunk(11, 0.34, 0.42, 3, 11),
            makeTrunk(15, 0.3, 0.3, 2, 23),
            makeTrunk(10, 0.22, 0.5, 2, 31),
            makeTrunk(9, 0.26, 0.28, 4, 47),
            null,
            null
        ];
        const foliageGeos: BufferGeometry[] = [
            makeBroadCanopy(8.2, 3.4, 13, 3.6, 53),
            makeConiferCanopy(3.4, 14.4, 2.5, 7, 59),
            makeBroadCanopy(7.4, 2.5, 10, 2.7, 61),
            // A dead snag keeps a few bare limbs instead of leaves.
            makeBroadCanopy(7.2, 1.4, 3, 1.1, 67),
            makeScrub(1.5, 5, 71),
            makeScrub(0.7, 4, 73)
        ];
        const foliageMats = [
            assets.leafBroadMat,
            assets.leafNeedleMat,
            assets.leafBroadMat,
            assets.leafNeedleMat,
            assets.leafScrubMat,
            assets.leafScrubMat
        ];

        for (let i = 0; i < SPECIES_COUNT; i++) {
            const isScrub = i >= SPECIES_BUSH;
            const block = isScrub ? SCRUB_BLOCK : TREE_BLOCK;
            const tg = trunkGeos[i];
            if (tg) {
                const p = new InstancePool(tg, assets.barkMat, block, blockCount);
                this.trunkPools.push(p);
                this.all.push(p);
                this.root.add(p.mesh);
            } else {
                this.trunkPools.push(null);
            }
            const fp = new InstancePool(foliageGeos[i], foliageMats[i], block, blockCount);
            // Scrub casting shadows is a lot of shadow-map work for very little,
            // and alpha-tested canopies are the most expensive thing in the
            // shadow pass, so only the broadleaf species cast.
            fp.mesh.castShadow = !isScrub && i !== SPECIES_PINE;
            this.foliagePools.push(fp);
            this.all.push(fp);
            this.root.add(fp.mesh);
        }

        this.rocks = new InstancePool(makeBoulder(83), assets.rockMat, ROCK_BLOCK, blockCount);
        this.logs = new InstancePool(makeLog(89), assets.woodMat, LOG_BLOCK, blockCount);
        this.logs.mesh.castShadow = false;
        for (const p of [this.rocks, this.logs]) {
            this.all.push(p);
            this.root.add(p.mesh);
        }
    }

    blockSizeFor(species: number): number {
        return species >= SPECIES_BUSH ? SCRUB_BLOCK : TREE_BLOCK;
    }

    flush(): void {
        for (const p of this.all) p.flush();
    }

    /**
     * Move the shared origin so instance matrices stay small. Called every
     * kilometre or so; a full pass over the matrices costs well under a
     * millisecond and prevents float32 shimmer far from the world origin.
     */
    rebase(x: number, y: number, z: number): void {
        const dx = x - this.origin.x;
        const dy = y - this.origin.y;
        const dz = z - this.origin.z;
        if (dx === 0 && dy === 0 && dz === 0) return;
        for (const p of this.all) p.rebase(dx, dy, dz);
        this.origin.set(x, y, z);
        this.root.position.copy(this.origin);
    }

    dispose(): void {
        for (const p of this.all) {
            this.root.remove(p.mesh);
            p.dispose();
        }
        this.all.length = 0;
        this.root.parent?.remove(this.root);
    }
}
