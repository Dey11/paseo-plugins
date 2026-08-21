import { describe, expect, test } from "bun:test";
import { buildReviewPlan } from "./review";

describe("buildReviewPlan", () => {
  test("turns a diff into focused review checks", () => {
    const plan = buildReviewPlan({
      workspaceId: "ws-1",
      generatedAt: "2026-08-21T00:00:00.000Z",
      gitAvailable: true,
      nameStatus: "M\tsrc/auth/session.ts\nA\tprisma/migrations/001.sql\nM\tapp/page.tsx",
      numStat: "12\t3\tsrc/auth/session.ts\n20\t0\tprisma/migrations/001.sql\n4\t2\tapp/page.tsx",
      porcelain: "?? docs/review.md",
    });

    expect(plan.files).toEqual(["app/page.tsx", "docs/review.md", "prisma/migrations/001.sql", "src/auth/session.ts"]);
    expect(plan.additions).toBe(36);
    expect(plan.deletions).toBe(5);
    expect(plan.checks.map((check) => check.id)).toEqual(["security", "data", "ui", "docs"]);
  });

  test("reports non-git workspaces without inventing checks", () => {
    const plan = buildReviewPlan({ workspaceId: "ws-2", generatedAt: "now", gitAvailable: false, nameStatus: "", numStat: "", porcelain: "" });
    expect(plan.gitAvailable).toBe(false);
    expect(plan.checks).toEqual([]);
  });
});
