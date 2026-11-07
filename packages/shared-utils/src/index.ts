export type { TtlLruCacheOptions } from "./cache";
export { TtlLruCache } from "./cache";

/**
 * Formats a greeting message.
 *
 * @param name - The name to greet.
 * @returns A greeting string.
 */
export function greet(name: string): string {
  const trimmed = name.trim();
  return `Hello, ${trimmed.length > 0 ? trimmed : "world"}!`;
}

/** Returns the sum of the provided numbers. */
export function sum(...values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Pads a number with leading zeroes to the given width. */
export function padStart(value: number, width: number, fill = "0"): string {
  return String(value).padStart(width, fill);
}

/**
 * Capitalizes a string by uppercasing its first character and lowercasing the
 * rest.
 *
 * Leading and trailing whitespace is trimmed, internal whitespace is preserved,
 * and blank input returns an empty string.
 *
 * @param value - The string to capitalize.
 * @returns The capitalized string.
 */
export function capitalize(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Lowercase Latin characters that Unicode decomposition leaves untouched,
 * mapped to their ASCII equivalents.
 */
const ASCII_FALLBACKS: Readonly<Record<string, string>> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ħ: "h",
  ı: "i",
  ŋ: "n",
  ſ: "s",
  ĸ: "k",
};

/**
 * Converts a string into a URL-friendly slug.
 *
 * Input is trimmed, accented Latin characters are normalized to their ASCII
 * equivalents, and all remaining non-alphanumeric ASCII characters are
 * collapsed into single hyphens. Leading and trailing hyphens are removed, and
 * blank input (or input without any alphanumeric characters) returns an empty
 * string.
 *
 * @param value - The string to slugify.
 * @returns The slugified string.
 */
export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      // Split accented characters into base letters plus combining marks.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      // Fold the remaining lowercase Latin characters that do not decompose.
      .replace(/[ßæœøłđðþħıŋſĸ]/g, (character) => ASCII_FALLBACKS[character] ?? character)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

export const VERSION = "0.1.0";
