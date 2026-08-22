import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";
import {
  createBoardWorkflow,
  normalizeStoredReviewState,
  type BoardWorkflow,
  type ReviewState,
} from "./workflow";
import { ReviewPlanSchema } from "./qa";
export {
  QaAnalysisSchema,
  QaFlowSchema,
  ReviewPlanSchema,
  type QaAnalysis,
  type ReviewPlan,
} from "./qa";

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

const LegacyReviewPlanSchema = z.object({
  workspaceId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  files: z.array(z.string()),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  checks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      detail: z.string(),
      priority: z.enum(["high", "medium", "normal"]),
    }),
  ),
  gitAvailable: z.boolean(),
});

const CurrentReviewDocumentSchema = z.object({
  status: z.enum(["idle", "generating", "ready", "error"]),
  plan: ReviewPlanSchema.nullable(),
  requestedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type ReviewDocument = z.infer<typeof CurrentReviewDocumentSchema>;

export const ReviewDocumentSchema = z
  .union([CurrentReviewDocumentSchema, LegacyReviewPlanSchema, z.null()])
  .transform((value): ReviewDocument => {
    if (value === null) return emptyReviewDocument();
    const current = CurrentReviewDocumentSchema.safeParse(value);
    if (current.success) return current.data;
    const legacy = LegacyReviewPlanSchema.parse(value);
    return {
      status: "ready",
      requestedAt: legacy.generatedAt,
      error: null,
      plan: {
        workspaceId: legacy.workspaceId,
        sourceAgentId: "legacy",
        generatedAt: legacy.generatedAt,
        summary: legacy.summary,
        changes: [legacy.summary],
        flows: legacy.checks.map((check, index) => ({
          id: check.id || `legacy-${index + 1}`,
          surface: "Workspace",
          title: check.title,
          why: check.detail,
          priority: check.priority === "high" ? "high" : "normal",
          steps: [check.detail],
        })),
        watchFor: [],
        files: legacy.files,
        additions: legacy.additions,
        deletions: legacy.deletions,
        gitAvailable: legacy.gitAvailable,
        transcriptMessageCount: 0,
      },
    };
  });

export function emptyReviewDocument(): ReviewDocument {
  return { status: "idle", plan: null, requestedAt: null, error: null };
}

export const GetReviewPlanRpc = defineRpc({
  name: "workspace-companion.review-plan.get",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: ReviewDocumentSchema,
});

export const GenerateReviewPlanRpc = defineRpc({
  name: "workspace-companion.review-plan.generate",
  input: z.object({
    workspaceId: z.string().min(1),
    agentId: z.string().min(1),
  }),
  output: ReviewDocumentSchema,
});
