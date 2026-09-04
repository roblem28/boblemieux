import { useCallback, useEffect, useRef, type JSX } from 'react';
import type { InputState } from '../game/input';

/**
 * Multi-touch driving controls.
 *
 * The hard requirements, each of which breaks the game on a phone if missed:
 *  - every button tracks its own `pointerId`, so steering left while holding
 *    the throttle actually works;
 *  - `setPointerCapture` on down, plus `pointercancel` and
 *    `lostpointercapture`, so a finger that slides off the button still
 *    releases it;
 *  - `touch-action: none` on the controls and a document-level non-passive
 *    `touchmove` preventDefault, so dragging never scrolls or rubber-bands;
 *  - the input flags are written straight into the mutable InputState, never
 *    through React state, so a press costs nothing and never re-renders;
 *  - **the ref callback identity is stable.** React calls a changed ref
 *    callback with `null` and then with the element, which tears down and
 *    rebuilds the listeners. With a fresh arrow function per render, any
 *    unrelated state change — tapping Sound, opening Settings — would release
 *    a held control mid-corner, and since the finger is already down no further
 *    `pointerdown` would ever arrive to restore it.
 */

type Control = 'left' | 'right' | 'gas' | 'brake';

interface Props {
    input: InputState;
    visible: boolean;
    /** When false the left cluster is gone and `ThumbStick` owns steering. */
    steerButtons: boolean;
}

const apply = (input: InputState, control: Control, down: boolean): void => {
    switch (control) {
        case 'left':
            input.touchLeft = down;
            break;
        case 'right':
            input.touchRight = down;
            break;
        case 'gas':
            input.touchThrottle = down;
            break;
        case 'brake':
            input.touchBrake = down;
            break;
    }
};

const preventDefault = (e: Event): void => e.preventDefault();

const useControlButton = (
    input: InputState,
    control: Control
): ((el: HTMLButtonElement | null) => void) => {
    const cleanup = useRef<(() => void) | null>(null);

    return useCallback(
        (el: HTMLButtonElement | null): void => {
            cleanup.current?.();
            cleanup.current = null;
            if (!el) return;

            let activeId: number | null = null;

            const down = (e: PointerEvent): void => {
                e.preventDefault();
                if (activeId !== null) return;
                activeId = e.pointerId;
                try {
                    el.setPointerCapture(e.pointerId);
                } catch {
                    /* capture is best-effort */
                }
                el.dataset.active = 'true';
                apply(input, control, true);
            };
            const up = (e: PointerEvent): void => {
                if (activeId !== e.pointerId) return;
                activeId = null;
                try {
                    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
                } catch {
                    /* already released */
                }
                delete el.dataset.active;
                apply(input, control, false);
            };

            el.addEventListener('pointerdown', down);
            el.addEventListener('pointerup', up);
            el.addEventListener('pointercancel', up);
            el.addEventListener('lostpointercapture', up);
            el.addEventListener('contextmenu', preventDefault);

            cleanup.current = (): void => {
                el.removeEventListener('pointerdown', down);
                el.removeEventListener('pointerup', up);
                el.removeEventListener('pointercancel', up);
                el.removeEventListener('lostpointercapture', up);
                el.removeEventListener('contextmenu', preventDefault);
                apply(input, control, false);
            };
        },
        [input, control]
    );
};

export const TouchControls = ({ input, visible, steerButtons }: Props): JSX.Element | null => {
    const leftRef = useControlButton(input, 'left');
    const rightRef = useControlButton(input, 'right');
    const gasRef = useControlButton(input, 'gas');
    const brakeRef = useControlButton(input, 'brake');

    useEffect(() => {
        // Kill pull-to-refresh, rubber-banding and pinch-zoom on the game
        // surface — but not inside a panel that is supposed to scroll.
        //
        // This used to prevent every touchmove on the document, which made the
        // stage picker's results unreachable on a phone: the list was below the
        // fold of a scrollable modal that could no longer be scrolled. The
        // handler is about the road, not the whole page.
        const stop = (e: TouchEvent): void => {
            const target = e.target as Element | null;
            if (target?.closest?.('.modal')) return;
            if (e.cancelable) e.preventDefault();
        };
        document.addEventListener('touchmove', stop, { passive: false });
        document.addEventListener('gesturestart', preventDefault as EventListener);
        return () => {
            document.removeEventListener('touchmove', stop);
            document.removeEventListener('gesturestart', preventDefault as EventListener);
        };
    }, []);

    if (!visible) return null;

    return (
        <div className="touch-layer">
            {steerButtons && (
                <div className="touch-cluster touch-left">
                    <button ref={leftRef} className="touch-btn steer" type="button" aria-label="Steer left">
                        <span>&#10094;</span>
                    </button>
                    <button ref={rightRef} className="touch-btn steer" type="button" aria-label="Steer right">
                        <span>&#10095;</span>
                    </button>
                </div>
            )}
            <div className="touch-cluster touch-right">
                <button ref={brakeRef} className="touch-btn brake" type="button" aria-label="Brake and reverse">
                    <span>BRAKE</span>
                </button>
                <button ref={gasRef} className="touch-btn gas" type="button" aria-label="Accelerate">
                    <span>GAS</span>
                </button>
            </div>
        </div>
    );
};
