export type WorkspaceArchiveResult = {
  archivedAt: string | null;
  error: string | null;
};

/** Validates Paseo's resolved archive result, which can carry an error. */
export function requireArchivedAt(result: WorkspaceArchiveResult): string {
  if (result.error) throw new Error(result.error);
  if (!result.archivedAt)
    throw new Error("Paseo did not confirm that the workspace was archived.");
  return result.archivedAt;
}
