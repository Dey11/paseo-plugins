import type { ReviewPlan } from "./contracts";

export interface GitReviewInput {
  workspaceId: string;
  generatedAt: string;
  nameStatus: string;
  numStat: string;
  porcelain: string;
  gitAvailable: boolean;
}

const CHECKS = [
  { id: "security", title: "Authentication and permissions", priority: "high" as const, pattern: /auth|permission|policy|session|token|middleware/i },
  { id: "data", title: "Migrations and data safety", priority: "high" as const, pattern: /migration|schema|prisma|sql|database|supabase/i },
  { id: "api", title: "API contracts and error states", priority: "medium" as const, pattern: /api|route|handler|controller|graphql|rpc/i },
  { id: "config", title: "Configuration and secrets", priority: "high" as const, pattern: /\.env|config|credential|secret|docker|deploy/i },
  { id: "ui", title: "UI states and accessibility", priority: "medium" as const, pattern: /\.tsx$|\.jsx$|\.css$|component|screen|page/i },
  { id: "tests", title: "Tests and verification", priority: "normal" as const, pattern: /test|spec|__tests__/i },
  { id: "dependencies", title: "Dependency changes", priority: "medium" as const, pattern: /package\.json|bun\.lock|package-lock|yarn\.lock|pnpm-lock/i },
  { id: "docs", title: "Documentation and operator steps", priority: "normal" as const, pattern: /readme|docs\/|\.md$/i },
] as const;

export function buildReviewPlan(input: GitReviewInput): ReviewPlan {
  const files = collectFiles(input.nameStatus, input.porcelain);
  const { additions, deletions } = countChanges(input.numStat);
  const checks: ReviewPlan["checks"] = CHECKS.filter((check) => files.some((file) => check.pattern.test(file))).map((check) => ({
    id: check.id,
    title: check.title,
    priority: check.priority,
    detail: detailFor(check.id, files),
  }));

  if (files.length > 0 && checks.length === 0) {
    checks.push({ id: "behavior", title: "Changed behavior", priority: "normal", detail: "Trace the changed paths and verify the intended behavior end to end." });
  }

  return {
    workspaceId: input.workspaceId,
    generatedAt: input.generatedAt,
    summary: input.gitAvailable
      ? `${files.length} changed ${files.length === 1 ? "file" : "files"}; +${additions} −${deletions}.`
      : "This workspace is not a Git checkout, so no diff-based review plan is available.",
    files,
    additions,
    deletions,
    checks,
    gitAvailable: input.gitAvailable,
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

function countChanges(numStat: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of numStat.split("\n")) {
    const [added, removed] = line.split("\t");
    if (added && added !== "-") additions += Number.parseInt(added, 10) || 0;
    if (removed && removed !== "-") deletions += Number.parseInt(removed, 10) || 0;
  }
  return { additions, deletions };
}

function detailFor(id: string, files: string[]): string {
  const matched = files.filter((file) => CHECKS.find((check) => check.id === id)?.pattern.test(file));
  return `Review ${matched.slice(0, 4).join(", ")}${matched.length > 4 ? ` and ${matched.length - 4} more` : ""}.`;
}
