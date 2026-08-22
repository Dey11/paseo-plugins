import type {
  PluginAgentPanelProps,
  PluginSurfaceProps,
  PluginTheme,
} from "@getpaseo/plugin";
import { useAgent, usePaseo, useRpc } from "@getpaseo/plugin";
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
  GenerateReviewPlanRpc,
  GetBoardWorkflowRpc,
  GetNoteRpc,
  GetReviewPlanRpc,
  PlaceBoardCardRpc,
  type ReviewDocument,
  type ReviewPlan,
  type ReviewState,
  SaveNoteRpc,
} from "./contracts";
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
import { buildWorkspaceDeepLink, buildWorkspaceRoute } from "./workspace-route";

const REVIEW_STATES: readonly ReviewState[] = [
  "unreviewed",
  "recheck",
  "approved",
];
const BOARD_QUERY_KEY = ["agent-board"] as const;

export function NotesPanel({
  workspaceId,
  agentId,
  theme,
  layout,
}: PluginAgentPanelProps) {
  const getNote = useRpc(GetNoteRpc);
  const saveNote = useRpc(SaveNoteRpc);
  const paseo = usePaseo();
  const agentTitle = useAgent(agentId, (agent) => agent.title) ?? "this agent";
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
  useEffect(() => {
    if (!note.data) return;
    setMarkdown(note.data.markdown);
    setSavedMarkdown(note.data.markdown);
    setUpdatedAt(note.data.updatedAt);
  }, [note.data]);
  const dirty = markdown !== savedMarkdown;

  async function save() {
    setBusy("save");
    setNotice("");
    setNoticeIsError(false);
    try {
      const saved = await saveNote({ workspaceId, markdown });
      setSavedMarkdown(saved.markdown);
      setUpdatedAt(saved.updatedAt);
    } catch (error) {
      setNotice(message(error));
      setNoticeIsError(true);
    } finally {
      setBusy(null);
    }
  }

  async function askAgent() {
    setBusy("refine");
    setNotice("");
    setNoticeIsError(false);
    try {
      const result = await paseo.agents
        .ref(agentId)
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
        subtitle={`Workspace context for ${agentTitle}`}
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
            <MarkdownPreview markdown={markdown} styles={styles} />
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
            label={busy === "refine" ? "Refining..." : "Refine with agent"}
            onPress={askAgent}
            variant="ghost"
            disabled={busy !== null || note.isError}
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

export function ReviewPanel({
  workspaceId,
  agentId,
  theme,
  layout,
}: PluginAgentPanelProps) {
  const getPlan = useRpc(GetReviewPlanRpc);
  const generatePlan = useRpc(GenerateReviewPlanRpc);
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const styles = useStyles(theme, layout.compact);
  const review = useQuery<ReviewDocument>({
    queryKey: ["review-plan", workspaceId],
    queryFn: () => getPlan({ workspaceId }),
    refetchInterval: (query) =>
      query.state.data?.status === "generating" ? 2_000 : false,
  });
  const document = review.data;
  const plan = document?.plan ?? null;
  const generating = starting || document?.status === "generating";

  async function generate() {
    setStarting(true);
    setGenerationError("");
    try {
      const next = await generatePlan({ workspaceId, agentId });
      queryClient.setQueryData(["review-plan", workspaceId], next);
      void review.refetch();
    } catch (error) {
      setGenerationError(message(error));
    } finally {
      setStarting(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.panelContent}
    >
      <View style={styles.panelHeaderRow}>
        <Header
          title="QA review"
          subtitle="Manual checks inferred from the work and its conversation"
          styles={styles}
        />
        {plan ? (
          <Button
            label="Regenerate"
            onPress={generate}
            variant="primary"
            disabled={generating}
            styles={styles}
          />
        ) : null}
      </View>
      {generating ? <GeneratingReview styles={styles} /> : null}
      {generationError ? (
        <PanelError
          title="Couldn’t prepare the QA plan"
          message={generationError}
          onRetry={generate}
          styles={styles}
        />
      ) : review.isError ? (
        <PanelError
          title="Couldn’t prepare the QA plan"
          message={message(review.error)}
          onRetry={generate}
          styles={styles}
        />
      ) : document?.status === "error" && !generating ? (
        <PanelError
          title="Couldn’t prepare the QA plan"
          message={document.error ?? "Unable to generate a QA plan."}
          onRetry={generate}
          styles={styles}
        />
      ) : null}
      {plan ? (
        <QaPlan plan={plan} styles={styles} />
      ) : generating ? null : (
        <View style={styles.reviewEmpty}>
          <Text style={styles.reviewEmptyTitle}>No QA plan yet</Text>
          <Text style={styles.reviewEmptyBody}>
            Generate one after the agent has made changes worth testing.
          </Text>
          <Button
            label="Generate QA plan"
            onPress={generate}
            variant="primary"
            disabled={generating}
            styles={styles}
          />
        </View>
      )}
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
  const [draggedCard, setDraggedCard] = useState<DraggedBoardCard | null>(null);
  const [dropTarget, setDropTarget] = useState<BoardDropTarget | null>(null);
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
    refetchInterval: moving || draggedCard ? false : 5_000,
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
    }
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
        <BoardToolbarButton
          label="Refresh"
          onPress={() => void board.refetch()}
          styles={styles}
        />
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
            moving={moving}
            draggedCard={draggedCard}
            onDragStart={setDraggedCard}
            onDragEnd={() => {
              setDraggedCard(null);
              setDropTarget(null);
            }}
            onDragOver={setDropTarget}
            onDrop={drop}
            dropTarget={dropTarget}
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
  styles,
}: {
  card: BoardCard;
  reviewState: ReviewState | null;
  moving: boolean;
  openWorkspace: (id: string) => void;
  onPlace: (placement: BoardPlacement) => void;
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
      {reviewState ? (
        <View style={styles.moveRow}>
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
        </View>
      ) : null}
    </View>
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
  styles,
}: {
  markdown: string;
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
          {renderInline(line.slice(4), styles)}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(
        <Text key={index} style={styles.heading2}>
          {renderInline(line.slice(3), styles)}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(
        <Text key={index} style={styles.heading1}>
          {renderInline(line.slice(2), styles)}
        </Text>,
      );
      continue;
    }
    const checkbox = line.match(/^[-*] \[([ xX])\] (.*)$/);
    if (checkbox) {
      blocks.push(
        <Text key={index} style={styles.body}>
          {checkbox[1]?.toLowerCase() === "x" ? "☑" : "☐"}{" "}
          {renderInline(checkbox[2] ?? "", styles)}
        </Text>,
      );
      continue;
    }
    const bullet = line.match(/^[-*] (.*)$/);
    if (bullet) {
      blocks.push(
        <Text key={index} style={styles.body}>
          • {renderInline(bullet[1] ?? "", styles)}
        </Text>,
      );
      continue;
    }
    const numbered = line.match(/^(\d+)\. (.*)$/);
    if (numbered) {
      blocks.push(
        <Text key={index} style={styles.body}>
          {numbered[1]}. {renderInline(numbered[2] ?? "", styles)}
        </Text>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(
        <View key={index} style={styles.blockquote}>
          <Text style={styles.body}>{renderInline(line.slice(2), styles)}</Text>
        </View>,
      );
      continue;
    }
    blocks.push(
      <Text key={index} style={styles.body}>
        {line ? renderInline(line, styles) : " "}
      </Text>,
    );
  }
  return <View style={styles.preview}>{blocks}</View>;
}

function renderInline(value: string, styles: Styles): React.ReactNode[] {
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
          onPress={() => Linking.openURL(link[2] ?? "")}
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

function GeneratingReview({ styles }: { styles: Styles }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.reviewProgress}>
      <ActivityIndicator size="small" color={styles.loadingIndicator.color} />
      <View style={styles.reviewProgressCopy}>
        <Text style={styles.reviewProgressTitle}>Preparing your QA plan</Text>
        <Text style={styles.muted}>
          Reading the agent transcript and current changes. This can take a few
          minutes.
        </Text>
      </View>
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
    <View style={styles.reviewError}>
      <View style={styles.reviewErrorCopy}>
        <Text style={styles.reviewErrorTitle}>{title}</Text>
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

function QaPlan({ plan, styles }: { plan: ReviewPlan; styles: Styles }) {
  const metrics = [
    `${plan.transcriptMessageCount} transcript ${plan.transcriptMessageCount === 1 ? "message" : "messages"}`,
    `${plan.files.length} changed ${plan.files.length === 1 ? "file" : "files"}`,
    `+${plan.additions} −${plan.deletions}`,
  ];
  return (
    <View style={styles.qaPlan}>
      <View style={styles.reviewIntro}>
        <Text style={styles.reviewSummary}>{plan.summary}</Text>
        <View style={styles.reviewMetaRow}>
          {metrics.map((metric) => (
            <Text key={metric} style={styles.reviewMeta}>
              {metric}
            </Text>
          ))}
          <Text style={styles.reviewMeta}>
            {generatedLabel(plan.generatedAt)}
          </Text>
        </View>
      </View>

      <ReviewSection title="What changed" styles={styles}>
        <View style={styles.reviewGroup}>
          {plan.changes.map((change, index) => (
            <View
              key={`${index}-${change}`}
              style={[styles.changeRow, index > 0 && styles.reviewGroupDivider]}
            >
              <View style={styles.bullet} />
              <Text style={styles.changeText}>{change}</Text>
            </View>
          ))}
        </View>
      </ReviewSection>

      <ReviewSection title="Test these flows" styles={styles}>
        <View style={styles.reviewGroup}>
          {plan.flows.map((flow, index) => (
            <View
              key={flow.id}
              style={[styles.flowRow, index > 0 && styles.reviewGroupDivider]}
            >
              <View style={styles.flowHeader}>
                <View style={styles.flowTitleGroup}>
                  <Text style={styles.flowSurface}>{flow.surface}</Text>
                  <Text style={styles.flowTitle}>{flow.title}</Text>
                </View>
                {flow.priority === "high" ? (
                  <Text style={styles.highPriority}>High priority</Text>
                ) : null}
              </View>
              <Text style={styles.flowWhy}>{flow.why}</Text>
              <View style={styles.flowSteps}>
                {flow.steps.map((step, stepIndex) => (
                  <View key={`${flow.id}-${stepIndex}`} style={styles.stepRow}>
                    <Text style={styles.stepNumber}>{stepIndex + 1}</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ReviewSection>

      {plan.watchFor.length > 0 ? (
        <ReviewSection title="Watch for" styles={styles}>
          <View style={styles.reviewGroup}>
            {plan.watchFor.map((item, index) => (
              <View
                key={`${index}-${item}`}
                style={[
                  styles.changeRow,
                  index > 0 && styles.reviewGroupDivider,
                ]}
              >
                <View style={styles.watchDot} />
                <Text style={styles.changeText}>{item}</Text>
              </View>
            ))}
          </View>
        </ReviewSection>
      ) : null}
    </View>
  );
}

function ReviewSection({
  title,
  styles,
  children,
}: React.PropsWithChildren<{ title: string; styles: Styles }>) {
  return (
    <View style={styles.reviewSection}>
      <Text style={styles.reviewSectionTitle}>{title}</Text>
      {children}
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
  styles,
}: {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
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
      <Text style={styles.moveActionText}>{label}</Text>
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

function generatedLabel(generatedAt: string): string {
  return `Generated ${new Date(generatedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
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
        panelHeaderRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
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
        reviewProgress: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          padding: 14,
          borderRadius: 12,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.accent,
            0.09,
          ),
        },
        loadingIndicator: { color: theme.colors.accent },
        reviewProgressCopy: { flex: 1, gap: 3 },
        reviewProgressTitle: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontWeight: "600",
        },
        reviewError: {
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
        reviewErrorCopy: { flex: 1, gap: 3 },
        reviewErrorTitle: {
          color: theme.colors.statusDanger,
          fontSize: 13,
          fontWeight: "600",
        },
        reviewEmpty: {
          minHeight: 300,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 24,
        },
        reviewEmptyTitle: {
          color: theme.colors.foreground,
          fontSize: 15,
          fontWeight: "600",
        },
        reviewEmptyBody: {
          maxWidth: 360,
          color: theme.colors.foregroundMuted,
          fontSize: 13,
          lineHeight: 19,
          textAlign: "center",
          marginBottom: 4,
        },
        qaPlan: { gap: 24 },
        reviewIntro: { gap: 9 },
        reviewSummary: {
          color: theme.colors.foreground,
          fontSize: 15,
          lineHeight: 22,
          fontWeight: "500",
        },
        reviewMetaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
        },
        reviewMeta: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          fontVariant: ["tabular-nums"],
        },
        reviewSection: { gap: 9 },
        reviewSectionTitle: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.45,
        },
        reviewGroup: {
          overflow: "hidden",
          borderRadius: 14,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.05,
          ),
        },
        reviewGroupDivider: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.12,
          ),
        },
        changeRow: {
          minHeight: 44,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
        },
        bullet: {
          width: 5,
          height: 5,
          marginTop: 7,
          borderRadius: 3,
          backgroundColor: theme.colors.accent,
        },
        watchDot: {
          width: 5,
          height: 5,
          marginTop: 7,
          borderRadius: 3,
          backgroundColor: theme.colors.foregroundMuted,
        },
        changeText: {
          flex: 1,
          color: theme.colors.foreground,
          fontSize: 13,
          lineHeight: 19,
        },
        flowRow: { gap: 10, padding: compact ? 14 : 16 },
        flowHeader: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        },
        flowTitleGroup: { flex: 1, gap: 3 },
        flowSurface: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.35,
        },
        flowTitle: {
          color: theme.colors.foreground,
          fontSize: 14,
          lineHeight: 19,
          fontWeight: "600",
        },
        highPriority: {
          color: theme.colors.statusDanger,
          fontSize: 11,
          fontWeight: "600",
        },
        flowWhy: {
          color: theme.colors.foregroundMuted,
          fontSize: 13,
          lineHeight: 19,
        },
        flowSteps: { gap: 7, paddingTop: 2 },
        stepRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 9,
        },
        stepNumber: {
          width: 17,
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 19,
          textAlign: "right",
          fontVariant: ["tabular-nums"],
        },
        stepText: {
          flex: 1,
          color: theme.colors.foreground,
          fontSize: 13,
          lineHeight: 19,
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
