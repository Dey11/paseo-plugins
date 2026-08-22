import { describe, expect, test } from "bun:test";
import {
  asAttachment,
  deletePrompt,
  searchPrompts,
  upsertPrompt,
} from "./library";
import type { SavedPrompt } from "./contracts";

const prompts: SavedPrompt[] = [
  {
    id: "one",
    title: "Review API",
    content: "Review this API diff",
    tags: ["review", "backend"],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
  },
  {
    id: "two",
    title: "Write release note",
    content: "Summarize user-visible changes",
    tags: ["writing"],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-03",
  },
];

describe("prompt library", () => {
  test("search requires every term across title, tags, and content", () => {
    expect(
      searchPrompts(prompts, "api backend").map((prompt) => prompt.id),
    ).toEqual(["one"]);
    expect(
      searchPrompts(prompts, "user changes").map((prompt) => prompt.id),
    ).toEqual(["two"]);
  });

  test("upsert normalizes tags and preserves creation time", () => {
    const result = upsertPrompt(
      prompts,
      {
        id: "one",
        title: " Review API ",
        content: " Updated ",
        tags: ["Review", "review", " API "],
      },
      "2026-02-01",
      () => "new",
    );
    expect(result.prompt.tags).toEqual(["review", "api"]);
    expect(result.prompt.createdAt).toBe("2026-01-01");
  });

  test("deletion and attachment snapshots are deterministic", () => {
    expect(deletePrompt(prompts, "one").prompts).toHaveLength(1);
    expect(asAttachment(prompts[0]).text).toBe("Review this API diff");
  });
});
