export type ReviewState = "unreviewed" | "recheck" | "approved";

export function normalizeStoredReviewState(
  state: ReviewState | "reviewed",
): ReviewState {
  return state === "reviewed" ? "unreviewed" : state;
}

export type BoardState = "running" | ReviewState | "error";

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
