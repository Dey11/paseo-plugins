import type { PluginContext } from "@getpaseo/plugin";
import type { PaseoClient } from "@getpaseo/client";
import { ListDevPortsRpc, ServeDevPortRpc, StopDevPortRpc, UnserveDevPortRpc } from "./contracts";
import { DevPortsSurface } from "./main.client";
import { listDevPorts, serveDevPort, stopDevPort, unserveDevPort } from "./ports.server";

export default function contribute(plugin: PluginContext) {
  plugin.handle(ListDevPortsRpc, (_, { paseo }) => listDevPorts(paseo as unknown as PaseoClient));
  plugin.handle(StopDevPortRpc, (input, { paseo }) => stopDevPort(paseo as unknown as PaseoClient, input));
  plugin.handle(ServeDevPortRpc, (input, { paseo }) => serveDevPort(paseo as unknown as PaseoClient, input));
  plugin.handle(UnserveDevPortRpc, ({ port }) => unserveDevPort(port));
  plugin.addSurface("dev-ports", DevPortsSurface);
  plugin.addSidebarItem({ id: "dev-ports", title: "Dev ports", icon: "radio-tower", surface: "dev-ports" });
  plugin.addCommandCenterItem({ id: "open-dev-ports", title: "Open dev ports", icon: "radio-tower", context: "global", onSelect: ({ openSurface }) => openSurface("dev-ports") });
  return () => {};
}
