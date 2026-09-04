/**
 * A single mutable input record. Keyboard listeners, touch buttons and (later)
 * XR controllers all write into the same fields, so nothing on the input path
 * goes through React state and true multi-touch just works.
 */
export interface InputState {
    /** Set by a control, consumed by the game loop. */
    cycleCameraRequested: boolean;
    /** Put the truck back on the road. Set by R or the HUD button. */
    recoverRequested: boolean;
    /** Restart the stage from the line. Set by Enter or the HUD button. */
    restartRequested: boolean;
    /** Held sources, tracked separately so keyboard and touch can coexist. */
    keyThrottle: boolean;
    keyBrake: boolean;
    keyLeft: boolean;
    keyRight: boolean;
    touchThrottle: boolean;
    touchBrake: boolean;
    touchLeft: boolean;
    touchRight: boolean;
    /**
     * Analogue steering from the thumbstick, -1 (left) .. 1 (right).
     *
     * Separate from `touchLeft`/`touchRight` rather than replacing them,
     * because the two controls coexist: a player can prefer buttons, and the
     * keyboard is always digital. `touchSteerHeld` says whether a thumb is
     * actually on the stick — a stick resting at dead centre reads 0, which is
     * indistinguishable from no stick at all unless it is tracked separately.
     */
    touchSteer: number;
    touchSteerHeld: boolean;
}

export const createInputState = (): InputState => ({
    cycleCameraRequested: false,
    recoverRequested: false,
    restartRequested: false,
    keyThrottle: false,
    keyBrake: false,
    keyLeft: false,
    keyRight: false,
    touchThrottle: false,
    touchBrake: false,
    touchLeft: false,
    touchRight: false,
    touchSteer: 0,
    touchSteerHeld: false
});

export interface InputTargets {
    throttle: number;
    brake: number;
    /** -1 (left) .. 1 (right), in UI terms. */
    steer: number;
    /**
     * Whether `steer` came from a continuous control.
     *
     * It changes what the number *means*. A key is a request to keep winding
     * lock on for as long as it is held, so the physics ramps toward it. A
     * thumb is already holding a position, so ramping toward it a second time
     * adds lag to a control the player is modulating directly.
     */
    analog: boolean;
}

/**
 * Collapse the held flags into the analogue targets the physics reads.
 *
 * Writes into a caller-owned record rather than returning a literal: this is
 * called on every physics substep, up to eight times a frame, and a fresh
 * object each time is the single easiest allocation to leave in a hot loop.
 */
export const resolveInputTargets = (input: InputState, out: InputTargets): InputTargets => {
    out.throttle = input.keyThrottle || input.touchThrottle ? 1 : 0;
    out.brake = input.keyBrake || input.touchBrake ? 1 : 0;
    const left = input.keyLeft || input.touchLeft ? 1 : 0;
    const right = input.keyRight || input.touchRight ? 1 : 0;
    const digital = right - left;
    // A key beats the stick while it is held: on a tablet with a keyboard both
    // exist, and the one being actively pressed is the one meant.
    if (digital !== 0 || !input.touchSteerHeld) {
        out.steer = digital;
        out.analog = false;
    } else {
        out.steer = steerCurve(input.touchSteer);
        out.analog = true;
    }
    return out;
};

/**
 * Shape the stick's travel.
 *
 * Linear is wrong for a thumb: the first few millimetres either side of centre
 * are the hardest part of the throw to hold still, and they are exactly where a
 * car at speed needs the finest control. Weighting the curve toward the centre
 * makes small corrections small and still reaches full lock at the rim.
 */
export const steerCurve = (x: number): number => {
    const c = Math.max(-1, Math.min(1, x));
    return c * (0.4 + 0.6 * c * c);
};

export interface KeyboardBinding {
    dispose(): void;
}

export const bindKeyboard = (input: InputState, target: EventTarget = window): KeyboardBinding => {
    const set = (code: string, down: boolean): boolean => {
        switch (code) {
            case 'KeyW':
            case 'ArrowUp':
                input.keyThrottle = down;
                return true;
            case 'KeyS':
            case 'ArrowDown':
            case 'Space':
                input.keyBrake = down;
                return true;
            case 'KeyA':
            case 'ArrowLeft':
                input.keyLeft = down;
                return true;
            case 'KeyD':
            case 'ArrowRight':
                input.keyRight = down;
                return true;
            case 'KeyC':
                if (down) input.cycleCameraRequested = true;
                return true;
            case 'KeyR':
                if (down) input.recoverRequested = true;
                return true;
            case 'Enter':
            case 'NumpadEnter':
                if (down) input.restartRequested = true;
                return true;
            default:
                return false;
        }
    };

    const onKeyDown = (e: Event): void => {
        const ev = e as KeyboardEvent;
        if (ev.repeat) {
            if (ev.code === 'Space' || ev.code.startsWith('Arrow')) ev.preventDefault();
            return;
        }
        if (set(ev.code, true)) ev.preventDefault();
    };
    const onKeyUp = (e: Event): void => {
        const ev = e as KeyboardEvent;
        if (set(ev.code, false)) ev.preventDefault();
    };
    // Losing focus mid-key would otherwise leave the throttle stuck on.
    const onBlur = (): void => {
        input.keyThrottle = false;
        input.keyBrake = false;
        input.keyLeft = false;
        input.keyRight = false;
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return {
        dispose(): void {
            target.removeEventListener('keydown', onKeyDown);
            target.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        }
    };
};
