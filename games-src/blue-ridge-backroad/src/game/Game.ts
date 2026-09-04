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
import { CoursePreview, PREVIEW_STEP } from './road/CoursePreview';
import { SplitTimer } from './splits';
import { Stage, STAGE_LENGTH, STAGE_NAME, STAGE_START_S } from './stage';
import { DEFAULT_DIFFICULTY, difficultyFor, type DifficultyName } from './difficulty';
import { bindKeyboard, createInputState, type InputState, type KeyboardBinding } from './input';
import { telemetry, publishTelemetry } from '../ui/telemetry';
import { MPS_TO_MPH, M_TO_MILES, clamp } from './util/mathx';

/**
 * Owns the renderer, the scene and the frame loop. React constructs one of
 * these and otherwise stays out of the way.
 */

const MAX_FRAME_DT = 0.1; // a tab that was backgrounded must not teleport
const REBASE_DISTANCE = 1200; // metres before instance matrices are re-origined

export type GameMode = 'free' | 'stage';

const FREE_START_S = 420;

export interface GameOptions {
    canvas: HTMLCanvasElement;
    quality: QualityName;
    seed?: number;
    steerSensitivity?: number;
    difficulty?: DifficultyName;
    /**
     * Keeps the drawing buffer readable after compositing, so tests can sample
     * what was actually rendered. Off in normal play — it costs a copy per
     * frame — and only ever set by the debug flag.
     */
    preserveDrawingBuffer?: boolean;
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
    private readonly preview: CoursePreview;
    private readonly splits: SplitTimer;
    private readonly stage: Stage;
    private difficultyName: DifficultyName;
    private mode: GameMode = 'free';

    constructor(options: GameOptions) {
        this.options = options;
        this.qualityName = options.quality;
        this.preset = PRESETS[options.quality];

        this.renderer = new WebGLRenderer({
            canvas: options.canvas,
            antialias: this.preset.name === 'high',
            powerPreference: 'high-performance',
            stencil: false,
            preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatioCap));
        this.renderer.outputColorSpace = SRGBColorSpace;
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = this.preset.shadows;
        this.renderer.shadowMap.type = PCFSoftShadowMap;

        this.difficultyName = options.difficulty ?? DEFAULT_DIFFICULTY;
        this.splits = new SplitTimer(this.difficultyName);
        this.stage = new Stage(this.difficultyName);
        this.path = new RoadPath(options.seed ?? 20260904);
        this.assets = new Assets(this.preset, this.renderer.capabilities.getMaxAnisotropy());
        this.vegetation = new Vegetation(this.scene, this.assets, this.preset.chunksAhead + this.preset.chunksBehind + 4);
        this.chunks = new ChunkManager(this.scene, this.path, this.assets, this.vegetation, this.preset);
        this.sky = new Sky(this.scene, this.assets, this.preset);
        this.physics = new VehiclePhysics(this.path);
        this.model = new VehicleModel(this.assets);
        this.scene.add(this.model.root);
        this.particles = new Particles(this.scene, this.assets, this.preset);
        this.rig = new CameraRig(this.aspect);
        this.preview = new CoursePreview(this.path);
        this.keys = bindKeyboard(this.input);
        this.physics.steerSensitivity = options.steerSensitivity ?? 1;
        this.physics.difficulty = difficultyFor(this.difficultyName);
        telemetry.difficulty = this.physics.difficulty.label;
        telemetry.previewOffset = this.preview.offset;
        telemetry.previewSeverity = this.preview.severity;
        telemetry.previewCount = this.preview.offset.length;
        telemetry.previewStep = PREVIEW_STEP;
        telemetry.stageName = STAGE_NAME;
        telemetry.stageBest = this.stage.best;

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
        this.splits.reset();
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

        this.assets = new Assets(this.preset, this.renderer.capabilities.getMaxAnisotropy());
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

    setSteerSensitivity(value: number): void {
        this.physics.steerSensitivity = value;
    }

    get currentDifficulty(): DifficultyName {
        return this.difficultyName;
    }

    /**
     * Change how forgiving the truck is. Records are kept per difficulty, so
     * the timers swap to that level's bests rather than comparing an Expert run
     * against an Easy one.
     */
    setDifficulty(name: DifficultyName): void {
        this.difficultyName = name;
        this.physics.difficulty = difficultyFor(name);
        this.splits.setDifficulty(name);
        this.stage.setDifficulty(name);
        telemetry.difficulty = this.physics.difficulty.label;
        telemetry.stageBest = this.stage.best;
        telemetry.mileBest = this.splits.currentMileBest;
        publishTelemetry();
    }

    /**
     * Put the truck back on the road. Whatever is being timed — the mile on the
     * endless drive, or the stage run — is marked assisted, so a recovery can
     * never buy a personal best.
     */
    recover(): void {
        this.physics.recover();
        this.splits.invalidate();
        this.stage.invalidate();
        telemetry.stuck = false;
        publishTelemetry();
    }

    get currentMode(): GameMode {
        return this.mode;
    }

    setMode(mode: GameMode): void {
        if (mode === this.mode) return;
        this.mode = mode;
        if (mode === 'stage') this.restartStage();
        else this.restartFree();
    }

    /** Back to the start line, clock stopped, world identical to last time. */
    restartStage(): void {
        this.mode = 'stage';
        this.teleportTo(STAGE_START_S);
        this.stage.arm();
        this.physics.handbrake = true;
        telemetry.mode = 'stage';
        telemetry.stageState = 'armed';
        telemetry.stageElapsed = 0;
        telemetry.stageProgress = 0;
        telemetry.stageRemainingMiles = STAGE_LENGTH / 1609.344;
        telemetry.stageBest = this.stage.best;
        telemetry.stageDelta = NaN;
        publishTelemetry();
    }

    restartFree(): void {
        this.mode = 'free';
        this.teleportTo(FREE_START_S);
        this.physics.handbrake = false;
        telemetry.mode = 'free';
        publishTelemetry();
    }

    /**
     * Move the truck to a distance along the road and rebuild the world around
     * it. Chunks are primed synchronously: a restart is a deliberate cut, and
     * streaming them in one per frame afterwards would show the road being
     * built under the player.
     */
    private teleportTo(s: number): void {
        // The sample ring prunes behind the vehicle, so jumping back to a
        // distance it has discarded would silently clamp to whatever the oldest
        // live sample happens to be. Regenerate first; it is deterministic, so
        // the stage is the same two miles however far you drove beforehand.
        if (s < this.path.minS + 200) this.path.rewind(s);
        this.physics.reset(s);
        this.splits.reset();
        this.lastEventChunk = Number.NaN;
        this.vegetation.rebase(this.physics.position.x, 0, this.physics.position.z);
        this.rebaseAnchor.copy(this.physics.position);
        this.chunks.primeAround(this.physics.s);
        this.accumulator = 0;
        this.clockLast = performance.now();
        // Snap rather than sweep the camera across the world.
        this.rig.set(this.rig.mode);
    }

    clearStageBest(): void {
        this.stage.forgetBest();
        telemetry.stageBest = 0;
        publishTelemetry();
    }

    clearBestTimes(): void {
        this.splits.forgetBests();
        this.stage.forgetBest();
        telemetry.mileBest = 0;
        telemetry.stageBest = 0;
        publishTelemetry();
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
        if (this.input.recoverRequested) {
            this.input.recoverRequested = false;
            if (this.driving) this.recover();
        }
        if (this.input.restartRequested) {
            this.input.restartRequested = false;
            // Enter restarts the stage, and does nothing on the endless drive —
            // there is nothing there to restart.
            if (this.driving && this.mode === 'stage') this.restartStage();
        }

        if (this.driving) {
            this.stepPhysics(dt);
            this.chunks.update(this.physics.s, 1);
            this.model.sync(this.physics, dt, this.sky.night);
            this.model.setCockpitView(this.rig.mode === 'cockpit');
            this.particles.update(dt, this.physics, this.model);
            this.rig.update(dt, this.physics, this.model);
            this.focus.copy(this.physics.position);
            this.audio.update(dt, this.physics);
            this.checkDiscovery();
            if (this.mode === 'stage') {
                this.stage.update(dt, this.physics.s, this.physics.throttle);
                // Held on the line until the driver asks to go.
                this.physics.handbrake = this.stage.state === 'armed';
            } else {
                this.physics.handbrake = false;
            }
            const split = this.splits.update(dt, this.physics.odometer);
            if (split.completedMile >= 0) {
                telemetry.lastSplitMile = split.completedMile;
                telemetry.lastSplitTime = split.time;
                telemetry.lastSplitDelta = split.delta;
                telemetry.lastSplitIsBest = split.isBest;
                telemetry.splitFlash = 5;
            }
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
        this.sky.update(this.physics.odometer, this.focus, this.path.fogAt(this.physics.s));
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
            telemetry.splitFlash = Math.max(0, telemetry.splitFlash - 0.1);
            telemetry.stuck = this.physics.stuckTime > 1.4;

            // The road ahead only needs refreshing at the HUD's rate.
            this.preview.update(this.physics.s, Math.abs(this.physics.u));
            telemetry.advisoryMph = this.preview.advisorySpeed * MPS_TO_MPH;
            telemetry.braking = this.preview.braking && this.driving;
            telemetry.advisoryCurvature = this.preview.advisoryCurvature;
            telemetry.advisoryDistance = this.preview.advisoryDistance;

            telemetry.mode = this.mode;
            telemetry.stageState = this.stage.state;
            telemetry.stageElapsed = this.stage.elapsed;
            telemetry.stageProgress = this.stage.progress;
            telemetry.stageRemainingMiles = this.stage.distanceRemaining / 1609.344;
            telemetry.stageBest = this.stage.best;
            telemetry.stageDelta = this.stage.delta;
            telemetry.stageAssisted = this.stage.assisted;
            telemetry.stageResultTime = this.stage.resultTime;
            telemetry.stageResultDelta = this.stage.resultDelta;
            telemetry.stageResultIsBest = this.stage.resultIsBest;

            telemetry.mile = this.splits.currentMile;
            telemetry.mileTime = this.splits.currentMileTime;
            telemetry.mileBest = this.splits.currentMileBest;
            telemetry.mileDirty = this.splits.currentMileDirty;
            telemetry.totalTime = this.splits.elapsed;
            publishTelemetry();
        }
    }

    /** Diagnostics: hide the dust and gravel, to isolate what they contribute. */
    setDustEnabled(enabled: boolean): void {
        this.particles.setVisible(enabled);
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

    /** The live camera, for diagnostics and the automated checks. */
    get cameraForTest(): unknown {
        return this.rig.camera;
    }

    /** The scene, so diagnostics can raycast what a camera is looking at. */
    get sceneForTest(): unknown {
        return this.scene;
    }

    get roadMinS(): number {
        return this.path.minS;
    }

    /** Live fog distance and texture filtering, for the suite. */
    get fogFarForTest(): number {
        const fog = this.scene.fog as { far?: number } | null;
        return fog && typeof fog.far === 'number' ? fog.far : 0;
    }

    get anisotropyForTest(): number {
        return this.assets.gravel.map.anisotropy;
    }

    /** Fog density from the schedule at a distance, for the suite. */
    fogAtForTest(s: number): number {
        return this.path.fogAt(s);
    }

    /** Carriageway width at a distance, for diagnostics and the suite. */
    roadWidthAt(s: number): number {
        this.path.sample(s, this.probeFrame);
        return this.probeFrame.width;
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
