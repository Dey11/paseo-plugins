import { z } from "zod";

export const QaFlowSchema = z.object({
  id: z.string().min(1),
  surface: z.string().min(1).max(100),
  title: z.string().min(1).max(160),
  why: z.string().min(1).max(500),
  priority: z.enum(["high", "normal"]),
  steps: z.array(z.string().min(1).max(500)).min(1).max(8),
});

export const QaAnalysisSchema = z.object({
  summary: z.string().min(1).max(600),
  changes: z.array(z.string().min(1).max(500)).min(1).max(8),
  flows: z
    .array(QaFlowSchema.omit({ id: true }))
    .min(1)
    .max(10),
  watchFor: z.array(z.string().min(1).max(500)).max(8),
});
export type QaAnalysis = z.infer<typeof QaAnalysisSchema>;

export const ReviewPlanSchema = z.object({
  workspaceId: z.string(),
  sourceAgentId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  changes: z.array(z.string()),
  flows: z.array(QaFlowSchema),
  watchFor: z.array(z.string()),
  files: z.array(z.string()),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  gitAvailable: z.boolean(),
  transcriptMessageCount: z.number().int().nonnegative(),
});
export type ReviewPlan = z.infer<typeof ReviewPlanSchema>;
