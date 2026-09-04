import type { JSX } from 'react';
import { useTelemetry } from './telemetry';

interface Props {
    onCamera: () => void;
    onSound: () => void;
    onSettings: () => void;
    muted: boolean;
    showFps: boolean;
}

const DIAL_MAX = 160;
const START_ANGLE = -220;
const SWEEP = 260;

/** Tick marks are static, so build them once at module load. */
const TICKS = Array.from({ length: 17 }, (_, i) => {
    const mph = i * 10;
    const angle = START_ANGLE + (mph / DIAL_MAX) * SWEEP;
    return { mph, angle, major: mph % 20 === 0 };
});

export const Hud = ({ onCamera, onSound, onSettings, muted, showFps }: Props): JSX.Element => {
    const t = useTelemetry();
    const mph = Math.min(t.mph, DIAL_MAX);
    const needle = START_ANGLE + (mph / DIAL_MAX) * SWEEP;

    return (
        <div className="hud">
            <div className="hud-top">
                <button className="hud-btn" type="button" onClick={onCamera}>
                    <span className="hud-btn-key">C</span>
                    {t.camera}
                </button>
                <button className="hud-btn" type="button" onClick={onSound} aria-pressed={!muted}>
                    {muted ? 'Sound off' : 'Sound on'}
                </button>
                <button className="hud-btn" type="button" onClick={onSettings}>
                    Settings
                </button>
                {showFps && (
                    <span className="hud-fps">
                        {t.fps} fps · {t.quality}
                    </span>
                )}
            </div>

            {t.discoveryAge > 0 && (
                <div className="discovery" style={{ opacity: Math.min(1, t.discoveryAge / 1.2) }}>
                    <span className="discovery-label">You found</span>
                    <span className="discovery-name">{t.discovery}</span>
                </div>
            )}

            <div className="gauge-cluster">
                <svg className="gauge" viewBox="0 0 200 200" aria-hidden="true">
                    <circle className="gauge-face" cx="100" cy="100" r="92" />
                    <circle className="gauge-ring" cx="100" cy="100" r="86" />
                    {TICKS.map((tick) => {
                        const a = (tick.angle * Math.PI) / 180;
                        const r1 = tick.major ? 66 : 72;
                        const r2 = 80;
                        return (
                            <line
                                key={tick.mph}
                                className={tick.major ? 'tick major' : 'tick'}
                                x1={100 + Math.cos(a) * r1}
                                y1={100 + Math.sin(a) * r1}
                                x2={100 + Math.cos(a) * r2}
                                y2={100 + Math.sin(a) * r2}
                            />
                        );
                    })}
                    {TICKS.filter((tick) => tick.mph % 40 === 0).map((tick) => {
                        const a = (tick.angle * Math.PI) / 180;
                        return (
                            <text
                                key={tick.mph}
                                className="gauge-num"
                                x={100 + Math.cos(a) * 54}
                                y={100 + Math.sin(a) * 54 + 5}
                                textAnchor="middle"
                            >
                                {tick.mph}
                            </text>
                        );
                    })}
                    <line
                        className="needle"
                        x1="100"
                        y1="100"
                        x2={100 + Math.cos((needle * Math.PI) / 180) * 74}
                        y2={100 + Math.sin((needle * Math.PI) / 180) * 74}
                    />
                    <circle className="needle-hub" cx="100" cy="100" r="8" />
                </svg>

                <div className="readouts">
                    <div className="readout-speed">
                        <strong>{Math.round(t.mph)}</strong>
                        <span>MPH</span>
                    </div>
                    <div className="readout-odo">
                        <span>{t.miles.toFixed(2)}</span> mi
                    </div>
                    <div className={t.offRoad ? 'readout-gear off-road' : 'readout-gear'}>
                        {t.offRoad ? 'OFF ROAD' : `GEAR ${t.gear}`}
                    </div>
                </div>
            </div>
        </div>
    );
};
