import type { ReviewState } from "./contracts";

export function setReviewState(
  states: Readonly<Record<string, ReviewState>>,
  workspaceId: string,
  state: ReviewState,
): Record<string, ReviewState> {
  return { ...states, [workspaceId]: state };
}
