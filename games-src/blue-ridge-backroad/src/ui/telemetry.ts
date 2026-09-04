import { useSyncExternalStore } from 'react';

/**
 * The game loop writes into a single mutable record; the HUD subscribes to a
 * *version counter*, not to the record.
 *
 * This is deliberate. `useSyncExternalStore` demands that `getSnapshot` return
 * a stable value: returning the mutable object means React never sees a change
 * and never re-renders, and returning a fresh object every call makes React
 * throw "getSnapshot should be cached". An integer version does neither, and it
 * lets the publisher throttle notifications to 10 Hz while the loop keeps
 * writing at 60+.
 */

export interface Telemetry {
    mph: number;
    miles: number;
    rpm: number;
    gear: number;
    camera: string;
    fps: number;
    offRoad: boolean;
    discovery: string;
    discoveryAge: number;
    quality: string;
}

export const telemetry: Telemetry = {
    mph: 0,
    miles: 0,
    rpm: 0,
    gear: 1,
    camera: 'Chase',
    fps: 0,
    offRoad: false,
    discovery: '',
    discoveryAge: 0,
    quality: 'high'
};

let version = 0;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

const getSnapshot = (): number => version;

/** Called by the game loop at ~10 Hz after it has written the fields. */
export const publishTelemetry = (): void => {
    version += 1;
    for (const fn of listeners) fn();
};

export const useTelemetry = (): Telemetry => {
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return telemetry;
};
