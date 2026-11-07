import { describe, expect, test } from "bun:test";
import { greet, padStart, sum, VERSION } from "../src/index";

describe("shared-utils", () => {
  test("greet uses the provided name", () => {
    expect(greet("Bun")).toBe("Hello, Bun!");
  });

  test("greet trims input and falls back for blanks", () => {
    expect(greet("  ")).toBe("Hello, world!");
  });

  test("sum adds values", () => {
    expect(sum(1, 2, 3)).toBe(6);
    expect(sum()).toBe(0);
  });

  test("padStart pads values", () => {
    expect(padStart(7, 3)).toBe("007");
  });

  test("exposes a version", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
