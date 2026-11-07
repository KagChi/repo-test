import { describe, expect, test } from "bun:test";
import { DEFAULT_CACHE_TTL_MS, resolveCacheTtlMs } from "./app";
import { DEFAULT_DB_PATH, resolveDbPath } from "./store";

describe("configuration", () => {
  test("DB_PATH overrides the local default", () => {
    const original = process.env.DB_PATH;
    try {
      process.env.DB_PATH = "/tmp/custom-notes.sqlite";
      expect(resolveDbPath()).toBe("/tmp/custom-notes.sqlite");

      process.env.DB_PATH = ":memory:";
      expect(resolveDbPath()).toBe(":memory:");

      delete process.env.DB_PATH;
      expect(resolveDbPath()).toBe(DEFAULT_DB_PATH);
    } finally {
      if (original === undefined) {
        delete process.env.DB_PATH;
      } else {
        process.env.DB_PATH = original;
      }
    }
  });

  test("CACHE_TTL_MS overrides the default TTL", () => {
    expect(resolveCacheTtlMs({})).toBe(DEFAULT_CACHE_TTL_MS);
    expect(resolveCacheTtlMs({ CACHE_TTL_MS: "1500" })).toBe(1500);
    expect(resolveCacheTtlMs({ CACHE_TTL_MS: "0" })).toBe(0);
  });

  test("falls back to the default TTL for invalid values", () => {
    expect(resolveCacheTtlMs({ CACHE_TTL_MS: "abc" })).toBe(DEFAULT_CACHE_TTL_MS);
    expect(resolveCacheTtlMs({ CACHE_TTL_MS: "-1" })).toBe(DEFAULT_CACHE_TTL_MS);
    expect(resolveCacheTtlMs({ CACHE_TTL_MS: "  " })).toBe(DEFAULT_CACHE_TTL_MS);
  });
});
