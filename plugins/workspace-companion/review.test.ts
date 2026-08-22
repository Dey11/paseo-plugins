import { describe, expect, test } from "bun:test";
import {
  buildReviewPlan,
  buildTranscriptContext,
  parseQaAnalysis,
  summarizeGitChanges,
} from "./review";

const analysis = {
  summary: "The workspace now has calmer native notes and a QA planning panel.",
  changes: ["Notes use a write and preview workflow."],
  flows: [
    {
      surface: "Workspace panel",
      title: "Write and save a note",
      why: "The note should persist without losing Markdown.",
      priority: "high" as const,
      steps: ["Open Notes.", "Write Markdown and save it."],
    },
    {
      surface: "Workspace panel",
      title: "Preview a note",
      why: "Markdown needs to render as expected.",
      priority: "normal" as const,
      steps: ["Switch to Preview."],
    },
  ],
  watchFor: ["The saved state should update after saving."],
};

describe("QA review evidence", () => {
  test("summarizes changed files and line counts", () => {
    const changes = summarizeGitChanges({
      nameStatus: "M\tsrc/auth/session.ts\nA\tapp/page.tsx",
      numStat: "12\t3\tsrc/auth/session.ts\n4\t2\tapp/page.tsx",
      porcelain: "?? docs/review.md",
      gitAvailable: true,
    });

    expect(changes).toEqual({
      files: ["app/page.tsx", "docs/review.md", "src/auth/session.ts"],
      additions: 16,
      deletions: 5,
      gitAvailable: true,
    });
  });

  test("keeps conversational messages and excludes tool payloads", () => {
    const transcript = buildTranscriptContext(
      [
        { item: { type: "user_message", text: "Make Notes feel native." } },
        { item: { type: "reasoning", text: "private chain" } },
        { item: { type: "tool_call", text: "secret command" } },
        { item: { type: "assistant_message", text: "I updated the panel." } },
      ],
      40,
    );

    expect(transcript.messageCount).toBe(2);
    expect(transcript.text).toStartWith("[Earlier transcript omitted]");
    expect(transcript.text).toContain("I updated the panel.");
    expect(transcript.text).not.toContain("private chain");
    expect(transcript.text).not.toContain("secret command");
  });

  test("accepts a schema-constrained response in a JSON fence", () => {
    expect(
      parseQaAnalysis(`\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``),
    ).toEqual(analysis);
  });

  test("builds stable unique flow ids", () => {
    const plan = buildReviewPlan({
      workspaceId: "ws-1",
      sourceAgentId: "agent-1",
      generatedAt: "2026-08-22T00:00:00.000Z",
      changes: {
        files: ["plugins/workspace-companion/main.client.tsx"],
        additions: 40,
        deletions: 10,
        gitAvailable: true,
      },
      transcriptMessageCount: 12,
      analysis,
    });

    expect(plan.flows.map((flow) => flow.id)).toEqual([
      "workspace-panel",
      "workspace-panel-2",
    ]);
    expect(plan.transcriptMessageCount).toBe(12);
  });
});
