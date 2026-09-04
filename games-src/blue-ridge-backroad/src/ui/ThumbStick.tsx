import { useEffect, useRef, type JSX } from 'react';
import type { InputState } from '../game/input';

/**
 * A steering stick that appears wherever your thumb lands.
 *
 * The fixed left/right buttons work, but they are on/off: `steer` could only
 * ever be -1, 0 or +1, so every correction on a phone was full lock in one
 * direction until you let go. That is survivable at 30 mph and hopeless at 100.
 * A stick gives the one thing a phone was missing, which is a steering angle
 * between "straight" and "as far as it goes".
 *
 * Floating rather than fixed, because a fixed stick has to be found before it
 * can be used. On a phone held in two hands the thumb lands where it lands, and
 * it is not the same place in portrait as in landscape, or for two different
 * people. Anchoring the centre to the touch means it is always exactly under
 * the thumb, and the only thing that matters afterwards is how far it travels.
 *
 * Everything here writes straight into the mutable `InputState` and drives the
 * knob through direct style writes on a ref. Nothing about a thumb moving
 * should cost a React render — at 60 Hz that is a render per frame, during the
 * one interaction in the game where dropped frames are most obvious.
 */

interface Props {
    input: InputState;
    visible: boolean;
}

/** Thumb travel for full lock. Roughly a comfortable thumb arc on a phone. */
const RADIUS = 62;
/** Movement below this is a tap, not a steering input. */
const DEADZONE = 4;

export const ThumbStick = ({ input, visible }: Props): JSX.Element | null => {
    const zoneRef = useRef<HTMLDivElement | null>(null);
    const baseRef = useRef<HTMLDivElement | null>(null);
    const knobRef = useRef<HTMLDivElement | null>(null);

    // `visible` is in the deps because the component returns null when it is
    // false, which destroys the elements the listeners are bound to. Keyed only
    // on `input` — which never changes — the effect would not re-run when the
    // stick came back, leaving every listener attached to a detached node: the
    // stick draws, the knob never moves and steering silently does nothing.
    // Reachable by switching to Buttons and back again.
    useEffect(() => {
        if (!visible) {
            input.touchSteer = 0;
            input.touchSteerHeld = false;
            return;
        }
        const zone = zoneRef.current;
        const base = baseRef.current;
        const knob = knobRef.current;
        if (!zone || !base || !knob) return;

        let pointer = -1;
        let originX = 0;
        let originY = 0;

        const paint = (dx: number, dy: number): void => {
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        const show = (x: number, y: number): void => {
            const r = zone.getBoundingClientRect();
            base.style.left = `${x - r.left}px`;
            base.style.top = `${y - r.top}px`;
            base.classList.add('live');
            paint(0, 0);
        };

        const hide = (): void => {
            base.classList.remove('live');
            paint(0, 0);
        };

        const down = (e: PointerEvent): void => {
            // One thumb owns the stick. A second finger in the zone is ignored
            // rather than stealing it, which is what happens when a palm brushes
            // the screen mid-corner.
            if (pointer !== -1) return;
            pointer = e.pointerId;
            originX = e.clientX;
            originY = e.clientY;
            input.touchSteerHeld = true;
            input.touchSteer = 0;
            show(e.clientX, e.clientY);
            // Capture last, and never let it decide whether steering works.
            // `setPointerCapture` throws if the pointer is already gone by the
            // time the handler runs, and with the call above the state writes
            // it would take the whole control down with it — the stick would
            // draw, track the thumb and steer nothing at all.
            try {
                zone.setPointerCapture(e.pointerId);
            } catch {
                /* capture is a convenience; pointercancel still releases us */
            }
            e.preventDefault();
        };

        const move = (e: PointerEvent): void => {
            if (e.pointerId !== pointer) return;
            const rawX = e.clientX - originX;
            const dy = Math.max(-RADIUS, Math.min(RADIUS, e.clientY - originY));
            const clamped = Math.max(-RADIUS, Math.min(RADIUS, rawX));
            const travel = Math.abs(clamped) < DEADZONE ? 0 : clamped;
            input.touchSteer = travel / RADIUS;
            // The knob follows vertically too even though only the horizontal
            // axis steers: a thumb arcs rather than sliding on a rail, and a
            // knob that refuses to move the way the thumb does reads as stuck.
            paint(travel, dy * 0.5);
            e.preventDefault();
        };

        const up = (e: PointerEvent): void => {
            if (e.pointerId !== pointer) return;
            pointer = -1;
            input.touchSteer = 0;
            input.touchSteerHeld = false;
            hide();
        };

        zone.addEventListener('pointerdown', down);
        zone.addEventListener('pointermove', move);
        zone.addEventListener('pointerup', up);
        // A capture that is lost — an incoming call, the browser stealing the
        // gesture — must release the stick, or the truck steers itself into the
        // trees with no finger anywhere near the screen.
        zone.addEventListener('pointercancel', up);
        zone.addEventListener('lostpointercapture', up);

        return () => {
            zone.removeEventListener('pointerdown', down);
            zone.removeEventListener('pointermove', move);
            zone.removeEventListener('pointerup', up);
            zone.removeEventListener('pointercancel', up);
            zone.removeEventListener('lostpointercapture', up);
            input.touchSteer = 0;
            input.touchSteerHeld = false;
        };
    }, [input, visible]);

    if (!visible) return null;

    return (
        <div className="thumb-zone" ref={zoneRef} aria-label="Steering area">
            <div className="thumb-base" ref={baseRef}>
                <div className="thumb-knob" ref={knobRef} />
            </div>
            <span className="thumb-hint">steer</span>
        </div>
    );
};
