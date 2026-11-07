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

export const VERSION = "0.1.0";
