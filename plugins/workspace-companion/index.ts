import type { PluginContext } from "@getpaseo/plugin";
import { z } from "zod";
import {
  GenerateReviewPlanRpc,
  GetNoteRpc,
  GetReviewPlanRpc,
  GetReviewStatesRpc,
  NoteSchema,
  ReviewPlanSchema,
  ReviewStatesSchema,
  SaveNoteRpc,
  SetReviewStateRpc,
} from "./contracts";
import { AgentBoardSurface, NotesPanel, ReviewPanel } from "./main.client";
import { inspectGitDiff } from "./review.server";
import { JsonStore, pluginDataDirectory, workspaceFile } from "./store.server";

const dataDirectory = pluginDataDirectory("workspace-companion");
const reviewStates = new JsonStore(`${dataDirectory}/review-states.json`, ReviewStatesSchema, () => ({}));

export default function contribute(plugin: PluginContext) {
  plugin.handle(GetNoteRpc, async ({ workspaceId }) => noteStore(workspaceId).read());
  plugin.handle(SaveNoteRpc, async ({ workspaceId, markdown }) =>
    noteStore(workspaceId).write({ workspaceId, markdown, updatedAt: new Date().toISOString() }),
  );
  plugin.handle(GetReviewStatesRpc, () => reviewStates.read());
  plugin.handle(SetReviewStateRpc, async ({ workspaceId, state }) => {
    const current = await reviewStates.read();
    await reviewStates.write({ ...current, [workspaceId]: state });
    return { workspaceId, state };
  });
  plugin.handle(GetReviewPlanRpc, ({ workspaceId }) => reviewPlanStore(workspaceId).read());
  plugin.handle(GenerateReviewPlanRpc, async ({ workspaceId }, { paseo }) => {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    const directory = workspace?.workspaceDirectory;
    if (!directory) throw new Error("The workspace directory is unavailable.");
    const plan = await inspectGitDiff(workspaceId, directory);
    await reviewPlanStore(workspaceId).write(plan);
    return plan;
  });

  plugin.addSurface("agent-board", AgentBoardSurface);
  plugin.addSidebarItem({ id: "agent-board", title: "Agent board", icon: "columns-3", surface: "agent-board" });
  plugin.addWorkspacePanel({ id: "notes", title: "Notes", icon: "notebook-pen", context: "workspace", Component: NotesPanel });
  plugin.addWorkspacePanel({ id: "review", title: "Review", icon: "list-checks", context: "agent", Component: ReviewPanel });
  plugin.addCommandCenterItem({ id: "open-agent-board", title: "Open agent board", icon: "columns-3", context: "global", onSelect: ({ openSurface }) => openSurface("agent-board") });
  plugin.addCommandCenterItem({ id: "open-notes", title: "Open workspace notes", icon: "notebook-pen", context: "workspace", onSelect: ({ openPanel }) => openPanel("notes") });
  plugin.addCommandCenterItem({ id: "open-review", title: "Create review plan", icon: "list-checks", context: "agent", onSelect: ({ openPanel }) => openPanel("review") });
  return () => {};
}

function noteStore(workspaceId: string) {
  return new JsonStore(
    workspaceFile(dataDirectory, workspaceId, "note"),
    NoteSchema,
    () => ({ workspaceId, markdown: "", updatedAt: new Date(0).toISOString() }),
  );
}

function reviewPlanStore(workspaceId: string) {
  return new JsonStore(
    workspaceFile(dataDirectory, workspaceId, "review"),
    ReviewPlanSchema.nullable(),
    () => null,
  );
}
