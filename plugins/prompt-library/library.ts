import type { SavedPrompt } from "./contracts";

export function searchPrompts(
  prompts: readonly SavedPrompt[],
  query: string,
): SavedPrompt[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return [...prompts]
    .filter((prompt) => {
      const haystack =
        `${prompt.title}\n${prompt.tags.join(" ")}\n${prompt.content}`.toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertPrompt(
  prompts: readonly SavedPrompt[],
  input: { id?: string; title: string; content: string; tags: string[] },
  now: string,
  createId: () => string,
): { prompt: SavedPrompt; prompts: SavedPrompt[] } {
  const existing = input.id
    ? prompts.find((prompt) => prompt.id === input.id)
    : undefined;
  if (input.id && !existing)
    throw new Error("The saved prompt no longer exists.");
  const prompt: SavedPrompt = {
    id: existing?.id ?? createId(),
    title: input.title.trim(),
    content: input.content.trim(),
    tags: [
      ...new Set(
        input.tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean),
      ),
    ],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return {
    prompt,
    prompts: [
      prompt,
      ...prompts.filter((candidate) => candidate.id !== prompt.id),
    ],
  };
}

export function deletePrompt(
  prompts: readonly SavedPrompt[],
  id: string,
): { deleted: boolean; prompts: SavedPrompt[] } {
  const next = prompts.filter((prompt) => prompt.id !== id);
  return { deleted: next.length !== prompts.length, prompts: next };
}

export function asAttachment(prompt: SavedPrompt) {
  return {
    id: prompt.id,
    identifier: prompt.title,
    title: prompt.title,
    subtitle: prompt.tags.length ? prompt.tags.join(" · ") : "Saved prompt",
    url: `paseo://prompt-library/${encodeURIComponent(prompt.id)}`,
    text: prompt.content,
    resourceType: "saved-prompt",
  };
}
