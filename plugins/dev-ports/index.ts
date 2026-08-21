import type { PluginContext } from "@getpaseo/plugin";
import {
  ListDevPortsRpc,
  ServeDevPortRpc,
  StopDevPortRpc,
  UnserveDevPortRpc,
} from "./contracts";
import { DevPortsPanel, DevPortsSurface } from "./main.client";
import {
  listDevPorts,
  serveDevPort,
  stopDevPort,
  unserveDevPort,
} from "./ports.server";

export default function contribute(plugin: PluginContext) {
  plugin.handle(ListDevPortsRpc, (_, { paseo }) => listDevPorts(paseo));
  plugin.handle(StopDevPortRpc, (input, { paseo }) =>
    stopDevPort(paseo, input),
  );
  plugin.handle(ServeDevPortRpc, (input, { paseo }) =>
    serveDevPort(paseo, input),
  );
  plugin.handle(UnserveDevPortRpc, ({ port }) => unserveDevPort(port));
  plugin.addSurface("dev-ports", DevPortsSurface);
  plugin.addSidebarItem({
    id: "dev-ports",
    title: "Dev ports",
    icon: "radio-tower",
    surface: "dev-ports",
  });
  plugin.addWorkspacePanel({
    id: "dev-ports",
    title: "Dev ports",
    icon: "radio-tower",
    context: "agent",
    Component: DevPortsPanel,
  });
  plugin.addCommandCenterItem({
    id: "open-dev-ports",
    title: "Open dev ports",
    icon: "radio-tower",
    context: "global",
    onSelect: ({ openSurface }) => openSurface("dev-ports"),
  });
  plugin.addCommandCenterItem({
    id: "open-workspace-dev-ports",
    title: "Open workspace dev ports",
    icon: "radio-tower",
    context: "agent",
    onSelect: ({ openPanel }) => openPanel("dev-ports"),
  });
  return () => {};
}
