import { describe, expect, test } from "bun:test";
import { requireArchivedAt } from "./archive";

describe("workspace archiving", () => {
  test("accepts a confirmed archive result", () => {
    expect(
      requireArchivedAt({
        archivedAt: "2026-08-22T10:00:00.000Z",
        error: null,
      }),
    ).toBe("2026-08-22T10:00:00.000Z");
  });

  test("surfaces a daemon-reported archive error", () => {
    expect(() =>
      requireArchivedAt({ archivedAt: null, error: "Workspace is busy." }),
    ).toThrow("Workspace is busy.");
  });

  test("rejects an unconfirmed archive result", () => {
    expect(() => requireArchivedAt({ archivedAt: null, error: null })).toThrow(
      "Paseo did not confirm",
    );
  });
});
