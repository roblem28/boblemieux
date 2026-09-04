import {
    ACESFilmicToneMapping,
    PCFSoftShadowMap,
    Scene,
    SRGBColorSpace,
    Vector3,
    WebGLRenderer
} from 'three';
import { RoadPath, EVENT_NAMES, EVENT_NONE, createFrame } from './road/RoadPath';
import { CHUNK_LEN } from './road/ChunkGeometry';
import { Assets } from './world/Assets';
import { Vegetation } from './world/Vegetation';
import { ChunkManager } from './world/ChunkManager';
import { Sky } from './world/Sky';
import { VehiclePhysics } from './vehicle/VehiclePhysics';
import { VehicleModel } from './vehicle/VehicleModel';
import { CameraRig, CAMERA_LABELS, type CameraMode } from './camera/CameraRig';
import { Particles } from './fx/Particles';
import { AudioEngine } from './audio/AudioEngine';
import { PRESETS, type QualityName, type QualityPreset } from './quality';
import { bindKeyboard, createInputState, type InputState, type KeyboardBinding } from './input';
import { telemetry, publishTelemetry } from '../ui/telemetry';
import { MPS_TO_MPH, M_TO_MILES, clamp } from './util/mathx';

/**
 * Owns the renderer, the scene and the frame loop. React constructs one of
 * these and otherwise stays out of the way.
 */

const MAX_FRAME_DT = 0.1; // a tab that was backgrounded must not teleport
const REBASE_DISTANCE = 1200; // metres before instance matrices are re-origined

export interface GameOptions {
    canvas: HTMLCanvasElement;
    quality: QualityName;
    seed?: number;
    onCameraChange?: (mode: CameraMode) => void;
    onDiscovery?: (name: string) => void;
}

export class Game {
    readonly input: InputState = createInputState();
    readonly audio = new AudioEngine();
    readonly physics: VehiclePhysics;

    private readonly renderer: WebGLRenderer;
    private readonly scene = new Scene();
    private readonly path: RoadPath;
    private assets: Assets;
    private vegetation: Vegetation;
    private chunks: ChunkManager;
    private sky: Sky;
    private model: VehicleModel;
    private particles: Particles;
    private readonly rig: CameraRig;
    private readonly keys: KeyboardBinding;

    private preset: QualityPreset;
    private qualityName: QualityName;
    private accumulator = 0;
    private clockLast = 0;
    private elapsed = 0;
    private running = false;
    private driving = false;
    private disposed = false;
    /**
     * The automated suite turns rendering off while it simulates minutes of
     * driving: headless Chromium runs on SwiftShader, where a full render is
     * thousands of times slower than the physics step it is verifying.
     */
    private renderEnabled = true;
    private contextLost = false;

    private fpsAccum = 0;
    private fpsFrames = 0;
    private publishTimer = 0;
    private lastEventChunk = Number.NaN;
    private readonly focus = new Vector3();
    private readonly rebaseAnchor = new Vector3();
    private readonly options: GameOptions;
    private readonly probeFrame = createFrame();

    constructor(options: GameOptions) {
        this.options = options;
        this.qualityName = options.quality;
        this.preset = PRESETS[options.quality];

        this.renderer = new WebGLRenderer({
            canvas: options.canvas,
            antialias: this.preset.name === 'high',
            powerPreference: 'high-performance',
            stencil: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatioCap));
        this.renderer.outputColorSpace = SRGBColorSpace;
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = this.preset.shadows;
        this.renderer.shadowMap.type = PCFSoftShadowMap;

        this.path = new RoadPath(options.seed ?? 20260904);
        this.assets = new Assets(this.preset);
        this.vegetation = new Vegetation(this.scene, this.assets, this.preset.chunksAhead + this.preset.chunksBehind + 4);
        this.chunks = new ChunkManager(this.scene, this.path, this.assets, this.vegetation, this.preset);
        this.sky = new Sky(this.scene, this.assets, this.preset);
        this.physics = new VehiclePhysics(this.path);
        this.model = new VehicleModel(this.assets);
        this.scene.add(this.model.root);
        this.particles = new Particles(this.scene, this.assets, this.preset);
        this.rig = new CameraRig(this.aspect);
        this.keys = bindKeyboard(this.input);

        // Well clear of s = 0: RoadPath clamps below its start, so a chunk built
        // there would collapse every row onto the same frame - a zero-area road
        // with all of its trees stacked on one point. Reversing from the spawn
        // reaches s = 0 in a few seconds.
        this.physics.reset(420);
        this.vegetation.rebase(this.physics.position.x, 0, this.physics.position.z);
        this.rebaseAnchor.copy(this.physics.position);
        this.chunks.primeAround(this.physics.s);
        this.resize();

        telemetry.quality = this.preset.label;
        telemetry.camera = CAMERA_LABELS[this.rig.mode];

        window.addEventListener('resize', this.onResize);
        window.addEventListener('orientationchange', this.onResize);
        document.addEventListener('visibilitychange', this.onVisibility);
        window.addEventListener('blur', this.onBlur);
        // Losing the GL context is routine on mobile (backgrounding, memory
        // pressure). Without these the canvas goes black for good and the
        // renderer warns on every frame.
        options.canvas.addEventListener('webglcontextlost', this.onContextLost);
        options.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    }

    private get aspect(): number {
        const c = this.options.canvas;
        return (c.clientWidth || 1) / (c.clientHeight || 1);
    }

    // ------------------------------------------------------------ lifecycle

    /**
     * Starts the frame loop. Used for the cinematic title camera, and to
     * restart the loop after `stopLoop()`. It deliberately does *not* touch
     * `driving`: doing so meant that restarting the loop after a stop silently
     * cancelled driving, which is exactly the state the test harness puts the
     * game in.
     */
    startPreview(): void {
        if (this.running) return;
        this.running = true;
        this.clockLast = performance.now();
        this.renderer.setAnimationLoop(this.frame);
    }

    /** Called from the START ENGINE click: unlocks audio and hands over control. */
    startDriving(): void {
        if (!this.running) this.startPreview();
        this.driving = true;
        this.accumulator = 0;
        this.clockLast = performance.now();
        this.rig.set('chase');
        this.options.onCameraChange?.(this.rig.mode);
        this.audio.start();
    }

    setQuality(name: QualityName): void {
        if (name === this.qualityName) return;
        this.qualityName = name;
        this.preset = PRESETS[name];

        // Rebuild everything that bakes preset values in. Cheap enough to do
        // live — a couple of hundred milliseconds — and far simpler than trying
        // to mutate texture sizes and pool capacities in place.
        this.chunks.dispose();
        this.vegetation.dispose();
        this.sky.dispose();
        this.scene.remove(this.model.root);
        this.model.dispose();
        this.assets.dispose();

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatioCap));
        this.renderer.shadowMap.enabled = this.preset.shadows;

        this.assets = new Assets(this.preset);
        this.vegetation = new Vegetation(
            this.scene,
            this.assets,
            this.preset.chunksAhead + this.preset.chunksBehind + 4
        );
        this.chunks = new ChunkManager(this.scene, this.path, this.assets, this.vegetation, this.preset);
        this.sky = new Sky(this.scene, this.assets, this.preset);
        this.model = new VehicleModel(this.assets);
        this.scene.add(this.model.root);
        this.particles.dispose();
        this.particles = new Particles(this.scene, this.assets, this.preset);

        this.vegetation.rebase(this.physics.position.x, 0, this.physics.position.z);
        this.rebaseAnchor.copy(this.physics.position);
        this.chunks.primeAround(this.physics.s);
        telemetry.quality = this.preset.label;
        publishTelemetry();
    }

    cycleCamera(): CameraMode {
        const mode = this.rig.cycle();
        telemetry.camera = CAMERA_LABELS[mode];
        publishTelemetry();
        this.options.onCameraChange?.(mode);
        return mode;
    }

    setMuted(muted: boolean): void {
        this.audio.setMuted(muted);
    }

    // ---------------------------------------------------------------- frame

    private frame = (now: number): void => {
        if (this.disposed) return;
        let dt = (now - this.clockLast) / 1000;
        this.clockLast = now;
        if (!Number.isFinite(dt) || dt < 0) dt = 0;
        this.tick(Math.min(dt, MAX_FRAME_DT));
    };

    /**
     * One frame with an explicit delta. The animation loop calls this with a
     * measured delta; the test harness calls it directly with a fixed one, so
     * "simulated seconds" mean exactly that and do not depend on wall clock.
     */
    tick(dt: number): void {
        if (this.disposed) return;
        this.elapsed += dt;

        if (this.input.cycleCameraRequested) {
            this.input.cycleCameraRequested = false;
            if (this.driving) this.cycleCamera();
        }

        if (this.driving) {
            this.stepPhysics(dt);
            this.chunks.update(this.physics.s, 1);
            this.model.sync(this.physics, dt, this.sky.night);
            this.particles.update(dt, this.physics, this.model);
            this.rig.update(dt, this.physics, this.model);
            this.focus.copy(this.physics.position);
            this.audio.update(dt, this.physics);
            this.checkDiscovery();
        } else {
            this.rig.cinematic(this.elapsed, this.model.root);
            this.model.sync(this.physics, dt, this.sky.night);
            this.focus.copy(this.physics.position);
            this.chunks.update(this.physics.s, 1);
        }

        // Keep instance matrices near their local origin.
        if (this.focus.distanceToSquared(this.rebaseAnchor) > REBASE_DISTANCE * REBASE_DISTANCE) {
            this.vegetation.rebase(this.focus.x, 0, this.focus.z);
            this.rebaseAnchor.copy(this.focus);
        }

        this.chunks.updateEvents(this.elapsed, this.rig.camera.position);
        this.sky.update(this.physics.odometer, this.focus, this.chunks.fogBoost);
        if (this.renderEnabled && !this.contextLost) this.renderer.render(this.scene, this.rig.camera);

        this.fpsAccum += dt;
        this.fpsFrames += 1;
        this.publishTimer += dt;
        if (this.publishTimer >= 0.1) {
            this.publishTimer = 0;
            if (this.fpsAccum > 0.45) {
                telemetry.fps = Math.round(this.fpsFrames / this.fpsAccum);
                this.fpsAccum = 0;
                this.fpsFrames = 0;
            }
            telemetry.mph = Math.abs(this.physics.u) * MPS_TO_MPH;
            telemetry.miles = this.physics.odometer * M_TO_MILES;
            telemetry.rpm = this.physics.rpm;
            telemetry.gear = this.physics.gear + 1;
            telemetry.offRoad = this.physics.offRoad;
            telemetry.discoveryAge = Math.max(0, telemetry.discoveryAge - 0.1);
            publishTelemetry();
        }
    }

    /** Simulate without drawing. Only the test harness ever turns this off. */
    setRenderEnabled(enabled: boolean): void {
        this.renderEnabled = enabled;
    }

    /** Hands time back to the caller — used by the automated test harness. */
    stopLoop(): void {
        this.renderer.setAnimationLoop(null);
        this.running = false;
    }

    /** True once START ENGINE (or ?drive) has handed over control. */
    get isDriving(): boolean {
        return this.driving;
    }

    get cameraMode(): CameraMode {
        return this.rig.mode;
    }

    get quality(): QualityName {
        return this.qualityName;
    }

    get presetValues(): QualityPreset {
        return this.preset;
    }

    get sceneObjectCount(): number {
        return this.scene.children.length;
    }

    /**
     * Road centreline state at an arbitrary distance. Exposed so the automated
     * suite can drive with a look-ahead controller instead of a crude
     * lateral-error one — otherwise the tests measure the test's driving skill
     * rather than the game's handling.
     */
    roadPointAt(s: number): { x: number; y: number; z: number; heading: number; curvature: number } {
        this.path.sample(s, this.probeFrame);
        const f = this.probeFrame;
        return { x: f.pos.x, y: f.pos.y, z: f.pos.z, heading: f.heading, curvature: f.curvature };
    }

    /** Live chunks, for the automated suite to inspect streaming and events. */
    get chunksForTest(): unknown[] {
        return [...this.chunks.liveChunks];
    }

    private stepPhysics(dt: number): void {
        const step = this.preset.name === 'mobile' ? 1 / 60 : 1 / 120;
        this.accumulator += dt;
        let steps = 0;
        const maxSteps = 8;
        while (this.accumulator >= step && steps < maxSteps) {
            this.physics.step(step, this.input, this.chunks);
            this.accumulator -= step;
            steps += 1;
        }
        // If the device cannot keep up, drop the backlog rather than running the
        // simulation in slow motion for the next few seconds.
        if (steps === maxSteps) this.accumulator = 0;
    }

    private checkDiscovery(): void {
        const index = Math.floor(this.physics.s / CHUNK_LEN);
        if (index === this.lastEventChunk) return;
        this.lastEventChunk = index;
        for (const chunk of this.chunks.liveChunks) {
            if (chunk.index !== index || chunk.eventKind === EVENT_NONE) continue;
            const name = EVENT_NAMES[chunk.eventKind] ?? '';
            if (!name) return;
            telemetry.discovery = name;
            telemetry.discoveryAge = 4;
            publishTelemetry();
            this.options.onDiscovery?.(name);
            return;
        }
    }

    // --------------------------------------------------------------- events

    private onResize = (): void => this.resize();

    private onVisibility = (): void => {
        if (document.hidden) {
            this.resetHeldInput();
            this.audio.suspend();
        } else {
            // Anything that elapsed while hidden is discarded, not simulated.
            this.clockLast = performance.now();
            this.accumulator = 0;
            if (this.driving) this.audio.resume();
        }
    };

    private onBlur = (): void => this.resetHeldInput();

    private onContextLost = (e: Event): void => {
        // Preventing the default is what lets the browser restore it at all.
        e.preventDefault();
        this.contextLost = true;
        this.resetHeldInput();
        this.audio.suspend();
    };

    private onContextRestored = (): void => {
        this.contextLost = false;
        this.clockLast = performance.now();
        this.accumulator = 0;
        this.renderer.shadowMap.needsUpdate = true;
        this.resize();
        if (this.driving) this.audio.resume();
    };

    private resetHeldInput(): void {
        const i = this.input;
        i.keyThrottle = false;
        i.keyBrake = false;
        i.keyLeft = false;
        i.keyRight = false;
        i.touchThrottle = false;
        i.touchBrake = false;
        i.touchLeft = false;
        i.touchRight = false;
    }

    resize(): void {
        const canvas = this.options.canvas;
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatioCap));
        this.renderer.setSize(w, h, false);
        this.rig.resize(clamp(w / Math.max(h, 1), 0.3, 4));
    }

    get drawCalls(): number {
        return this.renderer.info.render.calls;
    }

    get triangles(): number {
        return this.renderer.info.render.triangles;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.renderer.setAnimationLoop(null);
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('orientationchange', this.onResize);
        document.removeEventListener('visibilitychange', this.onVisibility);
        window.removeEventListener('blur', this.onBlur);
        this.options.canvas.removeEventListener('webglcontextlost', this.onContextLost);
        this.options.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
        this.keys.dispose();
        this.audio.dispose();
        this.particles.dispose();
        this.chunks.dispose();
        this.vegetation.dispose();
        this.sky.dispose();
        this.scene.remove(this.model.root);
        this.model.dispose();
        this.assets.dispose();
        this.renderer.dispose();
    }
}
