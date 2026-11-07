import { describe, expect, test } from "bun:test";
import { capitalize, greet, padStart, slugify, sum, VERSION } from "../src/index";

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
