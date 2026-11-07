import { describe, expect, test } from "bun:test";
import { greet, padStart, sum } from "@repo/shared-utils";

describe("web", () => {
  test("links to @repo/shared-utils through the workspace", () => {
    expect(greet("web")).toBe("Hello, web!");
  });

  test("formats the demo total", () => {
    expect(padStart(sum(1, 2, 3), 2)).toBe("06");
  });
});
