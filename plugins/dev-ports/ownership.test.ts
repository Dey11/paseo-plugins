import { describe, expect, test } from "bun:test";
import { inspectOwnedMapping } from "./ownership";

describe("Tailscale mapping ownership", () => {
  test("refuses to remove an unowned mapping", () => {
    expect(() =>
      inspectOwnedMapping([], [{ exposedPort: 3000, sourcePort: 3000 }], 3000),
    ).toThrow("not owned by this plugin");
  });

  test("distinguishes present and stale owned mappings", () => {
    expect(
      inspectOwnedMapping(
        [3000],
        [{ exposedPort: 3000, sourcePort: 3000 }],
        3000,
      ),
    ).toBe("present");
    expect(inspectOwnedMapping([3000], [], 3000)).toBe("missing");
  });
});
