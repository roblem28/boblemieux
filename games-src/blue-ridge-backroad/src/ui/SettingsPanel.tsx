import type { JSX } from 'react';
import { PRESETS, type QualityName } from '../game/quality';
import { STEER_LEVELS, type SteerLevel } from '../game/steering';

interface Props {
    mode: 'free' | 'stage';
    onMode: (mode: 'free' | 'stage') => void;
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
    quality,
    detected,
    steering,
    showFps,
    onQuality,
    onSteering,
    onToggleFps,
    onClearTimes,
    onClose
}: Props): JSX.Element => (
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
                    ? 'A fixed two miles of the same road, timed. Enter restarts it from the line.'
                    : 'The endless road, timed per mile against your own best for that mile.'}
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
                <span>Clear best mile times</span>
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
