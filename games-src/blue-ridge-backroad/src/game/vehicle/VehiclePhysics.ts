import { Vector3 } from 'three';
import {
    SURFACE_DITCH,
    SURFACE_GRASS,
    SURFACE_ROAD,
    SURFACE_SHOULDER,
    createFrame,
    createProjectResult,
    type RoadFrame,
    type RoadPath
} from '../road/RoadPath';
import { clamp, damp, moveTowards, smoothstep, DEG } from '../util/mathx';
import type { InputState } from '../input';
import { resolveInputTargets } from '../input';
import type { ChunkManager } from '../world/ChunkManager';

/**
 * Heavy, responsive, believable — not a hardcore simulator.
 *
 * The lateral model is a bicycle model with a Pacejka-shaped tire curve and
 * per-wheel load from analytic weight transfer. Three guards keep it stable at
 * 120 Hz and near standstill, which is where naive implementations of this
 * model shake themselves apart:
 *
 *   1. the slip-angle denominator is clamped, so it never divides by ~0;
 *   2. lateral force is low-passed by a tire relaxation length, which kills the
 *      oscillation a stiff tire curve otherwise produces at small timesteps;
 *   3. below 4 m/s the model blends into kinematic steering and the lateral
 *      velocity is damped directly.
 *
 * The suspension is *cosmetic*: it is driven by body acceleration and per-wheel
 * ground height and feeds nothing back into the solver. Grip comes from the
 * analytic load transfer instead. Two models for one phenomenon is how you get
 * a car that fights itself.
 */

// ------------------------------------------------------------- parameters

const MASS = 2100; // kg
const WHEELBASE = 2.95;
const A_FRONT = 1.44; // CG to front axle
const B_REAR = WHEELBASE - A_FRONT;
const TRACK = 1.66;
const CG_HEIGHT = 0.7;
const IZ = 3300; // yaw inertia
const G = 9.81;

const DRAG_K = 0.5 * 1.225 * 0.44 * 3.5; // 0.5 rho Cd A
const PEAK_POWER = 300000; // W
const PEAK_FORCE = 9600; // N — traction-limited launch
const BRAKE_FORCE = 15500; // N
const REVERSE_FORCE = 4200; // N
const REVERSE_MAX = 13; // m/s

const TIRE_B = 7.4;
const TIRE_C = 1.42;
const TIRE_D = 1.0;
const RELAX_LENGTH = 0.55; // metres

export const WHEEL_RADIUS = 0.41;
const WHEEL_X = TRACK * 0.5;
const WHEEL_Z_FRONT = A_FRONT;
const WHEEL_Z_REAR = -B_REAR;

/** Per-surface grip and rolling resistance. Index matches the SURFACE_* ids. */
const SURFACE_MU = [0.98, 0.72, 0.52, 0.47];
// Rolling resistance. Off the carriageway it is deliberately punishing: the
// spec asks for leaving the road to cost you a lot of speed, and bogging down
// in the weeds is a far better way to express that than a scripted penalty.
const SURFACE_ROLL = [0.016, 0.05, 0.22, 0.19];
const SURFACE_ROUGH = [0.35, 0.75, 1, 0.9];

const GEAR_RATIOS = [3.4, 2.05, 1.38, 1.0];
const FINAL_DRIVE = 3.9;
const RPM_IDLE = 750;
const RPM_MAX = 6200;

// ------------------------------------------------------------------ state

export interface WheelState {
    /** Local mount position (x right, y up, z forward). */
    readonly x: number;
    readonly z: number;
    /** Suspension compression, metres (0 = fully extended). */
    compression: number;
    /** Wheel spin angle, radians. */
    spin: number;
    /** Ground height under this wheel, world Y. */
    groundY: number;
    surface: number;
    load: number;
    slipping: number;
}

const makeWheel = (x: number, z: number): WheelState => ({
    x,
    z,
    compression: 0.06,
    spin: 0,
    groundY: 0,
    surface: SURFACE_ROAD,
    load: MASS * G * 0.25,
    slipping: 0
});

const frameA = createFrame();
const projA = createProjectResult();
const collisionOut = new Float32Array(4);

export class VehiclePhysics {
    readonly position = new Vector3();
    yaw = 0;
    /** Body-frame velocities: u forward, v lateral (right positive). */
    u = 0;
    v = 0;
    yawRate = 0;

    /** Road coordinates of the chassis, kept from the previous projection. */
    s = 0;
    lateral = 0;
    readonly frame: RoadFrame = createFrame();

    steer = 0; // actual road-wheel angle, radians
    throttle = 0;
    brake = 0;
    steerInput = 0;

    gear = 0;
    rpm = RPM_IDLE;
    shiftFlash = 0;

    odometer = 0; // metres
    airborne = false;

    /** Cosmetic body attitude. */
    pitch = 0;
    roll = 0;
    heave = 0;
    bodyY = 0;

    /** Smoothed accelerations, used by the camera, suspension and audio. */
    accelLong = 0;
    accelLat = 0;

    /** 0..1 how loose the surface under the tires is — drives dust and audio. */
    surfaceRoughness = 0;
    /** Magnitude of rear lateral slip; drives the skid sound and dust. */
    slipAmount = 0;
    /** Set for one frame when something is hit. */
    impact = 0;
    /** Set for one frame when a wheel lands hard. */
    landing = 0;

    readonly wheels: WheelState[] = [
        makeWheel(-WHEEL_X, WHEEL_Z_FRONT),
        makeWheel(WHEEL_X, WHEEL_Z_FRONT),
        makeWheel(-WHEEL_X, WHEEL_Z_REAR),
        makeWheel(WHEEL_X, WHEEL_Z_REAR)
    ];

    private fyFront = 0;
    private fyRear = 0;
    /** Rear slip angle from the previous substep; gates the counter-steer allowance. */
    private rearSlip = 0;
    private reverseHold = 0;
    private prevWheelY = [0, 0, 0, 0];

    constructor(private readonly path: RoadPath) {}

    reset(s: number): void {
        this.path.sample(s, this.frame);
        this.path.surfacePoint(this.frame, 0, this.position);
        this.position.y += WHEEL_RADIUS;
        this.yaw = Math.atan2(this.frame.tangent.x, this.frame.tangent.z);
        this.u = 0;
        this.v = 0;
        this.yawRate = 0;
        this.s = s;
        this.lateral = 0;
        this.steer = 0;
        this.gear = 0;
        this.rpm = RPM_IDLE;
        this.odometer = 0;
        this.fyFront = 0;
        this.fyRear = 0;
        this.rearSlip = 0;
        for (const w of this.wheels) w.compression = 0.06;
    }

    get speed(): number {
        return Math.hypot(this.u, this.v);
    }

    /** One fixed physics substep. Allocation-free. */
    step(dt: number, input: InputState, chunks: ChunkManager | null): void {
        const targets = resolveInputTargets(input);

        // 1. Input conditioning ------------------------------------------------
        this.throttle = moveTowards(this.throttle, targets.throttle, dt * 3.2);
        this.brake = moveTowards(this.brake, targets.brake, dt * 6);
        this.steerInput = moveTowards(this.steerInput, targets.steer, dt * 3.4);

        const speed = Math.abs(this.u);
        // Steering authority falls off with speed, so the truck is placid at
        // 100 mph and darty at walking pace.
        let steerMax = (32 - 24 * smoothstep(0, 55, speed)) * DEG;
        // HANDEDNESS. This is a right-handed, Y-up world, so a positive rotation
        // about +Y takes forward (+Z) toward +X — which is the driver's LEFT.
        // Every angular quantity here follows that same rule: yaw, yawRate and
        // steer are all POSITIVE = LEFT, and the lateral velocity used in the
        // tire model (vL) is POSITIVE = LEFT so that it is right-handed with
        // them. The public field `v` stays positive-to-the-RIGHT, because that
        // is what the camera, the dust and the collision response want. Mixing
        // the two conventions inverts the steering and quietly flips the
        // Coriolis terms, so the conversion happens in exactly one place below.
        const steerCmd = -this.steerInput; // left-positive, like `steer`
        // Extra lock while the rear is loose — but ONLY when the driver is
        // steering against the slide. Handing out more lock regardless of
        // direction lets a small slide unlock a large steering angle, which
        // deepens the slide, which unlocks more lock; the truck then spins
        // itself every time it steps out.
        if (this.rearSlip !== 0 && Math.sign(steerCmd) === Math.sign(this.rearSlip)) {
            steerMax = Math.min(steerMax + clamp(this.slipAmount * 0.8, 0, 10 * DEG), 30 * DEG);
        }
        const steerTarget = steerCmd * steerMax;
        this.steer = moveTowards(this.steer, steerTarget, dt * 4.5);

        // 2. Road query --------------------------------------------------------
        this.path.project(this.position.x, this.position.z, this.s, projA);
        this.s = projA.s;
        this.lateral = projA.lateral;
        this.path.sample(this.s, this.frame);

        const fwdX = Math.sin(this.yaw);
        const fwdZ = Math.cos(this.yaw);
        const rgtX = -fwdZ;
        const rgtZ = fwdX;

        // Per-wheel road coordinates, derived from the chassis frame rather than
        // four more projections.
        const tX = this.frame.tangent.x;
        const tZ = this.frame.tangent.z;
        const rX = this.frame.right.x;
        const rZ = this.frame.right.z;

        let muSum = 0;
        let rollSum = 0;
        let roughSum = 0;
        let groundSum = 0;
        for (let i = 0; i < 4; i++) {
            const w = this.wheels[i];
            const ox = rgtX * w.x + fwdX * w.z;
            const oz = rgtZ * w.x + fwdZ * w.z;
            const ws = this.s + ox * tX + oz * tZ;
            const wl = this.lateral + ox * rX + oz * rZ;
            this.path.sample(ws, frameA);
            w.groundY = frameA.pos.y + this.path.crossHeight(frameA, wl);
            w.surface = this.path.surfaceAt(frameA, wl);
            muSum += SURFACE_MU[w.surface];
            rollSum += SURFACE_ROLL[w.surface];
            roughSum += SURFACE_ROUGH[w.surface];
            groundSum += w.groundY;
        }
        const mu = muSum * 0.25;
        const rollCoef = rollSum * 0.25;
        this.surfaceRoughness = roughSum * 0.25;
        const groundY = groundSum * 0.25;

        // Local slopes, taken from the same height function the mesh uses.
        const crossSlope = this.path.crossSlope(this.frame, this.lateral);
        const headingDotTangent = fwdX * tX + fwdZ * tZ;
        const headingDotRight = fwdX * rX + fwdZ * rZ;
        const gradeAlong = this.frame.tangent.y;
        // Gravity resolved into the body frame.
        // Gravity along a slope is g*sin(theta), not g*tan(theta). Using the raw
        // gradient overstates it badly on the steep ground beyond the ditch —
        // enough to drag the truck sideways faster than any tire could resist,
        // which is not a slide, it is a bug.
        const slopeLat = crossSlope / Math.sqrt(1 + crossSlope * crossSlope);
        const gLong = -G * (gradeAlong * headingDotTangent + slopeLat * headingDotRight * 0.7);
        // Camber pull. `crossSlope` rises toward the driver's right, so gravity
        // drags the truck to the left when it is positive.
        const gLatLeft = G * clamp(slopeLat, -0.6, 0.6) * headingDotTangent;

        // 3. Load transfer -----------------------------------------------------
        const axleFront = (MASS * G * B_REAR) / WHEELBASE;
        const axleRear = (MASS * G * A_FRONT) / WHEELBASE;
        const longTransfer = (MASS * this.accelLong * CG_HEIGHT) / WHEELBASE;
        const latTransfer = (MASS * this.accelLat * CG_HEIGHT) / TRACK;
        const fzFront = Math.max(200, axleFront - longTransfer);
        const fzRear = Math.max(200, axleRear + longTransfer);
        this.wheels[0].load = Math.max(0, fzFront * 0.5 - latTransfer * 0.5);
        this.wheels[1].load = Math.max(0, fzFront * 0.5 + latTransfer * 0.5);
        this.wheels[2].load = Math.max(0, fzRear * 0.5 - latTransfer * 0.5);
        this.wheels[3].load = Math.max(0, fzRear * 0.5 + latTransfer * 0.5);

        // Tires lose grip as they are loaded up — this is what makes weight
        // transfer actually change the handling rather than just decorate it.
        const loadSens = (fz: number, ref: number): number => clamp(1 - 0.3 * (fz / ref - 1), 0.6, 1.25);
        const muFront = mu * loadSens(fzFront, axleFront);
        const muRear = mu * loadSens(fzRear, axleRear);

        // 4. Longitudinal ------------------------------------------------------
        this.updateGear(speed);
        let fx = 0;
        const reversing = this.u < 0.4 && this.brake > 0.5;
        if (reversing) this.reverseHold = Math.min(1, this.reverseHold + dt * 2.5);
        else this.reverseHold = Math.max(0, this.reverseHold - dt * 4);

        if (this.reverseHold > 0.6 && this.throttle < 0.05) {
            // Held brake at a standstill backs the truck up.
            if (this.u > -REVERSE_MAX) fx -= REVERSE_FORCE * this.brake;
        } else {
            const vEff = Math.max(4, Math.abs(this.u));
            fx += this.throttle * Math.min(PEAK_FORCE, PEAK_POWER / vEff);
            if (this.brake > 0) {
                const dir = this.u > 0.15 ? 1 : this.u < -0.15 ? -1 : 0;
                fx -= dir * BRAKE_FORCE * this.brake;
                // A dead band at zero stops braking integrating into reverse.
                if (dir === 0) this.u = 0;
            }
        }
        // Drag, rolling resistance and the grade.
        fx -= DRAG_K * this.u * Math.abs(this.u);
        fx -= rollCoef * MASS * G * Math.sign(this.u) * Math.min(1, Math.abs(this.u) * 2);
        fx += MASS * gLong;

        // Traction limit on the driven (rear) axle — this is what lets the
        // throttle break the rear loose on loose gravel.
        const maxDrive = muRear * fzRear * 1.05;
        const driveDemand = Math.abs(fx);
        const driveSat = driveDemand > maxDrive ? maxDrive / driveDemand : 1;
        if (fx > 0) fx *= driveSat;

        // 5. Lateral / yaw -----------------------------------------------------
        const uEff = Math.max(Math.abs(this.u), 2.5) * (this.u < 0 ? -1 : 1);
        // Lateral velocity, positive to the LEFT — right-handed with yawRate.
        const vL = -this.v;
        const alphaF = Math.atan2(vL + A_FRONT * this.yawRate, Math.abs(uEff)) - this.steer * Math.sign(uEff || 1);
        const alphaR = Math.atan2(vL - B_REAR * this.yawRate, Math.abs(uEff));

        // Combined slip: longitudinal demand eats into the lateral budget.
        const combined = clamp(1 - Math.pow(clamp(driveDemand / (maxDrive || 1), 0, 1), 2) * 0.55, 0.35, 1);

        const pacejka = (alpha: number): number => TIRE_D * Math.sin(TIRE_C * Math.atan(TIRE_B * alpha));
        const targetFyF = -muFront * fzFront * pacejka(alphaF);
        const targetFyR = -muRear * fzRear * pacejka(alphaR) * combined;

        // Tire relaxation: the contact patch cannot build force instantly. This
        // single low-pass is the difference between a drift you can hold and a
        // 120 Hz oscillation.
        const relaxRate = Math.max(Math.abs(this.u), 3) / RELAX_LENGTH;
        this.fyFront = damp(this.fyFront, targetFyF, relaxRate, dt);
        this.fyRear = damp(this.fyRear, targetFyR, relaxRate, dt);

        const cosSteer = Math.cos(this.steer);
        // Both tire forces are positive to the LEFT, matching alphaF/alphaR.
        const ayForceLeft = this.fyFront * cosSteer + this.fyRear;
        const yawTorque = A_FRONT * this.fyFront * cosSteer - B_REAR * this.fyRear;

        // Body-frame equations of motion in (forward, left, up) — the standard
        // right-handed set, so the Coriolis terms are +r*vL and -r*u.
        const du = (fx / MASS + this.yawRate * vL) * dt;
        const dvL = (ayForceLeft / MASS - this.u * this.yawRate + gLatLeft) * dt;
        this.u += du;
        this.v = -(vL + dvL);
        // Explicit yaw damping — a bare bicycle model goes unstable in yaw once
        // the rear is sliding.
        this.yawRate += (yawTorque / IZ) * dt;
        this.yawRate -= this.yawRate * clamp(1.4 * dt, 0, 0.5);

        // Low-speed blend to kinematic steering.
        const kin = smoothstep(4.5, 1.0, Math.abs(this.u));
        if (kin > 0) {
            const rKin = (this.u * Math.tan(this.steer)) / WHEELBASE;
            this.yawRate += (rKin - this.yawRate) * kin * clamp(dt * 12, 0, 1);
            this.v *= Math.exp(-9 * kin * dt);
        }
        // Hard sanity clamps. Nothing physical should reach these, but a single
        // bad frame delta must not be able to launch the truck into orbit.
        this.v = clamp(this.v, -35, 35);
        this.u = clamp(this.u, -REVERSE_MAX - 2, 78);
        this.yawRate = clamp(this.yawRate, -3.4, 3.4);

        // 6. Integrate ---------------------------------------------------------
        this.yaw += this.yawRate * dt;
        const worldVX = fwdX * this.u + rgtX * this.v;
        const worldVZ = fwdZ * this.u + rgtZ * this.v;
        this.position.x += worldVX * dt;
        this.position.z += worldVZ * dt;
        this.odometer += Math.abs(this.u) * dt;

        // 7. Ride height -------------------------------------------------------
        const restY = groundY + WHEEL_RADIUS;
        const prevY = this.position.y;
        this.position.y = damp(this.position.y, restY, 26, dt);
        const drop = (this.position.y - prevY) / Math.max(dt, 1e-4);
        if (drop < -3.5) this.landing = Math.min(1, -drop / 9);

        // 8. Collisions --------------------------------------------------------
        if (chunks && chunks.queryCollision(this.position.x, this.position.y, this.position.z, 1.05, collisionOut)) {
            const nx = collisionOut[0];
            const nz = collisionOut[1];
            const pen = collisionOut[2];
            this.position.x += nx * pen;
            this.position.z += nz * pen;
            const approach = worldVX * nx + worldVZ * nz;
            if (approach < 0) {
                // Remove the velocity going into the obstacle, keep a little
                // restitution, and scrub what slides along it. Anything that
                // *adds* speed here compounds every substep the truck stays in
                // contact, and a tree ends up launching it sideways.
                const j = -(1 + 0.15) * approach;
                const nvx = (worldVX + nx * j) * 0.8;
                const nvz = (worldVZ + nz * j) * 0.8;
                this.u = nvx * fwdX + nvz * fwdZ;
                this.v = nvx * rgtX + nvz * rgtZ;
                this.yawRate = clamp(this.yawRate + (nx * fwdZ - nz * fwdX) * 0.3, -2.2, 2.2);
                this.impact = Math.max(this.impact, clamp(-approach / 18, 0.15, 1));
            }
        }

        // 9. Cosmetic state ----------------------------------------------------
        this.accelLong = damp(this.accelLong, du / dt, 9, dt);
        // Lateral acceleration expressed to the driver's RIGHT: that is the
        // direction weight transfers away from, and the direction the body
        // leans away from.
        this.accelLat = damp(this.accelLat, -(ayForceLeft / MASS + gLatLeft), 9, dt);
        this.slipAmount = damp(this.slipAmount, Math.abs(alphaR) * Math.min(1, Math.abs(this.u) / 6), 7, dt);
        this.rearSlip = alphaR;

        const bodyPitchTarget = clamp(-this.accelLong * 0.011, -0.09, 0.09);
        // rotation.z is positive = left side up. Cornering right (accelLat > 0)
        // drops the left side, and a road banked right-side-high drops it too,
        // so both terms are negative.
        const bodyRollTarget =
            clamp(-this.accelLat * 0.013, -0.12, 0.12) - this.frame.bank * 0.9;
        this.pitch = damp(this.pitch, bodyPitchTarget, 9, dt);
        this.roll = damp(this.roll, bodyRollTarget, 8, dt);

        for (let i = 0; i < 4; i++) {
            const w = this.wheels[i];
            // Compression is purely visual: how far the wheel has to reach from
            // the (already resolved) body height down to its own ground point.
            const bodyAtWheel =
                this.position.y - this.pitch * w.z + this.roll * w.x;
            const target = clamp(bodyAtWheel - WHEEL_RADIUS - w.groundY + 0.09, -0.02, 0.24);
            w.compression = damp(w.compression, target, 16, dt);
            w.spin += (this.u / WHEEL_RADIUS) * dt;
            const wheelDrop = (w.groundY - this.prevWheelY[i]) / Math.max(dt, 1e-4);
            this.prevWheelY[i] = w.groundY;
            w.slipping = damp(w.slipping, this.slipAmount + Math.abs(wheelDrop) * 0.02, 8, dt);
        }

        this.impact = Math.max(0, this.impact - dt * 3);
        this.landing = Math.max(0, this.landing - dt * 4);
        this.shiftFlash = Math.max(0, this.shiftFlash - dt * 3);
    }

    private updateGear(speed: number): void {
        const wheelRps = speed / (2 * Math.PI * WHEEL_RADIUS);
        const ratio = GEAR_RATIOS[this.gear] * FINAL_DRIVE;
        const raw = wheelRps * ratio * 60;
        this.rpm = clamp(raw, RPM_IDLE, RPM_MAX);
        // Hysteresis, so cruising near a shift point does not chatter.
        if (raw > RPM_MAX * 0.93 && this.gear < GEAR_RATIOS.length - 1) {
            this.gear += 1;
            this.shiftFlash = 1;
        } else if (raw < RPM_MAX * 0.36 && this.gear > 0) {
            this.gear -= 1;
        }
    }

    /** True when a wheel is off the carriageway. */
    get offRoad(): boolean {
        for (const w of this.wheels) if (w.surface !== SURFACE_ROAD) return true;
        return false;
    }

    get onLooseSurface(): boolean {
        for (const w of this.wheels) {
            if (w.surface === SURFACE_SHOULDER || w.surface === SURFACE_GRASS || w.surface === SURFACE_DITCH) {
                return true;
            }
        }
        return false;
    }
}
