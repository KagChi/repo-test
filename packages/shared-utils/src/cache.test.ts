import { describe, expect, test } from "bun:test";
import { TtlLruCache } from "./cache";

function createClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("TtlLruCache", () => {
  describe("validation", () => {
    test("accepts a positive integer capacity", () => {
      expect(() => new TtlLruCache({ capacity: 1 })).not.toThrow();
    });

    test("rejects non-positive, fractional, and non-finite capacities", () => {
      for (const capacity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => new TtlLruCache({ capacity })).toThrow(RangeError);
      }
    });

    test("rejects negative and non-numeric TTLs but accepts Infinity", () => {
      for (const ttlMs of [-1, Number.NaN]) {
        expect(() => new TtlLruCache({ capacity: 1, ttlMs })).toThrow(RangeError);
      }

      expect(() => new TtlLruCache({ capacity: 1, ttlMs: 0 })).not.toThrow();
      expect(() => new TtlLruCache({ capacity: 1, ttlMs: Number.POSITIVE_INFINITY })).not.toThrow();
    });
  });

  describe("get and set", () => {
    test("stores and retrieves values", () => {
      const cache = new TtlLruCache<string, number>({ capacity: 2 });

      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);
    });

    test("returns undefined for missing keys", () => {
      const cache = new TtlLruCache<string, number>({ capacity: 2 });

      expect(cache.get("missing")).toBeUndefined();
    });

    test("updates an existing key with a new value, expiry, and recency", () => {
      const clock = createClock();
      const cache = new TtlLruCache<string, number>({
        capacity: 2,
        ttlMs: 100,
        now: clock.now,
      });

      cache.set("a", 1);
      cache.set("b", 2);
      clock.advance(80);
      cache.set("a", 10);
      expect(cache.get("a")).toBe(10);

      // "a" was refreshed at t=80, so it outlives its original expiry.
      clock.advance(80);
      expect(cache.get("a")).toBe(10);
      expect(cache.get("b")).toBeUndefined();
      expect(cache.size).toBe(1);

      clock.advance(21);
      expect(cache.get("a")).toBeUndefined();
    });

    test("does not grow size when updating an existing key", () => {
      const cache = new TtlLruCache<string, number>({ capacity: 1 });

      cache.set("a", 1);
      cache.set("a", 2);

      expect(cache.size).toBe(1);
      expect(cache.get("a")).toBe(2);
    });
  });

  describe("TTL expiry", () => {
    test("expires entries after the TTL elapses", () => {
      const clock = createClock();
      const cache = new TtlLruCache<string, number>({
        capacity: 2,
        ttlMs: 100,
        now: clock.now,
      });

      cache.set("a", 1);
      clock.advance(99);
      expect(cache.get("a")).toBe(1);

      clock.advance(1);
      expect(cache.get("a")).toBeUndefined();
    });

    test("treats entries as expired exactly at the expiry boundary", () => {
      const clock = createClock(1_000);
      const cache = new TtlLruCache<string, number>({
        capacity: 1,
        ttlMs: 50,
        now: clock.now,
      });

      cache.set("a", 1);
      clock.advance(50);

      expect(cache.has("a")).toBe(false);
      expect(cache.get("a")).toBeUndefined();
    });

    test("supports an infinite TTL by default", () => {
      const clock = createClock();
      const cache = new TtlLruCache<string, number>({ capacity: 1, now: clock.now });

      cache.set("a", 1);
      clock.advance(Number.MAX_SAFE_INTEGER);

      expect(cache.get("a")).toBe(1);
    });

    test("prunes expired entries when reading size", () => {
      const clock = createClock();
      const cache = new TtlLruCache<string, number>({
        capacity: 3,
        ttlMs: 10,
        now: clock.now,
      });

      cache.set("a", 1);
      cache.set("b", 2);
      clock.advance(10);

      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
    });
  });

  describe("has", () => {
    test("reports live entries and hides expired ones", () => {
      const clock = createClock();
      const cache = new TtlLruCache<string, number>({
        capacity: 2,
        ttlMs: 100,
        now: clock.now,
      });

      cache.set("a", 1);
      expect(cache.has("a")).toBe(true);
      expect(cache.has("missing")).toBe(false);

      clock.advance(100);
      expect(cache.has("a")).toBe(false);
    });

    test("does not refresh TTL or LRU recency", () => {
      const clock = createClock();
      const cache = new TtlLruCache<string, number>({
        capacity: 2,
        ttlMs: 100,
        now: clock.now,
      });

      cache.set("a", 1);
      cache.set("b", 2);

      clock.advance(50);
      expect(cache.has("a")).toBe(true);

      // "a" was not refreshed, so it is still the least recently used entry.
      clock.advance(30);
      cache.set("c", 3);
      expect(cache.has("a")).toBe(false);
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
    });

    test("does not extend the TTL of an entry", () => {
      const clock = createClock();
      const cache = new TtlLruCache<string, number>({
        capacity: 1,
        ttlMs: 100,
        now: clock.now,
      });

      cache.set("a", 1);
      clock.advance(60);
      expect(cache.has("a")).toBe(true);

      clock.advance(40);
      expect(cache.has("a")).toBe(false);
    });
  });

  describe("LRU eviction", () => {
    test("evicts the least recently used entry when over capacity", () => {
      const cache = new TtlLruCache<string, number>({ capacity: 2 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.size).toBe(2);
    });

    test("get marks an entry as most recently used", () => {
      const cache = new TtlLruCache<string, number>({ capacity: 2 });

      cache.set("a", 1);
      cache.set("b", 2);
      expect(cache.get("a")).toBe(1);
      cache.set("c", 3);

      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe(3);
    });

    test("set marks an updated entry as most recently used", () => {
      const cache = new TtlLruCache<string, number>({ capacity: 2 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("a", 10);
      cache.set("c", 3);

      expect(cache.get("a")).toBe(10);
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe(3);
    });

    test("prunes expired entries instead of evicting live ones", () => {
      const clock = createClock();
      const cache = new TtlLruCache<string, number>({
        capacity: 2,
        ttlMs: 10,
        now: clock.now,
      });

      cache.set("a", 1);
      cache.set("b", 2);
      clock.advance(10);
      cache.set("c", 3);

      expect(cache.get("c")).toBe(3);
      expect(cache.size).toBe(1);
    });
  });

  describe("delete and clear", () => {
    test("delete removes live entries and reports the removal", () => {
      const cache = new TtlLruCache<string, number>({ capacity: 2 });

      cache.set("a", 1);

      expect(cache.delete("a")).toBe(true);
      expect(cache.delete("a")).toBe(false);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    test("delete reports false for expired entries", () => {
      const clock = createClock();
      const cache = new TtlLruCache<string, number>({
        capacity: 1,
        ttlMs: 10,
        now: clock.now,
      });

      cache.set("a", 1);
      clock.advance(10);

      expect(cache.delete("a")).toBe(false);
      expect(cache.size).toBe(0);
    });

    test("clear removes all entries", () => {
      const cache = new TtlLruCache<string, number>({ capacity: 3 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.has("b")).toBe(false);
    });
  });
});
