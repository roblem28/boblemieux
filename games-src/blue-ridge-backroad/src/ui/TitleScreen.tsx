import type { JSX } from 'react';
import { DIFFICULTIES, type DifficultyName } from '../game/difficulty';

interface Props {
    onStart: () => void;
    onStartStage: () => void;
    difficulty: DifficultyName;
    onDifficulty: (d: DifficultyName) => void;
    ready: boolean;
    touch: boolean;
    stageBest: string;
}

export const TitleScreen = ({
    onStart,
    onStartStage,
    difficulty,
    onDifficulty,
    ready,
    touch,
    stageBest
}: Props): JSX.Element => (
    <div className="title">
        <div className="title-vignette" />
        <div className="title-inner">
            <p className="title-kicker">Somewhere off the parkway</p>
            <h1>
                Blue Ridge
                <span>Backroad</span>
            </h1>
            <p className="title-blurb">
                Gravel, switchbacks and a hundred miles of ridgeline. Drive it for its own sake —
                or put two miles of it against the clock.
            </p>

            <div className="title-difficulty">
                <span className="title-difficulty-label">Difficulty</span>
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
            </div>

            <div className="title-actions">
                <button className="start-btn" type="button" onClick={onStart} disabled={!ready}>
                    {ready ? 'Start Engine' : 'Warming up…'}
                </button>
                <button className="stage-btn" type="button" onClick={onStartStage} disabled={!ready}>
                    <span>Run the 2-mile stage</span>
                    <em>{stageBest}</em>
                </button>
            </div>

            <div className="title-controls">
                {touch ? (
                    <p>Steer with the arrows, bottom left. Gas and brake, bottom right.</p>
                ) : (
                    <p>
                        <kbd>W</kbd> accelerate · <kbd>S</kbd>/<kbd>Space</kbd> brake &amp; reverse ·{' '}
                        <kbd>A</kbd>/<kbd>D</kbd> steer · <kbd>C</kbd> camera
                    </p>
                )}
            </div>
        </div>
    </div>
);
