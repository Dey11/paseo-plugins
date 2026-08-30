import { z } from "zod";

export const NOTE_VIEW_MODES = ["write", "preview"] as const;
export type NoteViewMode = (typeof NOTE_VIEW_MODES)[number];

export interface WorkspaceNote {
  workspaceId: string;
  markdown: string;
  viewMode: NoteViewMode;
  updatedAt: string;
}

export const NoteSchema = z.object({
  workspaceId: z.string().min(1),
  markdown: z.string().max(200_000),
  viewMode: z.enum(NOTE_VIEW_MODES).default("write"),
  updatedAt: z.string(),
});

/** Replaces note content without resetting the workspace's preferred view mode. */
export function updateNoteMarkdown(
  note: WorkspaceNote,
  markdown: string,
  updatedAt: string,
): WorkspaceNote {
  return { ...note, markdown, updatedAt };
}

/** Changes only the workspace's preferred Notes view. */
export function updateNoteViewMode(
  note: WorkspaceNote,
  viewMode: NoteViewMode,
): WorkspaceNote {
  return { ...note, viewMode };
}
