/** Deterministic 32-bit PRNG. Same seed always yields the same stream. */
export class Rng {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0 || 0x9e3779b9;
    }

    reseed(seed: number): void {
        this.state = seed >>> 0 || 0x9e3779b9;
    }

    /** [0, 1) */
    next(): number {
        // mulberry32
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range(lo: number, hi: number): number {
        return lo + (hi - lo) * this.next();
    }

    int(loInclusive: number, hiExclusive: number): number {
        return loInclusive + Math.floor(this.next() * (hiExclusive - loInclusive));
    }

    chance(p: number): boolean {
        return this.next() < p;
    }

    pick<T>(items: readonly T[]): T {
        return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
    }
}

/** Order-independent integer hash — used to derive a per-chunk seed. */
export const hash2 = (a: number, b: number): number => {
    let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    return h >>> 0;
};

/** Deterministic [0,1) from an integer, without holding any state. */
export const hashFloat = (n: number): number => {
    let h = n >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};
