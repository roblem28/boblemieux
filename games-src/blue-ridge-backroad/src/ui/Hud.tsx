import type { JSX } from 'react';
import { useTelemetry } from './telemetry';
import { CourseAhead } from './CourseAhead';
import { StagePanel, StageResult } from './StagePanel';
import { formatDelta, formatTime } from '../game/splits';

interface Props {
    onCamera: () => void;
    onSound: () => void;
    onSettings: () => void;
    onRecover: () => void;
    onRestartStage: () => void;
    onFreeDrive: () => void;
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

export const Hud = ({
    onCamera,
    onSound,
    onSettings,
    onRecover,
    onRestartStage,
    onFreeDrive,
    muted,
    showFps
}: Props): JSX.Element => {
    const t = useTelemetry();
    const mph = Math.min(t.mph, DIAL_MAX);
    const needle = START_ANGLE + (mph / DIAL_MAX) * SWEEP;
    const stageMode = t.mode === 'stage';
    // Mile splits belong to the endless drive; the stage has its own clock.
    const showSplit = !stageMode && t.splitFlash > 0 && t.lastSplitMile >= 0;
    const finished = stageMode && t.stageState === 'finished';

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

            {stageMode ? (
                <StagePanel t={t} onRestart={onRestartStage} />
            ) : (
            /* Mile timing. There is no lap on an endless road, so the clock
               runs per mile against your own best for that same stretch. */
            <div className="timing">
                <div className="timing-row">
                    <span className="timing-label">Mile {t.mile + 1}</span>
                    <span className="timing-value">{formatTime(t.mileTime)}</span>
                </div>
                <div className="timing-row timing-sub">
                    <span className="timing-label">
                        {t.mileDirty ? 'assisted' : t.mileBest > 0 ? 'best' : 'no best yet'}
                    </span>
                    <span className="timing-value">{t.mileBest > 0 ? formatTime(t.mileBest) : '--:--'}</span>
                </div>
                <div className="timing-row timing-sub">
                    <span className="timing-label">total</span>
                    <span className="timing-value">{formatTime(t.totalTime)}</span>
                </div>
            </div>
            )}

            {showSplit && (
                <div
                    className={t.lastSplitIsBest ? 'split-flash split-best' : 'split-flash'}
                    style={{ opacity: Math.min(1, t.splitFlash / 1.2) }}
                >
                    <span className="split-title">
                        Mile {t.lastSplitMile + 1}
                        {t.lastSplitIsBest ? ' — personal best' : ''}
                    </span>
                    <span className="split-time">{formatTime(t.lastSplitTime)}</span>
                    {Number.isFinite(t.lastSplitDelta) && (
                        <span className={t.lastSplitDelta <= 0 ? 'split-delta good' : 'split-delta bad'}>
                            {formatDelta(t.lastSplitDelta)}
                        </span>
                    )}
                </div>
            )}

            {t.discoveryAge > 0 && (
                <div className="discovery" style={{ opacity: Math.min(1, t.discoveryAge / 1.2) }}>
                    <span className="discovery-label">You found</span>
                    <span className="discovery-name">{t.discovery}</span>
                </div>
            )}

            <CourseAhead t={t} />

            {t.chapter !== '' && <div className="chapter-badge">{t.chapter}</div>}

            {t.paceNoteAge > 0 && (
                <div className="pace-note" style={{ opacity: Math.min(1, t.paceNoteAge / 0.9) }}>
                    {t.paceNote}
                </div>
            )}

            {t.stuck && !finished && (
                <button className="recover-btn" type="button" onClick={onRecover}>
                    <span className="recover-key">R</span>
                    Back to the road
                </button>
            )}

            {finished && <StageResult t={t} onRestart={onRestartStage} onFreeDrive={onFreeDrive} />}

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
