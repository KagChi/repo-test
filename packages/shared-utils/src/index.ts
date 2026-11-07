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

export const VERSION = "0.1.0";
