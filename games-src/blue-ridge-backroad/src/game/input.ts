/**
 * A single mutable input record. Keyboard listeners, touch buttons and (later)
 * XR controllers all write into the same fields, so nothing on the input path
 * goes through React state and true multi-touch just works.
 */
export interface InputState {
    /** 0..1 */
    throttle: number;
    /** 0..1 */
    brake: number;
    /** -1 (left) .. 1 (right) */
    steer: number;
    /** Set by a control, consumed by the game loop. */
    cycleCameraRequested: boolean;
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
    throttle: 0,
    brake: 0,
    steer: 0,
    cycleCameraRequested: false,
    keyThrottle: false,
    keyBrake: false,
    keyLeft: false,
    keyRight: false,
    touchThrottle: false,
    touchBrake: false,
    touchLeft: false,
    touchRight: false
});

/** Collapse the held flags into the analogue targets the physics reads. */
export const resolveInputTargets = (
    input: InputState
): { throttle: number; brake: number; steer: number } => {
    const t = input.keyThrottle || input.touchThrottle ? 1 : 0;
    const b = input.keyBrake || input.touchBrake ? 1 : 0;
    const left = input.keyLeft || input.touchLeft ? 1 : 0;
    const right = input.keyRight || input.touchRight ? 1 : 0;
    return { throttle: t, brake: b, steer: right - left };
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
