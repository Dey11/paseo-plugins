import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { JsonStore } from "./store.server";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("JsonStore", () => {
  test("serializes concurrent read-modify-write operations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "paseo-store-test-"));
    temporaryDirectories.push(directory);
    const file = join(directory, "state.json");
    const store = new JsonStore(file, z.object({ count: z.number() }), () => ({
      count: 0,
    }));

    await Promise.all(
      Array.from({ length: 20 }, () =>
        store.update(async (current) => {
          await Promise.resolve();
          return { count: current.count + 1 };
        }),
      ),
    );

    expect(await store.read()).toEqual({ count: 20 });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ count: 20 });
  });
});
