import {
  PluginAttachmentSearchPayloadSchema,
  defineAttachmentSource,
  defineRpc,
} from "@getpaseo/plugin/server";
import { z } from "zod";

export const PromptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(100_000),
  tags: z.array(z.string().min(1).max(40)).max(20),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedPrompt = z.infer<typeof PromptSchema>;
export const PromptListSchema = z.array(PromptSchema);

export const ListPromptsRpc = defineRpc({
  name: "prompt-library.list",
  input: z.object({ query: z.string().max(200).default("") }),
  output: PromptListSchema,
});

export const SavePromptRpc = defineRpc({
  name: "prompt-library.save",
  input: z.object({
    id: z.string().optional(),
    title: z.string().min(1).max(120),
    content: z.string().min(1).max(100_000),
    tags: z.array(z.string().min(1).max(40)).max(20),
  }),
  output: PromptSchema,
});

export const DeletePromptRpc = defineRpc({
  name: "prompt-library.delete",
  input: z.object({ id: z.string().min(1) }),
  output: z.object({ deleted: z.boolean() }),
});

export const SearchPromptAttachmentsRpc = defineRpc({
  name: "prompt-library.attachments.search",
  input: z.object({ query: z.string().max(200).default("") }),
  output: PluginAttachmentSearchPayloadSchema,
});

export const PromptAttachmentSource = defineAttachmentSource({
  id: "saved-prompts",
  title: "Prompt library",
  icon: "library",
  pickerTitle: "Attach a saved prompt",
  searchPlaceholder: "Search titles, tags, and prompt text…",
  search: SearchPromptAttachmentsRpc,
});
