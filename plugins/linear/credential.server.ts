import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type CredentialSource = "environment" | "credential-file" | "missing";

export async function loadLinearCredential(): Promise<{
  apiKey: string | null;
  source: CredentialSource;
}> {
  if (process.env.LINEAR_API_KEY?.trim())
    return { apiKey: process.env.LINEAR_API_KEY.trim(), source: "environment" };
  for (const file of linearCredentialFiles()) {
    try {
      const apiKey = parseLinearCredential(await readFile(file, "utf8"));
      if (apiKey) return { apiKey, source: "credential-file" };
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return { apiKey: null, source: "missing" };
}

export function linearCredentialFiles(home = homedir()): string[] {
  return [
    join(home, ".config", "paseo-plugins", "linear.env"),
    join(home, ".config", "hosting", "credentials.env"),
  ];
}

export function parseLinearCredential(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?LINEAR_API_KEY\s*=\s*(.*?)\s*$/,
    );
    if (!match) continue;
    const value = match[1]?.trim() ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      return value.slice(1, -1) || null;
    return value || null;
  }
  return null;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
