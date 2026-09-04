import type { JSX } from 'react';
import { PRESETS, type QualityName } from '../game/quality';
import { STEER_LEVELS, type SteerLevel } from '../game/steering';
import { DIFFICULTIES, difficultyFor, type DifficultyName } from '../game/difficulty';
import type { CoDriverMode } from '../game/codriver/CoDriver';
import { useTelemetry } from './telemetry';

/** Plain words for what the director is doing. */
const DIRECTOR_STATUS: Record<string, string> = {
    off: 'off',
    watching: 'watching the drive',
    thinking: 'deciding',
    ready: 'waiting for the next mile',
    unreachable: 'no answer — road handed back'
};

interface Props {
    mode: 'free' | 'stage';
    onMode: (mode: 'free' | 'stage') => void;
    difficulty: DifficultyName;
    onDifficulty: (d: DifficultyName) => void;
    coDriver: CoDriverMode;
    onCoDriver: (m: CoDriverMode) => void;
    speechAvailable: boolean;
    touch: boolean;
    vehicles: readonly { id: string; name: string; blurb: string }[];
    vehicle: string;
    onVehicle: (id: string) => void;
    steerStyle: 'stick' | 'buttons';
    onSteerStyle: (next: 'stick' | 'buttons') => void;
    chapters: boolean;
    onChapters: (on: boolean) => void;
    director: boolean;
    onDirector: (on: boolean) => void;
    directorUrl: string;
    onDirectorUrl: (url: string) => void;
    onFindStage: () => void;
    quality: QualityName;
    detected: QualityName;
    steering: SteerLevel;
    showFps: boolean;
    onQuality: (q: QualityName) => void;
    onSteering: (s: SteerLevel) => void;
    onToggleFps: () => void;
    onClearTimes: () => void;
    onClose: () => void;
}

const ORDER: QualityName[] = ['high', 'balanced', 'mobile'];

const SUMMARY: Record<QualityName, string> = {
    high: 'Full vegetation, 2K shadows, 900 m draw distance, sharp textures.',
    balanced: 'Reduced vegetation, 1K shadows, 700 m draw distance.',
    mobile: 'Sparse vegetation, 512 shadows, 480 m draw distance, 1x pixel ratio.'
};

export const SettingsPanel = ({
    mode,
    onMode,
    difficulty,
    onDifficulty,
    coDriver,
    onCoDriver,
    speechAvailable,
    touch,
    vehicles,
    vehicle,
    onVehicle,
    steerStyle,
    onSteerStyle,
    chapters,
    onChapters,
    director,
    onDirector,
    directorUrl,
    onDirectorUrl,
    onFindStage,
    quality,
    detected,
    steering,
    showFps,
    onQuality,
    onSteering,
    onToggleFps,
    onClearTimes,
    onClose
}: Props): JSX.Element => {
    // The director changes state while the panel is open, so the panel reads
    // the live telemetry record rather than a snapshot handed down at open time.
    const { directorStatus, directorSource, directorReason, directorPatches } = useTelemetry();

    return (
        <div className="modal-backdrop" onPointerDown={onClose}>
            <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
                <h2>Settings</h2>

                <h3>Drive</h3>
                <div className="segmented">
                    <button
                        type="button"
                        className={mode === 'free' ? 'segment selected' : 'segment'}
                        onClick={() => onMode('free')}
                    >
                        Free drive
                    </button>
                    <button
                        type="button"
                        className={mode === 'stage' ? 'segment selected' : 'segment'}
                        onClick={() => onMode('stage')}
                    >
                        2-mile stage
                    </button>
                </div>
                <p className="setting-note">
                    {mode === 'stage'
                        ? 'A fixed stretch of the same road, timed. Enter restarts it from the line.'
                        : 'The endless road, timed per mile against your own best for that mile.'}
                </p>
                <button type="button" className="toggle-row" onClick={onFindStage}>
                    <span>Find a stage</span>
                    <span className="row-action">Search</span>
                </button>

                <h3>Vehicle</h3>
            <div className="profile-chips">
                {vehicles.map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        className={v.id === vehicle ? 'profile-chip selected' : 'profile-chip'}
                        onClick={() => onVehicle(v.id)}
                    >
                        {v.name}
                    </button>
                ))}
            </div>
            <p className="setting-note">
                {vehicles.find((v) => v.id === vehicle)?.blurb}
                {' '}
                <em>
                    Changing this restarts the drive, and each vehicle keeps its own best times —
                    they lap at different speeds, so one leaderboard across all three would measure
                    the vehicle rather than the drive.
                </em>
            </p>

            <h3>Difficulty</h3>
                <div className="segmented segmented-4">
                    {DIFFICULTIES.map((d) => (
                        <button
                            key={d.name}
                            type="button"
                            className={d.name === difficulty ? 'segment selected' : 'segment'}
                            onClick={() => onDifficulty(d.name)}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>
                <p className="setting-note">{difficultyFor(difficulty).detail}</p>
                <p className="setting-note setting-quiet">
                    Best times are kept separately for each difficulty.
                </p>

                <h3>Road chapters</h3>
                <button type="button" className="toggle-row" onClick={() => onChapters(!chapters)}>
                    <span>Changing country</span>
                    <span className={chapters ? 'switch on' : 'switch'} />
                </button>
                <p className="setting-note">
                    The road takes on a character for a mile at a time — open country, switchbacks,
                    morning haze, last light — and the co-driver calls the surface as it changes.
                    {' '}
                    <em>
                        Changing this restarts the drive: the road has to be generated consistently
                        or times stop meaning anything. Off by default because it changes how long a
                        mile takes. The timed stage always ignores it.
                    </em>
                </p>

                {touch && (
                <>
                    <h3>Steering</h3>
                    <div className="segmented">
                        <button
                            type="button"
                            className={steerStyle === 'stick' ? 'segment selected' : 'segment'}
                            onClick={() => onSteerStyle('stick')}
                        >
                            Thumbstick
                        </button>
                        <button
                            type="button"
                            className={steerStyle === 'buttons' ? 'segment selected' : 'segment'}
                            onClick={() => onSteerStyle('buttons')}
                        >
                            Buttons
                        </button>
                    </div>
                    <p className="setting-note">
                        The thumbstick appears wherever your thumb lands and steers by how far you
                        move it, so you can hold a small correction instead of only full lock. The
                        buttons are on or off, which is steadier in rough going but blunt at speed.
                    </p>
                </>
            )}

            <h3>Director</h3>
                <button type="button" className="toggle-row" onClick={() => onDirector(!director)}>
                    <span>Let something choose the road</span>
                    <span className={director ? 'switch on' : 'switch'} />
                </button>
                <p className="setting-note">
                    Instead of the next stretch being drawn at random, something decides what it
                    should be — opening the road out after a rough couple of miles, asking a harder
                    question after a clean fast one. It changes what the road is <em>like</em>, never
                    how the truck behaves: grip moves only as weather, and only when the co-driver
                    says so. Turning this on turns on road chapters, which restarts the drive. The
                    timed stage is never touched.
                </p>

                {director && (
                    <>
                        <div className="director-state">
                            <span className={`director-dot ${directorStatus}`} />
                            <span>{DIRECTOR_STATUS[directorStatus] ?? directorStatus}</span>
                            <span className="director-count">
                                {directorSource === 'http' ? 'model' : 'built-in'} · {directorPatches}{' '}
                                {directorPatches === 1 ? 'change' : 'changes'}
                            </span>
                        </div>
                        {directorReason !== '' && <p className="setting-note director-reason">“{directorReason}”</p>}

                        <label className="field-row">
                            <span>Model endpoint</span>
                            <input
                                type="url"
                                inputMode="url"
                                placeholder="built-in — no model"
                                spellCheck={false}
                                autoComplete="off"
                                value={directorUrl}
                                onChange={(e) => onDirectorUrl(e.target.value)}
                            />
                        </label>
                        <p className="setting-note setting-quiet">
                            Optional, and off by default. Leave it empty and the choices come from a
                            policy built into the game — which is what almost everyone will run, and
                            what a model has to beat to be worth the trouble. Point it at an
                            Ollama-compatible chat endpoint on a machine you control and the choosing
                            moves there.
                            {' '}
                            <em>
                                This page is served over HTTPS, so a plain http:// address will be
                                blocked by the browser and the director will simply report itself
                                unreachable — the model host needs TLS. Nothing it returns is ever
                                executed: it picks from a menu of names that ship with the game.
                            </em>
                        </p>
                    </>
                )}

                <h3>Co-driver</h3>
                <div className="segmented">
                    <button
                        type="button"
                        className={coDriver === 'off' ? 'segment selected' : 'segment'}
                        onClick={() => onCoDriver('off')}
                    >
                        Off
                    </button>
                    <button
                        type="button"
                        className={coDriver === 'text' ? 'segment selected' : 'segment'}
                        onClick={() => onCoDriver('text')}
                    >
                        Notes
                    </button>
                    <button
                        type="button"
                        className={coDriver === 'voice' ? 'segment selected' : 'segment'}
                        onClick={() => onCoDriver('voice')}
                        disabled={!speechAvailable}
                    >
                        Spoken
                    </button>
                </div>
                <p className="setting-note">
                    {coDriver === 'off'
                        ? 'No calls.'
                        : coDriver === 'voice'
                          ? 'Corners called aloud about three seconds ahead. Lower numbers are tighter.'
                          : 'Corners called on screen about three seconds ahead. Lower numbers are tighter.'}
                    {!speechAvailable && ' Spoken notes need a browser with speech synthesis.'}
                </p>

                <h3>Steering</h3>
                <div className="segmented">
                    {STEER_LEVELS.map((level) => (
                        <button
                            key={level.name}
                            type="button"
                            className={level.name === steering ? 'segment selected' : 'segment'}
                            onClick={() => onSteering(level.name)}
                        >
                            {level.label}
                        </button>
                    ))}
                </div>
                <p className="setting-note">{STEER_LEVELS.find((l) => l.name === steering)?.detail}</p>

                <h3>Quality</h3>
                <div className="quality-list">
                    {ORDER.map((name) => (
                        <button
                            key={name}
                            type="button"
                            className={name === quality ? 'quality-option selected' : 'quality-option'}
                            onClick={() => onQuality(name)}
                        >
                            <span className="quality-name">
                                {PRESETS[name].label}
                                {name === detected && <em> — detected</em>}
                            </span>
                            <span className="quality-detail">{SUMMARY[name]}</span>
                        </button>
                    ))}
                </div>

                <h3>Times</h3>
                <button type="button" className="toggle-row" onClick={onClearTimes}>
                    <span>Clear best times for {difficultyFor(difficulty).label}</span>
                    <span className="row-action">Reset</span>
                </button>

                <h3>Developer</h3>
                <button type="button" className="toggle-row" onClick={onToggleFps}>
                    <span>Show FPS counter</span>
                    <span className={showFps ? 'switch on' : 'switch'} />
                </button>

                <h3>Controls</h3>
                <dl className="controls-help">
                    <dt>W / &uarr;</dt>
                    <dd>Accelerate</dd>
                    <dt>S / &darr; / Space</dt>
                    <dd>Brake, then reverse</dd>
                    <dt>A / &larr;, D / &rarr;</dt>
                    <dd>Steer</dd>
                    <dt>C</dt>
                    <dd>Change camera</dd>
                    <dt>R</dt>
                    <dd>Back to the road when stuck</dd>
                    <dt>Enter</dt>
                    <dd>Restart the stage</dd>
                </dl>

                <button type="button" className="primary" onClick={onClose}>
                    Back to the road
                </button>
            </div>
        </div>
    );
};
