import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";
import {
  createBoardWorkflow,
  normalizeStoredReviewState,
  type BoardWorkflow,
  type ReviewState,
} from "./workflow";

export const ReviewStateSchema = z.enum(["unreviewed", "recheck", "approved"]);
export type { ReviewState } from "./workflow";

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
  input: z.object({
    workspaceId: z.string().min(1),
    markdown: z.string().max(200_000),
  }),
  output: NoteSchema,
});

const StoredReviewStateSchema = z
  .union([ReviewStateSchema, z.literal("reviewed")])
  .transform((state): ReviewState => normalizeStoredReviewState(state));

const LegacyReviewStatesSchema = z.record(z.string(), StoredReviewStateSchema);
export const BoardStateSchema = z.enum([
  "running",
  "unreviewed",
  "recheck",
  "error",
  "approved",
]);
const BoardColumnOrderSchema = z.object({
  running: z.array(z.string()),
  unreviewed: z.array(z.string()),
  recheck: z.array(z.string()),
  error: z.array(z.string()),
  approved: z.array(z.string()),
});
const CurrentBoardWorkflowSchema = z.object({
  reviewStates: LegacyReviewStatesSchema,
  columnOrder: BoardColumnOrderSchema,
});
export const BoardWorkflowSchema = z
  .union([CurrentBoardWorkflowSchema, LegacyReviewStatesSchema])
  .transform((value): BoardWorkflow => {
    const current = CurrentBoardWorkflowSchema.safeParse(value);
    return current.success
      ? current.data
      : createBoardWorkflow(LegacyReviewStatesSchema.parse(value));
  });

export const GetBoardWorkflowRpc = defineRpc({
  name: "workspace-companion.board-workflow.get",
  input: z.object({}),
  output: BoardWorkflowSchema,
});

export const PlaceBoardCardRpc = defineRpc({
  name: "workspace-companion.board-card.place",
  input: z.object({
    workspaceId: z.string().min(1),
    sourceState: BoardStateSchema,
    targetState: BoardStateSchema,
    targetIndex: z.number().int().nonnegative(),
  }),
  output: BoardWorkflowSchema,
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
