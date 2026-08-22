import { QaAnalysisSchema, type QaAnalysis, type ReviewPlan } from "./qa";

export interface GitReviewInput {
  nameStatus: string;
  numStat: string;
  porcelain: string;
  gitAvailable: boolean;
}

export interface WorkspaceChangeSummary {
  files: string[];
  additions: number;
  deletions: number;
  gitAvailable: boolean;
}

export interface TranscriptEntry {
  item: { type: string; text?: unknown };
}

export interface TranscriptContext {
  text: string;
  messageCount: number;
}

/** Reduces Git's machine-readable output to the evidence shown beside a QA plan. */
export function summarizeGitChanges(
  input: GitReviewInput,
): WorkspaceChangeSummary {
  const files = collectFiles(input.nameStatus, input.porcelain);
  const { additions, deletions } = countChanges(input.numStat);
  return { files, additions, deletions, gitAvailable: input.gitAvailable };
}

/** Keeps conversational intent while excluding reasoning and tool payloads. */
export function buildTranscriptContext(
  entries: readonly TranscriptEntry[],
  maxCharacters = 50_000,
): TranscriptContext {
  const messages = entries.flatMap((entry) => {
    const { item } = entry;
    if (
      (item.type !== "user_message" && item.type !== "assistant_message") ||
      typeof item.text !== "string" ||
      !item.text.trim()
    ) {
      return [];
    }
    const speaker = item.type === "user_message" ? "User" : "Agent";
    return [`${speaker}:\n${item.text.trim()}`];
  });
  const joined = messages.join("\n\n");
  return {
    text:
      joined.length <= maxCharacters
        ? joined
        : `[Earlier transcript omitted]\n\n${joined.slice(-maxCharacters)}`,
    messageCount: messages.length,
  };
}

/** Accepts schema-constrained JSON and the occasional defensive Markdown fence. */
export function parseQaAnalysis(value: string): QaAnalysis {
  const trimmed = value.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return QaAnalysisSchema.parse(JSON.parse(unfenced));
}

export function buildReviewPlan(input: {
  workspaceId: string;
  sourceAgentId: string;
  generatedAt: string;
  changes: WorkspaceChangeSummary;
  transcriptMessageCount: number;
  analysis: QaAnalysis;
}): ReviewPlan {
  const ids = new Set<string>();
  return {
    workspaceId: input.workspaceId,
    sourceAgentId: input.sourceAgentId,
    generatedAt: input.generatedAt,
    summary: input.analysis.summary,
    changes: input.analysis.changes,
    flows: input.analysis.flows.map((flow, index) => {
      const base = slug(flow.surface || flow.title) || `flow-${index + 1}`;
      let id = base;
      let suffix = 2;
      while (ids.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }
      ids.add(id);
      return { ...flow, id };
    }),
    watchFor: input.analysis.watchFor,
    files: input.changes.files,
    additions: input.changes.additions,
    deletions: input.changes.deletions,
    gitAvailable: input.changes.gitAvailable,
    transcriptMessageCount: input.transcriptMessageCount,
  };
}

function collectFiles(nameStatus: string, porcelain: string): string[] {
  const names = new Set<string>();
  for (const line of nameStatus.split("\n")) {
    const parts = line.trim().split("\t");
    if (parts.length >= 2) names.add(parts.at(-1) ?? "");
  }
  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue;
    const candidate = line.slice(3).split(" -> ").at(-1)?.trim();
    if (candidate) names.add(candidate);
  }
  return [...names].filter(Boolean).sort();
}

function countChanges(numStat: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const line of numStat.split("\n")) {
    const [added, removed] = line.split("\t");
    if (added && added !== "-") additions += Number.parseInt(added, 10) || 0;
    if (removed && removed !== "-")
      deletions += Number.parseInt(removed, 10) || 0;
  }
  return { additions, deletions };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
