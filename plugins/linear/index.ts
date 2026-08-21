import type { PluginContext } from "@getpaseo/plugin";
import { GetLinearIssueRpc, LinearAttachmentSource, LinearStatusRpc, MutateLinearIssueRpc, SearchLinearAttachmentsRpc, SearchLinearIssuesRpc } from "./contracts";
import { LinearPanel } from "./main.client";
import { getIssue, issueAttachment, linearStatus, mutateIssue, searchIssues } from "./linear.server";

export default function contribute(plugin: PluginContext) {
  plugin.handle(LinearStatusRpc, linearStatus);
  plugin.handle(SearchLinearIssuesRpc, ({ query }) => searchIssues(query));
  plugin.handle(GetLinearIssueRpc, ({ id }) => getIssue(id));
  plugin.handle(MutateLinearIssueRpc, (mutation) => mutateIssue(mutation));
  plugin.handle(SearchLinearAttachmentsRpc, async ({ query }) => ({ items: (await searchIssues(query)).slice(0, 50).map(issueAttachment) }));
  plugin.addWorkspacePanel({ id: "linear", title: "Linear", icon: "square-kanban", context: "agent", Component: LinearPanel });
  plugin.addAttachmentSource(LinearAttachmentSource);
  plugin.addCommandCenterItem({ id: "open-linear", title: "Open Linear", icon: "square-kanban", context: "agent", onSelect: ({ openPanel }) => openPanel("linear") });
  return () => {};
}
