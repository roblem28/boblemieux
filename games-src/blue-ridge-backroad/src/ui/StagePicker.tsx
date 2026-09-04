import { useMemo, useState, type JSX } from 'react';
import type { Game } from '../game/Game';
import type { StageCandidate } from '../game/scout/Scout';

/**
 * Pick a stage by asking for a character rather than a place.
 *
 * The road is infinite and deterministic, so the game does not author stages —
 * it *finds* them. You say "fast opening, tightening hard through the second
 * half" and the scout ranks every three-mile window it can measure. Because a
 * found stage is just a start distance and a length on a road that never
 * changes, its times stay as comparable as the built-in stage's.
 */

interface Props {
    game: Game;
    onClose: () => void;
    onPicked: () => void;
}

const bar = (value: number): string => '▁▂▃▄▅▆▇█'[Math.max(0, Math.min(7, Math.round(value * 7)))];

export const StagePicker = ({ game, onClose, onPicked }: Props): JSX.Element => {
    const profiles = game.stageProfiles;
    const [profileId, setProfileId] = useState(profiles[0]?.id ?? 'flowing');
    const current = game.currentStage;

    // The search is a couple of milliseconds over a cached survey, so it can run
    // during render rather than needing a spinner and a loading state.
    const candidates: StageCandidate[] = useMemo(
        () => game.findStages(profileId, 5),
        [game, profileId]
    );
    const profile = profiles.find((p) => p.id === profileId);

    return (
        <div className="modal-backdrop" onPointerDown={onClose}>
            <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
                <h2>Find a stage</h2>
                <p className="setting-note">
                    The road goes on for ever and never changes, so stages are found rather than
                    built. Ask for a character; every window of road gets measured and ranked.
                </p>

                <h3>What are you after</h3>
                <div className="profile-list">
                    {profiles.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            className={p.id === profileId ? 'quality-option selected' : 'quality-option'}
                            onClick={() => setProfileId(p.id)}
                        >
                            <span className="quality-name">
                                {p.label} <em>{p.lengthMiles} mi</em>
                            </span>
                            <span className="quality-detail">{p.blurb}</span>
                        </button>
                    ))}
                </div>

                <h3>Best matches{profile ? ` for ${profile.label.toLowerCase()}` : ''}</h3>
                <div className="candidate-list">
                    {candidates.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            className={c.id === current.id ? 'candidate selected' : 'candidate'}
                            onClick={() => {
                                game.useStage({ id: c.id, name: c.name, start: c.start, length: c.length });
                                onPicked();
                            }}
                        >
                            <span className="candidate-name">{c.name}</span>
                            <span className="candidate-stats">
                                <span title="how twisty">twist {bar(c.twistiness)}</span>
                                <span title="tightens or opens through the stage">
                                    {c.progression > 0.15 ? 'tightens' : c.progression < -0.15 ? 'opens' : 'even'}
                                </span>
                                <span title="elevation range">{Math.round(c.riseMetres)} m climb</span>
                                <span title="discovery set-pieces on this stage">
                                    {c.eventCount} {c.eventCount === 1 ? 'sight' : 'sights'}
                                </span>
                            </span>
                        </button>
                    ))}
                    {candidates.length === 0 && <p className="setting-note">Nothing matched. Try another character.</p>}
                </div>

                <h3>Currently loaded</h3>
                <div className="toggle-row" role="presentation">
                    <span>
                        {current.name} · {(current.length / 1609.344).toFixed(1)} mi
                    </span>
                </div>
                <button
                    type="button"
                    className="toggle-row"
                    onClick={() => {
                        game.useDefaultStage();
                        onPicked();
                    }}
                >
                    <span>Back to Hollow Creek</span>
                    <span className="row-action">Default</span>
                </button>

                <button type="button" className="primary" onClick={onClose}>
                    Close
                </button>
            </div>
        </div>
    );
};
