import {
    BufferAttribute,
    BufferGeometry,
    Mesh,
    MeshLambertMaterial,
    Scene,
    Sphere,
    Vector3
} from 'three';
import type { RoadPath } from '../road/RoadPath';
import { createProjectResult, TERRAIN_HALF_WIDTH } from '../road/RoadPath';
import { clamp } from '../util/mathx';
import { createLandSample, LandField } from './Land';

const sample = createLandSample();
const proj = createProjectResult();

/**
 * The land past the conformed ribbon — Phase 1 of the terrain spec.
 *
 * Phase 0 built a ribbon out to the fold limit and measured the fraction of the
 * frame occupied by terrain beyond 100 m at **0.1%**, against 0.2% before it.
 * That is the whole reason this exists: a ribbon 80 m wide that follows the
 * road is seen edge-on from a car on that road and occluded by its own near
 * portion, so widening the corridor cannot put land in the middle distance. Only
 * something that leaves road space can.
 *
 * A coarse world-space grid, snapped to a fixed lattice, sampling the same
 * `LandField` the ribbon does. No collision, no scatter, one level of detail —
 * option 1 in section 5 of the spec, and deliberately nothing more.
 *
 * ## Why it cannot tear at the seam
 *
 * It does not agree with the ribbon; it *is* the ribbon's field. Both evaluate
 * `LandField.heightAt` at a world position, so where they meet they are the
 * same arithmetic on the same input. There are no shared vertices and no
 * stitching, which is what makes this robust rather than delicate: a change to
 * the field moves both surfaces together by construction.
 *
 * ## Why it is drawn under the road rather than around it
 *
 * Cutting a hole for the ribbon would mean re-triangulating grid cells against
 * a road-space curve — the stitching this design exists to avoid. Instead the
 * grid runs unbroken beneath the corridor and the ribbon covers it. Inside the
 * corridor the grid is pulled to road level so it cannot erupt through the
 * carriageway, and a polygon offset keeps the two from fighting for depth along
 * the seam where they are coincident.
 */

/** Grid spacing. Coarse: the field's shortest wavelength is 720 m. */
const CELL = 150;
/** How far the layer reaches. */
const RADIUS = 3000;
const CELLS = Math.ceil((RADIUS * 2) / CELL);
const VERTS_PER_SIDE = CELLS + 1;
/**
 * Distance over which the grid is pulled to road level, so it passes under the
 * corridor rather than through it. Wider than the ribbon so the pull has faded
 * to nothing before the seam, where the two surfaces must agree exactly.
 */
const PULL_TO = TERRAIN_HALF_WIDTH;
/** Grid rows filled per frame while a rebuild is in flight. */
const ROWS_PER_TICK = 2;

export class DistantLand {
    readonly mesh: Mesh;
    private readonly geometry = new BufferGeometry();
    private readonly positions: Float32Array;
    private readonly colors: Float32Array;
    /** Lattice cell the grid is currently centred on; -1 forces a first build. */
    private originCellX = Number.NaN;
    private originCellZ = Number.NaN;
    private lastBuildMs = 0;
    private worstSliceMs = 0;
    private builds = 0;
    /**
     * Rebuilds are spread over several frames into a shadow buffer and swapped
     * in when complete.
     *
     * A whole rebuild measured 7.5 ms, which on a layer that rebuilds every
     * 150 m of travel is a hitch roughly every four seconds at speed — the
     * exact failure mode the spec asks to look for. Sliced, no frame pays more
     * than a fraction of it, and because the shadow buffer is only swapped in
     * when it is complete the player never sees a half-built surface. The
     * displayed grid is at most one rebuild stale, which on a layer reaching
     * 3 km is invisible.
     */
    private readonly shadowPos: Float32Array;
    private readonly shadowCol: Float32Array;
    private buildRow = -1;
    private buildCentreX = 0;
    private buildCentreZ = 0;

    constructor(
        private readonly scene: Scene,
        private readonly path: RoadPath
    ) {
        const n = VERTS_PER_SIDE * VERTS_PER_SIDE;
        this.positions = new Float32Array(n * 3);
        this.colors = new Float32Array(n * 3);
        this.shadowPos = new Float32Array(n * 3);
        this.shadowCol = new Float32Array(n * 3);
        this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));

        const quads = CELLS * CELLS;
        const index = quads * 6 > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);
        let w = 0;
        for (let r = 0; r < CELLS; r++) {
            for (let c = 0; c < CELLS; c++) {
                const a = r * VERTS_PER_SIDE + c;
                const b = a + 1;
                const d = a + VERTS_PER_SIDE;
                const e = d + 1;
                index[w++] = a;
                index[w++] = d;
                index[w++] = b;
                index[w++] = b;
                index[w++] = d;
                index[w++] = e;
            }
        }
        this.geometry.setIndex(new BufferAttribute(index, 1));

        const material = new MeshLambertMaterial({
            vertexColors: true,
            fog: true,
            // Pushed back in depth so the seam, where this surface and the
            // ribbon's outer edge are coincident by design, resolves in favour
            // of the ribbon instead of flickering between them.
            polygonOffset: true,
            polygonOffsetFactor: 1.5,
            polygonOffsetUnits: 2
        });
        this.mesh = new Mesh(this.geometry, material);
        this.mesh.receiveShadow = false;
        this.mesh.castShadow = false;
        // One mesh spanning kilometres: its bounding sphere is meaningless for
        // culling and would pop the whole layer out of existence at the edges.
        this.mesh.frustumCulled = false;
        this.geometry.boundingSphere = new Sphere(new Vector3(), 1e6);
        this.mesh.renderOrder = -1;
        this.scene.add(this.mesh);
    }

    /**
     * Rebuild if the vehicle has crossed into a new lattice cell.
     *
     * Snapped to a fixed world lattice rather than centred on the vehicle, so
     * vertices land on the same coordinates every time and the surface does not
     * swim as you drive.
     */
    update(vehicleX: number, vehicleZ: number): void {
        const cellX = Math.round(vehicleX / CELL);
        const cellZ = Math.round(vehicleZ / CELL);
        if (cellX !== this.originCellX || cellZ !== this.originCellZ) {
            this.originCellX = cellX;
            this.originCellZ = cellZ;
            // Start a rebuild. If one was already running it is abandoned: the
            // vehicle has moved on and its centre is stale.
            this.buildRow = 0;
            this.buildCentreX = cellX * CELL;
            this.buildCentreZ = cellZ * CELL;
            this.lastBuildMs = 0;
        }
        if (this.buildRow >= 0) this.advance();
    }

    /** Fill the next slice of rows, and swap the buffer in when the last lands. */
    private advance(): void {
        const t0 = performance.now();
        const upto = Math.min(VERTS_PER_SIDE, this.buildRow + ROWS_PER_TICK);
        this.fillRows(this.buildRow, upto, this.buildCentreX, this.buildCentreZ);
        this.buildRow = upto;

        if (this.buildRow >= VERTS_PER_SIDE) {
            this.positions.set(this.shadowPos);
            this.colors.set(this.shadowCol);
            this.geometry.getAttribute('position').needsUpdate = true;
            this.geometry.getAttribute('color').needsUpdate = true;
            this.geometry.computeVertexNormals();
            this.buildRow = -1;
            this.builds += 1;
        }
        const slice = performance.now() - t0;
        this.lastBuildMs += slice;
        if (slice > this.worstSliceMs) this.worstSliceMs = slice;
    }

    private fillRows(from: number, to: number, centreX: number, centreZ: number): void {
        const land = this.path.land;
        const half = CELLS / 2;
        const pos = this.shadowPos;
        const col = this.shadowCol;

        for (let r = from; r < to; r++) {
            const z = centreZ + (r - half) * CELL;
            for (let c = 0; c < VERTS_PER_SIDE; c++) {
                const x = centreX + (c - half) * CELL;
                const i = (r * VERTS_PER_SIDE + c) * 3;
                // One scan of the polyline per vertex, not three. The height,
                // the distance to the road and the baseline all come out of the
                // same pass; asking for them separately measured 8.7 ms per
                // rebuild, which is a hitch you can feel every 150 m.
                // Coarse nearest for a hint, then the road's own projection
                // for the answer. The coarse polyline is sampled every 150 m,
                // so using its nearest sample directly leaves the grid working
                // from an `s` up to 75 m away from the one the ribbon uses —
                // measured, 7.6 m of disagreement at a seam that is supposed to
                // be exact. Projecting gives both layers the same `s` and the
                // same lateral, which is the whole point of a shared field.
                land.nearest(x, z, sample);
                this.path.project(x, z, sample.nearS, proj);
                const lateral = Math.abs(proj.lateral);
                const shape = land.shape(x, z) * LandField.shapeWeight(lateral);
                let y = land.baselineAtS(proj.s) + shape;

                // Under the corridor, ease to road level. A vertex here is
                // hidden by the ribbon; what matters is only that it does not
                // push through the road, and that the pull has reached zero
                // before the seam so the seam value is the field's alone.
                if (lateral < PULL_TO) {
                    const t = 1 - lateral / PULL_TO;
                    y += (sample.nearY - y) * t * t;
                }

                pos[i] = x;
                pos[i + 1] = y;
                pos[i + 2] = z;

                // Higher ground is drier and greyer, low ground greener. Enough
                // to read as land rather than as one flat sheet; the scene fog
                // does the rest of the work with distance.
                const rel = clamp(shape / 60, -1, 1);
                col[i] = 0.30 + rel * 0.16;
                col[i + 1] = 0.36 + rel * 0.06;
                col[i + 2] = 0.24 + rel * 0.13;
            }
        }

    }

    /** Diagnostics: cost of the most recent rebuild, and how many there were. */
    get stats(): { lastBuildMs: number; worstSliceMs: number; builds: number; verts: number; tris: number; cell: number; radius: number } {
        return {
            lastBuildMs: +this.lastBuildMs.toFixed(3),
            worstSliceMs: +this.worstSliceMs.toFixed(3),
            builds: this.builds,
            verts: VERTS_PER_SIDE * VERTS_PER_SIDE,
            tris: CELLS * CELLS * 2,
            cell: CELL,
            radius: RADIUS
        };
    }

    setVisible(visible: boolean): void {
        this.mesh.visible = visible;
    }

    dispose(): void {
        this.scene.remove(this.mesh);
        this.geometry.dispose();
        (this.mesh.material as MeshLambertMaterial).dispose();
    }
}
