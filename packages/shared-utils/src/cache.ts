/** Options for constructing a {@link TtlLruCache}. */
export interface TtlLruCacheOptions {
  /** Maximum number of live entries retained by the cache. Must be a positive integer. */
  capacity: number;
  /**
   * Time-to-live in milliseconds for each entry. Defaults to `Infinity` (no expiry).
   * Must be a non-negative number; `Infinity` is allowed.
   */
  ttlMs?: number;
  /** Clock used for expiry checks. Defaults to `Date.now`. */
  now?: () => number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * A bounded cache that combines least-recently-used eviction with per-entry
 * time-to-live expiry.
 *
 * Iteration order of the backing `Map` tracks recency: the first entry is the
 * least recently used and the last entry is the most recently used. Expired
 * entries are pruned lazily whenever the cache is observed or mutated.
 */
export class TtlLruCache<K, V> {
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<K, CacheEntry<V>>();

  constructor(options: TtlLruCacheOptions) {
    const { capacity, ttlMs = Number.POSITIVE_INFINITY, now = Date.now } = options;

    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError("capacity must be a positive integer");
    }

    if (typeof ttlMs !== "number" || Number.isNaN(ttlMs) || ttlMs < 0) {
      throw new RangeError("ttlMs must be a non-negative number");
    }

    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  /**
   * Returns the value for `key`, or `undefined` when the key is missing or
   * expired. A successful lookup marks the entry as most recently used.
   */
  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }

    const current = this.now();
    if (this.isExpired(entry, current)) {
      this.entries.delete(key);
      return undefined;
    }

    // Re-inserting moves the entry to the end of the map's iteration order.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /**
   * Returns whether a live entry exists for `key`. Does not refresh either the
   * entry's TTL or its LRU recency.
   */
  has(key: K): boolean {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return false;
    }

    if (this.isExpired(entry, this.now())) {
      this.entries.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Inserts or updates an entry and marks it as most recently used. Inserting
   * beyond capacity evicts the least recently used unexpired entry.
   */
  set(key: K, value: V): void {
    const current = this.now();
    this.pruneExpired(current);

    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }

    this.entries.set(key, { value, expiresAt: current + this.ttlMs });
  }

  /**
   * Removes a live entry for `key`, returning whether one was removed. Expired
   * entries are discarded without reporting a removal.
   */
  delete(key: K): boolean {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return false;
    }

    const live = !this.isExpired(entry, this.now());
    this.entries.delete(key);
    return live;
  }

  /** Removes every entry, including expired ones. */
  clear(): void {
    this.entries.clear();
  }

  /** Number of live entries, pruning any expired entries first. */
  get size(): number {
    this.pruneExpired(this.now());
    return this.entries.size;
  }

  private isExpired(entry: CacheEntry<V>, current: number): boolean {
    return current >= entry.expiresAt;
  }

  private pruneExpired(current: number): void {
    if (this.ttlMs === Number.POSITIVE_INFINITY) {
      return;
    }

    for (const [key, entry] of this.entries) {
      if (this.isExpired(entry, current)) {
        this.entries.delete(key);
      }
    }
  }
}
