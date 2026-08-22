import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

const OwnedPortsSchema = z.array(z.number().int().min(1).max(65_535));
const file = join(
  process.env.PASEO_HOME ?? join(homedir(), ".paseo"),
  "plugin-data",
  "dev-ports",
  "owned-serve-ports.json",
);
let mutationQueue: Promise<void> = Promise.resolve();

export async function readOwnedPorts(): Promise<number[]> {
  try {
    return OwnedPortsSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

export function addOwnedPort(port: number): Promise<number[]> {
  return updateOwnedPorts((ports) => [...new Set([...ports, port])]);
}

export function removeOwnedPort(port: number): Promise<number[]> {
  return updateOwnedPorts((ports) =>
    ports.filter((candidate) => candidate !== port),
  );
}

function updateOwnedPorts(
  transform: (ports: number[]) => number[],
): Promise<number[]> {
  const operation = mutationQueue.then(async () => {
    const ports = OwnedPortsSchema.parse(
      transform(await readOwnedPorts()),
    ).sort((a, b) => a - b);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(ports, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, file);
    return ports;
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
