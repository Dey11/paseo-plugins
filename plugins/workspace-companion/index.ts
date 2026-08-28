import type { PluginContext } from "@getpaseo/plugin";
import {
  BoardWorkflowSchema,
  GetBoardWorkflowRpc,
  GetNoteRpc,
  GetTempChatContextRpc,
  NoteSchema,
  PlaceBoardCardRpc,
  ResetTempChatContextRpc,
  SaveNoteRpc,
  SaveTempChatContextRpc,
  TempChatContextSchema,
} from "./contracts";
import { AgentBoardSurface, NotesPanel } from "./main.client";
import { TempChatPanel } from "./temp-chat.client";
import { JsonStore, pluginDataDirectory, workspaceFile } from "./store.server";
import { createBoardWorkflow, placeBoardCard } from "./workflow";

let boardWorkflow: ReturnType<typeof createBoardWorkflowStore> | undefined;
const noteStores = new Map<string, ReturnType<typeof createNoteStore>>();
const tempChatContextStores = new Map<
  string,
  ReturnType<typeof createTempChatContextStore>
>();

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
  plugin.handle(GetTempChatContextRpc, async ({ workspaceId }) =>
    tempChatContextStore(workspaceId).read(),
  );
  plugin.handle(SaveTempChatContextRpc, async (context) =>
    tempChatContextStore(context.workspaceId).write(context),
  );
  plugin.handle(ResetTempChatContextRpc, async ({ workspaceId }) =>
    tempChatContextStore(workspaceId).write(emptyTempChatContext(workspaceId)),
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
    locations: ["explorer"],
    Component: NotesPanel,
  });
  plugin.addWorkspacePanel({
    id: "temp-chat",
    title: "Temp chat",
    icon: "CircleDot",
    context: "workspace",
    locations: ["explorer"],
    Component: TempChatPanel,
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
    onSelect: ({ openPanel }) => openPanel("notes", { location: "explorer" }),
  });
  plugin.addCommandCenterItem({
    id: "open-temp-chat",
    title: "Open Temp chat",
    icon: "CircleDot",
    keywords: ["temporary", "clarify", "question", "side chat"],
    context: "workspace",
    onSelect: ({ openPanel }) =>
      openPanel("temp-chat", { location: "explorer" }),
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

function tempChatContextStore(workspaceId: string) {
  const existing = tempChatContextStores.get(workspaceId);
  if (existing) return existing;
  const store = createTempChatContextStore(workspaceId);
  tempChatContextStores.set(workspaceId, store);
  return store;
}

function createTempChatContextStore(workspaceId: string) {
  return new JsonStore(
    workspaceFile(
      pluginDataDirectory("workspace-companion"),
      workspaceId,
      "temp-chat-context",
    ),
    TempChatContextSchema,
    () => emptyTempChatContext(workspaceId),
  );
}

function emptyTempChatContext(workspaceId: string) {
  return {
    workspaceId,
    snapshot: "",
    sourceAgentCount: 0,
    omittedAgentCount: 0,
    includesNote: false,
    capturedAt: null,
    appliedAgentId: null,
    appliedCapturedAt: null,
  };
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
