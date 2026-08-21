import type { PluginSurfaceProps, PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DeletePromptRpc, ListPromptsRpc, SavePromptRpc, type SavedPrompt } from "./contracts";

export function PromptLibrarySurface({ theme, layout }: PluginSurfaceProps) {
  const listPrompts = useRpc(ListPromptsRpc);
  const savePrompt = useRpc(SavePromptRpc);
  const deletePrompt = useRpc(DeletePromptRpc);
  const styles = useStyles(theme, layout.compact);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | undefined>();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const prompts = useQuery({ queryKey: ["prompt-library", query], queryFn: () => listPrompts({ query }) });
  useEffect(() => { const timer = setTimeout(() => prompts.refetch(), 180); return () => clearTimeout(timer); }, [query]);

  function edit(prompt: SavedPrompt) { setEditingId(prompt.id); setTitle(prompt.title); setContent(prompt.content); setTags(prompt.tags.join(", ")); setNotice(""); }
  function clear() { setEditingId(undefined); setTitle(""); setContent(""); setTags(""); setConfirmDelete(null); }
  async function save() {
    setBusy(true); setNotice("");
    try { await savePrompt({ id: editingId, title, content, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) }); clear(); await prompts.refetch(); setNotice("Prompt saved. It is now available in the composer attachment picker."); }
    catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    setBusy(true);
    try { await deletePrompt({ id }); clear(); await prompts.refetch(); setNotice("Prompt deleted."); }
    catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View style={styles.grow}><Text style={styles.title}>Prompt library</Text><Text style={styles.muted}>Save once, then attach a prompt from any workspace composer.</Text></View><Button label="New prompt" onPress={clear} styles={styles} /></View>
    <View style={[styles.layout, layout.compact && styles.layoutCompact]}>
      <View style={styles.listPane}><TextInput value={query} onChangeText={setQuery} placeholder="Search prompts…" placeholderTextColor={theme.colors.foregroundMuted} style={styles.input} />
        <View style={styles.stack}>{prompts.data?.map((prompt) => <Pressable key={prompt.id} onPress={() => edit(prompt)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}><Text style={styles.cardTitle}>{prompt.title}</Text><Text numberOfLines={2} style={styles.muted}>{prompt.content}</Text>{prompt.tags.length ? <Text style={styles.meta}>{prompt.tags.join(" · ")}</Text> : null}</Pressable>)}{prompts.data?.length === 0 ? <Text style={styles.empty}>No saved prompts match this search.</Text> : null}</View>
      </View>
      <View style={styles.editor}><Text style={styles.sectionTitle}>{editingId ? "Edit prompt" : "New prompt"}</Text><TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={theme.colors.foregroundMuted} style={styles.input} /><TextInput value={content} onChangeText={setContent} multiline placeholder="Prompt text…" placeholderTextColor={theme.colors.foregroundMuted} style={[styles.input, styles.contentInput]} /><TextInput value={tags} onChangeText={setTags} placeholder="Tags, separated by commas" placeholderTextColor={theme.colors.foregroundMuted} style={styles.input} />{notice ? <Text style={styles.notice}>{notice}</Text> : null}<View style={styles.actions}><Button label={busy ? "Saving…" : "Save prompt"} onPress={save} disabled={busy || !title.trim() || !content.trim()} primary styles={styles} />{editingId ? <Button label={confirmDelete === editingId ? "Confirm delete" : "Delete"} onPress={() => remove(editingId)} disabled={busy} danger={confirmDelete === editingId} styles={styles} /> : null}</View></View>
    </View>
  </ScrollView>;
}

function Button({ label, onPress, disabled, primary, danger, styles }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; styles: Styles }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, primary && styles.primary, danger && styles.dangerBorder, (pressed || disabled) && styles.pressed]}><Text style={[styles.buttonText, primary && styles.primaryText, danger && styles.dangerText]}>{label}</Text></Pressable>; }
function message(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }
type Styles = ReturnType<typeof useStyles>;
function useStyles(theme: PluginTheme, compact: boolean) { return useMemo(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.surface0 }, content: { padding: compact ? 16 : 24, gap: 20 }, header: { flexDirection: "row", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }, grow: { flex: 1, gap: 4 }, title: { color: theme.colors.foreground, fontSize: 24, fontWeight: "700", letterSpacing: -0.4 }, muted: { color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 19 }, meta: { color: theme.colors.foregroundMuted, fontSize: 11 }, layout: { flexDirection: "row", alignItems: "flex-start", gap: 16 }, layoutCompact: { flexDirection: "column" }, listPane: { flex: 1, minWidth: 260, gap: 12 }, editor: { flex: 1, minWidth: 260, gap: 10, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted }, stack: { gap: 8 }, input: { minHeight: 44, color: theme.colors.foreground, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10 }, contentInput: { minHeight: 220, textAlignVertical: "top" }, card: { gap: 5, padding: 13, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted }, cardTitle: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }, sectionTitle: { color: theme.colors.foreground, fontSize: 16, fontWeight: "700" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.foregroundMuted }, buttonText: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }, primary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }, primaryText: { color: theme.colors.accentForeground }, dangerBorder: { borderColor: theme.colors.statusDanger }, dangerText: { color: theme.colors.statusDanger }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] }, notice: { color: theme.colors.foregroundMuted, fontSize: 13 }, empty: { color: theme.colors.foregroundMuted, textAlign: "center", padding: 32 },
}), [theme, compact]); }
