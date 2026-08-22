import { describe, expect, test } from "bun:test";
import {
  normalizeStoredReviewState,
  resolveBoardState,
  setReviewState,
} from "./workflow";

describe("review workflow", () => {
  test("moves one workspace without changing the others", () => {
    expect(
      setReviewState(
        { "workspace-a": "unreviewed", "workspace-b": "approved" },
        "workspace-a",
        "recheck",
      ),
    ).toEqual({ "workspace-a": "recheck", "workspace-b": "approved" });
  });

  test("puts failures ahead of active and review states", () => {
    expect(
      resolveBoardState(
        { status: "running" },
        [{ status: "error", attentionReason: "error" }],
        "approved",
      ),
    ).toBe("error");
  });

  test("keeps running state live instead of storing it", () => {
    expect(
      resolveBoardState(
        { status: "done" },
        [{ status: "running", attentionReason: null }],
        "approved",
      ),
    ).toBe("running");
  });

  test("uses the manual review state after work stops", () => {
    expect(
      resolveBoardState(
        { status: "done" },
        [{ status: "idle", attentionReason: "finished" }],
        "recheck",
      ),
    ).toBe("recheck");
  });

  test("migrates the removed reviewed state to unreviewed", () => {
    expect(normalizeStoredReviewState("reviewed")).toBe("unreviewed");
    expect(normalizeStoredReviewState("approved")).toBe("approved");
  });
});
