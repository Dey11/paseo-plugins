import type { PluginContext } from "@getpaseo/plugin";
import {
  BoardWorkflowSchema,
  GetBoardWorkflowRpc,
  GetNoteRpc,
  NoteSchema,
  PlaceBoardCardRpc,
  SaveNoteRpc,
} from "./contracts";
import { AgentBoardSurface, NotesPanel } from "./main.client";
import { JsonStore, pluginDataDirectory, workspaceFile } from "./store.server";
import { createBoardWorkflow, placeBoardCard } from "./workflow";

let boardWorkflow: ReturnType<typeof createBoardWorkflowStore> | undefined;
const noteStores = new Map<string, ReturnType<typeof createNoteStore>>();

export default function contribute(plugin: PluginContext) {
  plugin.handle(GetNoteRpc, async ({ workspaceId }) =>
    noteStore(workspaceId).read(),
  );
  plugin.handle(SaveNoteRpc, async ({ workspaceId, markdown }) =>
    noteStore(workspaceId).write({
      workspaceId,
      markdown,
      updatedAt: new Date().toISOString(),
    }),
  );
  plugin.handle(GetBoardWorkflowRpc, () => boardWorkflowStore().read());
  plugin.handle(PlaceBoardCardRpc, (placement) =>
    boardWorkflowStore().update((current) =>
      placeBoardCard(current, placement),
    ),
  );

  plugin.addSurface("agent-board", AgentBoardSurface);
  plugin.addSidebarItem({
    id: "agent-board",
    title: "Agent board",
    icon: "PanelsTopLeft",
    surface: "agent-board",
  });
  plugin.addWorkspacePanel({
    id: "notes",
    title: "Workspace notes",
    icon: "ListPlus",
    context: "workspace",
    Component: NotesPanel,
  });
  plugin.addCommandCenterItem({
    id: "open-agent-board",
    title: "Open agent board",
    icon: "PanelsTopLeft",
    context: "global",
    onSelect: ({ openSurface }) => openSurface("agent-board"),
  });
  plugin.addCommandCenterItem({
    id: "open-notes",
    title: "Open workspace notes",
    icon: "ListPlus",
    context: "workspace",
    onSelect: ({ openPanel }) => openPanel("notes"),
  });
  return () => {};
}

function noteStore(workspaceId: string) {
  const existing = noteStores.get(workspaceId);
  if (existing) return existing;
  const store = createNoteStore(workspaceId);
  noteStores.set(workspaceId, store);
  return store;
}

function createNoteStore(workspaceId: string) {
  return new JsonStore(
    workspaceFile(
      pluginDataDirectory("workspace-companion"),
      workspaceId,
      "note",
    ),
    NoteSchema,
    () => ({ workspaceId, markdown: "", updatedAt: new Date(0).toISOString() }),
  );
}

function boardWorkflowStore() {
  boardWorkflow ??= createBoardWorkflowStore();
  return boardWorkflow;
}

function createBoardWorkflowStore() {
  return new JsonStore(
    `${pluginDataDirectory("workspace-companion")}/review-states.json`,
    BoardWorkflowSchema,
    () => createBoardWorkflow({}),
  );
}
