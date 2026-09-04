import {
    BoxGeometry,
    BufferGeometry,
    Color,
    CylinderGeometry,
    Group,
    Material,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    PlaneGeometry,
    Scene,
    SphereGeometry,
    Vector3
} from 'three';
import {
    DITCH_W,
    EVENT_BRIDGE,
    EVENT_CABIN,
    EVENT_FIRE_TOWER,
    EVENT_FOGGY_HOLLOW,
    EVENT_GAS_STATION,
    EVENT_JUNKED_TRUCK,
    EVENT_STRANGE_LIGHTS,
    HOLLOW_SPAN,
    SHOULDER_W,
    createFrame,
    type EventSlot,
    type RoadPath
} from '../../road/RoadPath';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../util/rng';
import type { Assets } from '../Assets';
import type { Chunk } from '../ChunkManager';

/**
 * Discovery set-pieces. These are rare by construction — the schedule in
 * RoadPath only fires on some slots — and the ones that need level ground get
 * it, because the road generator already flattened itself around them.
 *
 * Each kind is built once and then pooled; nothing is rebuilt while driving.
 */

const frame = createFrame();
const tmp = new Vector3();

interface Animated {
    node: Object3D;
    kind: number;
    phase: number;
}

export class EventBuilder {
    private readonly pools = new Map<number, Object3D[]>();
    private readonly active: Animated[] = [];
    private readonly owned: (BufferGeometry | Material)[] = [];
    private readonly glowMat: MeshBasicMaterial;
    private readonly fogMat: MeshBasicMaterial;
    private readonly darkWoodMat: MeshStandardMaterial;
    private readonly roofMat: MeshStandardMaterial;
    private readonly paintMat: MeshStandardMaterial;

    constructor(
        private readonly scene: Scene,
        private readonly assets: Assets,
        private readonly path: RoadPath
    ) {
        this.glowMat = new MeshBasicMaterial({
            color: new Color(0.75, 0.95, 0.6),
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        });
        this.fogMat = new MeshBasicMaterial({
            map: assets.softSprite,
            color: new Color(0.78, 0.82, 0.85),
            transparent: true,
            opacity: 0.16,
            depthWrite: false
        });
        this.darkWoodMat = new MeshStandardMaterial({
            map: assets.wood.map,
            normalMap: assets.wood.normalMap,
            color: new Color(0.42, 0.36, 0.3),
            roughness: 1
        });
        this.roofMat = new MeshStandardMaterial({
            color: new Color(0.24, 0.25, 0.26),
            roughness: 0.72,
            metalness: 0.35
        });
        this.paintMat = new MeshStandardMaterial({
            color: new Color(0.62, 0.58, 0.46),
            roughness: 0.85
        });
        this.owned.push(this.glowMat, this.fogMat, this.darkWoodMat, this.roofMat, this.paintMat);
    }

    build(slot: EventSlot, chunk: Chunk): Object3D | null {
        const pool = this.pools.get(slot.kind);
        let node = pool?.pop() ?? null;
        if (!node) {
            node = this.create(slot);
            // A fire tower is ~76 little meshes and a cabin ~40. Left as-is,
            // two or three set-pieces on screen doubled the frame's draw calls.
            // Merging by material collapses each one to a handful.
            if (node && node.userData.noMerge !== true) this.flatten(node);
        }
        if (!node) return null;

        this.path.sample(slot.s, frame);
        const lip = frame.width * 0.5 + SHOULDER_W + DITCH_W;
        const lateral = slot.kind === EVENT_BRIDGE ? 0 : slot.side * (lip + this.standoff(slot.kind));
        this.path.surfacePoint(frame, lateral, tmp);
        node.position.copy(tmp);
        // Everything lines up with the road, then turns to face it.
        node.rotation.set(0, Math.atan2(frame.tangent.x, frame.tangent.z), 0);
        if (slot.kind !== EVENT_BRIDGE && slot.kind !== EVENT_FOGGY_HOLLOW) {
            node.rotation.y += slot.side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
        }
        node.updateMatrixWorld(true);
        // A hollow is a corridor, so its mist banks are laid out along the road
        // rather than clustered at a point. Done here, not at build time,
        // because the node is pooled and reused at different places on the road.
        if (slot.kind === EVENT_FOGGY_HOLLOW) this.layoutHollow(node, slot.s);
        this.scene.add(node);
        this.active.push({ node, kind: slot.kind, phase: (slot.index * 1.7) % 6.28 });

        // Structures are solid; register a collider so you cannot drive through.
        // Goes through the chunk's bounds-checked adder: writing past the end of
        // the typed array is silently dropped while the count still advances,
        // which leaves a phantom collider that reads back as NaN.
        if (slot.kind === EVENT_CABIN || slot.kind === EVENT_GAS_STATION || slot.kind === EVENT_FIRE_TOWER) {
            chunk.addCollider(tmp.x, tmp.y, tmp.z, 4.2);
        }
        return node;
    }

    private standoff(kind: number): number {
        switch (kind) {
            case EVENT_GAS_STATION:
                return 9;
            case EVENT_CABIN:
                return 14;
            case EVENT_FIRE_TOWER:
                return 22;
            case EVENT_JUNKED_TRUCK:
                return 2.4;
            case EVENT_STRANGE_LIGHTS:
                return 26;
            default:
                return 6;
        }
    }

    release(kind: number, node: Object3D): void {
        this.scene.remove(node);
        const i = this.active.findIndex((a) => a.node === node);
        if (i >= 0) this.active.splice(i, 1);
        let pool = this.pools.get(kind);
        if (!pool) {
            pool = [];
            this.pools.set(kind, pool);
        }
        pool.push(node);
    }

    /**
     * Lay a hollow's mist banks along the road it covers. Positions are worked
     * out in world space from the road itself and then brought into the node's
     * local space, because over 300 m the road curves well away from the
     * straight line the node is oriented along.
     */
    private layoutHollow(node: Object3D, centreS: number): void {
        const n = node.children.length;
        for (let i = 0; i < n; i++) {
            const frac = n > 1 ? i / (n - 1) - 0.5 : 0;
            this.path.sample(centreS + frac * HOLLOW_SPAN * 0.92, frame);
            // Deterministic spread across and above the road.
            const lateral = ((i * 7) % 17) - 8;
            this.path.surfacePoint(frame, lateral, tmp);
            tmp.y += 1.1 + (i % 4) * 1.5;
            node.worldToLocal(tmp);
            const child = node.children[i];
            child.position.copy(tmp);
            child.rotation.set(0, i * 0.9, 0);
        }
    }

    /** Animates the few kinds that move. */
    update(time: number, cameraPos: Vector3): void {
        void cameraPos;
        for (let ai = 0; ai < this.active.length; ai++) {
            const a = this.active[ai];
            if (a.kind === EVENT_STRANGE_LIGHTS) {
                for (let i = 0; i < a.node.children.length; i++) {
                    const c = a.node.children[i];
                    c.position.y = 2.4 + Math.sin(time * 0.8 + a.phase + i * 2.1) * 1.35;
                    c.position.x = Math.sin(time * 0.35 + i * 1.7) * 3.2;
                    const m = (c as Mesh).material as MeshBasicMaterial;
                    m.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 2.3 + i));
                }
            }
        }
    }

    // ------------------------------------------------------------- builders

    private create(slot: EventSlot): Object3D | null {
        switch (slot.kind) {
            case EVENT_BRIDGE:
                return this.buildBridge();
            case EVENT_GAS_STATION:
                return this.buildGasStation();
            case EVENT_CABIN:
                return this.buildCabin();
            case EVENT_FIRE_TOWER:
                return this.buildFireTower();
            case EVENT_JUNKED_TRUCK:
                return this.buildJunkedTruck();
            case EVENT_FOGGY_HOLLOW:
                return this.buildFoggyHollow();
            case EVENT_STRANGE_LIGHTS:
                return this.buildStrangeLights();
            default:
                return null;
        }
    }

    /**
     * Collapse a set-piece's child meshes into one mesh per material. The
     * children are all direct children of the group and never move relative to
     * it, so their transforms can be baked into the merged geometry.
     */
    private flatten(node: Object3D): void {
        const byMaterial = new Map<Material, BufferGeometry[]>();
        const originals: Mesh[] = [];
        for (const child of node.children) {
            if (!(child instanceof Mesh)) return; // anything unexpected: leave it alone
            originals.push(child);
        }
        if (originals.length < 3) return;

        for (const mesh of originals) {
            mesh.updateMatrix();
            const geo = mesh.geometry.clone();
            geo.applyMatrix4(mesh.matrix);
            const mat = mesh.material as Material;
            const list = byMaterial.get(mat);
            if (list) list.push(geo);
            else byMaterial.set(mat, [geo]);
        }

        node.clear();
        for (const [mat, geos] of byMaterial) {
            const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
            if (geos.length > 1) for (const g of geos) g.dispose();
            if (!merged) continue;
            merged.computeBoundingSphere();
            const mesh = new Mesh(merged, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            node.add(mesh);
            this.owned.push(merged);
        }
    }

    private track<T extends BufferGeometry>(g: T): T {
        this.owned.push(g);
        return g;
    }

    private mesh(g: BufferGeometry, m: Material, x = 0, y = 0, z = 0): Mesh {
        const mesh = new Mesh(g, m);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    /** Timber bridge over a creek, with rails and stone abutments. */
    private buildBridge(): Object3D {
        const g = new Group();
        const wood = this.assets.woodMat;

        // Deck planks sit just under the road surface so the road reads on top.
        const deck = this.mesh(this.track(new BoxGeometry(11, 0.55, 22)), wood, 0, -0.42, 0);
        g.add(deck);

        // Rails: posts and a top rail down each side.
        const postGeo = this.track(new BoxGeometry(0.22, 1.15, 0.22));
        const railGeo = this.track(new BoxGeometry(0.16, 0.2, 21.4));
        for (const side of [-1, 1]) {
            for (let i = -5; i <= 5; i++) {
                g.add(this.mesh(postGeo, this.darkWoodMat, side * 4.6, 0.35, i * 2.1));
            }
            g.add(this.mesh(railGeo, this.darkWoodMat, side * 4.6, 0.86, 0));
            g.add(this.mesh(railGeo, this.darkWoodMat, side * 4.6, 0.35, 0));
        }

        // Stone abutments and piers.
        const pier = this.track(new BoxGeometry(9, 5, 1.6));
        for (const z of [-9.5, 9.5]) g.add(this.mesh(pier, this.assets.rockMat, 0, -3.2, z));
        const midPier = this.track(new CylinderGeometry(0.55, 0.7, 5, 8));
        for (const x of [-3, 0, 3]) g.add(this.mesh(midPier, this.darkWoodMat, x, -3.2, 0));

        // The creek: a low water plane and a gravel bed cut under the deck.
        const bed = this.mesh(this.track(new BoxGeometry(60, 1.2, 9)), this.assets.rockMat, 0, -5.4, 0);
        bed.rotation.y = Math.PI * 0.5;
        g.add(bed);
        const water = this.mesh(this.track(new PlaneGeometry(56, 6.5)), this.assets.waterMat, 0, -4.75, 0);
        water.rotation.x = -Math.PI * 0.5;
        water.rotation.z = Math.PI * 0.5;
        water.castShadow = false;
        g.add(water);
        return g;
    }

    /** Boarded-up filling station with a sagging canopy and two old pumps. */
    private buildGasStation(): Object3D {
        const g = new Group();
        const wall = this.paintMat;

        const building = this.mesh(this.track(new BoxGeometry(9, 3.6, 6.5)), wall, 0, 1.8, 0);
        g.add(building);
        const roof = this.mesh(this.track(new BoxGeometry(9.6, 0.35, 7.1)), this.roofMat, 0, 3.75, 0);
        g.add(roof);

        // Boarded windows and a door.
        const board = this.track(new BoxGeometry(1.9, 1.5, 0.12));
        for (const x of [-2.6, 0.2, 2.9]) g.add(this.mesh(board, this.darkWoodMat, x, 2.1, 3.3));

        // Forecourt canopy on four posts.
        const canopy = this.mesh(this.track(new BoxGeometry(9.5, 0.4, 6)), this.roofMat, 0, 4.1, 8.5);
        canopy.rotation.z = 0.035;
        g.add(canopy);
        const post = this.track(new CylinderGeometry(0.16, 0.18, 4, 7));
        for (const x of [-4, 4]) for (const z of [6.2, 10.8]) g.add(this.mesh(post, this.assets.metalMat, x, 2, z));

        // Pumps.
        const pumpBody = this.track(new BoxGeometry(0.8, 1.7, 0.55));
        const pumpTop = this.track(new BoxGeometry(0.9, 0.5, 0.65));
        for (const x of [-1.6, 1.6]) {
            g.add(this.mesh(pumpBody, this.assets.rustMat, x, 1.05, 8.5));
            g.add(this.mesh(pumpTop, this.paintMat, x, 2.1, 8.5));
        }
        const island = this.mesh(this.track(new BoxGeometry(5.5, 0.25, 1.6)), this.assets.rockMat, 0, 0.12, 8.5);
        g.add(island);

        // Roadside sign.
        const signPost = this.mesh(this.track(new CylinderGeometry(0.12, 0.14, 5, 6)), this.assets.metalMat, -6, 2.5, 11);
        g.add(signPost);
        const signFace = this.mesh(this.track(new BoxGeometry(2.4, 1.5, 0.16)), this.assets.rustMat, -6, 4.6, 11);
        g.add(signFace);
        return g;
    }

    /** Log cabin with a porch, stone chimney and tin roof. */
    private buildCabin(): Object3D {
        const g = new Group();

        // Stacked logs make the walls read as a cabin, not a box.
        const logGeo = this.track(new CylinderGeometry(0.19, 0.19, 7.2, 6));
        for (let i = 0; i < 9; i++) {
            const y = 0.2 + i * 0.36;
            for (const z of [-2.8, 2.8]) {
                const m = this.mesh(logGeo, this.assets.woodMat, 0, y, z);
                m.rotation.z = Math.PI * 0.5;
                g.add(m);
            }
            for (const x of [-3.5, 3.5]) {
                const m = this.mesh(logGeo, this.assets.woodMat, x, y + 0.18, 0);
                m.rotation.x = Math.PI * 0.5;
                m.scale.set(1, 0.8, 1);
                g.add(m);
            }
        }

        // Gable roof from two slabs.
        for (const side of [-1, 1]) {
            const slab = this.mesh(this.track(new BoxGeometry(8.4, 0.22, 3.6)), this.roofMat, 0, 4.05, side * 1.5);
            slab.rotation.x = side * 0.52;
            g.add(slab);
        }

        // Porch.
        const deck = this.mesh(this.track(new BoxGeometry(8, 0.24, 2.4)), this.darkWoodMat, 0, 0.14, 4.2);
        g.add(deck);
        const porchPost = this.track(new CylinderGeometry(0.11, 0.13, 2.6, 6));
        for (const x of [-3.4, 0, 3.4]) g.add(this.mesh(porchPost, this.assets.woodMat, x, 1.4, 5.2));
        const porchRoof = this.mesh(this.track(new BoxGeometry(8.4, 0.16, 2.8)), this.roofMat, 0, 2.8, 4.6);
        porchRoof.rotation.x = 0.16;
        g.add(porchRoof);

        // Chimney.
        const chimney = this.mesh(this.track(new BoxGeometry(1.1, 6, 1.1)), this.assets.rockMat, -4, 3, -1.2);
        g.add(chimney);

        // Door and a dark window.
        g.add(this.mesh(this.track(new BoxGeometry(1.1, 2, 0.14)), this.darkWoodMat, 0, 1.2, 3));
        g.add(this.mesh(this.track(new BoxGeometry(1, 0.9, 0.12)), this.roofMat, 2.2, 2, 3));
        return g;
    }

    /** Steel lattice fire tower with a cab on top. */
    private buildFireTower(): Object3D {
        const g = new Group();
        const metal = this.assets.metalMat;
        const legGeo = this.track(new BoxGeometry(0.17, 20, 0.17));
        const braceGeo = this.track(new BoxGeometry(0.1, 0.1, 4.6));

        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const leg = this.mesh(legGeo, metal, sx * 2.4, 10, sz * 2.4);
                // Legs splay outward toward the base.
                leg.rotation.z = -sx * 0.055;
                leg.rotation.x = sz * 0.055;
                g.add(leg);
            }
        }
        // Cross bracing every few metres, on all four faces.
        for (let level = 0; level < 6; level++) {
            const y = 2 + level * 3.1;
            for (let face = 0; face < 4; face++) {
                const a = (face * Math.PI) / 2;
                for (const tilt of [0.62, -0.62]) {
                    const b = this.mesh(braceGeo, metal, Math.sin(a) * 2.2, y, Math.cos(a) * 2.2);
                    b.rotation.y = a;
                    b.rotation.x = tilt;
                    g.add(b);
                }
                const ring = this.mesh(this.track(new BoxGeometry(4.8, 0.09, 0.09)), metal, 0, y, 0);
                ring.rotation.y = a;
                ring.position.set(Math.sin(a) * 2.3, y, Math.cos(a) * 2.3);
                g.add(ring);
            }
        }
        // Cab.
        const cab = this.mesh(this.track(new BoxGeometry(5, 2.4, 5)), this.paintMat, 0, 21.2, 0);
        g.add(cab);
        const cabRoof = this.mesh(this.track(new BoxGeometry(5.8, 0.22, 5.8)), this.roofMat, 0, 22.5, 0);
        g.add(cabRoof);
        const deck = this.mesh(this.track(new BoxGeometry(6.4, 0.16, 6.4)), metal, 0, 19.9, 0);
        g.add(deck);
        return g;
    }

    /** Rusted-out pickup abandoned in the weeds. */
    private buildJunkedTruck(): Object3D {
        const g = new Group();
        const rust = this.assets.rustMat;
        const body = this.mesh(this.track(new BoxGeometry(1.95, 0.85, 4.6)), rust, 0, 0.62, 0);
        body.rotation.z = 0.09;
        g.add(body);
        const cab = this.mesh(this.track(new BoxGeometry(1.85, 0.85, 1.9)), rust, 0, 1.4, -0.5);
        cab.rotation.z = 0.09;
        g.add(cab);
        const bed = this.mesh(this.track(new BoxGeometry(1.9, 0.5, 2.1)), rust, 0, 1.1, 1.5);
        bed.rotation.z = 0.09;
        g.add(bed);
        // Two wheels left, both flat.
        const wheel = this.track(new CylinderGeometry(0.36, 0.36, 0.24, 9));
        for (const [x, z] of [
            [-0.95, -1.4],
            [0.95, 1.5]
        ]) {
            const w = this.mesh(wheel, this.roofMat, x, 0.24, z);
            w.rotation.z = Math.PI * 0.5;
            g.add(w);
        }
        return g;
    }

    /** A hollow full of standing mist. */
    private buildFoggyHollow(): Object3D {
        const g = new Group();
        // Positions are overwritten by layoutHollow when the node is attached;
        // what matters here is how many banks there are and how big.
        for (let i = 0; i < 30; i++) {
            const s = 30 + (i % 5) * 11;
            const p = new Mesh(this.track(new PlaneGeometry(s, s * 0.46)), this.fogMat);
            p.renderOrder = 3;
            g.add(p);
        }
        // Every bank is repositioned individually, so this one keeps its
        // children rather than being merged by material.
        g.userData.noMerge = true;
        return g;
    }

    /** Pale lights drifting between the trunks, well off the road. */
    private buildStrangeLights(): Object3D {
        const g = new Group();
        // Each light is animated and faded individually, so this one keeps its
        // separate children.
        g.userData.noMerge = true;
        const rng = new Rng(4242);
        const geo = this.track(new SphereGeometry(0.28, 8, 6));
        for (let i = 0; i < 4; i++) {
            const m = new Mesh(geo, this.glowMat.clone());
            m.position.set(rng.range(-4, 4), 2.4, rng.range(-8, 8));
            m.renderOrder = 4;
            g.add(m);
            this.owned.push(m.material as Material);
        }
        return g;
    }

    dispose(): void {
        for (const a of this.active) this.scene.remove(a.node);
        this.active.length = 0;
        this.pools.clear();
        for (const o of this.owned) o.dispose();
        this.owned.length = 0;
    }
}
