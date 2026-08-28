import type { PluginContext } from "@getpaseo/plugin";
import {
  GetLinearIssueRpc,
  LinearStatusRpc,
  MutateLinearIssueRpc,
  SearchLinearIssuesRpc,
} from "./contracts";
import { LinearPanel } from "./main.client";
import {
  getIssue,
  linearStatus,
  mutateIssue,
  searchIssues,
} from "./linear.server";

export default function contribute(plugin: PluginContext) {
  plugin.handle(LinearStatusRpc, linearStatus);
  plugin.handle(SearchLinearIssuesRpc, ({ query, cursor }) =>
    searchIssues(query, cursor),
  );
  plugin.handle(GetLinearIssueRpc, ({ id }) => getIssue(id));
  plugin.handle(MutateLinearIssueRpc, (mutation) => mutateIssue(mutation));
  plugin.addWorkspacePanel({
    id: "linear",
    title: "Linear",
    icon: "CircleDot",
    context: "workspace",
    Component: LinearPanel,
  });
  plugin.addCommandCenterItem({
    id: "open-linear",
    title: "Open Linear",
    icon: "CircleDot",
    context: "workspace",
    onSelect: ({ openPanel }) => openPanel("linear"),
  });
  return () => {};
}
