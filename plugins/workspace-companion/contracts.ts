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

export const TempChatContextSchema = z.object({
  workspaceId: z.string().min(1),
  snapshot: z.string().max(60_000),
  sourceAgentCount: z.number().int().nonnegative(),
  omittedAgentCount: z.number().int().nonnegative(),
  includesNote: z.boolean(),
  capturedAt: z.string().nullable(),
  appliedAgentId: z.string().nullable(),
  appliedCapturedAt: z.string().nullable(),
});

export const GetTempChatContextRpc = defineRpc({
  name: "workspace-companion.temp-chat-context.get",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: TempChatContextSchema,
});

export const SaveTempChatContextRpc = defineRpc({
  name: "workspace-companion.temp-chat-context.save",
  input: TempChatContextSchema,
  output: TempChatContextSchema,
});

export const ResetTempChatContextRpc = defineRpc({
  name: "workspace-companion.temp-chat-context.reset",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: TempChatContextSchema,
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
