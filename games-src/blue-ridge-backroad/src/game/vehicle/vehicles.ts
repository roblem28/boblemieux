/**
 * The vehicles you can pick, and everything that makes them different.
 *
 * One rule shapes this file: a vehicle is a *set of numbers*, not a set of
 * special cases. `VehiclePhysics` reads a spec and has no idea which one it
 * has; `VehicleModel` builds from the same spec's proportions. Nothing anywhere
 * asks "is this the pickup". That is what keeps three vehicles from turning
 * into three code paths that drift apart.
 *
 * They are meant to be different to drive, not different to look at:
 *
 *  - the **Ranger** is the truck the game shipped with — heavy, powerful,
 *    planted, and the numbers here are exactly the ones that were hard-coded
 *    before, so it drives identically to how it always has;
 *  - the **Coupe** is half its weight with two thirds the power and a short
 *    wheelbase, so it carries far more speed through a corner and much less
 *    down a straight, and it rotates the moment you ask;
 *  - the **Hauler** is heavier still, softer, taller and down on power — it
 *    understeers into everything and has to be driven a corner ahead.
 *
 * Because they lap at different speeds, a time in one is not a time in another.
 * Best times are keyed by vehicle for the same reason they are keyed by
 * difficulty: a leaderboard that mixes them measures the vehicle, not the drive.
 */

export interface VehicleSpec {
    id: string;
    name: string;
    blurb: string;

    // ------------------------------------------------------------- mass etc.
    /** kg. */
    mass: number;
    /** Yaw inertia, kg m^2. Roughly mass * (wheelbase/2)^2 for a road vehicle. */
    iz: number;
    wheelbase: number;
    /** CG to front axle. Smaller means more weight over the front. */
    aFront: number;
    track: number;
    cgHeight: number;

    // ------------------------------------------------------------ powertrain
    /** 0.5 * rho * Cd * A. */
    dragK: number;
    /** W. */
    peakPower: number;
    /** N, traction-limited launch. */
    peakForce: number;
    brakeForce: number;
    reverseForce: number;
    gearRatios: number[];
    finalDrive: number;
    rpmMax: number;

    // ------------------------------------------------------------------ grip
    /** Multiplies the tire curve's peak. Above 1 is stickier rubber. */
    grip: number;

    // ---------------------------------------------------------------- steering
    /** Degrees of lock at a standstill, and at speed. */
    steerMaxLow: number;
    steerMaxHigh: number;

    // ----------------------------------------------------------------- shape
    /**
     * Body proportions, as multipliers on the model the game was built around.
     * The model is a pickup made of boxes; these stretch it rather than
     * replacing it, which is enough to tell three silhouettes apart at the
     * distance a chase camera actually sits.
     */
    body: {
        length: number;
        width: number;
        height: number;
        /** Metres the whole shell sits up or down. */
        lift: number;
        /** An open pickup bed, or a closed back. */
        bed: boolean;
        wheelRadius: number;
    };
    /** Bodywork colour, linear RGB, and the darker shade used for trim panels. */
    paint: [number, number, number];
    paintDark: [number, number, number];
}

export const VEHICLES: readonly VehicleSpec[] = [
    {
        id: 'ranger',
        name: 'Ranger 4x4',
        blurb: 'Heavy, quick and planted. The one the road was built around.',
        mass: 2100,
        iz: 3300,
        wheelbase: 2.95,
        aFront: 1.44,
        track: 1.66,
        cgHeight: 0.7,
        dragK: 0.5 * 1.225 * 0.44 * 3.5,
        peakPower: 300000,
        peakForce: 9600,
        brakeForce: 15500,
        reverseForce: 4200,
        gearRatios: [3.4, 2.05, 1.38, 1.0],
        finalDrive: 3.9,
        rpmMax: 6200,
        grip: 1,
        steerMaxLow: 30,
        steerMaxHigh: 6.5,
        body: { length: 1, width: 1, height: 1, lift: 0, bed: true, wheelRadius: 1 },
        paint: [0.14, 0.26, 0.3],
        paintDark: [0.09, 0.15, 0.17]
    },
    {
        id: 'coupe',
        name: 'Hollow Coupe',
        blurb: 'Half the weight, short wheelbase, low and eager. Corners for fun, straights for patience.',
        mass: 1120,
        // Short wheelbase and low mass together: rotates almost immediately,
        // which is most of what makes it feel alive and twitchy.
        iz: 1350,
        wheelbase: 2.48,
        aFront: 1.12,
        track: 1.52,
        cgHeight: 0.48,
        dragK: 0.5 * 1.225 * 0.34 * 2.05,
        peakPower: 176000,
        peakForce: 6100,
        brakeForce: 11800,
        reverseForce: 2800,
        gearRatios: [3.6, 2.2, 1.55, 1.15, 0.92],
        finalDrive: 4.2,
        rpmMax: 7400,
        // Lighter car, softer compound, and far less load per tire.
        grip: 1.1,
        steerMaxLow: 33,
        steerMaxHigh: 8,
        body: { length: 0.84, width: 0.9, height: 0.76, lift: -0.16, bed: false, wheelRadius: 0.88 },
        paint: [0.42, 0.13, 0.11],
        paintDark: [0.2, 0.07, 0.06]
    },
    {
        id: 'hauler',
        name: 'Old Hauler',
        blurb: 'Tall, soft and down on power. Plan two corners ahead or do not bother.',
        mass: 2620,
        iz: 4700,
        wheelbase: 3.32,
        // Weight well forward, like a loaded flatbed — it pushes wide.
        aFront: 1.32,
        track: 1.74,
        cgHeight: 0.92,
        dragK: 0.5 * 1.225 * 0.58 * 4.3,
        peakPower: 143000,
        peakForce: 7400,
        brakeForce: 12600,
        reverseForce: 3600,
        gearRatios: [4.1, 2.4, 1.5, 1.0],
        finalDrive: 4.4,
        rpmMax: 4600,
        grip: 0.93,
        steerMaxLow: 28,
        steerMaxHigh: 5.6,
        body: { length: 1.12, width: 1.06, height: 1.14, lift: 0.1, bed: true, wheelRadius: 1.06 },
        paint: [0.3, 0.27, 0.13],
        paintDark: [0.16, 0.14, 0.07]
    }
];

export const DEFAULT_VEHICLE_ID = 'ranger';

export const vehicleFor = (id: string): VehicleSpec =>
    VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
