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
  try {
    const text = await readFile(
      join(homedir(), ".config", "hosting", "credentials.env"),
      "utf8",
    );
    const apiKey = parseLinearCredential(text);
    return { apiKey, source: apiKey ? "credential-file" : "missing" };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return { apiKey: null, source: "missing" };
    throw error;
  }
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
