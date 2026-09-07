import { hash2 } from '../util/rng';

/**
 * Biomes: what world you are in, as opposed to how the road behaves in it.
 *
 * Chapters vary twistiness, grade, width, fog, time of day and surface — every
 * one of which describes the carriageway. None touches what is either side of
 * it, above it, or beyond the treeline, so all eight render as a gravel road
 * through the same forest under the same sky. The Switchbacks measurably
 * carries five times the twist of the straightest chapter and still does not
 * read as somewhere new, because the frame is mostly trees and the trees never
 * change.
 *
 * This is Phase 0 of `docs/blue-ridge-backroad/BIOMES.md` and nothing more: two
 * biomes, hard cut, no transition handling. It exists to answer one question —
 * does changing the surroundings fix the sameness that changing the road did
 * not? If driving out of the trees into open sky does not feel like arriving
 * somewhere, the layer is wrong and stopping here is cheap.
 *
 * Like everything else in the world, a biome is a pure function of distance and
 * the seed, so a chunk rebuilt at a different level of detail — or a road
 * regenerated from the origin after the sample ring has pruned — comes back
 * identical.
 */

/** Metres per biome. A hard cut lands on every multiple of this. */
export const BIOME_LENGTH = 3000;

export interface Biome {
    id: string;
    name: string;

    // ------------------------------------------------------------- vegetation
    /**
     * Metres from the ditch lip to the nearest trunk, and how far out from
     * there trees are spread.
     *
     * The single biggest lever on how open the road feels, and the reason
     * Farmland is the cheapest possible contrast: pushing the treeline from 1 m
     * to 60 m changes the whole frame without one new mesh.
     */
    treeSetback: number;
    treeSpread: number;
    /** Multipliers on the forest's own counts. */
    treeDensity: number;
    scrubDensity: number;
    rockDensity: number;
    logDensity: number;
    /**
     * Low scatter spread across the open ground, standing in for crop and
     * pasture. Reuses the fern mesh at a squashed scale — the cheapest thing
     * that reads as a field rather than woods.
     */
    fieldDensity: number;
    /** How far out the field scatter goes. */
    fieldSpread: number;

    // ------------------------------------------------------------------ light
    /**
     * Multiplies whatever fog the road asks for. Farmland wants its horizon
     * visible; that is most of what "wide sky" means from inside the car.
     */
    hazeScale: number;
    /**
     * Flatter light: less directional, more ambient. Farmland has no canopy to
     * cast the dappled shadow that gives the forest its contrast.
     */
    sunScale: number;
    ambientScale: number;

    // ----------------------------------------------------------------- ground
    /** Added to the terrain's vertex colour, before clamping. */
    groundTint: [number, number, number];
}

export const BIOMES: readonly Biome[] = [
    {
        id: 'forest',
        name: 'Deep Forest',
        // The road exactly as it was. Every number here is the one that was
        // hard-coded in the scatter before biomes existed, so this biome is the
        // baseline in the strict sense: nothing about it changed.
        treeSetback: 1.2,
        treeSpread: 52,
        treeDensity: 1,
        scrubDensity: 1,
        rockDensity: 1,
        logDensity: 1,
        fieldDensity: 0,
        fieldSpread: 0,
        hazeScale: 1,
        sunScale: 1,
        ambientScale: 1,
        groundTint: [0, 0, 0]
    },
    {
        id: 'farmland',
        name: 'Farmland',
        // Trees to the far edge of the field and thinned right out: what is left
        // reads as a hedgerow on the boundary rather than a wall beside the car.
        // Setback plus spread has to stay inside the conformed ribbon: 60 + 46
        // put the far trees at 106 m from the lip when terrain reached 62, and
        // they stood on nothing. The scatter clamps as well, but a biome that
        // needs clamping is a biome asking for trees that cannot exist.
        treeSetback: 58,
        treeSpread: 12,
        treeDensity: 0.5,
        // No undergrowth crowding the verge — that is what makes a forest road
        // feel like a corridor.
        scrubDensity: 0.15,
        rockDensity: 0.3,
        // A ploughed field is not strewn with fallen branches.
        logDensity: 0.1,
        fieldDensity: 2.6,
        fieldSpread: 64,
        // Clear enough to see the far side of the valley.
        hazeScale: 0.45,
        sunScale: 0.82,
        ambientScale: 1.35,
        // Drier and yellower than forest floor: stubble and pasture.
        groundTint: [0.1, 0.06, -0.06]
    }
];

export const DEFAULT_BIOME = BIOMES[0];

/**
 * Which biome slot a distance falls in. Negative distances clamp to the first,
 * which keeps the road behind the origin from flickering.
 */
export const biomeSlotAt = (s: number): number => Math.max(0, Math.floor(s / BIOME_LENGTH));

/**
 * Which biome occupies a slot.
 *
 * Alternating, with the phase taken from the seed. Phase 0 asks for a hard cut
 * at every boundary, so picking independently per slot would be wrong — with
 * two biomes it would leave half the boundaries with no cut at all. Stepping
 * guarantees that every multiple of `BIOME_LENGTH` is a change, which is the
 * thing being tested.
 */
export const biomeIndexForSlot = (slot: number, seed: number): number => {
    const phase = hash2(seed, 0x5eed) & 1;
    return (slot + phase) % BIOMES.length;
};

export const biomeAt = (s: number, seed: number): Biome =>
    BIOMES[biomeIndexForSlot(biomeSlotAt(s), seed)];

export const biomeIdAt = (s: number, seed: number): string => biomeAt(s, seed).id;
