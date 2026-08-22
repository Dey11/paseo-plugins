import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface QaAgentConfig {
  provider: string;
  modeId?: string;
  thinkingOptionId?: string;
}

const defaults: Required<QaAgentConfig> = {
  provider: "codex/gpt-5.6-sol",
  modeId: "auto-review",
  thinkingOptionId: "high",
};

export async function loadQaAgentConfig(): Promise<QaAgentConfig> {
  const file = join(
    homedir(),
    ".config",
    "paseo-plugins",
    "workspace-companion.env",
  );
  try {
    return resolveQaAgentConfig(process.env, await readFile(file, "utf8"));
  } catch (error) {
    if (isMissing(error)) return resolveQaAgentConfig(process.env);
    throw error;
  }
}

/** Resolves daemon environment values before optional file values and defaults. */
export function resolveQaAgentConfig(
  environment: Record<string, string | undefined>,
  fileText = "",
): QaAgentConfig {
  const file = parseSettings(fileText);
  const provider = setting(
    environment.PASEO_QA_PROVIDER,
    file.PASEO_QA_PROVIDER,
    defaults.provider,
  );
  const modeId = optionalSetting(
    environment.PASEO_QA_MODE,
    file.PASEO_QA_MODE,
    defaults.modeId,
  );
  const thinkingOptionId = optionalSetting(
    environment.PASEO_QA_THINKING,
    file.PASEO_QA_THINKING,
    defaults.thinkingOptionId,
  );
  return {
    provider,
    ...(modeId ? { modeId } : {}),
    ...(thinkingOptionId ? { thinkingOptionId } : {}),
  };
}

function parseSettings(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?(PASEO_QA_PROVIDER|PASEO_QA_MODE|PASEO_QA_THINKING)\s*=\s*(.*?)\s*$/,
    );
    if (!match?.[1]) continue;
    const raw = match[2]?.trim() ?? "";
    values[match[1]] = unquote(raw);
  }
  return values;
}

function setting(
  environmentValue: string | undefined,
  fileValue: string | undefined,
  fallback: string,
): string {
  return environmentValue?.trim() || fileValue?.trim() || fallback;
}

function optionalSetting(
  environmentValue: string | undefined,
  fileValue: string | undefined,
  fallback: string,
): string | undefined {
  const value = environmentValue ?? fileValue;
  return value === undefined ? fallback : value.trim() || undefined;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
