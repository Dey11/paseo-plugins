import type { PluginContext } from "@getpaseo/plugin";
import {
  BoardWorkflowSchema,
  emptyReviewDocument,
  GenerateReviewPlanRpc,
  GetBoardWorkflowRpc,
  GetNoteRpc,
  GetReviewPlanRpc,
  NoteSchema,
  PlaceBoardCardRpc,
  ReviewDocumentSchema,
  SaveNoteRpc,
} from "./contracts";
import { AgentBoardSurface, NotesPanel, ReviewPanel } from "./main.client";
import { generateQaReview } from "./review.server";
import { JsonStore, pluginDataDirectory, workspaceFile } from "./store.server";
import { createBoardWorkflow, placeBoardCard } from "./workflow";

let boardWorkflow: ReturnType<typeof createBoardWorkflowStore> | undefined;
const noteStores = new Map<string, ReturnType<typeof createNoteStore>>();
const reviewPlanStores = new Map<
  string,
  ReturnType<typeof createReviewPlanStore>
>();
const reviewJobs = new Map<string, Promise<void>>();

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
  plugin.handle(GetReviewPlanRpc, async ({ workspaceId }) => {
    const store = reviewPlanStore(workspaceId);
    const document = await store.read();
    if (document.status !== "generating" || reviewJobs.has(workspaceId)) {
      return document;
    }
    return store.write({
      ...document,
      status: "error",
      error: "QA plan generation was interrupted. Generate it again.",
    });
  });
  plugin.handle(
    GenerateReviewPlanRpc,
    async ({ workspaceId, agentId }, { paseo }) => {
      const store = reviewPlanStore(workspaceId);
      const current = await store.read();
      if (reviewJobs.has(workspaceId)) return current;

      const generating = await store.write({
        status: "generating",
        plan: current.plan,
        requestedAt: new Date().toISOString(),
        error: null,
      });
      const job = (async () => {
        try {
          const workspace = await paseo.workspaces.ref(workspaceId).refresh();
          const directory = workspace?.workspaceDirectory;
          if (!directory)
            throw new Error("The workspace directory is unavailable.");
          const plan = await generateQaReview({
            paseo,
            workspaceId,
            agentId,
            cwd: directory,
          });
          await store.write({
            status: "ready",
            plan,
            requestedAt: generating.requestedAt,
            error: null,
          });
        } catch (error) {
          await store.write({
            status: "error",
            plan: generating.plan,
            requestedAt: generating.requestedAt,
            error: message(error),
          });
        }
      })();
      reviewJobs.set(workspaceId, job);
      void job.then(
        () => reviewJobs.delete(workspaceId),
        () => reviewJobs.delete(workspaceId),
      );
      return generating;
    },
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
    title: "Notes",
    icon: "ListPlus",
    context: "agent",
    Component: NotesPanel,
  });
  plugin.addWorkspacePanel({
    id: "review",
    title: "QA review",
    icon: "Scan",
    context: "agent",
    Component: ReviewPanel,
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
    context: "agent",
    onSelect: ({ openPanel }) => openPanel("notes"),
  });
  plugin.addCommandCenterItem({
    id: "open-review",
    title: "Open QA review",
    icon: "Scan",
    context: "agent",
    onSelect: ({ openPanel }) => openPanel("review"),
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

function reviewPlanStore(workspaceId: string) {
  const existing = reviewPlanStores.get(workspaceId);
  if (existing) return existing;
  const store = createReviewPlanStore(workspaceId);
  reviewPlanStores.set(workspaceId, store);
  return store;
}

function createReviewPlanStore(workspaceId: string) {
  return new JsonStore(
    workspaceFile(
      pluginDataDirectory("workspace-companion"),
      workspaceId,
      "review",
    ),
    ReviewDocumentSchema,
    emptyReviewDocument,
  );
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to generate a QA plan.";
}
