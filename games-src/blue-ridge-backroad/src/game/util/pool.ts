/** Generic object pool — nothing is ever destroyed, only parked. */
export class Pool<T> {
    private free: T[] = [];
    private readonly factory: () => T;

    constructor(factory: () => T, prewarm = 0) {
        this.factory = factory;
        for (let i = 0; i < prewarm; i++) this.free.push(factory());
    }

    acquire(): T {
        const item = this.free.pop();
        return item !== undefined ? item : this.factory();
    }

    release(item: T): void {
        this.free.push(item);
    }

    get available(): number {
        return this.free.length;
    }
}

/**
 * Free-list allocator over a fixed number of instance slots. Used so all of a
 * species' vegetation lives in one InstancedMesh with one draw call, while
 * chunks come and go independently.
 */
export class SlotAllocator {
    private readonly free: Int32Array;
    private top: number;
    readonly capacity: number;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.free = new Int32Array(capacity);
        for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
        this.top = capacity;
    }

    /** Returns a slot index, or -1 when the pool is exhausted. */
    alloc(): number {
        if (this.top === 0) return -1;
        this.top -= 1;
        return this.free[this.top];
    }

    release(slot: number): void {
        if (this.top >= this.capacity) return;
        this.free[this.top] = slot;
        this.top += 1;
    }

    get used(): number {
        return this.capacity - this.top;
    }

    reset(): void {
        for (let i = 0; i < this.capacity; i++) this.free[i] = this.capacity - 1 - i;
        this.top = this.capacity;
    }
}
