import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { PromptListSchema, type SavedPrompt } from "./contracts";

const file = join(
  process.env.PASEO_HOME ?? join(homedir(), ".paseo"),
  "plugin-data",
  "prompt-library",
  "prompts.json",
);

export function newPromptId(): string {
  return randomUUID();
}

let mutationQueue: Promise<void> = Promise.resolve();

export async function readPrompts(): Promise<SavedPrompt[]> {
  try {
    return PromptListSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

export async function writePrompts(prompts: SavedPrompt[]): Promise<void> {
  const validated = PromptListSchema.parse(prompts);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, file);
}

export async function mutatePrompts<Result>(
  mutation: (prompts: SavedPrompt[]) => {
    prompts: SavedPrompt[];
    result: Result;
    shouldWrite?: boolean;
  },
): Promise<Result> {
  const operation = mutationQueue.then(async () => {
    const update = mutation(await readPrompts());
    if (update.shouldWrite !== false) await writePrompts(update.prompts);
    return update.result;
  });
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
