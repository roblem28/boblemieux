import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp, lerp, smoothstep } from '../util/mathx';
import type { VehiclePhysics } from '../vehicle/VehiclePhysics';
import type { VehicleModel } from '../vehicle/VehicleModel';

export type CameraMode = 'chase' | 'hood' | 'cockpit';
export const CAMERA_MODES: readonly CameraMode[] = ['chase', 'hood', 'cockpit'];
export const CAMERA_LABELS: Record<CameraMode, string> = {
    chase: 'Chase',
    hood: 'Hood',
    cockpit: 'Cockpit'
};

const desired = new Vector3();
const lookTarget = new Vector3();
const scratch = new Vector3();

/**
 * Spring-damped cameras that never roll the view. Roll is the one thing that
 * makes a driving camera nauseating in VR, and this rig is meant to be
 * XR-swappable, so body roll is deliberately not passed through — the horizon
 * stays level while the truck leans underneath it.
 */
export class CameraRig {
    mode: CameraMode = 'chase';
    readonly camera: PerspectiveCamera;

    private readonly position = new Vector3();
    private readonly look = new Vector3();
    private fov = 62;
    private shake = 0;
    private shakeSeed = 0;
    private started = false;

    constructor(aspect: number) {
        this.camera = new PerspectiveCamera(62, aspect, 0.25, 2400);
    }

    cycle(): CameraMode {
        const i = CAMERA_MODES.indexOf(this.mode);
        this.mode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
        this.started = false; // snap rather than sweep across the world
        return this.mode;
    }

    set(mode: CameraMode): void {
        this.mode = mode;
        this.started = false;
    }

    update(dt: number, physics: VehiclePhysics, model: VehicleModel, time: number): void {
        const speed = Math.abs(physics.u);
        const speedT = smoothstep(0, 62, speed);

        // Impacts and hard landings shove the camera a little.
        this.shake = Math.max(this.shake * Math.exp(-dt * 4.5), physics.impact * 0.6 + physics.landing * 0.35);
        this.shakeSeed += dt * 37;

        if (this.mode === 'chase') {
            // Sit behind the truck in *world* space, trailing the heading rather
            // than being rigidly bolted to it, so hard steering reads as the
            // truck rotating inside the frame.
            const back = lerp(6.4, 8.4, speedT);
            const height = lerp(2.5, 2.15, speedT);
            const fwdX = Math.sin(physics.yaw);
            const fwdZ = Math.cos(physics.yaw);
            desired.set(
                physics.position.x - fwdX * back,
                physics.position.y + height,
                physics.position.z - fwdZ * back
            );
            // Look slightly ahead of the truck, further at speed.
            const ahead = lerp(6, 22, speedT);
            lookTarget.set(
                physics.position.x + fwdX * ahead,
                physics.position.y + 0.9 - speedT * 0.25,
                physics.position.z + fwdZ * ahead
            );
            const posRate = lerp(4.4, 7.2, speedT);
            this.blend(dt, posRate, 8);
            this.fov = damp(this.fov, lerp(62, 82, speedT), 3, dt);
        } else if (this.mode === 'hood') {
            model.hoodAnchor.getWorldPosition(desired);
            model.chassis.getWorldPosition(scratch);
            const fwdX = Math.sin(physics.yaw);
            const fwdZ = Math.cos(physics.yaw);
            lookTarget.set(
                desired.x + fwdX * 30,
                desired.y - 1.2 + physics.pitch * 12,
                desired.z + fwdZ * 30
            );
            this.blend(dt, 26, 16);
            this.fov = damp(this.fov, lerp(66, 84, speedT), 3, dt);
        } else {
            model.cockpitAnchor.getWorldPosition(desired);
            const fwdX = Math.sin(physics.yaw);
            const fwdZ = Math.cos(physics.yaw);
            // A little look-into-the-corner, which is what a driver actually does.
            const lean = clamp(physics.steer * 2.4 + physics.yawRate * 0.35, -0.5, 0.5);
            const lx = Math.sin(physics.yaw + lean);
            const lz = Math.cos(physics.yaw + lean);
            lookTarget.set(
                desired.x + lx * 30,
                desired.y - 1.6 + physics.pitch * 10,
                desired.z + lz * 30
            );
            void fwdX;
            void fwdZ;
            this.blend(dt, 30, 20);
            this.fov = damp(this.fov, lerp(68, 80, speedT), 3, dt);
        }

        const amp = this.shake * (this.mode === 'chase' ? 0.22 : 0.1);
        this.camera.position.set(
            this.position.x + Math.sin(this.shakeSeed * 1.7) * amp,
            this.position.y + Math.sin(this.shakeSeed * 2.3) * amp,
            this.position.z + Math.cos(this.shakeSeed * 1.9) * amp
        );
        // up is always world-up: no camera roll, ever.
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(this.look);
        if (Math.abs(this.camera.fov - this.fov) > 0.01) {
            this.camera.fov = this.fov;
            this.camera.updateProjectionMatrix();
        }
        void time;
    }

    private blend(dt: number, posRate: number, lookRate: number): void {
        if (!this.started) {
            this.position.copy(desired);
            this.look.copy(lookTarget);
            this.started = true;
            return;
        }
        this.position.x = damp(this.position.x, desired.x, posRate, dt);
        this.position.y = damp(this.position.y, desired.y, posRate, dt);
        this.position.z = damp(this.position.z, desired.z, posRate, dt);
        this.look.x = damp(this.look.x, lookTarget.x, lookRate, dt);
        this.look.y = damp(this.look.y, lookTarget.y, lookRate, dt);
        this.look.z = damp(this.look.z, lookTarget.z, lookRate, dt);
    }

    /**
     * A slow orbit used by the title screen. Kept separate from the driving
     * cameras so entering the game always snaps to a clean chase view.
     */
    cinematic(time: number, target: Object3D): void {
        const r = 11;
        const a = time * 0.16;
        target.getWorldPosition(scratch);
        this.camera.position.set(
            scratch.x + Math.sin(a) * r,
            scratch.y + 3.4 + Math.sin(time * 0.23) * 0.7,
            scratch.z + Math.cos(a) * r
        );
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(scratch.x, scratch.y + 1.1, scratch.z);
        if (this.camera.fov !== 46) {
            this.camera.fov = 46;
            this.camera.updateProjectionMatrix();
        }
        this.started = false;
    }

    resize(aspect: number): void {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }
}
