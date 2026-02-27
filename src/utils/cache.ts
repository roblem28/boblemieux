// simple in-memory cache
class Cache {
    _cache: { [key: string]: any };

    constructor() {
        this._cache = {};
    }

    get(key: string) {
        return this._cache[key];
    }

    set(key: string, value: any) {
        this._cache[key] = value;
    }
}

export const cache = new Cache();
