import { describe, expect, test } from "bun:test";
import { NoteSchema, updateNoteMarkdown, updateNoteViewMode } from "./note";

const note = {
  workspaceId: "workspace-1",
  markdown: "Original",
  viewMode: "preview" as const,
  updatedAt: "2026-08-30T00:00:00.000Z",
};

describe("workspace note preferences", () => {
  test("defaults existing notes to Write during migration", () => {
    expect(
      NoteSchema.parse({
        workspaceId: "workspace-1",
        markdown: "Legacy note",
        updatedAt: "2026-08-29T00:00:00.000Z",
      }).viewMode,
    ).toBe("write");
  });

  test("preserves Preview while saving note content", () => {
    expect(
      updateNoteMarkdown(note, "Updated", "2026-08-30T01:00:00.000Z"),
    ).toEqual({
      ...note,
      markdown: "Updated",
      updatedAt: "2026-08-30T01:00:00.000Z",
    });
  });

  test("changes the view mode without touching note content", () => {
    expect(updateNoteViewMode(note, "write")).toEqual({
      ...note,
      viewMode: "write",
    });
  });
});
