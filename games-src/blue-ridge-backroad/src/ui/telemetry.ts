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

    /** Course ahead. Written in place; `previewVersion` tells the HUD it moved. */
    previewOffset: Float32Array;
    previewSeverity: Float32Array;
    previewCount: number;
    previewStep: number;
    /** Fastest the road ahead allows, MPH, and whether you are over it. */
    advisoryMph: number;
    braking: boolean;
    /** Signed curvature of the corner setting the advisory: <0 right, >0 left. */
    advisoryCurvature: number;
    advisoryDistance: number;

    /** Mile-split timing. */
    mile: number;
    mileTime: number;
    mileBest: number;
    mileDirty: boolean;
    lastSplitMile: number;
    lastSplitTime: number;
    lastSplitDelta: number;
    lastSplitIsBest: boolean;
    splitFlash: number;
    totalTime: number;

    /** Off the road and stopped for long enough to offer a way out. */
    stuck: boolean;

    /** 'free' for the endless drive, 'stage' for the timed two-mile run. */
    mode: string;
    stageName: string;
    stageState: string;
    stageElapsed: number;
    stageProgress: number;
    stageRemainingMiles: number;
    stageBest: number;
    stageDelta: number;
    stageAssisted: boolean;
    stageResultTime: number;
    stageResultDelta: number;
    stageResultIsBest: boolean;
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
    quality: 'high',

    previewOffset: new Float32Array(0),
    previewSeverity: new Float32Array(0),
    previewCount: 0,
    previewStep: 12,
    advisoryMph: 0,
    braking: false,
    advisoryCurvature: 0,
    advisoryDistance: 0,

    mile: 0,
    mileTime: 0,
    mileBest: 0,
    mileDirty: false,
    lastSplitMile: -1,
    lastSplitTime: 0,
    lastSplitDelta: NaN,
    lastSplitIsBest: false,
    splitFlash: 0,
    totalTime: 0,

    stuck: false,

    mode: 'free',
    stageName: '',
    stageState: 'armed',
    stageElapsed: 0,
    stageProgress: 0,
    stageRemainingMiles: 0,
    stageBest: 0,
    stageDelta: NaN,
    stageAssisted: false,
    stageResultTime: 0,
    stageResultDelta: NaN,
    stageResultIsBest: false
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
