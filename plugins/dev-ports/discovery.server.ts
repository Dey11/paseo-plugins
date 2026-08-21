import { isAbsolute, relative } from "node:path";

export interface SocketListener { address: string; port: number; pid: number; processName: string }

export function parseSsListeners(output: string): SocketListener[] {
  const listeners: SocketListener[] = [];
  for (const line of output.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[0] !== "LISTEN") continue;
    const local = parts[3] ?? "";
    const separator = local.lastIndexOf(":");
    const port = Number.parseInt(local.slice(separator + 1), 10);
    if (separator < 0 || !Number.isInteger(port)) continue;
    const address = local.slice(0, separator).replace(/^\[/, "").replace(/\]$/, "");
    const processText = parts.slice(5).join(" ");
    for (const match of processText.matchAll(/\("([^"]+)",pid=(\d+)/g)) {
      listeners.push({ address, port, processName: match[1] ?? "unknown", pid: Number(match[2]) });
    }
  }
  return listeners;
}

export function isPathInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export function isPublicBind(address: string): boolean {
  return address === "0.0.0.0" || address === "::" || address === "*";
}

export function buildServeArgs(port: number): string[] {
  return ["serve", "--bg", "--yes", `--https=${port}`, `http://localhost:${port}`];
}

export function buildUnserveArgs(port: number): string[] {
  return ["serve", "--yes", `--https=${port}`, "off"];
}

export function parseServeSourcePorts(value: unknown): number[] {
  const ports = new Set<number>();
  visit(value, (candidate) => {
    const match = candidate.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d+)(?:\/|$)/i);
    if (match) ports.add(Number(match[1]));
  });
  return [...ports].sort((a, b) => a - b);
}

function visit(value: unknown, onString: (value: string) => void): void {
  if (typeof value === "string") { onString(value); return; }
  if (Array.isArray(value)) { value.forEach((entry) => visit(entry, onString)); return; }
  if (typeof value === "object" && value !== null) Object.values(value).forEach((entry) => visit(entry, onString));
}
