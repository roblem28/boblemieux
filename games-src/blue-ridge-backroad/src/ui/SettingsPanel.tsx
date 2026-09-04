import type { JSX } from 'react';
import { PRESETS, type QualityName } from '../game/quality';

interface Props {
    quality: QualityName;
    detected: QualityName;
    showFps: boolean;
    onQuality: (q: QualityName) => void;
    onToggleFps: () => void;
    onClose: () => void;
}

const ORDER: QualityName[] = ['high', 'balanced', 'mobile'];

const SUMMARY: Record<QualityName, string> = {
    high: 'Full vegetation, 2K shadows, 900 m draw distance, sharp textures.',
    balanced: 'Reduced vegetation, 1K shadows, 700 m draw distance.',
    mobile: 'Sparse vegetation, 512 shadows, 480 m draw distance, 1x pixel ratio.'
};

export const SettingsPanel = ({
    quality,
    detected,
    showFps,
    onQuality,
    onToggleFps,
    onClose
}: Props): JSX.Element => (
    <div className="modal-backdrop" onPointerDown={onClose}>
        <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
            <h2>Settings</h2>

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
            </dl>

            <button type="button" className="primary" onClick={onClose}>
                Back to the road
            </button>
        </div>
    </div>
);
