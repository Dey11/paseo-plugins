import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const LinearStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  color: z.string(),
});
export const LinearIssueSummarySchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string().url(),
  state: z.string(),
  priority: z.number().int().min(0).max(4),
  priorityLabel: z.string(),
  updatedAt: z.string(),
});
export type LinearIssueSummary = z.infer<typeof LinearIssueSummarySchema>;
export const LinearCommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  user: z.string(),
});
export const LinearAssigneeSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export const LinearIssueSchema = LinearIssueSummarySchema.extend({
  description: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  assignee: LinearAssigneeSchema.nullable(),
  assignees: z.array(LinearAssigneeSchema),
  comments: z.array(LinearCommentSchema),
  states: z.array(LinearStateSchema),
});
export type LinearIssue = z.infer<typeof LinearIssueSchema>;

export const LinearStatusRpc = defineRpc({
  name: "linear.status",
  input: z.object({}),
  output: z.object({
    configured: z.boolean(),
    source: z.enum(["environment", "credential-file", "missing"]),
  }),
});
export const SearchLinearIssuesRpc = defineRpc({
  name: "linear.issues.search",
  input: z.object({
    query: z.string().max(200).default(""),
    cursor: z.string().nullable().default(null),
  }),
  output: z.object({
    items: z.array(LinearIssueSummarySchema),
    nextCursor: z.string().nullable(),
  }),
});
export const GetLinearIssueRpc = defineRpc({
  name: "linear.issue.get",
  input: z.object({ id: z.string().min(1) }),
  output: LinearIssueSchema,
});

export const LinearMutationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("comment"),
    issueId: z.string().min(1),
    body: z.string().min(1).max(100_000),
  }),
  z.object({
    type: z.literal("state"),
    issueId: z.string().min(1),
    stateId: z.string().min(1),
  }),
  z.object({
    type: z.literal("priority"),
    issueId: z.string().min(1),
    priority: z.number().int().min(0).max(4),
  }),
  z.object({
    type: z.literal("assignee"),
    issueId: z.string().min(1),
    assigneeId: z.string().min(1).nullable(),
  }),
]);
export type LinearMutation = z.infer<typeof LinearMutationSchema>;
export const MutateLinearIssueRpc = defineRpc({
  name: "linear.issue.mutate",
  input: LinearMutationSchema,
  output: LinearIssueSchema,
});
