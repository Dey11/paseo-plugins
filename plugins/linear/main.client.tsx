import type { PluginAgentPanelProps, PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  GetLinearIssueRpc,
  LinearStatusRpc,
  MutateLinearIssueRpc,
  SearchLinearIssuesRpc,
  type LinearIssue,
  type LinearMutation,
} from "./contracts";
import { describeMutation } from "./mutations";

const PRIORITIES = ["No priority", "Urgent", "High", "Normal", "Low"] as const;

export function LinearPanel({ theme, layout }: PluginAgentPanelProps) {
  const statusRpc = useRpc(LinearStatusRpc);
  const searchRpc = useRpc(SearchLinearIssuesRpc);
  const getIssue = useRpc(GetLinearIssueRpc);
  const mutateIssue = useRpc(MutateLinearIssueRpc);
  const styles = useStyles(theme, layout.compact);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [issue, setIssue] = useState<LinearIssue | null>(null);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState<LinearMutation | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ["linear-status"],
    queryFn: () => statusRpc({}),
  });
  const issues = useInfiniteQuery({
    queryKey: ["linear-issues", debouncedQuery],
    queryFn: ({ pageParam }) =>
      searchRpc({ query: debouncedQuery, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: status.data?.configured === true,
  });
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 220);
    return () => clearTimeout(timer);
  }, [query]);
  const issueItems = issues.data?.pages.flatMap((page) => page.items) ?? [];

  async function select(id: string) {
    setBusy(true);
    setNotice("");
    try {
      setIssue(await getIssue({ id }));
      setPending(null);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setNotice("");
    try {
      const updated = await mutateIssue(pending);
      setIssue(updated);
      setPending(null);
      setComment("");
      await issues.refetch();
      setNotice("Linear updated successfully.");
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(false);
    }
  }
  function queue(mutation: LinearMutation) {
    setPending(mutation);
    setNotice("");
  }

  if (status.data && !status.data.configured)
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.title}>Linear</Text>
          <Text style={styles.muted}>
            Add LINEAR_API_KEY to the daemon environment or the hosting
            credential file to connect this panel.
          </Text>
        </View>
      </View>
    );
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <Text style={styles.title}>Linear</Text>
        <Text style={styles.muted}>
          Browse issues here. Every comment or field change asks for
          confirmation.
        </Text>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search issues…"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={styles.input}
      />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {!issue ? (
        <View style={styles.stack}>
          {issueItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => select(item.id)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.row}>
                <Text style={styles.identifier}>{item.identifier}</Text>
                <Text style={styles.meta}>{item.state}</Text>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.muted}>
                {item.priorityLabel} · Updated{" "}
                {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
            </Pressable>
          ))}
          {issues.hasNextPage ? (
            <Button
              label={issues.isFetchingNextPage ? "Loading…" : "Load more"}
              onPress={async () => {
                await issues.fetchNextPage();
              }}
              disabled={issues.isFetchingNextPage}
              styles={styles}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.stack}>
          <View style={styles.row}>
            <Button
              label="Back"
              onPress={() => {
                setIssue(null);
                setPending(null);
              }}
              styles={styles}
            />
            <Button
              label="Open in Linear"
              onPress={() => Linking.openURL(issue.url)}
              styles={styles}
            />
          </View>
          <View style={styles.card}>
            <Text style={styles.identifier}>{issue.identifier}</Text>
            <Text style={styles.issueTitle}>{issue.title}</Text>
            <Text style={styles.muted}>
              {issue.teamName} · {issue.assignee ?? "Unassigned"}
            </Text>
            {issue.description ? (
              <Text style={styles.body}>{issue.description}</Text>
            ) : null}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.choices}>
              {issue.states.map((state) => (
                <Choice
                  key={state.id}
                  label={state.name}
                  active={state.name === issue.state}
                  onPress={() =>
                    queue({
                      type: "state",
                      issueId: issue.id,
                      stateId: state.id,
                    })
                  }
                  styles={styles}
                />
              ))}
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Priority</Text>
            <View style={styles.choices}>
              {PRIORITIES.map((label, priority) => (
                <Choice
                  key={label}
                  label={label}
                  active={priority === issue.priority}
                  onPress={() =>
                    queue({ type: "priority", issueId: issue.id, priority })
                  }
                  styles={styles}
                />
              ))}
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Comment</Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              multiline
              placeholder="Write a comment…"
              placeholderTextColor={theme.colors.foregroundMuted}
              style={[styles.input, styles.comment]}
            />
            <Button
              label="Review comment"
              onPress={() =>
                queue({ type: "comment", issueId: issue.id, body: comment })
              }
              disabled={!comment.trim()}
              styles={styles}
            />
          </View>
          {pending ? (
            <View style={styles.confirm}>
              <Text style={styles.sectionTitle}>Confirm Linear change</Text>
              <Text style={styles.body}>
                {describeMutation(issue, pending)}
              </Text>
              <View style={styles.row}>
                <Button
                  label="Cancel"
                  onPress={() => setPending(null)}
                  styles={styles}
                />
                <Button
                  label={busy ? "Updating…" : "Confirm update"}
                  onPress={confirm}
                  disabled={busy}
                  primary
                  styles={styles}
                />
              </View>
            </View>
          ) : null}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent comments</Text>
            {issue.comments.length ? (
              issue.comments.map((item) => (
                <View key={item.id} style={styles.commentItem}>
                  <Text style={styles.cardTitle}>{item.user}</Text>
                  <Text style={styles.body}>{item.body}</Text>
                  <Text style={styles.meta}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No comments yet.</Text>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Button({
  label,
  onPress,
  disabled,
  primary,
  styles,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  primary?: boolean;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryText]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Choice({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        active && styles.choiceActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={active ? styles.choiceTextActive : styles.buttonText}>
        {label}
      </Text>
    </Pressable>
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "Linear request failed.";
}
type Styles = ReturnType<typeof useStyles>;
function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: theme.colors.surface0 },
        content: { padding: compact ? 16 : 20, gap: 14 },
        title: {
          color: theme.colors.foreground,
          fontSize: 24,
          fontWeight: "700",
          letterSpacing: -0.4,
        },
        issueTitle: {
          color: theme.colors.foreground,
          fontSize: 19,
          fontWeight: "700",
          lineHeight: 25,
        },
        sectionTitle: {
          color: theme.colors.foreground,
          fontSize: 15,
          fontWeight: "700",
        },
        identifier: {
          color: theme.colors.accent,
          fontSize: 12,
          fontWeight: "700",
        },
        cardTitle: {
          color: theme.colors.foreground,
          fontSize: 14,
          fontWeight: "600",
        },
        body: { color: theme.colors.foreground, fontSize: 13, lineHeight: 20 },
        muted: {
          color: theme.colors.foregroundMuted,
          fontSize: 13,
          lineHeight: 19,
        },
        meta: { color: theme.colors.foregroundMuted, fontSize: 11 },
        notice: { color: theme.colors.foregroundMuted, fontSize: 13 },
        input: {
          minHeight: 44,
          color: theme.colors.foreground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
          borderRadius: 11,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        comment: { minHeight: 100, textAlignVertical: "top" },
        stack: { gap: 9 },
        card: {
          gap: 8,
          padding: 13,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
        },
        row: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 9,
        },
        choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
        choice: {
          minHeight: 40,
          justifyContent: "center",
          paddingHorizontal: 11,
          borderRadius: 9,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
        },
        choiceActive: {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.accent,
        },
        choiceTextActive: {
          color: theme.colors.accentForeground,
          fontSize: 13,
          fontWeight: "600",
        },
        button: {
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 13,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
        },
        buttonText: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontWeight: "600",
        },
        primary: {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.accent,
        },
        primaryText: { color: theme.colors.accentForeground },
        pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
        confirm: {
          gap: 10,
          padding: 14,
          borderRadius: 13,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        },
        commentItem: {
          gap: 4,
          paddingTop: 8,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
        },
      }),
    [theme, compact],
  );
}
