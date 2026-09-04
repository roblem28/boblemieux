import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Game, type GameMode } from './game/Game';
import { detectQuality, initialQuality, saveQualityOverride, type QualityName } from './game/quality';
import { loadSteerLevel, multiplierFor, saveSteerLevel, type SteerLevel } from './game/steering';
import { loadDifficulty, saveDifficulty, type DifficultyName } from './game/difficulty';
import { TitleScreen } from './ui/TitleScreen';
import { Hud } from './ui/Hud';
import { TouchControls } from './ui/TouchControls';
import { SettingsPanel } from './ui/SettingsPanel';
import { telemetry, publishTelemetry } from './ui/telemetry';
import { formatTime } from './game/splits';

type Screen = 'title' | 'driving';

const isTouchDevice = (): boolean =>
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);

export const App = (): JSX.Element => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const gameRef = useRef<Game | null>(null);
    const [screen, setScreen] = useState<Screen>('title');
    const [ready, setReady] = useState(false);
    const [muted, setMuted] = useState(false);
    const [showFps, setShowFps] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [quality, setQuality] = useState<QualityName>(() => initialQuality());
    const [steering, setSteering] = useState<SteerLevel>(() => loadSteerLevel());
    const [mode, setMode] = useState<GameMode>('free');
    const [difficulty, setDifficulty] = useState<DifficultyName>(() => loadDifficulty());
    const [stageBest, setStageBest] = useState(0);
    const [detected] = useState<QualityName>(() => detectQuality());
    const [touch] = useState(() => isTouchDevice());
    const [error, setError] = useState<string | null>(null);

    // Build the game exactly once per mount. The effect is idempotent and the
    // teardown is real, so a StrictMode double-mount or an HMR reload does not
    // leave a second renderer running.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || gameRef.current) return;
        let game: Game | null = null;
        try {
            game = new Game({
                canvas,
                quality,
                steerSensitivity: multiplierFor(steering),
                difficulty,
                // Only for the automated checks, which sample the rendered frame.
                preserveDrawingBuffer: new URLSearchParams(window.location.search).has('debug')
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'WebGL is unavailable in this browser.');
            return;
        }
        gameRef.current = game;
        game.startPreview();
        setStageBest(telemetry.stageBest);
        setReady(true);
        return () => {
            game?.dispose();
            gameRef.current = null;
        };
        // `quality` is applied through game.setQuality, not by rebuilding.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleStart = useCallback(() => {
        // This runs inside the click handler, which is what unlocks Web Audio.
        gameRef.current?.restartFree();
        gameRef.current?.startDriving();
        setMode('free');
        setScreen('driving');
    }, []);

    const handleStartStage = useCallback(() => {
        gameRef.current?.restartStage();
        gameRef.current?.startDriving();
        setMode('stage');
        setScreen('driving');
    }, []);

    const handleRestartStage = useCallback(() => {
        gameRef.current?.restartStage();
        setMode('stage');
    }, []);

    const handleFreeDrive = useCallback(() => {
        gameRef.current?.restartFree();
        setMode('free');
    }, []);

    const handleMode = useCallback((next: GameMode) => {
        gameRef.current?.setMode(next);
        setMode(next);
    }, []);

    const handleCamera = useCallback(() => {
        gameRef.current?.cycleCamera();
    }, []);

    const handleSound = useCallback(() => {
        setMuted((m) => {
            const next = !m;
            gameRef.current?.setMuted(next);
            return next;
        });
    }, []);

    const handleSteering = useCallback((level: SteerLevel) => {
        setSteering(level);
        saveSteerLevel(level);
        gameRef.current?.setSteerSensitivity(multiplierFor(level));
    }, []);

    const handleDifficulty = useCallback((next: DifficultyName) => {
        setDifficulty(next);
        saveDifficulty(next);
        gameRef.current?.setDifficulty(next);
        setStageBest(telemetry.stageBest);
    }, []);

    const handleRecover = useCallback(() => {
        gameRef.current?.recover();
    }, []);

    const handleClearTimes = useCallback(() => {
        gameRef.current?.clearBestTimes();
        setStageBest(0);
    }, []);

    const handleQuality = useCallback((name: QualityName) => {
        setQuality(name);
        saveQualityOverride(name);
        gameRef.current?.setQuality(name);
    }, []);

    const handleToggleFps = useCallback(() => {
        setShowFps((v) => {
            telemetry.fps = telemetry.fps || 0;
            publishTelemetry();
            return !v;
        });
    }, []);

    // Enabling the FPS counter with a URL flag is handy for QA runs.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.has('debug') || params.has('fps')) setShowFps(true);
        if (params.has('drive') || params.has('stage')) {
            // Skip the title screen — used by the automated checks.
            const wantStage = params.has('stage');
            const id = window.setTimeout(() => {
                if (wantStage) {
                    gameRef.current?.restartStage();
                    setMode('stage');
                }
                gameRef.current?.startDriving();
                setScreen('driving');
            }, 60);
            return () => window.clearTimeout(id);
        }
        return undefined;
    }, []);

    // Expose the game for debugging and automated testing.
    useEffect(() => {
        const w = window as Window & { brb?: unknown };
        w.brb = { get game() { return gameRef.current; }, telemetry };
        return () => {
            delete w.brb;
        };
    }, []);

    if (error) {
        return (
            <div className="fatal">
                <h1>Blue Ridge Backroad</h1>
                <p>{error}</p>
                <p className="fatal-hint">This game needs WebGL. Try a current Chrome, Edge or Safari.</p>
            </div>
        );
    }

    return (
        <div className="app">
            <canvas ref={canvasRef} className="game-canvas" />
            {screen === 'title' ? (
                <TitleScreen
                    onStart={handleStart}
                    onStartStage={handleStartStage}
                    difficulty={difficulty}
                    onDifficulty={handleDifficulty}
                    ready={ready}
                    touch={touch}
                    stageBest={stageBest > 0 ? `best ${formatTime(stageBest)}` : 'no time set'}
                />
            ) : (
                <>
                    <Hud
                        onCamera={handleCamera}
                        onSound={handleSound}
                        onSettings={() => setSettingsOpen(true)}
                        onRecover={handleRecover}
                        onRestartStage={handleRestartStage}
                        onFreeDrive={handleFreeDrive}
                        muted={muted}
                        showFps={showFps}
                    />
                    <TouchControls input={gameRef.current?.input ?? FALLBACK_INPUT} visible={touch} />
                </>
            )}
            {settingsOpen && (
                <SettingsPanel
                    mode={mode}
                    onMode={handleMode}
                    difficulty={difficulty}
                    onDifficulty={handleDifficulty}
                    quality={quality}
                    detected={detected}
                    steering={steering}
                    showFps={showFps}
                    onQuality={handleQuality}
                    onSteering={handleSteering}
                    onToggleFps={handleToggleFps}
                    onClearTimes={handleClearTimes}
                    onClose={() => setSettingsOpen(false)}
                />
            )}
        </div>
    );
};

// Only ever used if the canvas failed before the controls mounted; keeps the
// touch layer from having to deal with a null input object.
const FALLBACK_INPUT = {
    cycleCameraRequested: false,
    recoverRequested: false,
    restartRequested: false,
    keyThrottle: false,
    keyBrake: false,
    keyLeft: false,
    keyRight: false,
    touchThrottle: false,
    touchBrake: false,
    touchLeft: false,
    touchRight: false
};
