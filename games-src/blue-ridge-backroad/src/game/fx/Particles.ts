import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    NormalBlending,
    Points,
    Scene,
    ShaderMaterial,
    Texture,
    Vector3
} from 'three';
import { clamp } from '../util/mathx';
import type { VehiclePhysics } from '../vehicle/VehiclePhysics';
import type { VehicleModel } from '../vehicle/VehicleModel';
import type { QualityPreset } from '../quality';
import type { Assets } from '../world/Assets';

/**
 * Dust plumes and kicked-up gravel, as two pools inside one point-sprite
 * system. Everything is preallocated; emitting a particle is a couple of array
 * writes into a ring, and dead particles are simply given zero size.
 *
 * Positions are stored relative to a moving origin that tracks the vehicle. The
 * geometry's float32 positions therefore stay near zero however far you drive,
 * which is the same reason the chunk meshes are chunk-local.
 */

const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vTint;
void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    float a = tex.a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vTint, a);
}`;

interface PoolConfig {
    count: number;
    texture: Texture;
    additive: boolean;
    gravity: number;
    drag: number;
    grow: number;
    fade: number;
}

class ParticlePool {
    readonly points: Points;
    private readonly positions: Float32Array;
    private readonly sizes: Float32Array;
    private readonly alphas: Float32Array;
    private readonly tints: Float32Array;
    private readonly vel: Float32Array;
    private readonly life: Float32Array;
    private readonly maxLife: Float32Array;
    private readonly geo: BufferGeometry;
    private readonly mat: ShaderMaterial;
    private cursor = 0;
    readonly count: number;

    constructor(private readonly cfg: PoolConfig) {
        this.count = cfg.count;
        const n = cfg.count;
        this.positions = new Float32Array(n * 3);
        this.sizes = new Float32Array(n);
        this.alphas = new Float32Array(n);
        this.tints = new Float32Array(n * 3);
        this.vel = new Float32Array(n * 3);
        this.life = new Float32Array(n);
        this.maxLife = new Float32Array(n);

        this.geo = new BufferGeometry();
        this.geo.setAttribute('position', new BufferAttribute(this.positions, 3));
        this.geo.setAttribute('size', new BufferAttribute(this.sizes, 1));
        this.geo.setAttribute('alpha', new BufferAttribute(this.alphas, 1));
        this.geo.setAttribute('tint', new BufferAttribute(this.tints, 3));
        this.geo.boundingSphere = null;

        this.mat = new ShaderMaterial({
            uniforms: {
                map: { value: cfg.texture }
            },
            vertexShader: VERT,
            fragmentShader: FRAG,
            transparent: true,
            depthWrite: false,
            blending: cfg.additive ? AdditiveBlending : NormalBlending
        });

        this.points = new Points(this.geo, this.mat);
        this.points.frustumCulled = false;
        this.points.renderOrder = 5;
    }

    emit(
        x: number,
        y: number,
        z: number,
        vx: number,
        vy: number,
        vz: number,
        size: number,
        life: number,
        r: number,
        g: number,
        b: number
    ): void {
        const i = this.cursor;
        this.cursor = (this.cursor + 1) % this.count;
        this.positions[i * 3] = x;
        this.positions[i * 3 + 1] = y;
        this.positions[i * 3 + 2] = z;
        this.vel[i * 3] = vx;
        this.vel[i * 3 + 1] = vy;
        this.vel[i * 3 + 2] = vz;
        this.sizes[i] = size;
        this.life[i] = life;
        this.maxLife[i] = life;
        this.tints[i * 3] = r;
        this.tints[i * 3 + 1] = g;
        this.tints[i * 3 + 2] = b;
        this.alphas[i] = 1;
    }

    update(dt: number, dx: number, dy: number, dz: number): void {
        const { gravity, drag, grow, fade } = this.cfg;
        const decay = Math.exp(-drag * dt);
        for (let i = 0; i < this.count; i++) {
            if (this.life[i] <= 0) {
                if (this.alphas[i] !== 0) this.alphas[i] = 0;
                continue;
            }
            this.life[i] -= dt;
            const p = i * 3;
            this.vel[p + 1] += gravity * dt;
            this.vel[p] *= decay;
            this.vel[p + 1] *= decay;
            this.vel[p + 2] *= decay;
            // The origin shift is folded straight into the integration step.
            this.positions[p] += this.vel[p] * dt - dx;
            this.positions[p + 1] += this.vel[p + 1] * dt - dy;
            this.positions[p + 2] += this.vel[p + 2] * dt - dz;
            this.sizes[i] += grow * dt;
            const t = clamp(this.life[i] / (this.maxLife[i] || 1), 0, 1);
            this.alphas[i] = Math.pow(t, fade);
        }
        (this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
        (this.geo.getAttribute('size') as BufferAttribute).needsUpdate = true;
        (this.geo.getAttribute('alpha') as BufferAttribute).needsUpdate = true;
        (this.geo.getAttribute('tint') as BufferAttribute).needsUpdate = true;
    }

    dispose(): void {
        this.geo.dispose();
        this.mat.dispose();
    }
}

const wheelPos = new Vector3();

export class Particles {
    private dust: ParticlePool;
    private gravel: ParticlePool;
    private readonly origin = new Vector3();
    private emitAccum = 0;

    constructor(
        private readonly scene: Scene,
        assets: Assets,
        preset: QualityPreset
    ) {
        this.dust = new ParticlePool({
            count: preset.dustParticles,
            texture: assets.softSprite,
            additive: false,
            gravity: 0.35,
            drag: 1.35,
            grow: 1.9,
            fade: 1.6
        });
        this.gravel = new ParticlePool({
            count: preset.gravelParticles,
            texture: assets.softSprite,
            additive: false,
            gravity: -16,
            drag: 0.25,
            grow: 0,
            fade: 0.4
        });
        scene.add(this.dust.points, this.gravel.points);
    }

    update(dt: number, physics: VehiclePhysics, model: VehicleModel): void {
        // Move the local origin with the vehicle and fold the delta into the
        // particle integration, so stored positions stay small.
        const dx = physics.position.x - this.origin.x;
        const dy = physics.position.y - this.origin.y;
        const dz = physics.position.z - this.origin.z;
        this.origin.copy(physics.position);
        this.dust.points.position.copy(this.origin);
        this.gravel.points.position.copy(this.origin);

        const speed = Math.abs(physics.u);
        const looseness = clamp(physics.surfaceRoughness * 1.1 + physics.slipAmount * 1.4, 0, 1.6);
        const intensity = clamp((speed / 26) * looseness, 0, 1.8);

        if (intensity > 0.03) {
            // Emission rate is time-based so it does not depend on frame rate.
            this.emitAccum += dt * (14 + intensity * 90);
            const bursts = Math.min(6, Math.floor(this.emitAccum));
            this.emitAccum -= bursts;
            const fwdX = Math.sin(physics.yaw);
            const fwdZ = Math.cos(physics.yaw);
            for (let b = 0; b < bursts; b++) {
                // Rear wheels throw the most; front wheels feather it.
                const wi = 2 + (b & 1);
                model.wheelWorldPosition(wi, wheelPos);
                const lx = wheelPos.x - this.origin.x;
                const ly = wheelPos.y - this.origin.y;
                const lz = wheelPos.z - this.origin.z;
                const jitter = (Math.random() - 0.5) * 0.5;
                this.dust.emit(
                    lx + jitter,
                    ly + 0.1,
                    lz + jitter,
                    -fwdX * speed * 0.18 + (Math.random() - 0.5) * 1.6,
                    0.5 + Math.random() * 1.3,
                    -fwdZ * speed * 0.18 + (Math.random() - 0.5) * 1.6,
                    0.7 + Math.random() * 0.9,
                    0.75 + Math.random() * 0.9 + intensity * 0.5,
                    0.62,
                    0.56,
                    0.47
                );
                if (this.gravel.count > 0 && Math.random() < 0.42 * intensity) {
                    this.gravel.emit(
                        lx,
                        ly + 0.05,
                        lz,
                        -fwdX * speed * 0.45 + (Math.random() - 0.5) * 5,
                        2.2 + Math.random() * 4.2,
                        -fwdZ * speed * 0.45 + (Math.random() - 0.5) * 5,
                        0.13 + Math.random() * 0.14,
                        0.5 + Math.random() * 0.5,
                        0.42,
                        0.38,
                        0.32
                    );
                }
            }
        }

        this.dust.update(dt, dx, dy, dz);
        this.gravel.update(dt, dx, dy, dz);
    }

    dispose(): void {
        this.scene.remove(this.dust.points, this.gravel.points);
        this.dust.dispose();
        this.gravel.dispose();
    }
}
