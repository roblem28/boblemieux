import {
    BoxGeometry,
    BufferGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    Group,
    LOD,
    Material,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    SphereGeometry,
    Sprite,
    SpriteMaterial,
    Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WHEEL_RADIUS, type VehiclePhysics } from './VehiclePhysics';
import { DEFAULT_VEHICLE_ID, vehicleFor, type VehicleSpec } from './vehicles';
import type { Assets } from '../world/Assets';
import { clamp, damp } from '../util/mathx';

/**
 * A 1980s-ish short-bed 4x4 pickup, built entirely in code.
 *
 * Materials are split the way a real build would be — painted bodywork, glass,
 * chrome, rubber, interior cloth, light lenses — because that separation is
 * what makes a procedural vehicle read as a vehicle instead of as a pile of
 * boxes. Shapes are tapered rather than axis-aligned for the same reason.
 */

/** Box whose top face is scaled in X and Z — the basic shape of most bodywork. */
const taperedBox = (
    w: number,
    h: number,
    d: number,
    topX: number,
    topZ: number,
    frontLift = 0
): BufferGeometry => {
    const g = new BoxGeometry(w, h, d, 1, 1, 1);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y > 0) {
            pos.setX(i, pos.getX(i) * topX);
            pos.setZ(i, pos.getZ(i) * topZ);
        }
        if (frontLift !== 0 && pos.getZ(i) > 0) {
            pos.setY(i, pos.getY(i) + frontLift);
        }
    }
    g.computeVertexNormals();
    return g;
};

const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry => {
    const g = new BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
};

/** Chunky off-road tire: a cylinder with real tread blocks around the crown. */
const makeTire = (): BufferGeometry => {
    const parts: BufferGeometry[] = [];
    const carcass = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 22, 1);
    carcass.rotateZ(Math.PI * 0.5);
    parts.push(carcass);
    const blocks = 16;
    for (let i = 0; i < blocks; i++) {
        const a = (i / blocks) * Math.PI * 2;
        for (const off of [-0.085, 0.085]) {
            const b = new BoxGeometry(0.11, 0.07, 0.12);
            b.translate(off, WHEEL_RADIUS + 0.005, 0);
            b.rotateX(a + (off > 0 ? 0.12 : -0.12));
            parts.push(b);
        }
    }
    // Sidewall shoulder so the tire is not a flat-ended cylinder.
    for (const off of [-0.155, 0.155]) {
        const s = new CylinderGeometry(WHEEL_RADIUS * 0.93, WHEEL_RADIUS * 0.86, 0.05, 20, 1);
        s.rotateZ(Math.PI * 0.5);
        s.translate(off, 0, 0);
        parts.push(s);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    merged?.computeVertexNormals();
    return merged ?? carcass;
};

/** Painted steel rim with five spokes and a hub. */
const makeRim = (): BufferGeometry => {
    const parts: BufferGeometry[] = [];
    const dish = new CylinderGeometry(WHEEL_RADIUS * 0.68, WHEEL_RADIUS * 0.68, 0.16, 16, 1);
    dish.rotateZ(Math.PI * 0.5);
    parts.push(dish);
    const hub = new CylinderGeometry(0.09, 0.09, 0.22, 10);
    hub.rotateZ(Math.PI * 0.5);
    parts.push(hub);
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spoke = new BoxGeometry(0.17, WHEEL_RADIUS * 0.62, 0.075);
        spoke.translate(0, WHEEL_RADIUS * 0.31, 0);
        spoke.rotateX(a);
        parts.push(spoke);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    merged?.computeVertexNormals();
    return merged ?? dish;
};

export class VehicleModel {
    readonly root = new Group();
    /** Follows chassis attitude; cameras and emitters hang off this. */
    readonly chassis = new Group();
    readonly cockpitAnchor = new Object3D();
    readonly hoodAnchor = new Object3D();
    readonly chaseAnchor = new Object3D();
    readonly wheelNodes: Object3D[] = [];
    readonly dustAnchors: Object3D[] = [];

    private readonly steeringWheel = new Object3D();
    private readonly headlightGlare: Sprite[] = [];
    private readonly bodyGroup = new Group();
    private readonly owned: (BufferGeometry | Material)[] = [];
    private readonly headlightBeams: Mesh[] = [];
    /**
     * The cab shell and roof. The cockpit camera sits inside this box, and a
     * box you are inside is not something you can rely on back-face culling to
     * hide — so it is switched off explicitly in the interior view, the way a
     * driving game swaps in a separate cockpit model. The dash and seats go
     * with it: they are crude boxes at arm's length, and at this focal length
     * they simply fill the screen. The steering wheel stays, which is what
     * actually makes the view read as a cockpit.
     */
    private readonly greenhouse: Mesh[] = [];
    private lightsOn = 0;

    /** Diagnostics: the body scale this vehicle was built at, as one string. */
    get bodyScaleForTest(): string {
        const s = this.bodyGroup.scale;
        return `${s.x.toFixed(2)}x${s.y.toFixed(2)}x${s.z.toFixed(2)}`;
    }

    /**
     * Bed panels, so a vehicle without one can drop them.
     *
     * The shell is one pickup made of boxes, stretched per vehicle rather than
     * modelled three times over. Non-uniform scale on the body group does most
     * of the work, and it is honest about what it is: at the distance a chase
     * camera sits, length, width, height and ride height are what tell two
     * vehicles apart, not panel gaps.
     */
    private readonly bedParts: Mesh[] = [];

    constructor(assets: Assets, readonly spec: VehicleSpec = vehicleFor(DEFAULT_VEHICLE_ID)) {
        const paint = new MeshStandardMaterial({
            color: new Color(spec.paint[0], spec.paint[1], spec.paint[2]),
            roughness: 0.42,
            metalness: 0.32
        });
        const paintDark = new MeshStandardMaterial({
            color: new Color(spec.paintDark[0], spec.paintDark[1], spec.paintDark[2]),
            roughness: 0.5,
            metalness: 0.3
        });
        const glass = new MeshStandardMaterial({
            color: new Color(0.06, 0.09, 0.1),
            roughness: 0.06,
            metalness: 0.1,
            transparent: true,
            opacity: 0.62
        });
        const chrome = new MeshStandardMaterial({
            color: new Color(0.78, 0.79, 0.8),
            roughness: 0.22,
            metalness: 0.95
        });
        const rubber = new MeshStandardMaterial({
            color: new Color(0.045, 0.045, 0.05),
            roughness: 0.95,
            metalness: 0
        });
        const trim = new MeshStandardMaterial({
            color: new Color(0.17, 0.17, 0.18),
            roughness: 0.85,
            metalness: 0.1
        });
        const interior = new MeshStandardMaterial({
            // Light enough to read as trim rather than as a black hole: the cab
            // has no interior lighting, so a dark material renders as a void.
            color: new Color(0.29, 0.26, 0.22),
            roughness: 0.92,
            metalness: 0,
            emissive: new Color(0.03, 0.028, 0.025),
            emissiveIntensity: 1
        });
        const headlight = new MeshStandardMaterial({
            color: new Color(0.85, 0.85, 0.8),
            emissive: new Color(1, 0.95, 0.82),
            emissiveIntensity: 0.35,
            roughness: 0.15,
            metalness: 0.1
        });
        const taillight = new MeshStandardMaterial({
            color: new Color(0.3, 0.045, 0.04),
            emissive: new Color(0.7, 0.07, 0.04),
            // Low enough that the lenses read as dark red glass in daylight
            // rather than as two glowing decals stuck on the tailgate.
            emissiveIntensity: 0.22,
            roughness: 0.35
        });
        this.owned.push(paint, paintDark, glass, chrome, rubber, trim, interior, headlight, taillight);

        const mats = { paint, paintDark, glass, chrome, rubber, trim, interior, headlight, taillight };

        // ---------------------------------------------------------- body LOD
        const lod = new LOD();
        const detailed = this.buildBody(mats, true);
        const simple = this.buildBody(mats, false);
        lod.addLevel(detailed, 0);
        lod.addLevel(simple, 45);
        this.bodyGroup.add(lod);
        this.chassis.add(this.bodyGroup);

        // ------------------------------------------------------------- wheels
        const tireGeo = this.track(makeTire());
        const rimGeo = this.track(makeRim());
        // Straight off the spec, so the wheels are always under the axles the
        // physics is solving. They used to be four hard-coded pairs, which was
        // fine with one vehicle and wrong the moment there were three.
        const halfTrack = spec.track * 0.5;
        const rearZ = -(spec.wheelbase - spec.aFront);
        const wheelScale = spec.body.wheelRadius;
        const positions: [number, number][] = [
            [-halfTrack, spec.aFront],
            [halfTrack, spec.aFront],
            [-halfTrack, rearZ],
            [halfTrack, rearZ]
        ];
        for (const [x, z] of positions) {
            const node = new Object3D();
            node.position.set(x, WHEEL_RADIUS * wheelScale, z);
            node.scale.setScalar(wheelScale);
            const spin = new Object3D();
            const tire = new Mesh(tireGeo, rubber);
            tire.castShadow = true;
            const rim = new Mesh(rimGeo, chrome);
            rim.castShadow = true;
            spin.add(tire, rim);
            node.add(spin);
            node.userData.spin = spin;
            this.chassis.add(node);
            this.wheelNodes.push(node);

            const dust = new Object3D();
            dust.position.set(x, 0.06, z);
            this.chassis.add(dust);
            this.dustAnchors.push(dust);
        }

        // ------------------------------------------------------- light beams
        const beamGeo = this.track(new ConeGeometry(1.5, 16, 10, 1, true));
        const beamMat = new MeshBasicMaterial({
            color: new Color(1, 0.94, 0.78),
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        this.owned.push(beamMat);
        for (const x of [-0.62, 0.62]) {
            const beam = new Mesh(beamGeo, beamMat);
            beam.rotation.x = -Math.PI * 0.5;
            beam.position.set(x, 0.78, 2.55 + 7.6);
            beam.renderOrder = 2;
            this.chassis.add(beam);
            this.headlightBeams.push(beam);

            const glareMat = new SpriteMaterial({
                map: assets.glareSprite,
                color: new Color(1, 0.95, 0.8),
                transparent: true,
                opacity: 0,
                depthWrite: false
            });
            this.owned.push(glareMat);
            const sprite = new Sprite(glareMat);
            sprite.position.set(x, 0.78, 2.6);
            sprite.scale.setScalar(1.1);
            this.chassis.add(sprite);
            this.headlightGlare.push(sprite);
        }

        // ------------------------------------------------------------ anchors
        // Local +X is the driver's left in this right-handed, Y-up world, so a
        // left-hand-drive cab puts the seat and wheel at positive x.
        // These have to clear the bodywork, and the bodywork is specific:
        //   hood       y 0.95 .. 1.42, z 0.76 .. 2.48
        //   cab        y 1.18 .. 2.04, z -0.71 .. 1.01
        //   windshield y 1.35 .. 1.97, z 0.85 .. 1.15
        //   dash       y 1.29 .. 1.55, z 0.47 .. 0.97
        //   roof       y 2.01 .. 2.11
        //
        // The driver's eye sits above the dash and behind the wheel, looking out
        // through the windshield. The hood camera sits above the hood and ahead
        // of the windshield, so the hood fills the bottom of the frame. The old
        // values put the hood camera inside the windshield glass and the cockpit
        // camera below the dash top, 19 cm from its face — which is why both
        // views were a wall of paint.
        // Eye height sits about a third of a metre above the dash top (1.48)
        // and the same below the roof lining (2.10) — the framing a driver
        // actually has. The hood camera clears the hood (top 1.42) and sits
        // ahead of the windshield (front face 1.15), so the hood reads as a
        // strip along the bottom rather than half the screen.
        // Sat back between the seats rather than up against the dash: moving
        // the eye forward makes the dash *nearer*, so its top face swells to
        // fill the screen. Back here it reads as a strip along the bottom.
        // Anchors hang off the chassis, not the scaled body, so they have to be
        // scaled by hand. A cockpit anchor left at the truck's height sits above
        // the roof of anything lower.
        const bw = spec.body.width;
        const bh = spec.body.height;
        const bl = spec.body.length;
        const lift = spec.body.lift;
        this.cockpitAnchor.position.set(0.36 * bw, 1.78 * bh + lift, -0.15 * bl);
        this.hoodAnchor.position.set(0, 1.86 * bh + lift, 1.5 * bl);
        this.chaseAnchor.position.set(0, 1.5 * bh + lift, -1.2 * bl);
        this.chassis.add(this.cockpitAnchor, this.hoodAnchor, this.chaseAnchor);

        // The body is stretched; the wheels are not, because a scaled wheel is
        // an oval and reads as broken immediately.
        this.bodyGroup.scale.set(bw, bh, bl);
        this.bodyGroup.position.y += lift;

        if (!spec.body.bed) {
            // A closed back rather than an open box. Cheaper and more
            // convincing than hiding the walls and leaving a hole where the
            // floor was.
            for (const part of this.bedParts) part.visible = false;
            this.add(this.bodyGroup, boxAt(1.74, 0.82, 1.9, 0, 1.42, -1.5), paint);
            this.add(this.bodyGroup, boxAt(1.4, 0.44, 0.07, 0, 1.72, -0.62), glass, false);
        }

        this.root.add(this.chassis);
    }

    private track<T extends BufferGeometry>(g: T): T {
        this.owned.push(g);
        return g;
    }

    private add(parent: Object3D, geo: BufferGeometry, mat: Material, shadow = true): Mesh {
        const m = new Mesh(this.track(geo), mat);
        m.castShadow = shadow;
        m.receiveShadow = shadow;
        parent.add(m);
        return m;
    }

    private buildBody(
        m: {
            paint: Material;
            paintDark: Material;
            glass: Material;
            chrome: Material;
            rubber: Material;
            trim: Material;
            interior: Material;
            headlight: Material;
            taillight: Material;
        },
        detailed: boolean
    ): Object3D {
        const g = new Group();

        // Lower body / rocker: slightly wider at the bottom.
        const lower = taperedBox(1.94, 0.55, 4.95, 0.99, 0.985);
        lower.translate(0, 0.72, -0.05);
        this.add(g, lower, m.paint);

        // Hood and front clip: tapers inward and lifts at the nose.
        const hood = taperedBox(1.86, 0.42, 1.72, 0.92, 0.94, 0.05);
        hood.translate(0, 1.16, 1.62);
        this.add(g, hood, m.paint);

        // Front fenders, flared over the wheels.
        for (const x of [-0.9, 0.9]) {
            const fender = taperedBox(0.34, 0.5, 1.35, 0.7, 0.9);
            fender.translate(x, 1.02, 1.44);
            this.add(g, fender, m.paint);
            const rear = taperedBox(0.34, 0.5, 1.45, 0.7, 0.9);
            rear.translate(x, 1.02, -1.5);
            this.add(g, rear, m.paint);
        }

        // Cab greenhouse: narrower and shorter at the roof, like a real cabin.
        const cab = taperedBox(1.82, 0.94, 1.72, 0.9, 0.82);
        cab.translate(0, 1.66, 0.15);
        this.greenhouse.push(this.add(g, cab, m.paint));
        const roof = taperedBox(1.62, 0.1, 1.42, 0.97, 0.97);
        roof.translate(0, 2.15, 0.12);
        this.greenhouse.push(this.add(g, roof, m.paint));

        // Glass: windshield raked back, side glass, rear window.
        const windshield = new BoxGeometry(1.6, 0.86, 0.07);
        windshield.translate(0, 1.72, 1.0);
        const ws = this.add(g, windshield, m.glass, false);
        ws.rotation.x = -0.42;
        for (const x of [-0.855, 0.855]) {
            const side = boxAt(0.06, 0.56, 1.35, x, 1.8, 0.16);
            this.add(g, side, m.glass, false);
        }
        const rearGlass = boxAt(1.42, 0.56, 0.07, 0, 1.82, -0.66);
        this.add(g, rearGlass, m.glass, false);

        // Bed: floor plus four walls, so it reads as an open pickup box.
        const bedFloor = boxAt(1.78, 0.12, 2.0, 0, 1.02, -1.55);
        this.bedParts.push(this.add(g, bedFloor, m.paintDark));
        for (const x of [-0.88, 0.88]) {
            this.bedParts.push(this.add(g, boxAt(0.11, 0.46, 2.02, x, 1.28, -1.55), m.paint));
        }
        this.bedParts.push(this.add(g, boxAt(1.8, 0.46, 0.1, 0, 1.28, -2.53), m.paint));
        this.bedParts.push(this.add(g, boxAt(1.8, 0.46, 0.09, 0, 1.28, -0.58), m.paint));

        // Bumpers, grille, skid plate.
        this.add(g, boxAt(1.94, 0.24, 0.24, 0, 0.78, 2.58), m.chrome);
        this.add(g, boxAt(1.94, 0.24, 0.24, 0, 0.78, -2.7), m.chrome);
        this.add(g, boxAt(1.62, 0.42, 0.12, 0, 1.12, 2.5), m.trim);
        for (let i = 0; i < 5; i++) {
            this.add(g, boxAt(1.5, 0.035, 0.06, 0, 0.98 + i * 0.075, 2.55), m.chrome, false);
        }
        this.add(g, boxAt(1.3, 0.06, 0.7, 0, 0.5, 2.1), m.trim);

        // Lights.
        for (const x of [-0.64, 0.64]) {
            this.add(g, boxAt(0.36, 0.24, 0.1, x, 1.2, 2.52), m.headlight, false);
            this.add(g, boxAt(0.42, 0.3, 0.06, x, 1.2, 2.49), m.trim, false);
            // Lens plus a dark bezel, at a plausible size for the tailgate.
            this.add(g, boxAt(0.3, 0.19, 0.07, x * 1.24, 1.29, -2.66), m.taillight, false);
            this.add(g, boxAt(0.36, 0.25, 0.05, x * 1.24, 1.29, -2.63), m.trim, false);
        }

        if (!detailed) return g;

        // -------------------------------------------------- detail-only parts
        // Mirrors.
        for (const x of [-1.02, 1.02]) {
            this.add(g, boxAt(0.06, 0.05, 0.22, x * 0.94, 1.76, 0.92), m.trim);
            this.add(g, boxAt(0.09, 0.22, 0.16, x, 1.76, 0.98), m.trim);
        }
        // Roof light bar.
        this.add(g, boxAt(1.34, 0.11, 0.14, 0, 2.28, 0.32), m.trim);
        for (const x of [-0.44, 0, 0.44]) {
            this.add(g, boxAt(0.24, 0.14, 0.08, x, 2.28, 0.4), m.headlight, false);
        }
        // Exhaust and tow hooks.
        const pipe = new CylinderGeometry(0.045, 0.045, 0.9, 8);
        pipe.rotateX(Math.PI * 0.5);
        pipe.translate(0.6, 0.42, -2.4);
        this.add(g, pipe, m.chrome);
        for (const x of [-0.45, 0.45]) this.add(g, boxAt(0.08, 0.12, 0.16, x, 0.72, 2.66), m.trim);

        // Snorkel, because this is a mountain truck.
        const snorkel = new CylinderGeometry(0.055, 0.055, 1.5, 8);
        snorkel.translate(0.86, 1.6, 1.4);
        this.add(g, snorkel, m.trim);

        {
            // Interior — visible through the glass and in cockpit view.
            this.greenhouse.push(this.add(g, boxAt(1.66, 0.24, 0.5, 0, 1.36, 0.72), m.interior, false)); // dash
            this.greenhouse.push(this.add(g, boxAt(1.5, 0.1, 0.34, 0, 1.22, 0.5), m.trim, false)); // dash lower
            for (const x of [-0.4, 0.4]) {
                this.greenhouse.push(this.add(g, boxAt(0.5, 0.14, 0.5, x, 1.16, -0.05), m.interior, false)); // seat base
                const back = boxAt(0.5, 0.62, 0.13, x, 1.46, -0.28);
                const b = this.add(g, back, m.interior, false);
                b.rotation.x = 0.14;
                this.greenhouse.push(b);
            }
            this.greenhouse.push(this.add(g, boxAt(0.12, 0.4, 0.12, 0, 1.3, -0.3), m.trim, false)); // centre console

            // Steering wheel, on its own node so it can be turned.
            this.steeringWheel.position.set(0.38, 1.4, 0.52);
            this.steeringWheel.rotation.x = -0.42;
            const rimGeo = new CylinderGeometry(0.185, 0.185, 0.035, 16, 1);
            rimGeo.rotateX(Math.PI * 0.5);
            this.add(this.steeringWheel, rimGeo, m.trim, false);
            for (let i = 0; i < 3; i++) {
                const spoke = boxAt(0.16, 0.03, 0.02, 0, 0, 0);
                const s = this.add(this.steeringWheel, spoke, m.trim, false);
                s.rotation.z = (i / 3) * Math.PI * 2;
                s.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.09, Math.sin((i / 3) * Math.PI * 2) * 0.09, 0);
            }
            this.add(this.steeringWheel, new SphereGeometry(0.05, 8, 6), m.trim, false);
            g.add(this.steeringWheel);

            // Column stalk and pedals hint.
            this.add(g, boxAt(0.08, 0.08, 0.3, 0.38, 1.3, 0.68), m.trim, false);
        }

        return g;
    }

    /**
     * Hide the cab shell for the interior view. Everything else — dash, wheel,
     * seats, hood, bed — stays, so the cockpit still reads as a cockpit.
     */
    setCockpitView(on: boolean): void {
        for (let i = 0; i < this.greenhouse.length; i++) this.greenhouse[i].visible = !on;
    }

    /** Apply the physics state to the visual rig. Called once per rendered frame. */
    sync(physics: VehiclePhysics, dt: number, nightFactor: number): void {
        this.root.position.copy(physics.position);
        this.root.rotation.set(0, physics.yaw, 0);
        this.chassis.rotation.set(physics.pitch, 0, physics.roll);

        for (let i = 0; i < 4; i++) {
            const node = this.wheelNodes[i];
            const w = physics.wheels[i];
            // Suspension travel: the wheel hangs from the body.
            node.position.y = WHEEL_RADIUS - w.compression + 0.06;
            const spin = node.userData.spin as Object3D;
            spin.rotation.x = w.spin;
            // Front wheels steer.
            node.rotation.y = i < 2 ? physics.steer : 0;
        }

        this.steeringWheel.rotation.z = -physics.steer * 6.2;

        // Headlights fade up as the light goes.
        this.lightsOn = damp(this.lightsOn, clamp(nightFactor * 1.4, 0, 1), 2, dt);
        const lit = this.lightsOn > 0.02;
        for (let i = 0; i < this.headlightBeams.length; i++) {
            const beam = this.headlightBeams[i];
            (beam.material as MeshBasicMaterial).opacity = this.lightsOn * 0.075;
            beam.visible = lit;
        }
        for (let i = 0; i < this.headlightGlare.length; i++) {
            const sprite = this.headlightGlare[i];
            (sprite.material as SpriteMaterial).opacity = this.lightsOn * 0.85;
            sprite.visible = lit;
        }
    }

    /** World position of a wheel's contact patch, for the dust emitters. */
    wheelWorldPosition(i: number, target: Vector3): Vector3 {
        return this.dustAnchors[i].getWorldPosition(target);
    }

    dispose(): void {
        for (const o of this.owned) o.dispose();
        this.owned.length = 0;
    }
}
