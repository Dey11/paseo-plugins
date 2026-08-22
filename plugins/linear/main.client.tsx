import type { PluginAgentPanelProps, PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  type LinearIssueSummary,
  type LinearMutation,
} from "./contracts";
import { describeMutation } from "./mutations";

const PRIORITIES = ["No priority", "Urgent", "High", "Normal", "Low"] as const;

type Notice = {
  tone: "success" | "danger";
  text: string;
};

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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
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
  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = setTimeout(() => setNotice(null), 3_500);
    return () => clearTimeout(timer);
  }, [notice]);

  const issueItems = issues.data?.pages.flatMap((page) => page.items) ?? [];

  async function select(id: string) {
    setSelectingId(id);
    setNotice(null);
    try {
      setIssue(await getIssue({ id }));
      setPending(null);
    } catch (error) {
      setNotice({ tone: "danger", text: message(error) });
    } finally {
      setSelectingId(null);
    }
  }

  async function confirm() {
    if (!pending) return;
    setUpdating(true);
    setNotice(null);
    try {
      const updated = await mutateIssue(pending);
      setIssue(updated);
      setPending(null);
      setComment("");
      await issues.refetch();
      setNotice({ tone: "success", text: "Linear updated" });
    } catch (error) {
      setNotice({ tone: "danger", text: message(error) });
    } finally {
      setUpdating(false);
    }
  }

  function queue(mutation: LinearMutation) {
    setPending(mutation);
    setNotice(null);
  }

  if (status.isLoading) {
    return <PanelLoading theme={theme} styles={styles} />;
  }
  if (status.isError) {
    return (
      <PanelMessage
        title="Linear"
        text={message(status.error)}
        danger
        styles={styles}
      />
    );
  }
  if (status.data && !status.data.configured) {
    return (
      <PanelMessage
        title="Linear"
        text="Add LINEAR_API_KEY to the daemon environment or hosting credential file"
        styles={styles}
      />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Linear</Text>
        <Text style={styles.muted}>
          {issue
            ? "Inspect fields and activity. Updates require confirmation"
            : "Find an issue to inspect or update"}
        </Text>
      </View>

      {notice ? <NoticeMessage notice={notice} styles={styles} /> : null}

      {issue ? (
        <IssueDetail
          issue={issue}
          comment={comment}
          pending={pending}
          updating={updating}
          onBack={() => {
            setIssue(null);
            setPending(null);
            setNotice(null);
          }}
          onCommentChange={setComment}
          onQueue={queue}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
          styles={styles}
        />
      ) : (
        <IssueSearch
          query={query}
          theme={theme}
          items={issueItems}
          loading={issues.isLoading}
          error={issues.isError ? message(issues.error) : null}
          selectingId={selectingId}
          hasNextPage={issues.hasNextPage}
          fetchingNextPage={issues.isFetchingNextPage}
          onQueryChange={setQuery}
          onSelect={select}
          onLoadMore={() => issues.fetchNextPage()}
          styles={styles}
        />
      )}
    </ScrollView>
  );
}

function IssueSearch({
  query,
  theme,
  items,
  loading,
  error,
  selectingId,
  hasNextPage,
  fetchingNextPage,
  onQueryChange,
  onSelect,
  onLoadMore,
  styles,
}: {
  query: string;
  theme: PluginTheme;
  items: LinearIssueSummary[];
  loading: boolean;
  error: string | null;
  selectingId: string | null;
  hasNextPage: boolean;
  fetchingNextPage: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => Promise<unknown>;
  styles: Styles;
}) {
  return (
    <View style={styles.stack}>
      <TextInput
        accessibilityLabel="Search Linear issues"
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search issues"
        placeholderTextColor={theme.colors.foregroundMuted}
        returnKeyType="search"
        style={styles.input}
      />

      {loading ? (
        <InlineLoading
          label="Loading issues..."
          theme={theme}
          styles={styles}
        />
      ) : error ? (
        <EmptyState text={error} danger styles={styles} />
      ) : items.length ? (
        <View style={styles.issueList}>
          {items.map((item, index) => (
            <IssueRow
              key={item.id}
              item={item}
              divider={index > 0}
              loading={selectingId === item.id}
              disabled={selectingId !== null}
              onPress={() => onSelect(item.id)}
              styles={styles}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          text={query.trim() ? "No matching issues" : "No Linear issues"}
          styles={styles}
        />
      )}

      {hasNextPage ? (
        <Button
          label={fetchingNextPage ? "Loading..." : "Load more"}
          onPress={onLoadMore}
          disabled={fetchingNextPage}
          variant="ghost"
          styles={styles}
        />
      ) : null}
    </View>
  );
}

function IssueRow({
  item,
  divider,
  loading,
  disabled,
  onPress,
  styles,
}: {
  item: LinearIssueSummary;
  divider: boolean;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.identifier}: ${item.title}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.issueRow,
        divider && styles.rowDivider,
        pressed && styles.issueRowPressed,
        disabled && !loading && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.identifier}>{item.identifier}</Text>
        <View style={styles.statePill}>
          <Text style={styles.statePillText}>{item.state}</Text>
        </View>
      </View>
      <Text numberOfLines={2} style={styles.cardTitle}>
        {item.title}
      </Text>
      <Text style={styles.meta}>
        {loading
          ? "Opening..."
          : `${item.priorityLabel} · Updated ${formatListDate(item.updatedAt)}`}
      </Text>
    </Pressable>
  );
}

function IssueDetail({
  issue,
  comment,
  pending,
  updating,
  onBack,
  onCommentChange,
  onQueue,
  onCancel,
  onConfirm,
  styles,
}: {
  issue: LinearIssue;
  comment: string;
  pending: LinearMutation | null;
  updating: boolean;
  onBack: () => void;
  onCommentChange: (value: string) => void;
  onQueue: (mutation: LinearMutation) => void;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  styles: Styles;
}) {
  return (
    <View style={styles.stackLarge}>
      <View style={styles.detailActions}>
        <Button label="Back" onPress={onBack} variant="ghost" styles={styles} />
        <Button
          label="Open in Linear ↗"
          onPress={() => Linking.openURL(issue.url)}
          variant="secondary"
          role="link"
          styles={styles}
        />
      </View>

      <View style={styles.issueHeader}>
        <Text style={styles.identifier}>{issue.identifier}</Text>
        <Text style={styles.issueTitle}>{issue.title}</Text>
        <Text style={styles.muted}>
          {issue.teamName} · {issue.assignee ?? "Unassigned"}
        </Text>
        {issue.description ? (
          <Text style={styles.description}>{issue.description}</Text>
        ) : null}
      </View>

      <View style={styles.fieldGroup}>
        <FieldSection label="Status" styles={styles}>
          {issue.states.map((state) => (
            <Choice
              key={state.id}
              label={state.name}
              active={state.name === issue.state}
              disabled={updating || state.name === issue.state}
              onPress={() =>
                onQueue({
                  type: "state",
                  issueId: issue.id,
                  stateId: state.id,
                })
              }
              styles={styles}
            />
          ))}
        </FieldSection>
        <FieldSection label="Priority" divider styles={styles}>
          {PRIORITIES.map((label, priority) => (
            <Choice
              key={label}
              label={label}
              active={priority === issue.priority}
              disabled={updating || priority === issue.priority}
              onPress={() =>
                onQueue({ type: "priority", issueId: issue.id, priority })
              }
              styles={styles}
            />
          ))}
        </FieldSection>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Comment</Text>
        <TextInput
          accessibilityLabel="Linear comment"
          value={comment}
          onChangeText={onCommentChange}
          multiline
          placeholder="Write a comment"
          placeholderTextColor={styles.placeholder.color}
          style={[styles.input, styles.commentInput]}
        />
        <Button
          label="Review comment"
          onPress={() =>
            onQueue({
              type: "comment",
              issueId: issue.id,
              body: comment.trim(),
            })
          }
          disabled={updating || !comment.trim()}
          variant="secondary"
          styles={styles}
        />
      </View>

      {pending ? (
        <View style={styles.confirmation}>
          <Text style={styles.confirmationTitle}>Confirm Linear change</Text>
          <Text style={styles.body}>{describeMutation(issue, pending)}</Text>
          <View style={styles.confirmationActions}>
            <Button
              label="Cancel"
              onPress={onCancel}
              disabled={updating}
              variant="ghost"
              styles={styles}
            />
            <Button
              label={updating ? "Updating..." : "Confirm update"}
              onPress={onConfirm}
              disabled={updating}
              variant="primary"
              styles={styles}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent comments</Text>
        {issue.comments.length ? (
          <View style={styles.commentGroup}>
            {issue.comments.map((item, index) => (
              <View
                key={item.id}
                style={[styles.commentItem, index > 0 && styles.rowDivider]}
              >
                <View style={styles.row}>
                  <Text style={styles.commentAuthor}>{item.user}</Text>
                  <Text style={styles.meta}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>No comments yet</Text>
        )}
      </View>
    </View>
  );
}

function FieldSection({
  label,
  divider,
  styles,
  children,
}: React.PropsWithChildren<{
  label: string;
  divider?: boolean;
  styles: Styles;
}>) {
  return (
    <View style={[styles.fieldSection, divider && styles.rowDivider]}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <View style={styles.choices}>{children}</View>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  variant,
  role = "button",
  styles,
}: {
  label: string;
  onPress: () => void | Promise<unknown>;
  disabled?: boolean;
  variant: "ghost" | "secondary" | "primary";
  role?: "button" | "link";
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "ghost" && styles.ghostButton,
        variant === "secondary" && styles.secondaryButton,
        variant === "primary" && styles.primaryButton,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "ghost" && styles.ghostButtonText,
          variant === "primary" && styles.primaryButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Choice({
  label,
  active,
  disabled,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        active && styles.choiceActive,
        pressed && styles.pressed,
        disabled && !active && styles.disabled,
      ]}
    >
      <Text style={active ? styles.choiceTextActive : styles.choiceText}>
        {label}
      </Text>
    </Pressable>
  );
}

function NoticeMessage({ notice, styles }: { notice: Notice; styles: Styles }) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={notice.tone === "danger" ? styles.noticeDanger : styles.notice}
    >
      {notice.text}
    </Text>
  );
}

function InlineLoading({
  label,
  theme,
  styles,
}: {
  label: string;
  theme: PluginTheme;
  styles: Styles;
}) {
  return (
    <View style={styles.inlineState}>
      <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function EmptyState({
  text,
  danger,
  styles,
}: {
  text: string;
  danger?: boolean;
  styles: Styles;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={danger ? styles.noticeDanger : styles.muted}>{text}</Text>
    </View>
  );
}

function PanelLoading({
  theme,
  styles,
}: {
  theme: PluginTheme;
  styles: Styles;
}) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  );
}

function PanelMessage({
  title,
  text,
  danger,
  styles,
}: {
  title: string;
  text: string;
  danger?: boolean;
  styles: Styles;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={danger ? styles.noticeDanger : styles.muted}>{text}</Text>
      </View>
    </View>
  );
}

function formatListDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "today";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Linear request failed";
}

type Styles = ReturnType<typeof useStyles>;

function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(() => {
    const raised = blendHex(
      theme.colors.surface0,
      theme.colors.foreground,
      0.055,
    );
    const control = blendHex(
      theme.colors.surface0,
      theme.colors.foreground,
      0.1,
    );
    const border = blendHex(
      theme.colors.surface0,
      theme.colors.foreground,
      0.15,
    );
    const accentWash = blendHex(
      theme.colors.surface0,
      theme.colors.accent,
      0.13,
    );

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: compact ? 16 : 20, gap: 14 },
      center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.surface0,
      },
      header: { gap: 4 },
      title: {
        color: theme.colors.foreground,
        fontSize: 15,
        fontWeight: "500",
      },
      issueTitle: {
        color: theme.colors.foreground,
        fontSize: 18,
        fontWeight: "500",
        lineHeight: 24,
      },
      sectionTitle: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        fontWeight: "500",
      },
      confirmationTitle: {
        color: theme.colors.foreground,
        fontSize: 14,
        fontWeight: "500",
      },
      identifier: {
        color: theme.colors.accent,
        fontSize: 12,
        fontWeight: "500",
      },
      cardTitle: {
        color: theme.colors.foreground,
        fontSize: 14,
        lineHeight: 19,
        fontWeight: "400",
      },
      commentAuthor: {
        color: theme.colors.foreground,
        fontSize: 13,
        fontWeight: "500",
        flexShrink: 1,
      },
      body: {
        color: theme.colors.foreground,
        fontSize: 13,
        lineHeight: 20,
      },
      description: {
        color: theme.colors.foreground,
        fontSize: 14,
        lineHeight: 21,
        marginTop: 6,
      },
      muted: {
        color: theme.colors.foregroundMuted,
        fontSize: 13,
        lineHeight: 19,
      },
      meta: {
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        lineHeight: 16,
      },
      placeholder: { color: theme.colors.foregroundMuted },
      notice: { color: theme.colors.accent, fontSize: 13, lineHeight: 19 },
      noticeDanger: {
        color: theme.colors.statusDanger,
        fontSize: 13,
        lineHeight: 19,
      },
      stack: { gap: 10 },
      stackLarge: { gap: 16 },
      section: { gap: 8 },
      issueHeader: { gap: 5 },
      row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      },
      detailActions: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
      },
      input: {
        minHeight: 44,
        color: theme.colors.foreground,
        backgroundColor: raised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: border,
        borderRadius: 11,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
      },
      commentInput: { minHeight: 96, textAlignVertical: "top" },
      issueList: {
        overflow: "hidden",
        borderRadius: 13,
        backgroundColor: raised,
      },
      issueRow: { gap: 5, minHeight: 78, padding: 12 },
      issueRowPressed: { backgroundColor: control },
      rowDivider: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: border,
      },
      statePill: {
        maxWidth: "52%",
        minHeight: 24,
        justifyContent: "center",
        paddingHorizontal: 8,
        borderRadius: 12,
        backgroundColor: control,
      },
      statePillText: {
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        fontWeight: "400",
      },
      fieldGroup: {
        overflow: "hidden",
        borderRadius: 13,
        backgroundColor: raised,
      },
      fieldSection: { gap: 9, padding: 12 },
      choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
      choice: {
        minHeight: 40,
        justifyContent: "center",
        paddingHorizontal: 11,
        borderRadius: 20,
        backgroundColor: control,
      },
      choiceActive: { backgroundColor: accentWash },
      choiceText: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        fontWeight: "400",
      },
      choiceTextActive: {
        color: theme.colors.accent,
        fontSize: 12,
        fontWeight: "500",
      },
      button: {
        minHeight: 40,
        alignSelf: "flex-start",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        borderRadius: 10,
      },
      ghostButton: { backgroundColor: "transparent" },
      secondaryButton: { backgroundColor: control },
      primaryButton: { backgroundColor: theme.colors.accent },
      buttonText: {
        color: theme.colors.foreground,
        fontSize: 13,
        fontWeight: "400",
      },
      ghostButtonText: { color: theme.colors.foregroundMuted },
      primaryButtonText: { color: theme.colors.accentForeground },
      pressed: { opacity: 0.7 },
      disabled: { opacity: 0.58 },
      confirmation: {
        gap: 8,
        padding: 13,
        borderRadius: 13,
        backgroundColor: accentWash,
      },
      confirmationActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 8,
      },
      commentGroup: {
        overflow: "hidden",
        borderRadius: 13,
        backgroundColor: raised,
      },
      commentItem: { gap: 6, padding: 12 },
      inlineState: {
        minHeight: 112,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      },
      emptyState: {
        minHeight: 112,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
      },
    });
  }, [theme, compact]);
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
