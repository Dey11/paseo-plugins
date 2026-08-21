import { describe, expect, test } from "bun:test";
import { setReviewState } from "./workflow";

describe("review workflow", () => {
  test("moves one workspace without changing the others", () => {
    expect(
      setReviewState(
        { "workspace-a": "reviewed", "workspace-b": "approved" },
        "workspace-a",
        "recheck",
      ),
    ).toEqual({ "workspace-a": "recheck", "workspace-b": "approved" });
  });
});
