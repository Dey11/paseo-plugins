import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { PromptListSchema, type SavedPrompt } from "./contracts";

const file = join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "plugin-data", "prompt-library", "prompts.json");

export function newPromptId(): string { return randomUUID(); }

export async function readPrompts(): Promise<SavedPrompt[]> {
  try { return PromptListSchema.parse(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) { if (isMissing(error)) return []; throw error; }
}

export async function writePrompts(prompts: SavedPrompt[]): Promise<void> {
  const validated = PromptListSchema.parse(prompts);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
