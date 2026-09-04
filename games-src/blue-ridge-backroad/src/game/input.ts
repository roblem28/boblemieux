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
    /** Held sources, tracked separately so keyboard and touch can coexist. */
    keyThrottle: boolean;
    keyBrake: boolean;
    keyLeft: boolean;
    keyRight: boolean;
    touchThrottle: boolean;
    touchBrake: boolean;
    touchLeft: boolean;
    touchRight: boolean;
}

export const createInputState = (): InputState => ({
    cycleCameraRequested: false,
    recoverRequested: false,
    keyThrottle: false,
    keyBrake: false,
    keyLeft: false,
    keyRight: false,
    touchThrottle: false,
    touchBrake: false,
    touchLeft: false,
    touchRight: false
});

export interface InputTargets {
    throttle: number;
    brake: number;
    /** -1 (left) .. 1 (right), in UI terms. */
    steer: number;
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
    out.steer = right - left;
    return out;
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
