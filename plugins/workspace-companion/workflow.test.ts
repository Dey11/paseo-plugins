import { describe, expect, test } from "bun:test";
import {
  createBoardWorkflow,
  normalizeStoredReviewState,
  orderBoardWorkspaceIds,
  placeBoardCard,
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

  test("persists a same-column reorder at the requested index", () => {
    const workflow = createBoardWorkflow({
      "workspace-a": "unreviewed",
      "workspace-b": "unreviewed",
      "workspace-c": "unreviewed",
    });
    workflow.columnOrder.unreviewed = [
      "workspace-a",
      "workspace-b",
      "workspace-c",
    ];

    expect(
      placeBoardCard(workflow, {
        workspaceId: "workspace-a",
        sourceState: "unreviewed",
        targetState: "unreviewed",
        targetIndex: 3,
      }).columnOrder.unreviewed,
    ).toEqual(["workspace-b", "workspace-c", "workspace-a"]);
  });

  test("moves review cards atomically with their saved order", () => {
    const workflow = createBoardWorkflow({
      "workspace-a": "unreviewed",
      "workspace-b": "approved",
      "workspace-c": "approved",
    });
    workflow.columnOrder.unreviewed = ["workspace-a"];
    workflow.columnOrder.approved = ["workspace-b", "workspace-c"];

    expect(
      placeBoardCard(workflow, {
        workspaceId: "workspace-a",
        sourceState: "unreviewed",
        targetState: "approved",
        targetIndex: 1,
      }),
    ).toEqual({
      reviewStates: {
        "workspace-a": "approved",
        "workspace-b": "approved",
        "workspace-c": "approved",
      },
      columnOrder: {
        running: [],
        unreviewed: [],
        approved: ["workspace-b", "workspace-a", "workspace-c"],
        recheck: [],
        error: [],
      },
    });
  });

  test("allows live columns to reorder but not accept cross-column moves", () => {
    const workflow = createBoardWorkflow({});
    workflow.columnOrder.running = ["workspace-a", "workspace-b"];

    expect(
      placeBoardCard(workflow, {
        workspaceId: "workspace-b",
        sourceState: "running",
        targetState: "running",
        targetIndex: 0,
      }).columnOrder.running,
    ).toEqual(["workspace-b", "workspace-a"]);
    expect(() =>
      placeBoardCard(workflow, {
        workspaceId: "workspace-a",
        sourceState: "running",
        targetState: "unreviewed",
        targetIndex: 0,
      }),
    ).toThrow("Live board states can only be reordered in place.");
  });

  test("applies saved order and appends newly discovered workspaces", () => {
    expect(
      orderBoardWorkspaceIds(
        ["workspace-new", "workspace-b", "workspace-a"],
        ["workspace-a", "workspace-b", "workspace-gone"],
      ),
    ).toEqual(["workspace-a", "workspace-b", "workspace-new"]);
  });
});
