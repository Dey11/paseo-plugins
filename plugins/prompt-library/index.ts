import type { PluginContext } from "@getpaseo/plugin";
import {
  DeletePromptRpc,
  ListPromptsRpc,
  PromptAttachmentSource,
  SavePromptRpc,
  SearchPromptAttachmentsRpc,
} from "./contracts";
import {
  asAttachment,
  deletePrompt,
  searchPrompts,
  upsertPrompt,
} from "./library";
import { PromptLibrarySurface } from "./main.client";
import { mutatePrompts, newPromptId, readPrompts } from "./store.server";

export default function contribute(plugin: PluginContext) {
  plugin.handle(ListPromptsRpc, async ({ query }) =>
    searchPrompts(await readPrompts(), query),
  );
  plugin.handle(SavePromptRpc, async (input) => {
    return mutatePrompts((prompts) => {
      const update = upsertPrompt(
        prompts,
        input,
        new Date().toISOString(),
        newPromptId,
      );
      return { prompts: update.prompts, result: update.prompt };
    });
  });
  plugin.handle(DeletePromptRpc, async ({ id }) =>
    mutatePrompts((prompts) => {
      const update = deletePrompt(prompts, id);
      return {
        prompts: update.prompts,
        result: { deleted: update.deleted },
        shouldWrite: update.deleted,
      };
    }),
  );
  plugin.handle(SearchPromptAttachmentsRpc, async ({ query }) => ({
    items: searchPrompts(await readPrompts(), query)
      .slice(0, 50)
      .map(asAttachment),
  }));

  plugin.addSurface("prompt-library", PromptLibrarySurface);
  plugin.addSidebarItem({
    id: "prompt-library",
    title: "Prompt library",
    icon: "Blocks",
    surface: "prompt-library",
  });
  plugin.addAttachmentSource(PromptAttachmentSource);
  plugin.addCommandCenterItem({
    id: "open-prompt-library",
    title: "Open prompt library",
    icon: "Blocks",
    context: "global",
    onSelect: ({ openSurface }) => openSurface("prompt-library"),
  });
  return () => {};
}
