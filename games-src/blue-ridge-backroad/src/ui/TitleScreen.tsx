import type { JSX } from 'react';

interface Props {
    onStart: () => void;
    onStartStage: () => void;
    ready: boolean;
    touch: boolean;
    stageBest: string;
}

export const TitleScreen = ({ onStart, onStartStage, ready, touch, stageBest }: Props): JSX.Element => (
    <div className="title">
        <div className="title-vignette" />
        <div className="title-inner">
            <p className="title-kicker">Somewhere off the parkway</p>
            <h1>
                Blue Ridge
                <span>Backroad</span>
            </h1>
            <p className="title-blurb">
                Gravel, switchbacks and a hundred miles of ridgeline. No race, no finish line — just
                the road, the woods, and whatever is out there in them.
            </p>

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
