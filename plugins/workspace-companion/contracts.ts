import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const ReviewStateSchema = z.enum(["unreviewed", "reviewed", "recheck", "approved"]);
export type ReviewState = z.infer<typeof ReviewStateSchema>;

export const NoteSchema = z.object({
  workspaceId: z.string().min(1),
  markdown: z.string().max(200_000),
  updatedAt: z.string(),
});

export const GetNoteRpc = defineRpc({
  name: "workspace-companion.note.get",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: NoteSchema,
});

export const SaveNoteRpc = defineRpc({
  name: "workspace-companion.note.save",
  input: z.object({ workspaceId: z.string().min(1), markdown: z.string().max(200_000) }),
  output: NoteSchema,
});

export const ReviewStatesSchema = z.record(z.string(), ReviewStateSchema);

export const GetReviewStatesRpc = defineRpc({
  name: "workspace-companion.review-states.get",
  input: z.object({}),
  output: ReviewStatesSchema,
});

export const SetReviewStateRpc = defineRpc({
  name: "workspace-companion.review-states.set",
  input: z.object({ workspaceId: z.string().min(1), state: ReviewStateSchema }),
  output: z.object({ workspaceId: z.string(), state: ReviewStateSchema }),
});

export const ReviewCheckSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  priority: z.enum(["high", "medium", "normal"]),
});

export const ReviewPlanSchema = z.object({
  workspaceId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  files: z.array(z.string()),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  checks: z.array(ReviewCheckSchema),
  gitAvailable: z.boolean(),
});
export type ReviewPlan = z.infer<typeof ReviewPlanSchema>;

export const GetReviewPlanRpc = defineRpc({
  name: "workspace-companion.review-plan.get",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: ReviewPlanSchema.nullable(),
});

export const GenerateReviewPlanRpc = defineRpc({
  name: "workspace-companion.review-plan.generate",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: ReviewPlanSchema,
});
