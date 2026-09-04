import type { JSX } from 'react';
import type { Telemetry } from './telemetry';

/**
 * A small top-down map of the road ahead, plus the speed it will take.
 *
 * It is drawn to scale — the same metres-per-pixel across as along — so the
 * shape on screen is the shape of the road, not a stylised impression of it.
 * Colour is the useful part: each segment is tinted by how much it will have to
 * be slowed for, so a red band well up the strip is the cue to lift.
 */

const W = 116;
const H = 188;
const CENTRE = W / 2;
const PAD = 10;

const severityColour = (v: number): string => {
    // Green through amber to red. Kept away from pure hues so it sits on the
    // scene rather than glowing off it.
    if (v < 0.5) {
        const t = v / 0.5;
        return `rgb(${Math.round(122 + 111 * t)}, ${Math.round(196 - 20 * t)}, ${Math.round(118 - 40 * t)})`;
    }
    const t = (v - 0.5) / 0.5;
    return `rgb(${Math.round(233 - 8 * t)}, ${Math.round(176 - 84 * t)}, ${Math.round(78 - 12 * t)})`;
};

interface Props {
    t: Telemetry;
}

export const CourseAhead = ({ t }: Props): JSX.Element | null => {
    const n = t.previewCount;
    if (n === 0) return null;

    const span = n * t.previewStep;
    const scale = (H - PAD * 2) / span; // px per metre, used for both axes

    // Build the segment list. This runs at the HUD's 10 Hz, not per frame.
    const segments: JSX.Element[] = [];
    let px = CENTRE;
    let py = H - PAD;
    for (let i = 0; i < n; i++) {
        const x = CENTRE + t.previewOffset[i] * scale;
        const y = H - PAD - (i + 1) * t.previewStep * scale;
        // Clamp across, so a hairpin stays inside the widget instead of
        // disappearing off the side of it.
        const cx = Math.max(6, Math.min(W - 6, x));
        segments.push(
            <line
                key={i}
                x1={px}
                y1={py}
                x2={cx}
                y2={y}
                stroke={severityColour(t.previewSeverity[i])}
                strokeWidth={i < 4 ? 7 : 5.5}
                strokeLinecap="round"
            />
        );
        px = cx;
        py = y;
    }

    const advisory = Math.round(t.advisoryMph);
    const over = t.braking;

    return (
        <div className={over ? 'course course-brake' : 'course'}>
            <svg viewBox={`0 0 ${W} ${H}`} className="course-map" aria-hidden="true">
                <rect x="0" y="0" width={W} height={H} rx="12" className="course-bg" />
                {segments}
                {/* The truck, at the bottom, always pointing up the strip. */}
                <polygon points={`${CENTRE - 5},${H - PAD + 5} ${CENTRE + 5},${H - PAD + 5} ${CENTRE},${H - PAD - 5}`} className="course-car" />
            </svg>
            <div className="course-readout">
                <span className="course-label">{over ? 'Ease off' : 'Road ahead'}</span>
                <span className="course-speed">
                    {advisory >= 155 ? '155+' : advisory}
                    <em>mph</em>
                </span>
            </div>
        </div>
    );
};
