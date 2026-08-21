import { execFile } from "node:child_process";
import { readFile, readlink, realpath, stat } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { PaseoClient, PaseoWorkspace } from "@getpaseo/client";
import type { DevPort, PortForward } from "./contracts";
import { buildServeArgs, buildUnserveArgs, isPathInside, isPublicBind, parseServeSourcePorts, parseSsListeners } from "./discovery.server";

const execFileAsync = promisify(execFile);

export async function listDevPorts(paseo: PaseoClient): Promise<{ ports: DevPort[]; forwards: PortForward[]; tailscaleAvailable: boolean }> {
  const workspaces = (await paseo.workspaces.list({ page: { limit: 500 } })).entries;
  const ports = await discover(workspaces);
  const tailscale = await tailscaleState();
  return { ports, forwards: tailscale.forwards, tailscaleAvailable: tailscale.available };
}

export async function stopDevPort(paseo: PaseoClient, expected: { pid: number; port: number; workspaceId: string }) {
  const devProcess = await requireCurrentProcess(paseo, expected);
  process.kill(devProcess.pid, "SIGTERM");
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await delay(100);
    if (!isAlive(devProcess.pid)) return { stopped: true, survived: false };
  }
  return { stopped: false, survived: true };
}

export async function serveDevPort(paseo: PaseoClient, expected: { pid: number; port: number; workspaceId: string }): Promise<PortForward> {
  await requireCurrentProcess(paseo, expected);
  const before = await tailscaleState();
  if (!before.available) throw new Error("Tailscale is not installed or is not running.");
  await run("tailscale", buildServeArgs(expected.port));
  const after = await tailscaleState();
  const forward = after.forwards.find((candidate) => candidate.sourcePort === expected.port);
  if (!forward) throw new Error("Tailscale Serve did not report the new private mapping.");
  return forward;
}

export async function unserveDevPort(port: number): Promise<{ removed: boolean }> {
  await run("tailscale", buildUnserveArgs(port));
  const after = await tailscaleState();
  return { removed: !after.forwards.some((candidate) => candidate.sourcePort === port) };
}

async function requireCurrentProcess(paseo: PaseoClient, expected: { pid: number; port: number; workspaceId: string }): Promise<DevPort> {
  const workspaces = (await paseo.workspaces.list({ page: { limit: 500 } })).entries;
  const process = (await discover(workspaces)).find((candidate) => candidate.pid === expected.pid && candidate.port === expected.port && candidate.workspaceId === expected.workspaceId);
  if (!process) throw new Error("The process changed or is no longer owned by this Paseo workspace.");
  return process;
}

async function discover(workspaces: PaseoWorkspace[]): Promise<DevPort[]> {
  const { stdout } = await execFileAsync("ss", ["-ltnpH"], { maxBuffer: 5_000_000 });
  const workspaceDirectories = await Promise.all(workspaces.map(async (workspace) => ({ workspace, directory: await safeRealpath(workspace.workspaceDirectory) })));
  const found: DevPort[] = [];
  for (const listener of parseSsListeners(stdout)) {
    try {
      const processStat = await stat(`/proc/${listener.pid}`);
      if (processStat.uid !== process.getuid?.()) continue;
      const cwd = await safeRealpath(await readlink(`/proc/${listener.pid}/cwd`));
      const owner = workspaceDirectories.find(({ directory }) => isPathInside(directory, cwd));
      if (!owner) continue;
      const commandRaw = await readFile(`/proc/${listener.pid}/cmdline`, "utf8");
      const command = commandRaw.split("\0").filter(Boolean).join(" ").slice(0, 500);
      found.push({ port: listener.port, pid: listener.pid, processName: listener.processName || basename(command.split(" ")[0] ?? "process"), command, address: listener.address, cwd, workspaceId: owner.workspace.id, workspaceName: owner.workspace.title ?? owner.workspace.name, publiclyBound: isPublicBind(listener.address) });
    } catch { /* Processes can exit between the socket and /proc snapshots. */ }
  }
  const unique = new Map(found.map((port) => [`${port.pid}:${port.port}`, port]));
  return [...unique.values()].sort((a, b) => a.port - b.port || a.pid - b.pid);
}

async function tailscaleState(): Promise<{ available: boolean; forwards: PortForward[] }> {
  try {
    const [serve, status] = await Promise.all([run("tailscale", ["serve", "status", "--json"]), run("tailscale", ["status", "--json"])]);
    const serveJson: unknown = JSON.parse(serve);
    const statusJson: unknown = JSON.parse(status);
    const dnsName = readDnsName(statusJson);
    const forwards = parseServeSourcePorts(serveJson).map((sourcePort) => ({ sourcePort, url: `https://${dnsName}${sourcePort === 443 ? "" : `:${sourcePort}`}` }));
    return { available: true, forwards };
  } catch { return { available: false, forwards: [] }; }
}

function readDnsName(status: unknown): string {
  if (typeof status !== "object" || status === null || !("Self" in status)) throw new Error("Tailscale status is missing this device.");
  const self = status.Self;
  if (typeof self !== "object" || self === null || !("DNSName" in self) || typeof self.DNSName !== "string") throw new Error("Tailscale DNS name is unavailable.");
  return self.DNSName.replace(/\.$/, "");
}

async function run(file: string, args: string[]): Promise<string> { const { stdout } = await execFileAsync(file, args, { maxBuffer: 5_000_000 }); return stdout; }
async function safeRealpath(path: string): Promise<string> { try { return await realpath(path); } catch { return path; } }
function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function isAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
