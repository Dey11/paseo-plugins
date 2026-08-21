import type { PluginContext } from "@getpaseo/plugin";
import { DeletePromptRpc, ListPromptsRpc, PromptAttachmentSource, SavePromptRpc, SearchPromptAttachmentsRpc } from "./contracts";
import { asAttachment, deletePrompt, searchPrompts, upsertPrompt } from "./library";
import { PromptLibrarySurface } from "./main.client";
import { newPromptId, readPrompts, writePrompts } from "./store.server";

export default function contribute(plugin: PluginContext) {
  plugin.handle(ListPromptsRpc, async ({ query }) => searchPrompts(await readPrompts(), query));
  plugin.handle(SavePromptRpc, async (input) => {
    const result = upsertPrompt(await readPrompts(), input, new Date().toISOString(), newPromptId);
    await writePrompts(result.prompts);
    return result.prompt;
  });
  plugin.handle(DeletePromptRpc, async ({ id }) => {
    const result = deletePrompt(await readPrompts(), id);
    if (result.deleted) await writePrompts(result.prompts);
    return { deleted: result.deleted };
  });
  plugin.handle(SearchPromptAttachmentsRpc, async ({ query }) => ({ items: searchPrompts(await readPrompts(), query).slice(0, 50).map(asAttachment) }));

  plugin.addSurface("prompt-library", PromptLibrarySurface);
  plugin.addSidebarItem({ id: "prompt-library", title: "Prompt library", icon: "library", surface: "prompt-library" });
  plugin.addAttachmentSource(PromptAttachmentSource);
  plugin.addCommandCenterItem({ id: "open-prompt-library", title: "Open prompt library", icon: "library", context: "global", onSelect: ({ openSurface }) => openSurface("prompt-library") });
  return () => {};
}
