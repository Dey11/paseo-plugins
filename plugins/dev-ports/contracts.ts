import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const DevPortSchema = z.object({
  port: z.number().int().min(1).max(65535),
  pid: z.number().int().positive(),
  processName: z.string(),
  command: z.string(),
  address: z.string(),
  cwd: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  publiclyBound: z.boolean(),
});
export type DevPort = z.infer<typeof DevPortSchema>;

export const PortForwardSchema = z.object({
  sourcePort: z.number().int(),
  url: z.string().url(),
});
export type PortForward = z.infer<typeof PortForwardSchema>;

export const ListDevPortsRpc = defineRpc({
  name: "dev-ports.list",
  input: z.object({}),
  output: z.object({
    ports: z.array(DevPortSchema),
    forwards: z.array(PortForwardSchema),
    tailscaleAvailable: z.boolean(),
  }),
});
export const StopDevPortRpc = defineRpc({
  name: "dev-ports.stop",
  input: z.object({
    pid: z.number().int().positive(),
    port: z.number().int().min(1).max(65535),
    workspaceId: z.string().min(1),
  }),
  output: z.object({ stopped: z.boolean(), survived: z.boolean() }),
});
export const ServeDevPortRpc = defineRpc({
  name: "dev-ports.serve",
  input: z.object({
    pid: z.number().int().positive(),
    port: z.number().int().min(1).max(65535),
    workspaceId: z.string().min(1),
  }),
  output: PortForwardSchema,
});
export const UnserveDevPortRpc = defineRpc({
  name: "dev-ports.unserve",
  input: z.object({ port: z.number().int().min(1).max(65535) }),
  output: z.object({ removed: z.boolean() }),
});
