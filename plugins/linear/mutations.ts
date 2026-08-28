import type { LinearIssue, LinearMutation } from "./contracts";

const PRIORITIES = ["No priority", "Urgent", "High", "Normal", "Low"] as const;

export function describeMutation(
  issue: LinearIssue,
  mutation: LinearMutation,
): string {
  switch (mutation.type) {
    case "comment":
      return `Post this comment to ${issue.identifier}: “${truncate(mutation.body, 100)}”`;
    case "state":
      return `Move ${issue.identifier} from ${issue.state} to ${issue.states.find((state) => state.id === mutation.stateId)?.name ?? "the selected state"}.`;
    case "priority":
      return `Change ${issue.identifier} priority from ${issue.priorityLabel} to ${PRIORITIES[mutation.priority]}.`;
    case "assignee": {
      const current = issue.assignee?.name ?? "Unassigned";
      const next = mutation.assigneeId
        ? (issue.assignees.find(
            (assignee) => assignee.id === mutation.assigneeId,
          )?.name ?? "the selected teammate")
        : "Unassigned";
      return `Change ${issue.identifier} assignee from ${current} to ${next}.`;
    }
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
