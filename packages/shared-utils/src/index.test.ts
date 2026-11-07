import { describe, expect, test } from "bun:test";
import { capitalize, clamp, greet, padStart, slugify, sum, VERSION } from "../src/index";

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

  describe("clamp", () => {
    test("returns the minimum when the value is below the range", () => {
      expect(clamp(-2, 0, 10)).toBe(0);
    });

    test("returns the maximum when the value is above the range", () => {
      expect(clamp(12, 0, 10)).toBe(10);
    });

    test("returns the value when it is within the inclusive range", () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    test("treats the bounds as inclusive", () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    test("supports negative and fractional ranges", () => {
      expect(clamp(-0.5, -1, 1)).toBe(-0.5);
      expect(clamp(-2.5, -1, 1)).toBe(-1);
      expect(clamp(2.5, -1, 1)).toBe(1);
      expect(clamp(0.25, 0.25, 0.25)).toBe(0.25);
    });

    test("throws a RangeError when any argument is not finite", () => {
      expect(() => clamp(Number.NaN, 0, 10)).toThrow(RangeError);
      expect(() => clamp(0, Number.NaN, 10)).toThrow(RangeError);
      expect(() => clamp(0, 0, Number.NaN)).toThrow(RangeError);
      expect(() => clamp(Number.POSITIVE_INFINITY, 0, 10)).toThrow(RangeError);
      expect(() => clamp(0, Number.NEGATIVE_INFINITY, 10)).toThrow(RangeError);
      expect(() => clamp(0, 0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });

    test("throws a RangeError when the minimum exceeds the maximum", () => {
      expect(() => clamp(5, 10, 0)).toThrow(RangeError);
    });
  });

  test("capitalize trims whitespace and normalizes casing", () => {
    expect(capitalize("  hello WORLD  ")).toBe("Hello world");
  });

  test("capitalize returns an empty string for empty input", () => {
    expect(capitalize("")).toBe("");
    expect(capitalize("   ")).toBe("");
  });

  test("capitalize preserves internal whitespace", () => {
    expect(capitalize("  hELLO   wORLD  ")).toBe("Hello   world");
  });

  test("capitalize handles single characters and already-capitalized input", () => {
    expect(capitalize("a")).toBe("A");
    expect(capitalize("HELLO")).toBe("Hello");
  });

  test("slugify lowercases and hyphenates words", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  test("slugify trims input and normalizes accented characters", () => {
    expect(slugify("  Café déjà vu  ")).toBe("cafe-deja-vu");
  });

  test("slugify normalizes non-decomposable Latin characters", () => {
    expect(slugify("Æther Straße")).toBe("aether-strasse");
    expect(slugify("Œuvre Øresund")).toBe("oeuvre-oresund");
  });

  test("slugify collapses runs of non-alphanumeric characters", () => {
    expect(slugify("Hello___  ---World")).toBe("hello-world");
  });

  test("slugify removes leading and trailing hyphens", () => {
    expect(slugify("---")).toBe("");
    expect(slugify("  ...Hello World...  ")).toBe("hello-world");
    expect(slugify("--Hello--")).toBe("hello");
  });

  test("slugify returns an empty string for blank or non-alphanumeric input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("!@#$%^&*()")).toBe("");
  });

  test("slugify preserves numbers", () => {
    expect(slugify("Version 2.0 Release")).toBe("version-2-0-release");
  });

  test("slugify is idempotent", () => {
    const slug = slugify("  Café déjà vu  ");
    expect(slugify(slug)).toBe(slug);
  });

  test("exposes a version", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
