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
import { Stage, DEFAULT_STAGE, type StageDefinition } from './stage';
import { PROFILES, profileFor, scout, type StageCandidate } from './scout/Scout';
import { DEFAULT_DIFFICULTY, difficultyFor, type DifficultyName } from './difficulty';
import { CoDriver, type CoDriverMode } from './codriver/CoDriver';
import { Director } from './director/Director';
import { classify, HttpEndpoint, LocalEndpoint, type Brief, type Endpoint } from './director/Endpoint';
import { parsePatch } from './director/patch';
import { analysePreview, createFeature, phrase, shouldLink, type RoadFeature } from './codriver/PaceNotes';
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
    coDriver?: CoDriverMode;
    chapters?: boolean;
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
    private chaptersWanted = false;
    /**
     * Chooses what the road ahead is like, on a slow cadence. Constructed
     * always and enabled never, by default: it is a director, not a
     * dependency, and everything else works whether it runs or not.
     */
    readonly director: Director;
    /**
     * Set when something that changes how the road is generated has changed.
     * The next teleport regenerates the whole road rather than only the part
     * the ring has pruned — otherwise the ring keeps samples made under the old
     * setting, and the first rewind that does happen silently produces a road
     * different from the one that was driven.
     */
    private worldDirty = false;
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
    private readonly coDriver = new CoDriver();
    private difficultyName: DifficultyName;
    /** The surface the co-driver last called, so a change can be announced. */
    private lastSurface = '';
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
        this.coDriver.setMode(options.coDriver ?? 'text');
        this.director = new Director(this.path);
        this.chaptersWanted = options.chapters ?? false;
        this.path.chapters.enabled = this.chaptersWanted;
        telemetry.previewOffset = this.preview.offset;
        telemetry.previewSeverity = this.preview.severity;
        telemetry.previewCount = this.preview.offset.length;
        telemetry.previewStep = PREVIEW_STEP;
        telemetry.stageName = this.stage.name;
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

    /**
     * Chapters are opt-in and only ever apply to the free drive. They change how
     * long a mile takes, so leaving them on by default would quietly make every
     * recorded mile split incomparable with the last.
     */
    setChaptersEnabled(enabled: boolean): void {
        if (enabled === this.chaptersWanted) return;
        // The director has nothing to steer without chapters.
        if (!enabled && this.director.enabled) this.director.setEnabled(false);
        this.chaptersWanted = enabled;
        this.worldDirty = true;
        if (this.mode === 'stage') return;
        // Restart rather than toggle in place. The sample ring would otherwise
        // hold road generated under two different settings, and regenerating it
        // — which happens whenever the vehicle jumps back past the ring — would
        // produce a different road from the one that was driven. Determinism is
        // the property the timing system rests on, so the setting is applied at
        // a restart or not at all.
        this.restartFree();
    }

    get chaptersEnabled(): boolean {
        return this.chaptersWanted;
    }

    /**
     * Turn the director on or off.
     *
     * On implies chapters on, because the chapter schedule is the director's
     * only lever — running it with chapters off would leave it deciding things
     * that reach nothing. Off leaves chapters exactly as they were, and hands
     * the road ahead back to the procedural schedule.
     */
    setDirectorEnabled(enabled: boolean): void {
        if (enabled && !this.chaptersWanted) this.setChaptersEnabled(true);
        this.director.setEnabled(enabled);
        telemetry.directorStatus = this.director.state;
        telemetry.directorSource = this.director.endpointKind;
        telemetry.directorReason = '';
        publishTelemetry();
    }

    get directorEnabled(): boolean {
        return this.director.enabled;
    }

    /**
     * Point the director at a model, or back at the built-in policy.
     *
     * An empty URL means the local policy. A URL means an Ollama-compatible
     * chat endpoint on a box the player controls; see AI-DIRECTOR §3.2 for why
     * that needs TLS to work from the deployed site.
     */
    setDirectorEndpoint(url: string, model = 'qwen3:8b'): void {
        const trimmed = url.trim();
        const endpoint: Endpoint = trimmed === '' ? new LocalEndpoint() : new HttpEndpoint(trimmed, model.trim() || 'qwen3:8b');
        this.director.setEndpoint(endpoint);
        telemetry.directorSource = this.director.endpointKind;
        publishTelemetry();
    }

    /** Diagnostics: the director's whole state in one object. */
    directorReportForTest(): unknown {
        return this.director.report();
    }

    /**
     * Diagnostics: run the patch validator directly.
     *
     * Exposed because it is the security boundary of the feature, and a
     * boundary tested only through behaviour is a boundary tested by accident.
     */
    validatePatchForTest(raw: unknown): unknown {
        return parsePatch(raw);
    }

    /** Diagnostics: the road itself, for checks about slots and generation. */
    get pathForTest(): RoadPath {
        return this.path;
    }

    /** Diagnostics: how the director reads a window of driving. */
    classifyForTest(brief: unknown): string {
        return classify(brief as Brief);
    }

    /** Diagnostics: a fresh copy of the built-in policy, with its own memory. */
    newLocalPolicyForTest(): LocalEndpoint {
        return new LocalEndpoint();
    }

    /** Chapter label at a distance, for diagnostics and the suite. */
    chapterAtForTest(s: number): unknown {
        const c = this.path.chapters.chapterAt(s);
        const p = this.path.chapters.paramsAt(s);
        return {
            name: c.name,
            label: c.label,
            twistiness: +p.twistiness.toFixed(3),
            gradeScale: +p.gradeScale.toFixed(3),
            widthTarget: +p.widthTarget.toFixed(2),
            fogBias: +p.fogBias.toFixed(3),
            timeOfDay: +p.timeOfDay.toFixed(3),
            grip: +p.grip.toFixed(3),
            drag: +p.drag.toFixed(3),
            surface: this.path.chapters.surfaceAt(s).name
        };
    }

    setCoDriverMode(mode: CoDriverMode): void {
        this.coDriver.setMode(mode);
        if (mode === 'off') {
            telemetry.paceNote = '';
            telemetry.paceNoteAge = 0;
            publishTelemetry();
        }
    }

    get speechAvailable(): boolean {
        return this.coDriver.speechAvailable;
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
        this.director.noteRecovery();
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
        // Switching between chaptered and neutral road changes the generator.
        if (this.path.chapters.enabled) this.worldDirty = true;
        // A stage always runs on neutral road. Chapters would make one run's
        // road different from the next, and the whole point of a stage time is
        // that it is comparable.
        this.path.chapters.enabled = false;
        this.teleportTo(this.stage.start);
        this.stage.arm();
        this.physics.handbrake = true;
        telemetry.mode = 'stage';
        telemetry.stageName = this.stage.name;
        telemetry.stageState = 'armed';
        telemetry.stageElapsed = 0;
        telemetry.stageProgress = 0;
        telemetry.stageRemainingMiles = this.stage.length / 1609.344;
        telemetry.stageBest = this.stage.best;
        telemetry.stageDelta = NaN;
        publishTelemetry();
    }

    /**
     * Rank stretches of road against a named profile. Pure search over the
     * neutral road — no model, no side effects, a couple of milliseconds.
     */
    findStages(profileId: string, limit = 5): StageCandidate[] {
        return scout(this.path, profileFor(profileId), limit);
    }

    get stageProfiles(): readonly { id: string; label: string; blurb: string; lengthMiles: number }[] {
        return PROFILES;
    }

    /** Adopt a scouted stretch as the stage and start it from the line. */
    useStage(definition: StageDefinition): void {
        this.stage.setDefinition(definition);
        telemetry.stageName = definition.name;
        this.restartStage();
    }

    /** Back to the stage that ships with the game. */
    useDefaultStage(): void {
        this.useStage(DEFAULT_STAGE);
    }

    get currentStage(): StageDefinition {
        return { id: this.stage.id, name: this.stage.name, start: this.stage.start, length: this.stage.length };
    }

    restartFree(): void {
        this.mode = 'free';
        // A new drive is a new session as far as the director is concerned.
        this.director.reset();
        if (this.path.chapters.enabled !== this.chaptersWanted) this.worldDirty = true;
        this.path.chapters.enabled = this.chaptersWanted;
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
        this.coDriver.reset();
        this.lastSurface = '';
        // The sample ring prunes behind the vehicle, so jumping back to a
        // distance it has discarded would silently clamp to whatever the oldest
        // live sample happens to be. Regenerate first; it is deterministic, so
        // the stage is the same two miles however far you drove beforehand.
        if (this.worldDirty || s < this.path.minS + 200) {
            this.path.rewind(s);
            this.worldDirty = false;
        }
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
                // Mile markers are the director's commit points.
                this.director.noteMile(split.time, split.delta);
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
        this.sky.update(
            this.physics.odometer,
            this.focus,
            this.path.fogAt(this.physics.s),
            this.path.chapters.paramsAt(this.physics.s).timeOfDay
        );
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

            // The road ahead only needs refreshing at the HUD's rate, and the
            // co-driver reads the same data — a note is a pure function of it.
            this.preview.update(this.physics.s, Math.abs(this.physics.u));

            // Chapter parameters that are not baked into the road itself: the
            // surface under the tires, and where the sun is.
            const chapter = this.path.chapters.paramsAt(this.physics.s);
            this.physics.surfaceGrip = chapter.grip;
            this.physics.surfaceDrag = chapter.drag;
            telemetry.chapter = this.path.chapters.labelAt(this.physics.s);

            const surface = this.path.chapters.surfaceAt(this.physics.s);
            if (surface.name !== this.lastSurface) {
                // Not on the first tick of a drive — announcing "surface dry"
                // the instant you set off is noise.
                if (this.lastSurface !== '') this.coDriver.announce(surface.call);
                this.lastSurface = surface.name;
            }

            // The director runs here, at 10 Hz, and only on the endless drive:
            // the timed stage is neutral road by definition (AI-DIRECTOR §3.3).
            // Note the order — it runs *after* the surface has been read above,
            // so a patch that changes the surface is announced by the ordinary
            // co-driver path when the truck actually reaches the new chapter,
            // rather than at the moment the patch lands a kilometre earlier.
            if (this.driving && this.mode === 'free') {
                const landed = this.director.update(0.1, {
                    s: this.physics.s,
                    miles: this.physics.odometer * M_TO_MILES,
                    speed: Math.abs(this.physics.u),
                    // A rear slip angle this far past the tire's peak is a
                    // slide the driver is fighting, not a cornering attitude.
                    spinning: this.physics.slipAmount > 0.3,
                    offRoad: this.physics.offRoad
                });
                if (landed) {
                    telemetry.directorReason = landed.reason;
                    telemetry.directorPatches = this.director.patchCount;
                }
                telemetry.directorStatus = this.director.state;
                telemetry.directorSource = this.director.endpointKind;
            }

            this.coDriver.update(0.1, this.physics.s, Math.abs(this.physics.u), this.preview);
            telemetry.paceNote = this.coDriver.note;
            telemetry.paceNoteAge = this.coDriver.noteAge;
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

    /**
     * Run the pace-note analysis at an arbitrary distance and return what it
     * found. Used by the suite; the notes are a pure function, so this is the
     * whole of their behaviour.
     */
    paceNotesForTest(s: number, speed = 25): unknown {
        this.preview.update(s, speed);
        const pool: RoadFeature[] = [];
        for (let i = 0; i < 12; i++) pool.push(createFeature());
        const n = analysePreview(
            this.preview.curvature,
            this.preview.rise,
            this.preview.width,
            this.preview.offset.length,
            this.preview.step,
            pool
        );
        const features = [];
        for (let i = 0; i < n; i++) {
            const f = pool[i];
            features.push({
                distance: +f.distance.toFixed(1),
                length: +f.length.toFixed(1),
                direction: f.direction,
                severity: f.severity,
                trend: +f.trend.toFixed(3),
                safeSpeed: +f.safeSpeed.toFixed(1),
                gradient: +f.gradient.toFixed(2),
                narrows: f.narrows,
                phrase: phrase(f, shouldLink(f, i + 1 < n ? pool[i + 1] : null) ? pool[i + 1] : null)
            });
        }
        return features;
    }

    /** Raw preview statistics, for tuning the pace-note thresholds. */
    previewStatsForTest(s: number): unknown {
        this.preview.update(s, 25);
        const rise = this.preview.rise;
        const k = this.preview.curvature;
        let lo = Infinity;
        let hi = -Infinity;
        let kappaMax = 0;
        for (let i = 0; i < rise.length; i++) {
            if (rise[i] < lo) lo = rise[i];
            if (rise[i] > hi) hi = rise[i];
            kappaMax = Math.max(kappaMax, Math.abs(k[i]));
        }
        // Largest turn-over in the elevation profile across a 3-sample reach.
        let maxTurn = 0;
        for (let i = 3; i < rise.length - 3; i++) {
            maxTurn = Math.max(maxTurn, Math.min(rise[i] - rise[i - 3], rise[i] - rise[i + 3]));
        }
        return {
            riseRange: +(hi - lo).toFixed(2),
            maxTurn: +maxTurn.toFixed(2),
            kappaMax: +kappaMax.toFixed(5)
        };
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
        this.coDriver.dispose();
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
