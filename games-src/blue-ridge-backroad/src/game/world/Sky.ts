import {
    BackSide,
    BufferAttribute,
    BufferGeometry,
    Color,
    DirectionalLight,
    Fog,
    HemisphereLight,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    Scene,
    ShaderMaterial,
    Sprite,
    SpriteMaterial,
    SphereGeometry,
    Vector3
} from 'three';
import { fbm1, fbm2 } from '../util/noise';
import { clamp, lerp, smoothstep } from '../util/mathx';
import type { QualityPreset } from '../quality';
import type { Assets } from './Assets';

/**
 * Sky, sun, light, fog and the layered ridge lines that make the Blue Ridge
 * read as the Blue Ridge.
 *
 * Time of day sweeps from early morning to late afternoon and back — a full
 * night cycle would mean minutes of an unplayable black screen, so the sun is
 * clamped to the good hours and the headlights come up in the dim ones.
 */

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float haze;
varying vec3 vDir;
void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // Sky gradient, with a wide warm band hugging the horizon.
    float t = smoothstep(-0.06, 0.55, h);
    vec3 col = mix(horizon, zenith, t);
    col = mix(ground, col, smoothstep(-0.22, 0.02, h));
    // Sun disc and its glow.
    float sd = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * pow(sd, 380.0) * 3.2;
    col += sunColor * pow(sd, 8.0) * 0.32 * haze;
    gl_FragColor = vec4(col, 1.0);
}`;

export interface TimeOfDay {
    /** 0 = deep dawn, 0.5 = midday, 1 = dusk. */
    phase: number;
    /** 0 in full daylight, 1 when the headlights should be on. */
    night: number;
}

export class Sky {
    readonly sun: DirectionalLight;
    readonly hemi: HemisphereLight;
    readonly sunDir = new Vector3(0.4, 0.6, 0.3);
    readonly fogColor = new Color();
    private readonly dome: Mesh;
    private readonly material: ShaderMaterial;
    private readonly ridges: Mesh[] = [];
    private readonly sunSprite: Sprite;
    private readonly owned: { dispose(): void }[] = [];

    /** 0 = deep dawn, 0.5 = midday, 1 = dusk. Exposed for the HUD/debug. */
    phase = 0.31;
    night = 0;

    constructor(
        private readonly scene: Scene,
        assets: Assets,
        private preset: QualityPreset
    ) {
        this.material = new ShaderMaterial({
            uniforms: {
                zenith: { value: new Color(0.18, 0.34, 0.62) },
                horizon: { value: new Color(0.72, 0.78, 0.83) },
                ground: { value: new Color(0.3, 0.31, 0.3) },
                sunDir: { value: this.sunDir },
                sunColor: { value: new Color(1, 0.92, 0.78) },
                haze: { value: 1 }
            },
            vertexShader: SKY_VERT,
            fragmentShader: SKY_FRAG,
            side: BackSide,
            depthWrite: false,
            fog: false
        });
        const domeGeo = new SphereGeometry(1800, 24, 16);
        this.dome = new Mesh(domeGeo, this.material);
        this.dome.frustumCulled = false;
        this.dome.renderOrder = -10;
        scene.add(this.dome);
        this.owned.push(domeGeo, this.material);

        this.sun = new DirectionalLight(0xfff0dd, 2.6);
        this.sun.castShadow = preset.shadows;
        this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
        this.sun.shadow.bias = -0.0006;
        this.sun.shadow.normalBias = 0.035;
        const cam = this.sun.shadow.camera;
        cam.near = 1;
        cam.far = preset.shadowDistance * 3;
        cam.left = -preset.shadowDistance * 0.55;
        cam.right = preset.shadowDistance * 0.55;
        cam.top = preset.shadowDistance * 0.55;
        cam.bottom = -preset.shadowDistance * 0.55;
        cam.updateProjectionMatrix();
        scene.add(this.sun);
        scene.add(this.sun.target);

        this.hemi = new HemisphereLight(0xbcd4ee, 0x3d3a2c, 1.15);
        scene.add(this.hemi);

        scene.fog = new Fog(0xa9b7c2, 60, preset.fogFar);

        // Sun glare sprite — cheaper and VR-safe compared with a bloom pass.
        const glareMat = new SpriteMaterial({
            map: assets.glareSprite,
            color: new Color(1, 0.9, 0.72),
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            depthTest: false
        });
        this.sunSprite = new Sprite(glareMat);
        this.sunSprite.scale.setScalar(260);
        this.sunSprite.renderOrder = -9;
        scene.add(this.sunSprite);
        this.owned.push(glareMat);

        this.buildRidges(preset.mountainLayers);
    }

    /** Layered ridge silhouettes, camera-locked in XZ so they never get closer. */
    private buildRidges(layers: number): void {
        for (let layer = 0; layer < layers; layer++) {
            const radius = 900 + layer * 340;
            const segs = 128;
            const height = 200 + layer * 130;
            const positions = new Float32Array(segs * 2 * 3 + 6);
            const colors = new Float32Array(segs * 2 * 3 + 6);
            const indices: number[] = [];
            const base = -40 - layer * 10;
            for (let i = 0; i <= segs; i++) {
                const a = (i / segs) * Math.PI * 2;
                const ridge =
                    0.34 +
                    0.5 * fbm1(i * 0.11 + layer * 31.7, 3, 900 + layer) * 0.5 +
                    0.35 * fbm2(i * 0.035, layer * 3.3, 3, 17);
                const h = base + height * clamp(ridge, 0.08, 1.35);
                const x = Math.sin(a) * radius;
                const z = Math.cos(a) * radius;
                const o = i * 6;
                positions[o] = x;
                positions[o + 1] = base;
                positions[o + 2] = z;
                positions[o + 3] = x;
                positions[o + 4] = h;
                positions[o + 5] = z;
                // Further layers are hazier and bluer — the whole point of the range.
                const haze = 0.42 + layer * 0.19;
                const top = 0.5 + layer * 0.16;
                colors[o] = haze * 0.82;
                colors[o + 1] = haze * 0.88;
                colors[o + 2] = haze;
                colors[o + 3] = top * 0.84;
                colors[o + 4] = top * 0.9;
                colors[o + 5] = top * 1.02;
                if (i < segs) {
                    const a0 = i * 2;
                    indices.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
                }
            }
            const geo = new BufferGeometry();
            geo.setAttribute('position', new BufferAttribute(positions, 3));
            geo.setAttribute('color', new BufferAttribute(colors, 3));
            geo.setIndex(indices);
            const mat = new MeshBasicMaterial({ vertexColors: true, fog: false, side: BackSide });
            const mesh = new Mesh(geo, mat);
            mesh.frustumCulled = false;
            mesh.renderOrder = -8 + layer;
            this.scene.add(mesh);
            this.ridges.push(mesh);
            this.owned.push(geo, mat);
        }
    }

    setPreset(preset: QualityPreset): void {
        this.preset = preset;
        this.sun.castShadow = preset.shadows;
        this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
        const cam = this.sun.shadow.camera;
        cam.far = preset.shadowDistance * 3;
        cam.left = -preset.shadowDistance * 0.55;
        cam.right = preset.shadowDistance * 0.55;
        cam.top = preset.shadowDistance * 0.55;
        cam.bottom = -preset.shadowDistance * 0.55;
        cam.updateProjectionMatrix();
        if (this.sun.shadow.map) {
            this.sun.shadow.map.dispose();
            this.sun.shadow.map = null;
        }
        (this.scene.fog as Fog).far = preset.fogFar;
    }

    /**
     * `distance` is the odometer in metres: the day advances as you drive, which
     * ties the passage of time to exploring rather than to sitting still.
     */
    update(distance: number, focus: Vector3, fogBoost: number): void {
        // The day rocks back and forth over roughly 13 km of driving, starting
        // in bright mid-morning. A sine rather than a sawtooth means there is no
        // discontinuity when it wraps, and the ends of the range are golden
        // hour rather than darkness — see the class comment.
        const t = 0.5 + 0.42 * Math.sin((distance / 13000) * Math.PI * 2 - Math.PI * 0.36);
        this.phase = t;
        const elev = lerp(0.03, 0.92, Math.sin(t * Math.PI));
        const azim = lerp(-2.3, 1.1, t);
        this.sunDir.set(Math.sin(azim) * Math.cos(elev * 1.4), Math.sin(elev * 1.5), Math.cos(azim) * Math.cos(elev * 1.4)).normalize();

        const low = 1 - smoothstep(0.06, 0.42, this.sunDir.y);
        // Headlights only come up in the last of the light, never mid-day.
        this.night = clamp(low * 0.9, 0, 1);

        // Colours: warm and low-contrast at the ends of the day, cool at noon.
        const warm = low;
        const zen = this.material.uniforms.zenith.value as Color;
        const hor = this.material.uniforms.horizon.value as Color;
        const grd = this.material.uniforms.ground.value as Color;
        const sunCol = this.material.uniforms.sunColor.value as Color;
        zen.setRGB(lerp(0.14, 0.09, warm), lerp(0.31, 0.16, warm), lerp(0.6, 0.32, warm));
        hor.setRGB(lerp(0.66, 0.86, warm), lerp(0.73, 0.6, warm), lerp(0.8, 0.46, warm));
        grd.setRGB(lerp(0.24, 0.16, warm), lerp(0.26, 0.15, warm), lerp(0.26, 0.15, warm));
        sunCol.setRGB(1, lerp(0.94, 0.72, warm), lerp(0.84, 0.44, warm));
        this.material.uniforms.haze.value = 0.6 + warm * 1.4;

        this.sun.color.setRGB(1, lerp(0.95, 0.76, warm), lerp(0.88, 0.55, warm));
        this.sun.intensity = lerp(3.5, 1.5, warm);
        this.hemi.intensity = lerp(1.25, 0.95, warm);
        this.hemi.color.setRGB(lerp(0.72, 0.5, warm), lerp(0.82, 0.55, warm), lerp(0.95, 0.62, warm));

        // Fog: hazier low in the day, and much thicker inside a foggy hollow.
        const fog = this.scene.fog as Fog;
        this.fogColor.setRGB(
            lerp(0.66, 0.74, warm) * lerp(1, 0.86, fogBoost),
            lerp(0.72, 0.66, warm) * lerp(1, 0.88, fogBoost),
            lerp(0.78, 0.62, warm) * lerp(1, 0.9, fogBoost)
        );
        fog.color.copy(this.fogColor);
        fog.near = lerp(45, 6, fogBoost);
        fog.far = lerp(this.preset.fogFar * lerp(1, 0.78, warm), 95, fogBoost);

        // Keep the dome, ridges and sun sprite centred on the player.
        this.dome.position.set(focus.x, focus.y, focus.z);
        for (const r of this.ridges) r.position.set(focus.x, focus.y - 30, focus.z);
        this.sunSprite.position
            .copy(this.sunDir)
            .multiplyScalar(1500)
            .add(focus);
        (this.sunSprite.material as SpriteMaterial).color.copy(sunCol);
        (this.sunSprite.material as SpriteMaterial).opacity = lerp(0.32, 0.6, warm);

        // Bound the shadow camera to the vehicle, snapped to texel increments so
        // shadows do not crawl while driving.
        const d = this.preset.shadowDistance;
        const texel = (d * 1.1) / this.preset.shadowMapSize;
        const sx = Math.round(focus.x / texel) * texel;
        const sz = Math.round(focus.z / texel) * texel;
        this.sun.target.position.set(sx, focus.y, sz);
        this.sun.position.set(
            sx + this.sunDir.x * d * 1.6,
            focus.y + this.sunDir.y * d * 1.6 + 30,
            sz + this.sunDir.z * d * 1.6
        );
        this.sun.target.updateMatrixWorld();
    }

    attach(target: Object3D): void {
        void target;
    }

    dispose(): void {
        this.scene.remove(this.dome, this.sun, this.sun.target, this.hemi, this.sunSprite);
        for (const r of this.ridges) this.scene.remove(r);
        this.ridges.length = 0;
        for (const o of this.owned) o.dispose();
        this.owned.length = 0;
        this.scene.fog = null;
    }
}
