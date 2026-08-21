import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ZodType } from "zod";

export function pluginDataDirectory(pluginId: string): string {
  const paseoHome = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
  return join(paseoHome, "plugin-data", pluginId);
}

export class JsonStore<T> {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly schema: ZodType<T>,
    private readonly fallback: () => T,
  ) {}

  async read(): Promise<T> {
    try {
      const raw = await readFile(this.file, "utf8");
      return this.schema.parse(JSON.parse(raw));
    } catch (error) {
      if (isMissingFile(error)) return this.fallback();
      throw error;
    }
  }

  async write(value: T): Promise<T> {
    return this.enqueue(() => this.writeNow(value));
  }

  async update(transform: (current: T) => T | Promise<T>): Promise<T> {
    return this.enqueue(async () =>
      this.writeNow(await transform(await this.read())),
    );
  }

  private async writeNow(value: T): Promise<T> {
    const validated = this.schema.parse(value);
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, this.file);
    return validated;
  }

  private async enqueue<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function workspaceFile(
  directory: string,
  workspaceId: string,
  suffix: string,
): string {
  const key = createHash("sha256").update(workspaceId).digest("hex");
  return join(directory, `${key}.${suffix}.json`);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
