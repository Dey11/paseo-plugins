import type { PluginAgentPanelProps, PluginSurfaceProps, PluginTheme, PluginWorkspacePanelProps } from "@getpaseo/plugin";
import { useAgent, usePaseo, useRpc, useWorkspace } from "@getpaseo/plugin";
import type { PaseoAgent, PaseoClient, PaseoWorkspace } from "@getpaseo/client";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  GenerateReviewPlanRpc,
  GetNoteRpc,
  GetReviewPlanRpc,
  GetReviewStatesRpc,
  type ReviewPlan,
  type ReviewState,
  SaveNoteRpc,
  SetReviewStateRpc,
} from "./contracts";

const REVIEW_STATES: readonly ReviewState[] = ["unreviewed", "reviewed", "recheck", "approved"];

export function NotesPanel({ workspaceId, theme, layout }: PluginWorkspacePanelProps) {
  const getNote = useRpc(GetNoteRpc);
  const saveNote = useRpc(SaveNoteRpc);
  const paseo = usePaseo() as unknown as PaseoClient;
  const [mode, setMode] = useState<"source" | "preview">("source");
  const [markdown, setMarkdown] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const styles = useStyles(theme, layout.compact);
  const note = useQuery({ queryKey: ["workspace-note", workspaceId], queryFn: () => getNote({ workspaceId }) });
  useEffect(() => { if (note.data) setMarkdown(note.data.markdown); }, [note.data]);

  async function save() {
    setBusy(true); setNotice("");
    try { await saveNote({ workspaceId, markdown }); setNotice("Saved to this Paseo daemon."); }
    catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }

  async function askAgent() {
    setBusy(true); setNotice("");
    try {
      const agents = await paseo.agents.list();
      const agent = agents.entries.map((entry) => entry.agent).filter((entry) => entry.workspaceId === workspaceId && entry.status !== "closed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (!agent) throw new Error("No active agent is available in this workspace.");
      const result = await paseo.agents.ref(agent).run(`Rewrite the workspace note below as concise Markdown. Preserve useful facts, decisions, TODOs, and review instructions. Return Markdown only; do not use a wrapping code fence.\n\n${markdown}`, { timeoutMs: 180_000 });
      if (!result.lastMessage) throw new Error(result.error ?? "The agent did not return a note draft.");
      setMarkdown(result.lastMessage); setMode("source"); setNotice("Agent draft loaded. Review it, then save when ready.");
    } catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Header title="Notes" subtitle="Private workspace context stored by this Paseo daemon." styles={styles} />
    <Segments values={["source", "preview"]} value={mode} onChange={(value) => setMode(value as "source" | "preview")} styles={styles} />
    {mode === "source" ? <TextInput accessibilityLabel="Workspace note" multiline value={markdown} onChangeText={setMarkdown} placeholder="Add context, decisions, and follow-ups…" placeholderTextColor={theme.colors.foregroundMuted} style={[styles.input, styles.noteInput]} /> : <MarkdownPreview markdown={markdown} styles={styles} />}
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    <View style={styles.actions}><Button label={busy ? "Working…" : "Save note"} onPress={save} primary disabled={busy} styles={styles} /><Button label="Ask agent for draft" onPress={askAgent} disabled={busy} styles={styles} /></View>
  </ScrollView>;
}

export function ReviewPanel({ workspaceId, agentId, theme, layout }: PluginAgentPanelProps) {
  const getPlan = useRpc(GetReviewPlanRpc);
  const generatePlan = useRpc(GenerateReviewPlanRpc);
  const paseo = usePaseo() as unknown as PaseoClient;
  const workspaceName = useWorkspace(workspaceId, (workspace) => workspace.title ?? workspace.name) ?? "workspace";
  const agentTitle = useAgent(agentId, (agent) => agent.title) ?? "current agent";
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const styles = useStyles(theme, layout.compact);
  const stored = useQuery({ queryKey: ["review-plan", workspaceId], queryFn: () => getPlan({ workspaceId }) });
  useEffect(() => { if (stored.data) setPlan(stored.data); }, [stored.data]);

  async function generate() {
    setBusy(true); setNotice("");
    try { setPlan(await generatePlan({ workspaceId })); }
    catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }

  async function startReviewer() {
    setBusy(true); setNotice("");
    try {
      const workspace = paseo.workspaces.ref(workspaceId);
      const reviewer = await workspace.agents.create({
        config: { provider: "codex/gpt-5.6-sol", modeId: "auto-review", thinkingOptionId: "high" },
        parent: agentId,
        title: `Review ${workspaceName}`,
        labels: { role: "independent-reviewer", sourceAgent: agentId },
        prompt: `Independently review the current Git diff in this workspace. Focus on correctness, regressions, security, data safety, missing verification, and maintainability. Do not edit files. Report only actionable findings with file and line references, then list remaining review risks. The originating agent is “${agentTitle}”.`,
      });
      setNotice(`Independent reviewer started (${reviewer.id.slice(0, 8)}).`);
    } catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Header title="Review" subtitle="Generate a deterministic checklist when a diff is worth checking." styles={styles} />
    <View style={styles.actions}><Button label={busy ? "Working…" : "Generate review plan"} onPress={generate} primary disabled={busy} styles={styles} /><Button label="Start independent review" onPress={startReviewer} disabled={busy} styles={styles} /></View>
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    {plan ? <View style={styles.stack}><Card styles={styles}><Text style={styles.cardTitle}>{plan.summary}</Text><Text style={styles.muted}>{new Date(plan.generatedAt).toLocaleString()}</Text></Card>{plan.checks.map((check) => <Card key={check.id} styles={styles}><View style={styles.row}><Text style={styles.cardTitle}>{check.title}</Text><Pill label={check.priority} styles={styles} /></View><Text style={styles.muted}>{check.detail}</Text></Card>)}</View> : <Empty text="No review plan yet." styles={styles} />}
  </ScrollView>;
}

export function AgentBoardSurface({ theme, layout }: PluginSurfaceProps) {
  const paseo = usePaseo() as unknown as PaseoClient;
  const getStates = useRpc(GetReviewStatesRpc);
  const setState = useRpc(SetReviewStateRpc);
  const styles = useStyles(theme, layout.compact);
  const [refreshKey, setRefreshKey] = useState(0);
  const [moving, setMoving] = useState<string | null>(null);
  const board = useQuery({
    queryKey: ["agent-board", refreshKey],
    queryFn: async () => {
      const [workspaces, agents, states] = await Promise.all([paseo.workspaces.list(), paseo.agents.list(), getStates({})]);
      return { workspaces: workspaces.entries, agents: agents.entries.map((entry) => entry.agent), states };
    },
    refetchInterval: 5_000,
  });

  async function move(workspaceId: string, state: ReviewState) {
    setMoving(workspaceId);
    try { await setState({ workspaceId, state }); await board.refetch(); }
    finally { setMoving(null); }
  }

  if (board.isLoading || !board.data) return <View style={styles.center}><ActivityIndicator color={theme.colors.accent} /></View>;
  const cards = board.data.workspaces.map((workspace) => {
    const agents = board.data.agents.filter((agent) => agent.workspaceId === workspace.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { workspace, agent: agents[0], reviewState: board.data.states[workspace.id] ?? "unreviewed" as ReviewState };
  });
  const active = cards.filter(({ workspace }) => workspace.status !== "done");

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} horizontal={false}>
    <View style={styles.row}><Header title="Agent board" subtitle="Live Paseo activity with a separate review workflow." styles={styles} /><Button label="Refresh" onPress={() => setRefreshKey((value) => value + 1)} styles={styles} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.board}>
      <BoardColumn title="Working" cards={active} styles={styles} />
      {REVIEW_STATES.map((state) => <BoardColumn key={state} title={titleCase(state)} cards={cards.filter(({ workspace, reviewState }) => workspace.status === "done" && reviewState === state)} reviewState={state} onMove={move} moving={moving} styles={styles} />)}
    </ScrollView>
  </ScrollView>;
}

type BoardCard = { workspace: PaseoWorkspace; agent?: PaseoAgent };
function BoardColumn({ title, cards, reviewState, onMove, moving, styles }: { title: string; cards: BoardCard[]; reviewState?: ReviewState; onMove?: (id: string, state: ReviewState) => void; moving?: string | null; styles: Styles }) {
  return <View style={styles.column}><View style={styles.row}><Text style={styles.columnTitle}>{title}</Text><Pill label={String(cards.length)} styles={styles} /></View>{cards.map(({ workspace, agent }) => <Card key={workspace.id} styles={styles}><Text style={styles.cardTitle}>{workspace.title ?? workspace.name}</Text><Text style={styles.muted}>{workspace.projectDisplayName} · {agent?.title ?? agent?.provider ?? "No agent"}</Text><Text style={styles.meta}>{workspace.status}{workspace.diffStat ? ` · +${workspace.diffStat.additions} −${workspace.diffStat.deletions}` : ""}</Text>{reviewState && onMove ? <View style={styles.moveRow}>{REVIEW_STATES.filter((state) => state !== reviewState).map((state) => <MiniButton key={state} label={titleCase(state)} disabled={moving === workspace.id} onPress={() => onMove(workspace.id, state)} styles={styles} />)}</View> : null}</Card>)}</View>;
}

function MarkdownPreview({ markdown, styles }: { markdown: string; styles: Styles }) {
  if (!markdown.trim()) return <Empty text="Nothing to preview yet." styles={styles} />;
  return <View style={styles.preview}>{markdown.split("\n").map((line, index) => {
    if (line.startsWith("### ")) return <Text key={index} style={styles.heading3}>{line.slice(4)}</Text>;
    if (line.startsWith("## ")) return <Text key={index} style={styles.heading2}>{line.slice(3)}</Text>;
    if (line.startsWith("# ")) return <Text key={index} style={styles.heading1}>{line.slice(2)}</Text>;
    if (/^[-*] /.test(line)) return <Text key={index} style={styles.body}>• {line.slice(2)}</Text>;
    if (/^- \[[ xX]\] /.test(line)) return <Text key={index} style={styles.body}>{line[3]?.toLowerCase() === "x" ? "☑" : "☐"} {line.slice(6)}</Text>;
    return <Text key={index} style={styles.body}>{line || " "}</Text>;
  })}</View>;
}

function Header({ title, subtitle, styles }: { title: string; subtitle: string; styles: Styles }) { return <View style={styles.header}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{subtitle}</Text></View>; }
function Card({ children, styles }: React.PropsWithChildren<{ styles: Styles }>) { return <View style={styles.card}>{children}</View>; }
function Pill({ label, styles }: { label: string; styles: Styles }) { return <View style={styles.pill}><Text style={styles.pillText}>{label}</Text></View>; }
function Empty({ text, styles }: { text: string; styles: Styles }) { return <View style={styles.empty}><Text style={styles.muted}>{text}</Text></View>; }
function Button({ label, onPress, primary, disabled, styles }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; styles: Styles }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, primary && styles.primaryButton, (pressed || disabled) && styles.pressed]}><Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text></Pressable>; }
function MiniButton({ label, onPress, disabled, styles }: { label: string; onPress: () => void; disabled?: boolean; styles: Styles }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.miniButton, (pressed || disabled) && styles.pressed]}><Text style={styles.miniButtonText}>{label}</Text></Pressable>; }
function Segments({ values, value, onChange, styles }: { values: string[]; value: string; onChange: (value: string) => void; styles: Styles }) { return <View style={styles.segments}>{values.map((item) => <Pressable key={item} onPress={() => onChange(item)} style={[styles.segment, value === item && styles.activeSegment]}><Text style={value === item ? styles.segmentTextActive : styles.muted}>{titleCase(item)}</Text></Pressable>)}</View>; }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function message(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }

type Styles = ReturnType<typeof useStyles>;
function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    content: { padding: compact ? 16 : 24, gap: 16 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface0 },
    header: { flex: 1, gap: 4 },
    title: { color: theme.colors.foreground, fontSize: 24, fontWeight: "700", letterSpacing: -0.4 },
    muted: { color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 19 },
    notice: { color: theme.colors.foregroundMuted, fontSize: 13 },
    input: { color: theme.colors.foreground, backgroundColor: theme.colors.surface0, borderColor: theme.colors.foregroundMuted, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, minHeight: 44 },
    noteInput: { minHeight: 280, textAlignVertical: "top" },
    actions: { flexDirection: compact ? "column" : "row", gap: 8 },
    button: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted },
    buttonText: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" },
    primaryButton: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    primaryButtonText: { color: theme.colors.accentForeground },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    stack: { gap: 10 },
    card: { backgroundColor: theme.colors.surface0, borderColor: theme.colors.foregroundMuted, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 13, gap: 7 },
    cardTitle: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" },
    meta: { color: theme.colors.foregroundMuted, fontSize: 12 },
    pill: { minHeight: 24, minWidth: 24, paddingHorizontal: 8, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accent },
    pillText: { color: theme.colors.accentForeground, fontSize: 11, fontWeight: "700" },
    segments: { flexDirection: "row", padding: 3, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted },
    segment: { flex: 1, minHeight: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    activeSegment: { backgroundColor: theme.colors.accent },
    segmentTextActive: { color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" },
    preview: { minHeight: 280, gap: 5, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted },
    heading1: { color: theme.colors.foreground, fontSize: 23, fontWeight: "700", marginTop: 8 },
    heading2: { color: theme.colors.foreground, fontSize: 19, fontWeight: "700", marginTop: 7 },
    heading3: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600", marginTop: 6 },
    body: { color: theme.colors.foreground, fontSize: 14, lineHeight: 21 },
    empty: { minHeight: 160, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted },
    board: { gap: 12, paddingBottom: 12 },
    column: { width: compact ? 280 : 310, minHeight: 360, gap: 8, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted },
    columnTitle: { color: theme.colors.foreground, fontSize: 14, fontWeight: "700" },
    moveRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
    miniButton: { minHeight: 34, justifyContent: "center", paddingHorizontal: 9, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted },
    miniButtonText: { color: theme.colors.foreground, fontSize: 11, fontWeight: "600" },
  }), [theme, compact]);
}
