import type {
  PluginSurfaceProps,
  PluginTheme,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin";
import { usePaseo, useRpc } from "@getpaseo/plugin";
import type { PaseoAgent, PaseoWorkspace } from "@getpaseo/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  type GestureResponderEvent,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  GetBoardWorkflowRpc,
  GetNoteRpc,
  PlaceBoardCardRpc,
  type ReviewState,
  SaveNoteRpc,
} from "./contracts";
import { requireArchivedAt } from "./archive";
import {
  BOARD_STATES,
  canPlaceBoardCard,
  orderBoardWorkspaceIds,
  placeBoardCard,
  resolveBoardState,
  type BoardPlacement,
  type BoardState,
  type BoardWorkflow,
} from "./workflow";
import { toggleMarkdownTask } from "./markdown";
import { openExternalNoteUrl } from "./external-url";
import { buildWorkspaceDeepLink, buildWorkspaceRoute } from "./workspace-route";

declare global {
  interface Window {
    paseoDesktop?: {
      opener?: { openUrl?: (url: string) => Promise<void> };
    };
  }
}

const REVIEW_STATES: readonly ReviewState[] = [
  "unreviewed",
  "recheck",
  "approved",
];
const BOARD_QUERY_KEY = ["agent-board"] as const;

export function NotesPanel({
  workspaceId,
  theme,
  layout,
}: PluginWorkspacePanelProps) {
  const getNote = useRpc(GetNoteRpc);
  const saveNote = useRpc(SaveNoteRpc);
  const paseo = usePaseo();
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [markdown, setMarkdown] = useState("");
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [busy, setBusy] = useState<"save" | "refine" | null>(null);
  const styles = useStyles(theme, layout.compact);
  const note = useQuery({
    queryKey: ["workspace-note", workspaceId],
    queryFn: () => getNote({ workspaceId }),
  });
  const workspaceAgent = useQuery({
    queryKey: ["workspace-note-agent", workspaceId],
    queryFn: async () => {
      const agents = await paseo.agents.list();
      return (
        agents.entries
          .map((entry: { agent: PaseoAgent }) => entry.agent)
          .filter((agent: PaseoAgent) => agent.workspaceId === workspaceId)
          .sort((left: PaseoAgent, right: PaseoAgent) =>
            right.updatedAt.localeCompare(left.updatedAt),
          )[0] ?? null
      );
    },
    staleTime: 30_000,
  });
  useEffect(() => {
    if (!note.data) return;
    setMarkdown(note.data.markdown);
    setSavedMarkdown(note.data.markdown);
    setUpdatedAt(note.data.updatedAt);
  }, [note.data]);
  const dirty = markdown !== savedMarkdown;

  async function persistNote(nextMarkdown: string) {
    setBusy("save");
    setNotice("");
    setNoticeIsError(false);
    try {
      const saved = await saveNote({ workspaceId, markdown: nextMarkdown });
      setSavedMarkdown(saved.markdown);
      setUpdatedAt(saved.updatedAt);
    } catch (error) {
      setNotice(message(error));
      setNoticeIsError(true);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    await persistNote(markdown);
  }

  async function toggleChecklist(lineIndex: number) {
    if (busy !== null || note.isError) return;
    const nextMarkdown = toggleMarkdownTask(markdown, lineIndex);
    if (nextMarkdown === markdown) return;
    setMarkdown(nextMarkdown);
    await persistNote(nextMarkdown);
  }

  async function openLinkInBrowser(url: string) {
    setNotice("");
    setNoticeIsError(false);
    try {
      const desktopOpen =
        typeof window !== "undefined" &&
        typeof window.paseoDesktop?.opener?.openUrl === "function"
          ? (value: string) => window.paseoDesktop?.opener?.openUrl?.(value)
          : undefined;
      await openExternalNoteUrl(url, {
        platform: layout.platform,
        desktopOpen,
        browserOpen: (value) => {
          if (typeof window !== "undefined") {
            window.open(value, "_blank", "noopener,noreferrer");
          }
        },
        nativeOpen: Linking.openURL,
      });
    } catch (error) {
      setNotice(message(error));
      setNoticeIsError(true);
    }
  }

  async function askAgent() {
    setBusy("refine");
    setNotice("");
    setNoticeIsError(false);
    try {
      const agent = workspaceAgent.data;
      if (!agent)
        throw new Error(
          "This workspace does not have an agent to refine the note.",
        );
      const result = await paseo.agents
        .ref(agent.id)
        .run(
          `Rewrite the workspace note below as concise Markdown. Preserve useful facts, decisions, TODOs, and review instructions. Return Markdown only; do not use a wrapping code fence.\n\n${markdown}`,
          { timeoutMs: 180_000 },
        );
      if (!result.lastMessage)
        throw new Error(
          result.error ?? "The agent did not return a note draft.",
        );
      setMarkdown(result.lastMessage);
      setMode("write");
      setNotice("Agent draft loaded. Review it before saving.");
    } catch (error) {
      setNotice(message(error));
      setNoticeIsError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
    >
      <Header
        title="Notes"
        subtitle="Private Markdown context for this workspace"
        styles={styles}
      />
      <Segments
        values={["write", "preview"]}
        value={mode}
        onChange={(value) => setMode(value as "write" | "preview")}
        styles={styles}
      />
      {note.isError ? (
        <PanelError
          title="Couldn’t load this note"
          message={message(note.error)}
          onRetry={() => void note.refetch()}
          styles={styles}
        />
      ) : (
        <View style={styles.noteSurface}>
          {note.isLoading ? (
            <View style={styles.noteLoading}>
              <ActivityIndicator color={theme.colors.foregroundMuted} />
            </View>
          ) : mode === "write" ? (
            <TextInput
              accessibilityLabel="Workspace note"
              multiline
              value={markdown}
              onChangeText={setMarkdown}
              placeholder="Add decisions, context, and follow-ups…"
              placeholderTextColor={theme.colors.foregroundMuted}
              style={styles.noteEditor}
            />
          ) : (
            <MarkdownPreview
              markdown={markdown}
              checklistDisabled={busy !== null || note.isError}
              onOpenLink={openLinkInBrowser}
              onToggleChecklist={toggleChecklist}
              styles={styles}
            />
          )}
        </View>
      )}
      {notice ? (
        <Text style={noticeIsError ? styles.errorText : styles.notice}>
          {notice}
        </Text>
      ) : null}
      <View style={styles.panelFooter}>
        <Text accessibilityLiveRegion="polite" style={styles.saveState}>
          {busy === "save"
            ? "Saving..."
            : dirty
              ? "Unsaved changes"
              : savedLabel(updatedAt)}
        </Text>
        <View style={styles.footerActions}>
          <Button
            label={
              busy === "refine"
                ? "Refining..."
                : workspaceAgent.data
                  ? "Refine with agent"
                  : "No agent available"
            }
            onPress={askAgent}
            variant="ghost"
            disabled={
              busy !== null ||
              note.isError ||
              workspaceAgent.isLoading ||
              !workspaceAgent.data
            }
            styles={styles}
          />
          <Button
            label="Save"
            onPress={save}
            variant="primary"
            disabled={busy !== null || note.isError || !dirty}
            styles={styles}
          />
        </View>
      </View>
    </ScrollView>
  );
}

export function AgentBoardSurface({ theme, host, layout }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const getWorkflow = useRpc(GetBoardWorkflowRpc);
  const persistPlacement = useRpc(PlaceBoardCardRpc);
  const queryClient = useQueryClient();
  const styles = useStyles(theme, layout.compact);
  const [moving, setMoving] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState<string | null>(
    null,
  );
  const [draggedCard, setDraggedCard] = useState<DraggedBoardCard | null>(null);
  const [dropTarget, setDropTarget] = useState<BoardDropTarget | null>(null);
  const [archiveDropActive, setArchiveDropActive] = useState(false);
  const [notice, setNotice] = useState("");
  const board = useQuery<BoardQueryData>({
    queryKey: BOARD_QUERY_KEY,
    queryFn: async () => {
      const [workspaces, agents, workflow] = await Promise.all([
        paseo.workspaces.list(),
        paseo.agents.list(),
        getWorkflow({}),
      ]);
      const workspaceEntries: PaseoWorkspace[] = workspaces.entries;
      const agentEntries: PaseoAgent[] = agents.entries.map(
        (entry: { agent: PaseoAgent }) => entry.agent,
      );
      return {
        workspaces: workspaceEntries,
        agents: agentEntries,
        workflow,
      };
    },
    refetchInterval: moving || archiving || draggedCard ? false : 5_000,
  });

  async function place(placement: BoardPlacement) {
    if (moving) return;
    const previous = queryClient.getQueryData<BoardQueryData>(BOARD_QUERY_KEY);
    if (!previous) return;

    let optimisticWorkflow: BoardWorkflow;
    try {
      optimisticWorkflow = placeBoardCard(previous.workflow, placement);
    } catch (error) {
      setNotice(message(error));
      return;
    }

    setMoving(placement.workspaceId);
    setConfirmingArchive(null);
    setNotice("");
    void queryClient.cancelQueries({ queryKey: BOARD_QUERY_KEY });
    queryClient.setQueryData<BoardQueryData>(BOARD_QUERY_KEY, {
      ...previous,
      workflow: optimisticWorkflow,
    });
    try {
      const workflow = await persistPlacement(placement);
      queryClient.setQueryData<BoardQueryData>(BOARD_QUERY_KEY, (current) =>
        current ? { ...current, workflow } : current,
      );
    } catch (error) {
      queryClient.setQueryData(BOARD_QUERY_KEY, previous);
      setNotice(message(error));
    } finally {
      setMoving(null);
      setDraggedCard(null);
      setDropTarget(null);
      setArchiveDropActive(false);
    }
  }

  async function archiveWorkspace(workspaceId: string) {
    if (moving || archiving) return;
    const previous = queryClient.getQueryData<BoardQueryData>(BOARD_QUERY_KEY);
    if (!previous) return;
    const workspace = previous.workspaces.find(
      (entry) => entry.id === workspaceId,
    );
    if (!workspace) return;

    setArchiving(workspaceId);
    setConfirmingArchive(null);
    setNotice("");
    await queryClient.cancelQueries({ queryKey: BOARD_QUERY_KEY });
    queryClient.setQueryData<BoardQueryData>(BOARD_QUERY_KEY, {
      ...previous,
      workspaces: previous.workspaces.filter(
        (entry) => entry.id !== workspaceId,
      ),
      agents: previous.agents.filter(
        (entry) => entry.workspaceId !== workspaceId,
      ),
    });

    try {
      const result = await paseo.workspaces.archive(workspaceId);
      requireArchivedAt(result);
      setNotice(`Archived ${workspace.title ?? workspace.name}.`);
      await queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
    } catch (error) {
      queryClient.setQueryData(BOARD_QUERY_KEY, previous);
      setNotice(`Couldn’t archive the workspace. ${message(error)}`);
    } finally {
      setArchiving(null);
      setDraggedCard(null);
      setDropTarget(null);
      setArchiveDropActive(false);
    }
  }

  function requestArchive(workspaceId: string) {
    if (confirmingArchive === workspaceId) {
      void archiveWorkspace(workspaceId);
      return;
    }
    setConfirmingArchive(workspaceId);
  }

  function drop(target: BoardDropTarget) {
    if (!draggedCard) return;
    void place({
      workspaceId: draggedCard.workspaceId,
      sourceState: draggedCard.state,
      targetState: target.state,
      targetIndex: target.index,
    });
  }

  if (board.isLoading || (!board.data && !board.isError))
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  if (board.isError || !board.data)
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Unable to load the agent board</Text>
        <BoardToolbarButton
          label="Try again"
          onPress={() => void board.refetch()}
          styles={styles}
        />
      </View>
    );
  const cards: BoardCard[] = board.data.workspaces.map(
    (workspace: PaseoWorkspace) => {
      const agents = board.data.agents
        .filter((agent: PaseoAgent) => agent.workspaceId === workspace.id)
        .sort((a: PaseoAgent, b: PaseoAgent) =>
          b.updatedAt.localeCompare(a.updatedAt),
        );
      const reviewState: ReviewState =
        board.data.workflow.reviewStates[workspace.id] ?? "unreviewed";
      return {
        workspace,
        agent: agents[0],
        state: resolveBoardState(workspace, agents, reviewState),
      };
    },
  );
  cards.sort((left, right) =>
    cardUpdatedAt(right).localeCompare(cardUpdatedAt(left)),
  );
  const cardsByState = Object.fromEntries(
    BOARD_STATES.map((state) => {
      const stateCards = cards.filter((card) => card.state === state);
      const cardsById = new Map(
        stateCards.map((card) => [card.workspace.id, card]),
      );
      const workspaceIds = orderBoardWorkspaceIds(
        stateCards.map((card) => card.workspace.id),
        board.data.workflow.columnOrder[state],
      );
      return [
        state,
        workspaceIds.flatMap((workspaceId) => {
          const card = cardsById.get(workspaceId);
          return card ? [card] : [];
        }),
      ];
    }),
  ) as Record<BoardState, BoardCard[]>;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      horizontal={false}
    >
      <View style={styles.boardToolbar}>
        <View style={styles.header}>
          <Text style={styles.boardHeaderTitle}>Agent board</Text>
          <Text style={styles.muted}>
            Live activity and review status in one board
          </Text>
        </View>
        <View style={styles.boardToolbarActions}>
          {layout.platform === "web" ? (
            <WebArchiveDropZone
              draggedCard={draggedCard}
              active={archiveDropActive}
              archiving={archiving !== null}
              disabled={moving !== null || archiving !== null}
              onDragOver={() => {
                setArchiveDropActive(true);
                setDropTarget(null);
              }}
              onDrop={(workspaceId) => void archiveWorkspace(workspaceId)}
              styles={styles}
            />
          ) : null}
          <BoardToolbarButton
            label="Refresh"
            onPress={() => void board.refetch()}
            styles={styles}
          />
        </View>
      </View>
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.board}
      >
        {BOARD_STATES.map((state) => (
          <BoardColumn
            key={state}
            title={titleCase(state)}
            state={state}
            cards={cardsByState[state]}
            onPlace={place}
            moving={moving ?? archiving}
            draggedCard={draggedCard}
            onDragStart={setDraggedCard}
            onDragEnd={() => {
              setDraggedCard(null);
              setDropTarget(null);
              setArchiveDropActive(false);
            }}
            onDragOver={(target) => {
              setArchiveDropActive(false);
              setDropTarget(target);
            }}
            onDrop={drop}
            dropTarget={dropTarget}
            confirmingArchive={confirmingArchive}
            onRequestArchive={requestArchive}
            openWorkspace={(workspaceId) =>
              openWorkspace(host.id, workspaceId, layout.platform)
            }
            web={layout.platform === "web"}
            styles={styles}
          />
        ))}
      </ScrollView>
    </ScrollView>
  );
}

type BoardCard = {
  workspace: PaseoWorkspace;
  agent?: PaseoAgent;
  state: BoardState;
};

type BoardQueryData = {
  workspaces: PaseoWorkspace[];
  agents: PaseoAgent[];
  workflow: BoardWorkflow;
};

type DraggedBoardCard = {
  workspaceId: string;
  state: BoardState;
};

type BoardDropTarget = {
  state: BoardState;
  index: number;
  anchorWorkspaceId?: string;
  edge: "before" | "after" | "end";
};

function BoardColumn({
  title,
  state,
  cards,
  onPlace,
  moving,
  draggedCard,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  dropTarget,
  confirmingArchive,
  onRequestArchive,
  openWorkspace,
  web,
  styles,
}: {
  title: string;
  state: BoardState;
  cards: BoardCard[];
  onPlace: (placement: BoardPlacement) => void;
  moving: string | null;
  draggedCard: DraggedBoardCard | null;
  onDragStart: (card: DraggedBoardCard) => void;
  onDragEnd: () => void;
  onDragOver: (target: BoardDropTarget) => void;
  onDrop: (target: BoardDropTarget) => void;
  dropTarget: BoardDropTarget | null;
  confirmingArchive: string | null;
  onRequestArchive: (workspaceId: string) => void;
  openWorkspace: (id: string) => void;
  web: boolean;
  styles: Styles;
}) {
  const reviewState = isReviewState(state) ? state : null;
  const content = (
    <>
      <View style={styles.columnHeader}>
        <View style={styles.columnLabel}>
          <View
            style={[
              styles.stateDot,
              state === "running" && styles.runningDot,
              state === "error" && styles.errorDot,
            ]}
          />
          <Text style={styles.columnTitle}>{title}</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{cards.length}</Text>
        </View>
      </View>
      <View style={styles.columnCards}>
        {cards.map((card, index) => {
          const boardCard = (
            <WorkspaceBoardCard
              card={card}
              reviewState={reviewState}
              moving={moving === card.workspace.id}
              openWorkspace={openWorkspace}
              onPlace={onPlace}
              confirmingArchive={confirmingArchive === card.workspace.id}
              onRequestArchive={onRequestArchive}
              styles={styles}
            />
          );
          return web ? (
            <WebDragCard
              key={card.workspace.id}
              card={card}
              index={index}
              active={draggedCard?.workspaceId === card.workspace.id}
              disabled={moving !== null}
              draggedCard={draggedCard}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              styles={styles}
            >
              {boardCard}
            </WebDragCard>
          ) : (
            <View key={card.workspace.id}>{boardCard}</View>
          );
        })}
        {cards.length === 0 ? (
          <Text style={styles.columnEmpty}>No workspaces</Text>
        ) : null}
      </View>
    </>
  );

  if (web) {
    return (
      <WebDropColumn
        state={state}
        endIndex={cards.length}
        draggedCard={draggedCard}
        dropActive={dropTarget?.state === state}
        onDragOver={onDragOver}
        onDrop={onDrop}
        styles={styles}
      >
        {content}
      </WebDropColumn>
    );
  }

  return <View style={styles.column}>{content}</View>;
}

function WorkspaceBoardCard({
  card,
  reviewState,
  moving,
  openWorkspace,
  onPlace,
  confirmingArchive,
  onRequestArchive,
  styles,
}: {
  card: BoardCard;
  reviewState: ReviewState | null;
  moving: boolean;
  openWorkspace: (id: string) => void;
  onPlace: (placement: BoardPlacement) => void;
  confirmingArchive: boolean;
  onRequestArchive: (workspaceId: string) => void;
  styles: Styles;
}) {
  const { workspace, agent } = card;
  return (
    <View style={styles.boardCard}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open workspace ${workspace.title ?? workspace.name}`}
        onPress={() => openWorkspace(workspace.id)}
        style={({ pressed }) => [
          styles.boardCardBody,
          pressed && styles.boardCardPressed,
        ]}
      >
        <Text numberOfLines={2} style={styles.boardCardTitle}>
          {workspace.title ?? workspace.name}
        </Text>
        <Text numberOfLines={2} style={styles.boardCardSubtitle}>
          {workspace.projectDisplayName} ·{" "}
          {agent?.title ?? agent?.provider ?? "No agent"}
        </Text>
        <Text style={styles.boardCardMeta}>
          {workspace.diffStat
            ? `+${workspace.diffStat.additions} −${workspace.diffStat.deletions}`
            : (agent?.provider ?? "No changes")}
        </Text>
      </Pressable>
      <View style={styles.moveRow}>
        {reviewState ? (
          <>
            <Text style={styles.moveLabel}>Move to</Text>
            {REVIEW_STATES.filter((state) => state !== reviewState).map(
              (state) => (
                <MoveAction
                  key={state}
                  label={titleCase(state)}
                  disabled={moving}
                  onPress={(event) => {
                    event.stopPropagation();
                    onPlace({
                      workspaceId: workspace.id,
                      sourceState: card.state,
                      targetState: state,
                      targetIndex: Number.MAX_SAFE_INTEGER,
                    });
                  }}
                  styles={styles}
                />
              ),
            )}
          </>
        ) : null}
        <MoveAction
          label={confirmingArchive ? "Confirm archive" : "Archive"}
          disabled={moving}
          destructive
          onPress={(event) => {
            event.stopPropagation();
            onRequestArchive(workspace.id);
          }}
          styles={styles}
        />
      </View>
    </View>
  );
}

function WebArchiveDropZone({
  draggedCard,
  active,
  archiving,
  disabled,
  onDragOver,
  onDrop,
  styles,
}: {
  draggedCard: DraggedBoardCard | null;
  active: boolean;
  archiving: boolean;
  disabled: boolean;
  onDragOver: () => void;
  onDrop: (workspaceId: string) => void;
  styles: Styles;
}) {
  const armed = draggedCard !== null && !disabled;
  const label = archiving
    ? "Archiving…"
    : active
      ? "Release to archive"
      : armed
        ? "Drop to archive"
        : "Archive";

  return (
    <div
      aria-label="Archive workspace drop zone"
      onDragOver={(event) => {
        if (!armed) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={(event) => {
        if (!draggedCard || disabled) return;
        event.preventDefault();
        event.stopPropagation();
        onDrop(draggedCard.workspaceId);
      }}
      style={
        StyleSheet.flatten([
          styles.archiveDropZone,
          armed && styles.archiveDropZoneArmed,
          active && styles.archiveDropZoneActive,
        ]) as unknown as React.CSSProperties
      }
    >
      <Text
        style={[
          styles.archiveDropZoneText,
          armed && styles.archiveDropZoneTextArmed,
        ]}
      >
        {label}
      </Text>
    </div>
  );
}

function WebDragCard({
  card,
  index,
  active,
  disabled,
  draggedCard,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  styles,
  children,
}: React.PropsWithChildren<{
  card: BoardCard;
  index: number;
  active: boolean;
  disabled: boolean;
  draggedCard: DraggedBoardCard | null;
  dropTarget: BoardDropTarget | null;
  onDragStart: (card: DraggedBoardCard) => void;
  onDragEnd: () => void;
  onDragOver: (target: BoardDropTarget) => void;
  onDrop: (target: BoardDropTarget) => void;
  styles: Styles;
}>) {
  const marker =
    dropTarget?.anchorWorkspaceId === card.workspace.id
      ? dropTarget.edge
      : null;

  function targetForPointer(event: React.DragEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const edge =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    return {
      state: card.state,
      index: edge === "before" ? index : index + 1,
      anchorWorkspaceId: card.workspace.id,
      edge,
    } satisfies BoardDropTarget;
  }

  return (
    <div
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.workspace.id);
        onDragStart({ workspaceId: card.workspace.id, state: card.state });
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!draggedCard || !canPlaceBoardCard(draggedCard.state, card.state))
          return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        onDragOver(targetForPointer(event));
      }}
      onDrop={(event) => {
        if (!draggedCard || !canPlaceBoardCard(draggedCard.state, card.state))
          return;
        event.preventDefault();
        event.stopPropagation();
        onDrop(targetForPointer(event));
      }}
      style={{
        ...(StyleSheet.flatten(
          active ? styles.webDragCardActive : undefined,
        ) as unknown as React.CSSProperties),
        position: "relative",
        cursor: disabled ? "default" : active ? "grabbing" : "grab",
      }}
    >
      {marker ? (
        <div
          aria-hidden="true"
          style={{
            ...(StyleSheet.flatten(
              styles.webDropMarker,
            ) as unknown as React.CSSProperties),
            [marker === "before" ? "top" : "bottom"]: -5,
          }}
        />
      ) : null}
      {children}
    </div>
  );
}

function WebDropColumn({
  state,
  endIndex,
  draggedCard,
  dropActive,
  onDragOver,
  onDrop,
  styles,
  children,
}: React.PropsWithChildren<{
  state: BoardState;
  endIndex: number;
  draggedCard: DraggedBoardCard | null;
  dropActive: boolean;
  onDragOver: (target: BoardDropTarget) => void;
  onDrop: (target: BoardDropTarget) => void;
  styles: Styles;
}>) {
  const endTarget: BoardDropTarget = {
    state,
    index: endIndex,
    edge: "end",
  };
  const acceptsDrop =
    draggedCard !== null && canPlaceBoardCard(draggedCard.state, state);
  return (
    <div
      onDragOver={(event) => {
        if (!acceptsDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver(endTarget);
      }}
      onDrop={(event) => {
        if (!acceptsDrop) return;
        event.preventDefault();
        onDrop(endTarget);
      }}
      style={
        StyleSheet.flatten([
          styles.column,
          dropActive && styles.columnDropActive,
        ]) as unknown as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

function isReviewState(state: BoardState): state is ReviewState {
  return REVIEW_STATES.includes(state as ReviewState);
}

function cardUpdatedAt(card: BoardCard): string {
  return card.agent?.updatedAt ?? card.workspace.statusEnteredAt ?? "";
}

function openWorkspace(
  hostId: string,
  workspaceId: string,
  platform: PluginSurfaceProps["layout"]["platform"],
) {
  const route = buildWorkspaceRoute(hostId, workspaceId);
  if (platform === "web" && typeof window !== "undefined") {
    window.location.assign(route);
    return;
  }
  void Linking.openURL(buildWorkspaceDeepLink(hostId, workspaceId));
}

function MarkdownPreview({
  markdown,
  checklistDisabled,
  onOpenLink,
  onToggleChecklist,
  styles,
}: {
  markdown: string;
  checklistDisabled: boolean;
  onOpenLink: (url: string) => Promise<void>;
  onToggleChecklist: (lineIndex: number) => Promise<void>;
  styles: Styles;
}) {
  if (!markdown.trim())
    return <Empty text="Nothing to preview yet." styles={styles} />;
  const lines = markdown.split("\n");
  const blocks: React.ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      const code: string[] = [];
      while (index + 1 < lines.length && !lines[index + 1]?.startsWith("```")) {
        code.push(lines[index + 1] ?? "");
        index += 1;
      }
      if (lines[index + 1]?.startsWith("```")) index += 1;
      blocks.push(
        <View key={`code-${index}`} style={styles.codeBlock}>
          <Text style={styles.codeText}>{code.join("\n")}</Text>
        </View>,
      );
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push(
        <Text key={index} style={styles.heading3}>
          {renderInline(line.slice(4), styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(
        <Text key={index} style={styles.heading2}>
          {renderInline(line.slice(3), styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(
        <Text key={index} style={styles.heading1}>
          {renderInline(line.slice(2), styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    const checkbox = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (checkbox) {
      const checked = checkbox[1]?.toLowerCase() === "x";
      const label = checkbox[2] ?? "";
      blocks.push(
        <View key={index} style={styles.taskRow}>
          <Pressable
            accessibilityLabel={`${checked ? "Mark incomplete" : "Mark complete"}: ${label}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled: checklistDisabled }}
            disabled={checklistDisabled}
            onPress={() => onToggleChecklist(index)}
            style={({ pressed }) => [
              styles.taskToggle,
              pressed && styles.taskTogglePressed,
              checklistDisabled && styles.taskToggleDisabled,
            ]}
          >
            <View style={[styles.taskBox, checked && styles.taskBoxChecked]}>
              {checked ? <Text style={styles.taskCheckmark}>✓</Text> : null}
            </View>
          </Pressable>
          <Text style={[styles.body, checked && styles.taskTextChecked]}>
            {renderInline(label, styles, onOpenLink)}
          </Text>
        </View>,
      );
      continue;
    }
    const bullet = line.match(/^[-*] (.*)$/);
    if (bullet) {
      blocks.push(
        <Text key={index} style={styles.body}>
          • {renderInline(bullet[1] ?? "", styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    const numbered = line.match(/^(\d+)\. (.*)$/);
    if (numbered) {
      blocks.push(
        <Text key={index} style={styles.body}>
          {numbered[1]}. {renderInline(numbered[2] ?? "", styles, onOpenLink)}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(
        <View key={index} style={styles.blockquote}>
          <Text style={styles.body}>
            {renderInline(line.slice(2), styles, onOpenLink)}
          </Text>
        </View>,
      );
      continue;
    }
    blocks.push(
      <Text key={index} style={styles.body}>
        {line ? renderInline(line, styles, onOpenLink) : " "}
      </Text>,
    );
  }
  return <View style={styles.preview}>{blocks}</View>;
}

function renderInline(
  value: string,
  styles: Styles,
  onOpenLink: (url: string) => Promise<void>,
): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(value.slice(cursor, start));
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) {
      nodes.push(
        <Text
          key={`${start}-link`}
          accessibilityRole="link"
          onPress={() => void onOpenLink(link[2] ?? "")}
          style={styles.link}
        >
          {link[1]}
        </Text>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <Text key={`${start}-strong`} style={styles.strong}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={`${start}-code`} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </Text>,
      );
    }
    cursor = start + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function Header({
  title,
  subtitle,
  styles,
}: {
  title: string;
  subtitle: string;
  styles: Styles;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>{subtitle}</Text>
    </View>
  );
}

function PanelError({
  title,
  message,
  onRetry,
  styles,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  styles: Styles;
}) {
  return (
    <View style={styles.panelError}>
      <View style={styles.panelErrorCopy}>
        <Text style={styles.panelErrorTitle}>{title}</Text>
        <Text style={styles.muted}>{message}</Text>
      </View>
      <Button
        label="Try again"
        onPress={onRetry}
        variant="secondary"
        styles={styles}
      />
    </View>
  );
}

function Empty({ text, styles }: { text: string; styles: Styles }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}
function Button({
  label,
  onPress,
  variant = "secondary",
  disabled,
  styles,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primaryButton,
        variant === "secondary" && styles.secondaryButton,
        variant === "ghost" && styles.ghostButton,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "primary" && styles.primaryButtonText,
          variant === "ghost" && styles.ghostButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function BoardToolbarButton({
  label,
  onPress,
  styles,
}: {
  label: string;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.boardToolbarButton,
        pressed && styles.boardControlPressed,
      ]}
    >
      <Text style={styles.boardToolbarButtonText}>{label}</Text>
    </Pressable>
  );
}
function MoveAction({
  label,
  onPress,
  disabled,
  destructive = false,
  styles,
}: {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  destructive?: boolean;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.moveAction,
        (pressed || disabled) && styles.boardControlPressed,
      ]}
    >
      <Text
        style={[
          styles.moveActionText,
          destructive && styles.moveActionTextDestructive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function Segments({
  values,
  value,
  onChange,
  styles,
}: {
  values: string[];
  value: string;
  onChange: (value: string) => void;
  styles: Styles;
}) {
  return (
    <View style={styles.segments}>
      {values.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item }}
          onPress={() => onChange(item)}
          style={({ pressed }) => [
            styles.segment,
            value === item && styles.activeSegment,
            pressed && styles.segmentPressed,
          ]}
        >
          <Text
            style={value === item ? styles.segmentTextActive : styles.muted}
          >
            {titleCase(item)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function savedLabel(updatedAt: string | null): string {
  if (!updatedAt) return "Not saved yet";
  const savedAt = new Date(updatedAt);
  if (savedAt.getTime() <= 0 || Number.isNaN(savedAt.getTime())) {
    return "Not saved yet";
  }
  return `Saved ${savedAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

type Styles = ReturnType<typeof useStyles>;
function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: theme.colors.surface0 },
        content: { padding: compact ? 16 : 24, gap: 16 },
        panelContent: {
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
          padding: compact ? 16 : 24,
          gap: 16,
        },
        center: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.surface0,
        },
        header: { flex: 1, gap: 3 },
        title: {
          color: theme.colors.foreground,
          fontSize: 17,
          fontWeight: "600",
          letterSpacing: -0.2,
        },
        muted: {
          color: theme.colors.foregroundMuted,
          fontSize: 13,
          lineHeight: 19,
        },
        notice: { color: theme.colors.foregroundMuted, fontSize: 13 },
        errorText: {
          color: theme.colors.statusDanger,
          fontSize: 13,
        },
        noteSurface: {
          minHeight: compact ? 320 : 400,
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.05,
          ),
        },
        noteLoading: {
          flex: 1,
          minHeight: compact ? 320 : 400,
          alignItems: "center",
          justifyContent: "center",
        },
        noteEditor: {
          flex: 1,
          minHeight: compact ? 320 : 400,
          padding: compact ? 14 : 18,
          color: theme.colors.foreground,
          fontSize: 14,
          lineHeight: 22,
          textAlignVertical: "top",
        },
        panelFooter: {
          flexDirection: compact ? "column" : "row",
          alignItems: compact ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 12,
        },
        saveState: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          fontVariant: ["tabular-nums"],
        },
        footerActions: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: compact ? "flex-end" : "flex-start",
          gap: 8,
        },
        button: {
          minHeight: 36,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 13,
          borderRadius: 9,
        },
        buttonText: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontWeight: "600",
        },
        primaryButton: {
          backgroundColor: theme.colors.accent,
        },
        primaryButtonText: { color: theme.colors.accentForeground },
        secondaryButton: {
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.09,
          ),
        },
        ghostButton: { backgroundColor: "transparent" },
        ghostButtonText: { color: theme.colors.foregroundMuted },
        buttonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
        buttonDisabled: { opacity: 0.45 },
        segments: {
          alignSelf: "flex-start",
          flexDirection: "row",
          padding: 3,
          borderRadius: 10,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.055,
          ),
        },
        segment: {
          minWidth: 82,
          minHeight: 32,
          borderRadius: 7,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 12,
        },
        activeSegment: {
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.105,
          ),
        },
        segmentPressed: { opacity: 0.72 },
        segmentTextActive: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontWeight: "600",
        },
        preview: {
          minHeight: compact ? 320 : 400,
          gap: 5,
          padding: compact ? 14 : 18,
        },
        taskRow: {
          minHeight: 40,
          flexDirection: "row",
          alignItems: "center",
        },
        taskToggle: {
          width: 40,
          minHeight: 40,
          alignItems: "center",
          justifyContent: "center",
        },
        taskTogglePressed: { opacity: 0.7 },
        taskToggleDisabled: { opacity: 0.5 },
        taskBox: {
          width: 18,
          height: 18,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
          borderRadius: 5,
        },
        taskBoxChecked: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accent,
        },
        taskCheckmark: {
          color: theme.colors.accentForeground,
          fontSize: 12,
          lineHeight: 14,
          fontWeight: "700",
        },
        taskTextChecked: {
          color: theme.colors.foregroundMuted,
          textDecorationLine: "line-through",
        },
        panelError: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: 14,
          borderRadius: 12,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.statusDanger,
            0.08,
          ),
        },
        panelErrorCopy: { flex: 1, gap: 3 },
        panelErrorTitle: {
          color: theme.colors.statusDanger,
          fontSize: 13,
          fontWeight: "600",
        },
        heading1: {
          color: theme.colors.foreground,
          fontSize: 23,
          fontWeight: "700",
          marginTop: 8,
        },
        heading2: {
          color: theme.colors.foreground,
          fontSize: 19,
          fontWeight: "700",
          marginTop: 7,
        },
        heading3: {
          color: theme.colors.foreground,
          fontSize: 16,
          fontWeight: "600",
          marginTop: 6,
        },
        body: { color: theme.colors.foreground, fontSize: 14, lineHeight: 21 },
        strong: { fontWeight: "700" },
        inlineCode: {
          color: theme.colors.accent,
          fontFamily: "monospace",
        },
        link: {
          color: theme.colors.accent,
          textDecorationLine: "underline",
        },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: theme.colors.accent,
          paddingLeft: 10,
          paddingVertical: 2,
        },
        codeBlock: {
          padding: 11,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
        },
        codeText: {
          color: theme.colors.foreground,
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 18,
        },
        empty: {
          minHeight: compact ? 292 : 364,
          alignItems: "center",
          justifyContent: "center",
        },
        board: { gap: 12, paddingBottom: 12 },
        boardToolbar: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        },
        boardToolbarActions: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        boardHeaderTitle: {
          color: theme.colors.foreground,
          fontSize: 15,
          fontWeight: "500",
        },
        boardToolbarButton: {
          minHeight: 36,
          justifyContent: "center",
          paddingHorizontal: 10,
          borderRadius: 9,
        },
        boardToolbarButtonText: {
          color: theme.colors.foregroundMuted,
          fontSize: 13,
          fontWeight: "400",
        },
        boardControlPressed: { opacity: 0.7 },
        archiveDropZone: {
          width: 140,
          minHeight: 36,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 12,
          borderRadius: 9,
        },
        archiveDropZoneArmed: {
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.statusDanger,
            0.08,
          ),
        },
        archiveDropZoneActive: {
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.statusDanger,
            0.16,
          ),
        },
        archiveDropZoneText: {
          color: theme.colors.foregroundMuted,
          fontSize: 13,
          fontWeight: "400",
        },
        archiveDropZoneTextArmed: {
          color: theme.colors.statusDanger,
          fontWeight: "500",
        },
        column: {
          width: compact ? 272 : 292,
          minHeight: 420,
          padding: 12,
          borderRadius: 14,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.055,
          ),
        },
        columnDropActive: {
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.accent,
            0.12,
          ),
        },
        columnHeader: {
          minHeight: 32,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingHorizontal: 2,
          paddingBottom: 10,
        },
        columnLabel: {
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
        },
        columnTitle: {
          color: theme.colors.foreground,
          fontSize: 14,
          fontWeight: "500",
        },
        stateDot: {
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: theme.colors.foregroundMuted,
        },
        runningDot: { backgroundColor: theme.colors.accent },
        errorDot: { backgroundColor: theme.colors.statusDanger },
        countPill: {
          minWidth: 24,
          minHeight: 24,
          paddingHorizontal: 7,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.1,
          ),
        },
        countText: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          fontWeight: "500",
          fontVariant: ["tabular-nums"],
        },
        columnCards: { gap: 8 },
        columnEmpty: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          paddingHorizontal: 2,
          paddingVertical: 8,
        },
        boardCard: {
          overflow: "hidden",
          borderRadius: 12,
          backgroundColor: theme.colors.surface0,
          shadowColor: theme.colors.foreground,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 2,
          elevation: 1,
        },
        boardCardBody: { gap: 5, padding: 13 },
        boardCardPressed: { opacity: 0.72 },
        boardCardTitle: {
          color: theme.colors.foreground,
          fontSize: 14,
          lineHeight: 19,
          fontWeight: "500",
        },
        boardCardSubtitle: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 17,
        },
        boardCardMeta: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          fontVariant: ["tabular-nums"],
        },
        moveRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          minHeight: 36,
          paddingHorizontal: 13,
          paddingBottom: 9,
        },
        moveLabel: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
        },
        moveAction: {
          minHeight: 28,
          justifyContent: "center",
          paddingHorizontal: 2,
        },
        moveActionText: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          fontWeight: "500",
        },
        moveActionTextDestructive: {
          color: theme.colors.statusDanger,
        },
        webDragCardActive: { opacity: 0.78 },
        webDropMarker: {
          position: "absolute",
          zIndex: 1,
          left: 4,
          right: 4,
          height: 2,
          borderRadius: 1,
          backgroundColor: theme.colors.accent,
        },
      }),
    [theme, compact],
  );
}

function blendHex(base: string, overlay: string, amount: number): string {
  const left = parseHex(base);
  const right = parseHex(overlay);
  if (!left || !right) return base;
  const channel = (index: number) =>
    Math.round(left[index]! * (1 - amount) + right[index]! * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(value: string): readonly [number, number, number] | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(value);
  return match
    ? [
        Number.parseInt(match[1]!, 16),
        Number.parseInt(match[2]!, 16),
        Number.parseInt(match[3]!, 16),
      ]
    : null;
}
