export type ReviewState = "unreviewed" | "recheck" | "approved";

export const BOARD_STATES = [
  "running",
  "unreviewed",
  "recheck",
  "error",
  "approved",
] as const;

export function normalizeStoredReviewState(
  state: ReviewState | "reviewed",
): ReviewState {
  return state === "reviewed" ? "unreviewed" : state;
}

export type BoardState = "running" | ReviewState | "error";

export type BoardColumnOrder = Record<BoardState, string[]>;

export interface BoardWorkflow {
  reviewStates: Record<string, ReviewState>;
  columnOrder: BoardColumnOrder;
}

export interface BoardPlacement {
  workspaceId: string;
  sourceState: BoardState;
  targetState: BoardState;
  targetIndex: number;
}

export interface BoardWorkspaceStatus {
  status: "needs_input" | "failed" | "running" | "attention" | "done";
}

export interface BoardAgentStatus {
  status: "initializing" | "idle" | "running" | "error" | "closed";
  attentionReason?: "finished" | "error" | "permission" | null;
}

/** Live failures and active work take precedence over the stored review state. */
export function resolveBoardState(
  workspace: BoardWorkspaceStatus,
  agents: readonly BoardAgentStatus[],
  reviewState: ReviewState,
): BoardState {
  if (
    workspace.status === "failed" ||
    agents.some(
      (agent) => agent.status === "error" || agent.attentionReason === "error",
    )
  ) {
    return "error";
  }

  if (
    workspace.status === "running" ||
    agents.some((agent) => ["initializing", "running"].includes(agent.status))
  ) {
    return "running";
  }

  return reviewState;
}

export function setReviewState(
  states: Readonly<Record<string, ReviewState>>,
  workspaceId: string,
  state: ReviewState,
): Record<string, ReviewState> {
  return { ...states, [workspaceId]: state };
}

/** Creates the persisted board model while preserving legacy review markers. */
export function createBoardWorkflow(
  reviewStates: Readonly<Record<string, ReviewState>>,
): BoardWorkflow {
  return {
    reviewStates: { ...reviewStates },
    columnOrder: {
      running: [],
      unreviewed: [],
      recheck: [],
      error: [],
      approved: [],
    },
  };
}

/** Applies one drag placement to review state and ordering as one atomic value. */
export function placeBoardCard(
  workflow: Readonly<BoardWorkflow>,
  placement: BoardPlacement,
): BoardWorkflow {
  const { workspaceId, sourceState, targetState } = placement;
  if (!canPlaceBoardCard(sourceState, targetState)) {
    throw new Error("Live board states can only be reordered in place.");
  }

  const columnOrder = Object.fromEntries(
    BOARD_STATES.map((state) => [
      state,
      workflow.columnOrder[state].filter((id) => id !== workspaceId),
    ]),
  ) as BoardColumnOrder;
  const previousTargetIndex =
    workflow.columnOrder[targetState].indexOf(workspaceId);
  const correctedIndex =
    sourceState === targetState &&
    previousTargetIndex >= 0 &&
    previousTargetIndex < placement.targetIndex
      ? placement.targetIndex - 1
      : placement.targetIndex;
  const targetIndex = Math.max(
    0,
    Math.min(correctedIndex, columnOrder[targetState].length),
  );
  columnOrder[targetState].splice(targetIndex, 0, workspaceId);

  return {
    reviewStates: isReviewState(targetState)
      ? setReviewState(workflow.reviewStates, workspaceId, targetState)
      : { ...workflow.reviewStates },
    columnOrder,
  };
}

export function canPlaceBoardCard(
  sourceState: BoardState,
  targetState: BoardState,
): boolean {
  return (
    sourceState === targetState ||
    (isReviewState(sourceState) && isReviewState(targetState))
  );
}

/** Keeps known cards in saved order and appends new cards in their live order. */
export function orderBoardWorkspaceIds(
  liveWorkspaceIds: readonly string[],
  savedWorkspaceIds: readonly string[],
): string[] {
  const live = new Set(liveWorkspaceIds);
  const ordered = savedWorkspaceIds.filter((id) => live.delete(id));
  return [...ordered, ...liveWorkspaceIds.filter((id) => live.has(id))];
}

function isReviewState(state: BoardState): state is ReviewState {
  return ["unreviewed", "approved", "recheck"].includes(state);
}
