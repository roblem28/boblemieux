import type { JSX } from 'react';
import type { Telemetry } from './telemetry';
import { formatDelta, formatTime } from '../game/splits';

/**
 * The stage clock: elapsed, how far is left, and — the part that makes a time
 * trial worth repeating — how far up or down you are on your own best run at
 * this exact point on the road.
 */

interface Props {
    t: Telemetry;
    onRestart: () => void;
}

export const StagePanel = ({ t, onRestart }: Props): JSX.Element => {
    const hasDelta = Number.isFinite(t.stageDelta) && t.stageState === 'running';
    const up = t.stageDelta <= 0;

    return (
        <div className="stage">
            <div className="stage-head">
                <span className="stage-name">
                    {t.stageName} <em>{t.difficulty}</em>
                </span>
                <button className="stage-restart" type="button" onClick={onRestart}>
                    <span className="stage-key">&crarr;</span>
                    Restart
                </button>
            </div>

            <div className="stage-clock">
                <span className="stage-time">{formatTime(t.stageElapsed)}</span>
                {hasDelta && (
                    <span className={up ? 'stage-delta good' : 'stage-delta bad'}>
                        {formatDelta(t.stageDelta)}
                    </span>
                )}
            </div>

            <div className="stage-bar" role="presentation">
                <div className="stage-bar-fill" style={{ width: `${Math.round(t.stageProgress * 100)}%` }} />
            </div>

            <div className="stage-foot">
                <span>
                    {t.stageState === 'armed'
                        ? 'Go when ready'
                        : `${t.stageRemainingMiles.toFixed(2)} mi to go`}
                </span>
                <span>{t.stageBest > 0 ? `best ${formatTime(t.stageBest)}` : 'no best yet'}</span>
            </div>

            {t.stageAssisted && <span className="stage-assisted">Assisted — will not set a best</span>}
        </div>
    );
};

interface ResultProps {
    t: Telemetry;
    onRestart: () => void;
    onFreeDrive: () => void;
}

export const StageResult = ({ t, onRestart, onFreeDrive }: ResultProps): JSX.Element => (
    <div className="result-backdrop">
        <div className={t.stageResultIsBest ? 'result result-best' : 'result'}>
            <span className="result-kicker">
                {t.stageName} — {t.difficulty}
            </span>
            <span className="result-time">{formatTime(t.stageResultTime)}</span>

            {t.stageResultIsBest ? (
                <span className="result-badge">New personal best</span>
            ) : Number.isFinite(t.stageResultDelta) ? (
                <span className={t.stageResultDelta <= 0 ? 'result-delta good' : 'result-delta bad'}>
                    {formatDelta(t.stageResultDelta)} vs best {formatTime(t.stageBest)}
                </span>
            ) : (
                <span className="result-delta">Stage complete</span>
            )}

            {t.stageAssisted && <span className="result-note">Recovery was used, so this run was not banked.</span>}

            <div className="result-actions">
                <button type="button" className="primary" onClick={onRestart}>
                    Run it again
                </button>
                <button type="button" className="secondary" onClick={onFreeDrive}>
                    Free drive
                </button>
            </div>
        </div>
    </div>
);
