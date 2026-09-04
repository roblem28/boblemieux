import { Euler, Matrix4, Mesh, Object3D, Quaternion, Scene, Vector3 } from 'three';
import {
    CHUNK_LEN,
    buildRoadChunk,
    buildTerrainChunk,
    createRoadGeometry,
    createTerrainGeometry
} from '../road/ChunkGeometry';
import {
    DITCH_W,
    SHOULDER_W,
    createFrame,
    type EventSlot,
    type RoadFrame,
    RoadPath,
    EVENT_NONE
} from '../road/RoadPath';
import { Rng, hash2 } from '../util/rng';
import { clamp } from '../util/mathx';
import type { QualityPreset } from '../quality';
import type { Assets } from './Assets';
import {
    SPECIES_BIRCH,
    SPECIES_BUSH,
    SPECIES_COUNT,
    SPECIES_FERN,
    SPECIES_OAK,
    SPECIES_PINE,
    SPECIES_SNAG,
    Vegetation,
    createBlocks,
    type VegetationBlocks
} from './Vegetation';
import { EventBuilder } from './events/EventBuilder';

const MAX_COLLIDERS = 96;

const UP = new Vector3(0, 1, 0);
const EULER_HELPER = new Euler();
const tmpMatrix = new Matrix4();
const tmpPos = new Vector3();
const tmpLocal = new Vector3();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const frameA = createFrame();

export class Chunk {
    index = -1;
    sStart = 0;
    readonly origin = new Vector3();
    readonly road: Mesh;
    readonly terrain: Mesh;
    readonly blocks: VegetationBlocks = createBlocks();
    /** x, y, z, radius per collider, in world space. */
    readonly colliders = new Float32Array(MAX_COLLIDERS * 4);
    colliderCount = 0;
    /**
     * Colliders owned by this chunk's discovery event, which survive a
     * re-scatter. Scatter resets the count back to this before appending its
     * own; without it, flipping level of detail leaves the previous layout's
     * rock colliders behind with no rocks attached to them, and you get hit by
     * nothing thirty metres from anything.
     */
    baseColliderCount = 0;
    lod = 0;
    live = false;
    eventKind = EVENT_NONE;
    eventNode: Object3D | null = null;

    constructor(assets: Assets) {
        this.road = new Mesh(createRoadGeometry(), assets.roadMat);
        this.road.receiveShadow = true;
        this.road.castShadow = false;
        this.road.matrixAutoUpdate = false;
        this.terrain = new Mesh(createTerrainGeometry(), assets.terrainMat);
        this.terrain.receiveShadow = true;
        this.terrain.castShadow = false;
        this.terrain.matrixAutoUpdate = false;
    }

    /** Add a world-space collider. Ignored once the chunk's array is full. */
    addCollider(x: number, y: number, z: number, r: number): void {
        if (this.colliderCount >= MAX_COLLIDERS) return;
        const i = this.colliderCount * 4;
        this.colliders[i] = x;
        this.colliders[i + 1] = y;
        this.colliders[i + 2] = z;
        this.colliders[i + 3] = r;
        this.colliderCount += 1;
    }

    dispose(): void {
        this.road.geometry.dispose();
        this.terrain.geometry.dispose();
    }
}

export class ChunkManager {
    private readonly chunks = new Map<number, Chunk>();
    private readonly pool: Chunk[] = [];
    private readonly rng = new Rng(1);
    private readonly slot: EventSlot = { index: 0, s: 0, kind: EVENT_NONE, side: 1 };
    private readonly events: EventBuilder;
    private centreIndex = 0;
    /** Scratch, reused every frame so streaming allocates nothing. */
    private readonly doomed: number[] = [];
    /** The chunks close enough to collide with, refreshed once per frame. */
    private readonly nearChunks: Chunk[] = [];

    constructor(
        private readonly scene: Scene,
        private readonly path: RoadPath,
        private readonly assets: Assets,
        private readonly vegetation: Vegetation,
        private preset: QualityPreset
    ) {
        this.events = new EventBuilder(scene, assets, path);
    }

    get liveChunks(): IterableIterator<Chunk> {
        return this.chunks.values();
    }

    /** How deep the camera is inside a foggy hollow, 0..1. */
    get fogBoost(): number {
        return this.events.fogBoost;
    }

    /** Animates the set-pieces that move (drifting lights, mist). */
    updateEvents(time: number, cameraPos: Vector3): void {
        this.events.update(time, cameraPos);
    }

    /**
     * How many chunks either side keep full 3-D trees. Derived from the
     * preset's `lodDistance` rather than hard-coded, so mobile really does
     * carry detailed trees a shorter distance than desktop.
     */
    private get lodNearChunks(): number {
        return Math.max(1, Math.round(this.preset.lodDistance / CHUNK_LEN));
    }

    /** Build every chunk the vehicle needs right now, synchronously. */
    primeAround(s: number): void {
        this.update(s, Number.POSITIVE_INFINITY);
    }

    /**
     * Stream chunks around distance `s`. `budget` caps how many chunks may be
     * built this frame; the initial fill passes Infinity so the hitching happens
     * behind the title screen instead of under the player.
     */
    update(s: number, budget = 1): void {
        const centre = Math.floor(s / CHUNK_LEN);
        this.centreIndex = centre;
        // Never below zero: chunk -1 would be built entirely from the clamped
        // s = 0 frame.
        const lo = Math.max(0, centre - this.preset.chunksBehind);
        const hi = centre + this.preset.chunksAhead;

        // Release anything outside the window first, so its blocks are free for
        // the chunks we are about to build. Collecting the doomed keys into a
        // reused array avoids the per-entry tuple that iterating a Map with
        // destructuring allocates every frame.
        this.doomed.length = 0;
        for (const index of this.chunks.keys()) {
            if (index < lo || index > hi) this.doomed.push(index);
        }
        for (let i = 0; i < this.doomed.length; i++) {
            const index = this.doomed[i];
            const chunk = this.chunks.get(index);
            if (chunk) this.release(chunk);
            this.chunks.delete(index);
        }

        // Re-evaluate level of detail for chunks that changed distance band.
        for (const chunk of this.chunks.values()) {
            const lod = Math.abs(chunk.index - centre) <= this.lodNearChunks ? 0 : 1;
            if (lod !== chunk.lod && budget > 0) {
                chunk.lod = lod;
                this.releaseVegetation(chunk);
                this.scatter(chunk);
                budget -= 1;
            }
        }

        this.refreshNearChunks();

        let built = 0;
        // Nearest-first so the road under the vehicle always exists.
        for (let d = 0; d <= hi - lo; d++) {
            for (let sgn = 0; sgn < 2; sgn++) {
                const index = sgn === 0 ? centre + d : centre - d;
                if (index < lo || index > hi || (sgn === 1 && d === 0)) continue;
                if (this.chunks.has(index)) continue;
                if (built >= budget) return;
                this.chunks.set(index, this.acquire(index, centre));
                built += 1;
            }
        }
    }

    /** The +/-1 chunk window the physics tests against, cached once per frame. */
    private refreshNearChunks(): void {
        this.nearChunks.length = 0;
        for (let i = this.centreIndex - 1; i <= this.centreIndex + 1; i++) {
            const chunk = this.chunks.get(i);
            if (chunk) this.nearChunks.push(chunk);
        }
    }

    private acquire(index: number, centre: number): Chunk {
        const chunk = this.pool.pop() ?? new Chunk(this.assets);
        chunk.index = index;
        chunk.sStart = index * CHUNK_LEN;
        chunk.lod = Math.abs(index - centre) <= this.lodNearChunks ? 0 : 1;
        chunk.colliderCount = 0;
        chunk.live = true;

        this.path.ensure(chunk.sStart + CHUNK_LEN + 40);
        this.path.sample(chunk.sStart, frameA);
        chunk.origin.copy(frameA.pos);

        buildRoadChunk(this.path, chunk.road.geometry, chunk.sStart, frameA.pos.x, frameA.pos.y, frameA.pos.z);
        buildTerrainChunk(
            this.path,
            chunk.terrain.geometry,
            chunk.sStart,
            frameA.pos.x,
            frameA.pos.y,
            frameA.pos.z
        );
        chunk.road.position.copy(chunk.origin);
        chunk.terrain.position.copy(chunk.origin);
        chunk.road.updateMatrix();
        chunk.terrain.updateMatrix();
        this.scene.add(chunk.road);
        this.scene.add(chunk.terrain);

        this.buildEvent(chunk);
        // Whatever the event registered is the floor a re-scatter resets to.
        chunk.baseColliderCount = chunk.colliderCount;
        this.scatter(chunk);
        return chunk;
    }

    private release(chunk: Chunk): void {
        this.scene.remove(chunk.road);
        this.scene.remove(chunk.terrain);
        this.releaseVegetation(chunk);
        if (chunk.eventNode) {
            this.events.release(chunk.eventKind, chunk.eventNode);
            chunk.eventNode = null;
        }
        chunk.eventKind = EVENT_NONE;
        chunk.live = false;
        chunk.colliderCount = 0;
        chunk.baseColliderCount = 0;
        this.pool.push(chunk);
    }

    private releaseVegetation(chunk: Chunk): void {
        const v = this.vegetation;
        for (let i = 0; i < SPECIES_COUNT; i++) {
            if (chunk.blocks.trunk[i] >= 0) {
                v.trunkPools[i]?.freeBlock(chunk.blocks.trunk[i]);
                chunk.blocks.trunk[i] = -1;
            }
            if (chunk.blocks.foliage[i] >= 0) {
                v.foliagePools[i].freeBlock(chunk.blocks.foliage[i]);
                chunk.blocks.foliage[i] = -1;
            }
            chunk.blocks.used[i] = 0;
        }
        if (chunk.blocks.rock >= 0) {
            v.rocks.freeBlock(chunk.blocks.rock);
            chunk.blocks.rock = -1;
        }
        if (chunk.blocks.log >= 0) {
            v.logs.freeBlock(chunk.blocks.log);
            chunk.blocks.log = -1;
        }
        chunk.blocks.rockUsed = 0;
        chunk.blocks.logUsed = 0;
    }

    private buildEvent(chunk: Chunk): void {
        // A chunk hosts an event when a scheduled slot centre falls inside it.
        const n = RoadPath.slotIndexFor(chunk.sStart + CHUNK_LEN * 0.5);
        for (let i = n - 1; i <= n + 1; i++) {
            this.path.eventSlot(i, this.slot);
            if (this.slot.kind === EVENT_NONE) continue;
            if (this.slot.s < chunk.sStart || this.slot.s >= chunk.sStart + CHUNK_LEN) continue;
            const node = this.events.build(this.slot, chunk);
            if (node) {
                chunk.eventKind = this.slot.kind;
                chunk.eventNode = node;
            }
            return;
        }
    }

    // ---------------------------------------------------------------- scatter

    /**
     * Deterministic placement: the seed is derived from the chunk index, so a
     * chunk always looks identical no matter how many times it streams in.
     */
    private scatter(chunk: Chunk): void {
        const v = this.vegetation;
        const density = this.preset.vegetationDensity;
        const rng = this.rng;
        rng.reseed(hash2(this.path.seed, chunk.index * 7919 + 13));
        // Drop any colliders a previous scatter of this chunk left behind.
        chunk.colliderCount = chunk.baseColliderCount;

        // LOD1 keeps the canopy and drops the trunk mesh — roughly 60 % of a
        // tree's triangles — and because the pools are global, the far level
        // reuses the very same instanced meshes. Distance detail costs zero
        // extra draw calls.
        const far = chunk.lod === 1;
        const treeCount = Math.round((far ? 108 : 140) * density);
        const bushCount = Math.round(46 * density);
        const fernCount = Math.round(70 * density);
        const rockCount = Math.round(16 * density);
        const logCount = Math.round(6 * density);

        // Trees.
        for (let i = 0; i < treeCount; i++) {
            const s = chunk.sStart + rng.next() * CHUNK_LEN;
            this.path.sample(s, frameA);
            const lip = frameA.width * 0.5 + SHOULDER_W + DITCH_W;
            const side = rng.next() < 0.5 ? -1 : 1;
            // Bias toward the road so the corridor feels enclosed, with a
            // clear-cut margin so trunks never grow out of the ditch.
            const off = 1.2 + Math.pow(rng.next(), 0.62) * 52;
            const lateral = side * (lip + off);
            const height = this.path.crossHeight(frameA, lateral);
            tmpPos.copy(frameA.pos);
            tmpPos.x += frameA.right.x * lateral;
            tmpPos.z += frameA.right.z * lateral;
            tmpPos.y += height;

            const species = this.pickSpecies(rng, frameA, side, off);
            const scale = rng.range(0.72, 1.45) * (species === SPECIES_PINE ? 0.95 : 1);
            const yaw = rng.range(0, Math.PI * 2);
            const lean = rng.range(-0.05, 0.05);

            const used = chunk.blocks.used[species];
            if (used >= v.blockSizeFor(species)) continue;
            if (chunk.blocks.foliage[species] < 0) {
                // Claim the foliage block first. Allocating the trunk block
                // regardless would orphan it on the next iteration, turning a
                // temporary pool shortage into a permanent leak.
                const fb = v.foliagePools[species].allocBlock();
                if (fb < 0) continue;
                chunk.blocks.foliage[species] = fb;
                const tp = v.trunkPools[species];
                if (tp && !far) chunk.blocks.trunk[species] = tp.allocBlock();
            }
            tmpScale.setScalar(scale);
            tmpQuat.setFromEuler(EULER_HELPER.set(lean, yaw, lean * 0.6));
            tmpMatrix.compose(this.local(tmpPos), tmpQuat, tmpScale);
            v.foliagePools[species].set(chunk.blocks.foliage[species], used, tmpMatrix);
            const tp = v.trunkPools[species];
            if (tp && chunk.blocks.trunk[species] >= 0) {
                tp.set(chunk.blocks.trunk[species], used, tmpMatrix);
            }
            chunk.blocks.used[species] = used + 1;

            // Only trunks close enough to hit are worth a collider.
            if (Math.abs(lateral) < 13 && species <= SPECIES_SNAG) {
                chunk.addCollider(tmpPos.x, tmpPos.y, tmpPos.z, 0.45 * scale + 0.35);
            }
        }

        // Undergrowth hugging the verge. Only near chunks get it — beyond a few
        // hundred metres it is invisible and would just burn instance slots.
        if (!far) {
            this.scatterScrub(chunk, SPECIES_BUSH, bushCount, 0.4, 16, rng, 0.8, 1.7);
            this.scatterScrub(chunk, SPECIES_FERN, fernCount, 0.2, 9, rng, 0.7, 1.6);
        }

        // Rocks: a few big ones on the hillside, small stones on the shoulder.
        chunk.blocks.rock = v.rocks.allocBlock();
        if (chunk.blocks.rock >= 0) {
            for (let i = 0; i < rockCount && chunk.blocks.rockUsed < v.rocks.blockSize; i++) {
                const s = chunk.sStart + rng.next() * CHUNK_LEN;
                this.path.sample(s, frameA);
                const lip = frameA.width * 0.5 + SHOULDER_W;
                const side = rng.next() < 0.5 ? -1 : 1;
                const big = rng.next() < 0.4;
                const scale = big ? rng.range(0.7, 2.3) : rng.range(0.1, 0.28);
                // A boulder is placed by its centre, so it has to stand off by
                // its own radius plus clearance — otherwise big ones overhang
                // the carriageway and the player is hit by a rock that is not
                // visibly in the road.
                const off = big ? rng.range(scale * 1.15 + 1.6, 26) : rng.range(0.1, 2.2);
                const lateral = side * (lip + off);
                tmpPos.copy(frameA.pos);
                tmpPos.x += frameA.right.x * lateral;
                tmpPos.z += frameA.right.z * lateral;
                tmpPos.y += this.path.crossHeight(frameA, lateral) - scale * 0.28;
                tmpQuat.setFromEuler(
                    EULER_HELPER.set(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3))
                );
                tmpScale.set(scale, scale * rng.range(0.7, 1.1), scale * rng.range(0.85, 1.2));
                tmpMatrix.compose(this.local(tmpPos), tmpQuat, tmpScale);
                v.rocks.set(chunk.blocks.rock, chunk.blocks.rockUsed, tmpMatrix);
                chunk.blocks.rockUsed += 1;
                if (big && Math.abs(lateral) < 11) {
                    chunk.addCollider(tmpPos.x, tmpPos.y, tmpPos.z, scale * 0.85);
                }
            }
            v.rocks.clearFrom(chunk.blocks.rock, chunk.blocks.rockUsed);
        }

        // Fallen branches near the verge.
        chunk.blocks.log = v.logs.allocBlock();
        if (chunk.blocks.log >= 0) {
            for (let i = 0; i < logCount && chunk.blocks.logUsed < v.logs.blockSize; i++) {
                const s = chunk.sStart + rng.next() * CHUNK_LEN;
                this.path.sample(s, frameA);
                const lip = frameA.width * 0.5 + SHOULDER_W;
                const side = rng.next() < 0.5 ? -1 : 1;
                const lateral = side * (lip + rng.range(0.2, 12));
                tmpPos.copy(frameA.pos);
                tmpPos.x += frameA.right.x * lateral;
                tmpPos.z += frameA.right.z * lateral;
                tmpPos.y += this.path.crossHeight(frameA, lateral) + 0.12;
                tmpQuat.setFromEuler(EULER_HELPER.set(rng.range(-0.2, 0.2), rng.range(0, 6.28), 0));
                tmpScale.setScalar(rng.range(0.75, 1.3));
                tmpMatrix.compose(this.local(tmpPos), tmpQuat, tmpScale);
                v.logs.set(chunk.blocks.log, chunk.blocks.logUsed, tmpMatrix);
                chunk.blocks.logUsed += 1;
            }
            v.logs.clearFrom(chunk.blocks.log, chunk.blocks.logUsed);
        }

        // Collapse any unused tail so freed slots draw nothing.
        for (let i = 0; i < SPECIES_COUNT; i++) {
            if (chunk.blocks.foliage[i] >= 0) {
                v.foliagePools[i].clearFrom(chunk.blocks.foliage[i], chunk.blocks.used[i]);
                const tp = v.trunkPools[i];
                if (tp && chunk.blocks.trunk[i] >= 0) tp.clearFrom(chunk.blocks.trunk[i], chunk.blocks.used[i]);
            }
        }
        v.flush();
    }

    private scatterScrub(
        chunk: Chunk,
        species: number,
        count: number,
        minOff: number,
        maxOff: number,
        rng: Rng,
        scaleLo: number,
        scaleHi: number
    ): void {
        const v = this.vegetation;
        if (chunk.blocks.foliage[species] < 0) {
            chunk.blocks.foliage[species] = v.foliagePools[species].allocBlock();
        }
        const block = chunk.blocks.foliage[species];
        if (block < 0) return;
        let used = chunk.blocks.used[species];
        const cap = v.blockSizeFor(species);
        for (let i = 0; i < count && used < cap; i++) {
            const s = chunk.sStart + rng.next() * CHUNK_LEN;
            this.path.sample(s, frameA);
            const lip = frameA.width * 0.5 + SHOULDER_W;
            const side = rng.next() < 0.5 ? -1 : 1;
            const lateral = side * (lip + rng.range(minOff, maxOff));
            tmpPos.copy(frameA.pos);
            tmpPos.x += frameA.right.x * lateral;
            tmpPos.z += frameA.right.z * lateral;
            tmpPos.y += this.path.crossHeight(frameA, lateral);
            tmpQuat.setFromAxisAngle(UP, rng.range(0, 6.28));
            tmpScale.setScalar(rng.range(scaleLo, scaleHi));
            tmpMatrix.compose(this.local(tmpPos), tmpQuat, tmpScale);
            v.foliagePools[species].set(block, used, tmpMatrix);
            used += 1;
        }
        chunk.blocks.used[species] = used;
    }

    private pickSpecies(rng: Rng, frame: RoadFrame, side: number, off: number): number {
        // Conifers take the high, dry cut banks; birch and oak the hollows.
        const upslope = clamp(frame.sideBias * side, -1, 1);
        const r = rng.next();
        const pineBias = 0.28 + upslope * 0.22 + clamp(off / 60, 0, 1) * 0.14;
        if (r < pineBias) return SPECIES_PINE;
        if (r < pineBias + 0.34) return SPECIES_OAK;
        if (r < pineBias + 0.56) return SPECIES_BIRCH;
        if (r < pineBias + 0.62) return SPECIES_SNAG;
        return SPECIES_OAK;
    }

    /**
     * World position -> the vegetation pool's rebased local space. Writes into
     * a scratch vector so the caller's world position stays intact (colliders
     * are recorded in world space right afterwards).
     */
    private local(world: Vector3): Vector3 {
        return tmpLocal.copy(world).sub(this.vegetation.origin);
    }

    // -------------------------------------------------------------- queries

    /**
     * Closest collider overlapping a sphere at (x, y, z) with radius r.
     * Returns the collider index packed as (chunk colliders array, i*4) via the
     * out array [x, y, z, radius], or false when nothing is hit.
     */
    queryCollision(x: number, y: number, z: number, r: number, out: Float32Array): boolean {
        let hit = false;
        let bestPen = 0;
        // Indexed loop over the cached near list: this runs once per physics
        // substep, up to eight times a frame.
        for (let ci = 0; ci < this.nearChunks.length; ci++) {
            const chunk = this.nearChunks[ci];
            const c = chunk.colliders;
            for (let i = 0; i < chunk.colliderCount; i++) {
                const o = i * 4;
                const dx = x - c[o];
                const dz = z - c[o + 2];
                const dy = y - c[o + 1];
                if (dy > 3.5 || dy < -6) continue;
                const rr = c[o + 3] + r;
                const d2 = dx * dx + dz * dz;
                if (d2 >= rr * rr) continue;
                // `|| 1e-4` would turn a NaN distance into a huge penetration
                // and write NaN straight into the vehicle position.
                const d = Math.max(Math.sqrt(d2), 1e-4);
                const pen = rr - d;
                if (pen > bestPen) {
                    bestPen = pen;
                    out[0] = dx / d;
                    out[1] = dz / d;
                    out[2] = pen;
                    out[3] = c[o + 3];
                    hit = true;
                }
            }
        }
        return hit;
    }

    dispose(): void {
        // release() parks the chunk in the pool, so disposing it here as well
        // would dispose every live chunk's geometry twice.
        for (const chunk of this.chunks.values()) this.release(chunk);
        this.chunks.clear();
        this.nearChunks.length = 0;
        for (const chunk of this.pool) chunk.dispose();
        this.pool.length = 0;
        this.events.dispose();
    }
}

