import type { PluginTheme, PluginWorkspacePanelProps } from "@getpaseo/plugin";
import { usePaseo, useRpc, useWorkspace } from "@getpaseo/plugin";
import type { PaseoAgent, PaseoProviderSnapshotResult } from "@getpaseo/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEvent,
  View,
} from "react-native";
import {
  GetNoteRpc,
  GetTempChatContextRpc,
  ResetTempChatContextRpc,
  SaveTempChatContextRpc,
} from "./contracts";
import {
  buildTempChatContext,
  chooseInitialTempChatSelection,
  findActiveTempChatAgent,
  isTempChatAgent,
  MAX_CONTEXT_AGENTS,
  projectTempChatTimeline,
  selectionForModel,
  shouldAttachTempChatContext,
  shouldSendTempChatKey,
  TEMP_CHAT_LABEL,
  TEMP_CHAT_LABEL_VALUE,
  TEMP_CHAT_SYSTEM_PROMPT,
  type TempChatContextMessage,
  type TempChatModelOption,
  type TempChatSelection,
  wrapTempChatPrompt,
} from "./temp-chat";

type BusyAction = "archive" | "context" | "send" | null;
type PickerKind = "model" | "mode" | "thinking" | null;

const TEMP_AGENTS_QUERY_KEY = "workspace-temp-chat-agents";
const WORKSPACE_AGENTS_QUERY_KEY = "workspace-temp-chat-recent-agents";
const CONTEXT_QUERY_KEY = "workspace-temp-chat-context";
const TIMELINE_QUERY_KEY = "workspace-temp-chat-timeline";

export function TempChatPanel({
  workspaceId,
  theme,
  layout,
}: PluginWorkspacePanelProps) {
  const paseo = usePaseo();
  const getNote = useRpc(GetNoteRpc);
  const getContext = useRpc(GetTempChatContextRpc);
  const saveContext = useRpc(SaveTempChatContextRpc);
  const resetContext = useRpc(ResetTempChatContextRpc);
  const queryClient = useQueryClient();
  const workspace = useWorkspace(workspaceId, (value) => ({
    directory: value.directory,
    name: value.title ?? value.name,
  }));
  const styles = useTempChatStyles(theme, layout.compact);
  const messageListRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [selection, setSelection] = useState<TempChatSelection | null>(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  const tempAgents = useQuery<PaseoAgent[]>({
    queryKey: [TEMP_AGENTS_QUERY_KEY, workspaceId],
    queryFn: async () => {
      const result = await paseo.agents.list({
        filter: {
          includeArchived: false,
          labels: { [TEMP_CHAT_LABEL]: TEMP_CHAT_LABEL_VALUE },
        },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: 200 },
      });
      return result.entries.map((entry: { agent: PaseoAgent }) => entry.agent);
    },
    refetchInterval: 1_500,
  });
  const activeAgent = useMemo(
    () => findActiveTempChatAgent(tempAgents.data ?? [], workspaceId),
    [tempAgents.data, workspaceId],
  );
  const activeAgentId = activeAgent?.id ?? createdAgentId;

  const recentAgents = useQuery<PaseoAgent[]>({
    queryKey: [WORKSPACE_AGENTS_QUERY_KEY, workspaceId],
    enabled: !tempAgents.isLoading && activeAgentId === null,
    queryFn: async () => {
      const result = await paseo.agents.list({
        filter: { includeArchived: false },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: 200 },
      });
      return result.entries
        .map((entry: { agent: PaseoAgent }) => entry.agent)
        .filter((agent: PaseoAgent) => agent.workspaceId === workspaceId);
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (activeAgent && createdAgentId === activeAgent.id) {
      setCreatedAgentId(null);
    }
  }, [activeAgent, createdAgentId]);

  const context = useQuery({
    queryKey: [CONTEXT_QUERY_KEY, workspaceId],
    queryFn: () => getContext({ workspaceId }),
  });
  const providers = useQuery({
    queryKey: [
      "workspace-temp-chat-providers",
      workspaceId,
      workspace?.directory,
    ],
    enabled:
      workspace !== null && !tempAgents.isLoading && activeAgentId === null,
    queryFn: () =>
      paseo.providers.waitForReady({
        cwd: workspace?.directory,
        timeoutMs: 60_000,
      }),
    staleTime: 60_000,
  });
  const modelOptions = useMemo(
    () => buildModelOptions(providers.data),
    [providers.data],
  );

  useEffect(() => {
    if (activeAgentId || selection || modelOptions.length === 0) return;
    setSelection(
      chooseInitialTempChatSelection(
        modelOptions,
        recentAgents.data ?? [],
        workspaceId,
      ),
    );
  }, [activeAgentId, modelOptions, recentAgents.data, selection, workspaceId]);

  const timeline = useQuery({
    queryKey: [TIMELINE_QUERY_KEY, activeAgentId],
    enabled: activeAgentId !== null,
    queryFn: () => {
      if (!activeAgentId) throw new Error("No Temp Chat agent is active.");
      return paseo.agents.ref(activeAgentId).timeline.refetch({
        direction: "tail",
        limit: 200,
        projection: "projected",
      });
    },
    refetchInterval:
      activeAgent?.status === "running" ||
      activeAgent?.status === "initializing" ||
      busy === "send"
        ? 700
        : 3_000,
  });
  const messages = useMemo(
    () => projectTempChatTimeline(timeline.data?.entries ?? []),
    [timeline.data?.entries],
  );
  const selectedModel = modelOptions.find(
    (option) =>
      option.provider === selection?.provider &&
      option.modelId === selection.modelId,
  );
  const working =
    busy === "send" ||
    activeAgent?.status === "running" ||
    activeAgent?.status === "initializing" ||
    (createdAgentId !== null && activeAgent === null);
  const canSend =
    draft.trim().length > 0 &&
    !working &&
    busy === null &&
    !tempAgents.isLoading &&
    !tempAgents.isError &&
    (activeAgentId !== null || selection !== null);

  async function captureContext() {
    if (!workspace) throw new Error("This workspace is not available yet.");
    const [freshAgents, note] = await Promise.all([
      paseo.agents.list({
        filter: { includeArchived: false },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: 200 },
      }),
      getNote({ workspaceId }),
    ]);
    const sourceAgents = freshAgents.entries
      .map((entry: { agent: PaseoAgent }) => entry.agent)
      .filter(
        (agent: PaseoAgent) =>
          agent.workspaceId === workspaceId && !isTempChatAgent(agent),
      )
      .slice(0, MAX_CONTEXT_AGENTS);
    const sources = await Promise.all(
      sourceAgents.map(async (agent: PaseoAgent) => {
        let contextMessages: TempChatContextMessage[] = [];
        try {
          const response = await paseo.agents.ref(agent.id).timeline.refetch({
            direction: "tail",
            limit: 80,
            projection: "projected",
          });
          contextMessages = response.entries.flatMap(
            (entry: {
              item: { type: string; text?: string };
              timestamp: string;
            }): TempChatContextMessage[] => {
              if (
                entry.item.type === "user_message" &&
                typeof entry.item.text === "string"
              ) {
                return [
                  {
                    role: "user",
                    text: entry.item.text,
                    timestamp: entry.timestamp,
                  },
                ];
              }
              if (
                entry.item.type === "assistant_message" &&
                typeof entry.item.text === "string"
              ) {
                return [
                  {
                    role: "assistant",
                    text: entry.item.text,
                    timestamp: entry.timestamp,
                  },
                ];
              }
              return [];
            },
          );
        } catch {
          // The rest of the workspace remains useful when one transcript is stale.
        }
        return {
          id: agent.id,
          title: agent.title ?? "Untitled agent",
          provider: agent.provider,
          model: agent.model,
          status: agent.status,
          updatedAt: agent.updatedAt,
          messages: contextMessages,
        };
      }),
    );
    const built = buildTempChatContext({
      workspaceName: workspace.name,
      directory: workspace.directory,
      note: note.markdown,
      sources,
    });
    const saved = await saveContext({
      workspaceId,
      ...built,
      capturedAt: new Date().toISOString(),
      appliedAgentId: context.data?.appliedAgentId ?? null,
      appliedCapturedAt: context.data?.appliedCapturedAt ?? null,
    });
    queryClient.setQueryData([CONTEXT_QUERY_KEY, workspaceId], saved);
    return saved;
  }

  async function refreshContext() {
    setBusy("context");
    clearNotice();
    try {
      const saved = await captureContext();
      setNotice(contextUpdatedMessage(saved.sourceAgentCount));
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function sendMessage() {
    const question = draft.trim();
    if (
      !question ||
      !workspace ||
      working ||
      busy !== null ||
      tempAgents.isLoading ||
      tempAgents.isError
    )
      return;
    setBusy("send");
    clearNotice();
    try {
      const captured = context.data?.snapshot
        ? context.data
        : await captureContext();
      const prompt = shouldAttachTempChatContext(captured, activeAgentId)
        ? wrapTempChatPrompt(captured.snapshot, question)
        : question;
      let sentAgentId = activeAgentId;
      if (activeAgentId) {
        await paseo.agents.ref(activeAgentId).send(prompt);
      } else {
        if (!selection) throw new Error("Choose a model before starting chat.");
        const handle = await paseo.workspaces.ref(workspaceId).agents.create({
          config: {
            provider: `${selection.provider}/${selection.modelId}`,
            ...(selection.modeId ? { modeId: selection.modeId } : {}),
            ...(selection.thinkingOptionId
              ? { thinkingOptionId: selection.thinkingOptionId }
              : {}),
            systemPrompt: TEMP_CHAT_SYSTEM_PROMPT,
          },
          title: "Temp chat",
          prompt,
          labels: { [TEMP_CHAT_LABEL]: TEMP_CHAT_LABEL_VALUE },
        });
        setCreatedAgentId(handle.id);
        sentAgentId = handle.id;
      }
      setDraft("");
      try {
        const applied = await saveContext({
          ...captured,
          appliedAgentId: sentAgentId,
          appliedCapturedAt: captured.capturedAt,
        });
        queryClient.setQueryData([CONTEXT_QUERY_KEY, workspaceId], applied);
      } catch {
        setNotice(
          "Message sent, but the context marker could not be saved. The next question may resend the snapshot.",
        );
        setNoticeIsError(true);
      }
      await queryClient.invalidateQueries({
        queryKey: [TEMP_AGENTS_QUERY_KEY, workspaceId],
      });
      if (activeAgentId) {
        await queryClient.invalidateQueries({
          queryKey: [TIMELINE_QUERY_KEY, activeAgentId],
        });
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function archiveChat() {
    if (!activeAgentId || busy !== null) return;
    setBusy("archive");
    clearNotice();
    try {
      await paseo.agents.ref(activeAgentId).archive();
      const reset = await resetContext({ workspaceId });
      queryClient.setQueryData([CONTEXT_QUERY_KEY, workspaceId], reset);
      queryClient.removeQueries({
        queryKey: [TIMELINE_QUERY_KEY, activeAgentId],
      });
      setCreatedAgentId(null);
      setSelection(null);
      setDraft("");
      setConfirmArchive(false);
      setPicker(null);
      setNotice("Chat archived. A new chat will capture fresh context.");
      await queryClient.invalidateQueries({
        queryKey: [TEMP_AGENTS_QUERY_KEY, workspaceId],
      });
      await queryClient.invalidateQueries({
        queryKey: [WORKSPACE_AGENTS_QUERY_KEY, workspaceId],
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  function handleComposerKeyPress(event: TextInputKeyPressEvent) {
    if (
      !shouldSendTempChatKey({
        key: event.nativeEvent.key,
        platform: layout.platform,
        shiftKey: keyboardEventFlag(event, "shiftKey"),
        isComposing: keyboardEventFlag(event, "isComposing"),
      })
    )
      return;
    event.preventDefault();
    if (canSend) void sendMessage();
  }

  function clearNotice() {
    setNotice("");
    setNoticeIsError(false);
  }

  function showError(error: unknown) {
    setNotice(errorMessage(error));
    setNoticeIsError(true);
  }

  function chooseModel(option: TempChatModelOption) {
    setSelection(selectionForModel(option));
    setPicker(null);
  }

  const contextLabel = contextSummary(context.data);

  return (
    <KeyboardAvoidingView
      behavior={layout.platform === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Temp chat</Text>
          <Text style={styles.subtitle}>
            Clarify workspace work without changing the main thread
          </Text>
        </View>
        <View style={styles.headerActions}>
          <QuietButton
            disabled={busy !== null || workspace === null}
            label={busy === "context" ? "Refreshing…" : "Refresh context"}
            onPress={() => void refreshContext()}
            styles={styles}
          />
          {activeAgentId ? (
            <QuietButton
              disabled={busy !== null}
              label="Archive"
              onPress={() => setConfirmArchive(true)}
              styles={styles}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.contextRow}>
        <View style={styles.contextDot} />
        <Text numberOfLines={2} style={styles.contextText}>
          {context.isLoading ? "Loading context…" : contextLabel}
        </Text>
      </View>

      {confirmArchive ? (
        <ArchiveConfirmation
          busy={busy === "archive"}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => void archiveChat()}
          styles={styles}
        />
      ) : null}

      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          style={noticeIsError ? styles.errorNotice : styles.notice}
        >
          {notice}
        </Text>
      ) : null}

      {tempAgents.isError || recentAgents.isError || context.isError ? (
        <InlineError
          message={errorMessage(
            tempAgents.error ?? recentAgents.error ?? context.error,
          )}
          onRetry={() => {
            void tempAgents.refetch();
            void recentAgents.refetch();
            void context.refetch();
          }}
          styles={styles}
        />
      ) : (
        <ScrollView
          ref={messageListRef}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            messageListRef.current?.scrollToEnd({ animated: false })
          }
          style={styles.messageList}
        >
          {timeline.isLoading && activeAgentId ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.colors.foregroundMuted} />
            </View>
          ) : messages.length > 0 ? (
            messages.map((entry, index) => (
              <ChatMessage
                key={`${entry.timestamp}-${index}`}
                message={entry}
                styles={styles}
              />
            ))
          ) : (
            <EmptyChat
              hasContext={Boolean(context.data?.snapshot)}
              styles={styles}
            />
          )}
          {working ? (
            <View style={styles.thinkingRow}>
              <ActivityIndicator
                color={theme.colors.foregroundMuted}
                size="small"
              />
              <Text style={styles.thinkingText}>Working…</Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {!activeAgentId ? (
        <View style={styles.configuration}>
          {tempAgents.isLoading ? (
            <View style={styles.configurationLoading}>
              <ActivityIndicator color={theme.colors.foregroundMuted} />
              <Text style={styles.muted}>Checking for an active chat…</Text>
            </View>
          ) : providers.isError ? (
            <Text style={styles.errorNotice}>
              {errorMessage(providers.error)}
            </Text>
          ) : providers.isLoading ? (
            <View style={styles.configurationLoading}>
              <ActivityIndicator color={theme.colors.foregroundMuted} />
              <Text style={styles.muted}>Loading models…</Text>
            </View>
          ) : modelOptions.length === 0 ? (
            <Text style={styles.errorNotice}>
              No ready provider models are available for this workspace.
            </Text>
          ) : (
            <>
              <SelectorButton
                label="Model"
                onPress={() => setPicker(picker === "model" ? null : "model")}
                styles={styles}
                value={
                  selectedModel
                    ? `${selectedModel.providerLabel} · ${selectedModel.modelLabel}`
                    : "Choose a model"
                }
              />
              {picker === "model" ? (
                <OptionList
                  options={modelOptions.map((option) => ({
                    id: `${option.provider}/${option.modelId}`,
                    label: option.modelLabel,
                    selected:
                      option.provider === selection?.provider &&
                      option.modelId === selection.modelId,
                    subtitle: option.providerLabel,
                    value: option,
                  }))}
                  onSelect={chooseModel}
                  styles={styles}
                />
              ) : null}
              {selectedModel && selectedModel.modes.length > 0 ? (
                <SelectorButton
                  label="Mode"
                  onPress={() => setPicker(picker === "mode" ? null : "mode")}
                  styles={styles}
                  value={
                    selectedModel.modes.find(
                      (option) => option.id === selection?.modeId,
                    )?.label ?? "Default"
                  }
                />
              ) : null}
              {picker === "mode" && selectedModel ? (
                <OptionList
                  options={selectedModel.modes.map((option) => ({
                    id: option.id,
                    label: option.label,
                    selected: option.id === selection?.modeId,
                    value: option.id,
                  }))}
                  onSelect={(modeId) => {
                    setSelection((current) =>
                      current ? { ...current, modeId } : current,
                    );
                    setPicker(null);
                  }}
                  styles={styles}
                />
              ) : null}
              {selectedModel && selectedModel.thinkingOptions.length > 0 ? (
                <SelectorButton
                  label="Reasoning"
                  onPress={() =>
                    setPicker(picker === "thinking" ? null : "thinking")
                  }
                  styles={styles}
                  value={
                    selectedModel.thinkingOptions.find(
                      (option) => option.id === selection?.thinkingOptionId,
                    )?.label ?? "Default"
                  }
                />
              ) : null}
              {picker === "thinking" && selectedModel ? (
                <OptionList
                  options={selectedModel.thinkingOptions.map((option) => ({
                    id: option.id,
                    label: option.label,
                    selected: option.id === selection?.thinkingOptionId,
                    value: option.id,
                  }))}
                  onSelect={(thinkingOptionId) => {
                    setSelection((current) =>
                      current ? { ...current, thinkingOptionId } : current,
                    );
                    setPicker(null);
                  }}
                  styles={styles}
                />
              ) : null}
            </>
          )}
        </View>
      ) : (
        <Text style={styles.lockedConfiguration}>
          {activeAgent
            ? activeAgentConfigurationLabel(activeAgent, modelOptions)
            : "Starting selected model…"}
        </Text>
      )}

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message Temp chat"
          editable={!working && busy !== "archive"}
          multiline
          onChangeText={setDraft}
          onKeyPress={handleComposerKeyPress}
          onSubmitEditing={() => {
            if (layout.platform !== "web" && canSend) void sendMessage();
          }}
          placeholder="Ask about this workspace…"
          placeholderTextColor={theme.colors.foregroundMuted}
          returnKeyType="send"
          style={styles.composerInput}
          submitBehavior={layout.platform === "web" ? "newline" : "submit"}
          value={draft}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => void sendMessage()}
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.controlPressed,
            !canSend && styles.controlDisabled,
          ]}
        >
          <Text style={styles.sendButtonText}>
            {working ? "Working" : "Send"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function EmptyChat({
  hasContext,
  styles,
}: {
  hasContext: boolean;
  styles: TempChatStyles;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>A quiet place to ask</Text>
      <Text style={styles.emptyText}>
        {hasContext
          ? "This chat is ready with the captured workspace context."
          : "Your first question will capture notes and recent workspace conversations."}
      </Text>
    </View>
  );
}

function ChatMessage({
  message,
  styles,
}: {
  message: ReturnType<typeof projectTempChatTimeline>[number];
  styles: TempChatStyles;
}) {
  if (message.role === "user") {
    return (
      <View style={styles.userMessageRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userMessageText}>{message.text}</Text>
        </View>
      </View>
    );
  }
  if (message.role === "error") {
    return (
      <View style={styles.messageError}>
        <Text style={styles.messageErrorText}>{message.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.assistantMessage}>
      <ChatMarkdown markdown={message.text} styles={styles} />
    </View>
  );
}

function ChatMarkdown({
  markdown,
  styles,
}: {
  markdown: string;
  styles: TempChatStyles;
}) {
  const lines = markdown.split("\n");
  const blocks: React.ReactNode[] = [];
  let inCode = false;
  let code: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      if (inCode) {
        blocks.push(
          <View key={`code-${index}`} style={styles.codeBlock}>
            <Text style={styles.codeText}>{code.join("\n")}</Text>
          </View>,
        );
        code = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <Text key={index} style={styles.markdownHeading}>
          {renderInlineMarkdown(heading[2] ?? "", styles)}
        </Text>,
      );
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push(
        <View key={index} style={styles.markdownListRow}>
          <Text style={styles.markdownBullet}>•</Text>
          <Text style={styles.assistantText}>
            {renderInlineMarkdown(bullet[1] ?? "", styles)}
          </Text>
        </View>,
      );
      continue;
    }
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      blocks.push(
        <View key={index} style={styles.markdownListRow}>
          <Text style={styles.markdownBullet}>{numbered[1]}.</Text>
          <Text style={styles.assistantText}>
            {renderInlineMarkdown(numbered[2] ?? "", styles)}
          </Text>
        </View>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(
        <View key={index} style={styles.markdownQuote}>
          <Text style={styles.assistantText}>
            {renderInlineMarkdown(line.slice(2), styles)}
          </Text>
        </View>,
      );
      continue;
    }
    blocks.push(
      <Text key={index} style={styles.assistantText}>
        {line ? renderInlineMarkdown(line, styles) : " "}
      </Text>,
    );
  }
  if (code.length > 0) {
    blocks.push(
      <View key="code-final" style={styles.codeBlock}>
        <Text style={styles.codeText}>{code.join("\n")}</Text>
      </View>,
    );
  }
  return <View style={styles.markdown}>{blocks}</View>;
}

function renderInlineMarkdown(
  value: string,
  styles: TempChatStyles,
): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(value.slice(cursor, start));
    const token = match[0];
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(token);
    if (link) {
      nodes.push(
        <Text
          key={`${start}-link`}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(link[2] ?? "")}
          style={styles.markdownLink}
        >
          {link[1]}
        </Text>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <Text key={`${start}-strong`} style={styles.markdownStrong}>
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

function ArchiveConfirmation({
  busy,
  onCancel,
  onConfirm,
  styles,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  styles: TempChatStyles;
}) {
  return (
    <View style={styles.archiveConfirmation}>
      <View style={styles.archiveCopy}>
        <Text style={styles.archiveTitle}>Archive this chat?</Text>
        <Text style={styles.muted}>
          Its agent and transcript remain available in Paseo’s archive.
        </Text>
      </View>
      <View style={styles.archiveActions}>
        <QuietButton
          disabled={busy}
          label="Cancel"
          onPress={onCancel}
          styles={styles}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.archiveButton,
            pressed && styles.controlPressed,
            busy && styles.controlDisabled,
          ]}
        >
          <Text style={styles.archiveButtonText}>
            {busy ? "Archiving…" : "Archive chat"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function InlineError({
  message,
  onRetry,
  styles,
}: {
  message: string;
  onRetry: () => void;
  styles: TempChatStyles;
}) {
  return (
    <View style={styles.inlineError}>
      <Text style={styles.errorNotice}>{message}</Text>
      <QuietButton label="Try again" onPress={onRetry} styles={styles} />
    </View>
  );
}

function QuietButton({
  disabled,
  label,
  onPress,
  styles,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  styles: TempChatStyles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quietButton,
        pressed && styles.controlPressed,
        disabled && styles.controlDisabled,
      ]}
    >
      <Text style={styles.quietButtonText}>{label}</Text>
    </Pressable>
  );
}

function SelectorButton({
  label,
  onPress,
  styles,
  value,
}: {
  label: string;
  onPress: () => void;
  styles: TempChatStyles;
  value: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectorButton,
        pressed && styles.controlPressed,
      ]}
    >
      <Text style={styles.selectorLabel}>{label}</Text>
      <View style={styles.selectorValueRow}>
        <Text numberOfLines={1} style={styles.selectorValue}>
          {value}
        </Text>
        <View style={styles.chevronBox}>
          <View style={styles.chevron} />
        </View>
      </View>
    </Pressable>
  );
}

function OptionList<Value>({
  onSelect,
  options,
  styles,
}: {
  onSelect: (value: Value) => void;
  options: readonly {
    id: string;
    label: string;
    selected: boolean;
    subtitle?: string;
    value: Value;
  }[];
  styles: TempChatStyles;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.optionListContent}
      nestedScrollEnabled
      style={styles.optionList}
    >
      {options.map((option) => (
        <Pressable
          key={option.id}
          accessibilityRole="button"
          accessibilityState={{ selected: option.selected }}
          onPress={() => onSelect(option.value)}
          style={({ pressed }) => [
            styles.option,
            option.selected && styles.optionSelected,
            pressed && styles.controlPressed,
          ]}
        >
          <View style={styles.optionCopy}>
            <Text style={styles.optionLabel}>{option.label}</Text>
            {option.subtitle ? (
              <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
            ) : null}
          </View>
          {option.selected ? <Text style={styles.optionCheck}>✓</Text> : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function buildModelOptions(
  snapshot: PaseoProviderSnapshotResult | undefined,
): TempChatModelOption[] {
  if (!snapshot) return [];
  return snapshot.entries.flatMap((provider) => {
    if (!provider.enabled || provider.status !== "ready") return [];
    return (provider.models ?? [])
      .filter((model) => model.isSelectable !== false)
      .map((model) => ({
        provider: provider.provider,
        providerLabel: provider.label ?? provider.provider,
        modelId: model.id,
        modelLabel: model.label,
        isDefault: model.isDefault,
        defaultModeId: provider.defaultModeId ?? null,
        modes: provider.modes ?? [],
        defaultThinkingOptionId: model.defaultThinkingOptionId ?? null,
        thinkingOptions: model.thinkingOptions ?? [],
      }));
  });
}

function activeAgentConfigurationLabel(
  agent: PaseoAgent,
  options: readonly TempChatModelOption[],
): string {
  const option = options.find(
    (candidate) =>
      candidate.provider === agent.provider &&
      candidate.modelId === agent.model,
  );
  const model = option
    ? `${option.providerLabel} · ${option.modelLabel}`
    : `${agent.provider}${agent.model ? ` · ${agent.model}` : ""}`;
  const details = [agent.currentModeId, agent.thinkingOptionId].filter(Boolean);
  return `${model}${details.length > 0 ? ` · ${details.join(" · ")}` : ""}`;
}

function contextSummary(
  context:
    | {
        capturedAt: string | null;
        includesNote: boolean;
        omittedAgentCount: number;
        snapshot: string;
        sourceAgentCount: number;
      }
    | undefined,
): string {
  if (!context?.snapshot || !context.capturedAt) return "Context not captured";
  const time = new Date(context.capturedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const sources = [
    `${context.sourceAgentCount} ${context.sourceAgentCount === 1 ? "agent" : "agents"}`,
    context.includesNote ? "notes" : null,
    context.omittedAgentCount > 0
      ? `${context.omittedAgentCount} omitted`
      : null,
  ].filter(Boolean);
  return `Context updated ${time} · ${sources.join(" · ")}`;
}

function contextUpdatedMessage(sourceAgentCount: number): string {
  return `Context refreshed from ${sourceAgentCount} ${
    sourceAgentCount === 1 ? "agent" : "agents"
  }.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function keyboardEventFlag(
  event: TextInputKeyPressEvent,
  name: "shiftKey" | "isComposing",
): boolean {
  const nativeEvent: unknown = event.nativeEvent;
  if (typeof nativeEvent !== "object" || nativeEvent === null) return false;
  if (name === "shiftKey" && "shiftKey" in nativeEvent) {
    return nativeEvent.shiftKey === true;
  }
  if (name === "isComposing" && "isComposing" in nativeEvent) {
    return nativeEvent.isComposing === true;
  }
  return false;
}

type TempChatStyles = ReturnType<typeof useTempChatStyles>;

function useTempChatStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: theme.colors.surface0,
          paddingHorizontal: compact ? 12 : 16,
          paddingTop: compact ? 12 : 16,
          paddingBottom: compact ? 10 : 14,
          gap: 10,
        },
        header: {
          flexDirection: compact ? "column" : "row",
          alignItems: compact ? "stretch" : "flex-start",
          justifyContent: "space-between",
          gap: 10,
        },
        headerCopy: { flex: 1, gap: 2 },
        title: {
          color: theme.colors.foreground,
          fontSize: 16,
          fontWeight: "600",
          letterSpacing: -0.2,
        },
        subtitle: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 17,
        },
        headerActions: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: compact ? "flex-start" : "flex-end",
          gap: 4,
        },
        quietButton: {
          minHeight: 30,
          justifyContent: "center",
          paddingHorizontal: 8,
          borderRadius: 7,
        },
        quietButtonText: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          fontWeight: "500",
        },
        contextRow: {
          minHeight: 28,
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingHorizontal: 2,
        },
        contextDot: {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.accent,
        },
        contextText: {
          flex: 1,
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          lineHeight: 15,
          fontVariant: ["tabular-nums"],
        },
        notice: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 17,
        },
        errorNotice: {
          color: theme.colors.statusDanger,
          fontSize: 12,
          lineHeight: 17,
        },
        messageList: { flex: 1 },
        messages: {
          flexGrow: 1,
          paddingVertical: 8,
          gap: 16,
        },
        centerState: {
          flex: 1,
          minHeight: 160,
          alignItems: "center",
          justifyContent: "center",
        },
        emptyState: {
          flex: 1,
          minHeight: 180,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          gap: 6,
        },
        emptyTitle: {
          color: theme.colors.foreground,
          fontSize: 14,
          fontWeight: "600",
        },
        emptyText: {
          maxWidth: 360,
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 18,
          textAlign: "center",
        },
        userMessageRow: {
          alignItems: "flex-end",
          paddingLeft: 32,
        },
        userBubble: {
          maxWidth: "90%",
          borderRadius: 14,
          borderBottomRightRadius: 5,
          paddingHorizontal: 12,
          paddingVertical: 9,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.accent,
            0.18,
          ),
        },
        userMessageText: {
          color: theme.colors.foreground,
          fontSize: 13,
          lineHeight: 19,
        },
        assistantMessage: { paddingRight: 6 },
        assistantText: {
          flexShrink: 1,
          color: theme.colors.foreground,
          fontSize: 13,
          lineHeight: 20,
        },
        messageError: {
          borderRadius: 10,
          paddingHorizontal: 11,
          paddingVertical: 9,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.statusDanger,
            0.12,
          ),
        },
        messageErrorText: {
          color: theme.colors.statusDanger,
          fontSize: 12,
          lineHeight: 17,
        },
        thinkingRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: 4,
        },
        thinkingText: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
        },
        markdown: { gap: 5 },
        markdownHeading: {
          color: theme.colors.foreground,
          fontSize: 14,
          lineHeight: 20,
          fontWeight: "600",
          marginTop: 3,
        },
        markdownListRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 7,
          paddingLeft: 2,
        },
        markdownBullet: {
          minWidth: 13,
          color: theme.colors.foregroundMuted,
          fontSize: 13,
          lineHeight: 20,
          textAlign: "right",
        },
        markdownQuote: {
          paddingLeft: 10,
          borderLeftWidth: 2,
          borderLeftColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.2,
          ),
        },
        markdownStrong: { fontWeight: "700" },
        markdownLink: {
          color: theme.colors.accent,
          textDecorationLine: "underline",
        },
        inlineCode: {
          color: theme.colors.foreground,
          fontFamily: "monospace",
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.08,
          ),
        },
        codeBlock: {
          borderRadius: 9,
          padding: 10,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.07,
          ),
        },
        codeText: {
          color: theme.colors.foreground,
          fontFamily: "monospace",
          fontSize: 11,
          lineHeight: 17,
        },
        configuration: {
          gap: 6,
          paddingTop: 2,
        },
        configurationLoading: {
          minHeight: 34,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        muted: {
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 17,
        },
        selectorButton: {
          minHeight: 38,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          borderRadius: 9,
          paddingHorizontal: 10,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.05,
          ),
        },
        selectorLabel: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          fontWeight: "500",
        },
        selectorValueRow: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
        },
        selectorValue: {
          flexShrink: 1,
          color: theme.colors.foreground,
          fontSize: 12,
          fontWeight: "500",
          textAlign: "right",
        },
        chevronBox: {
          width: 16,
          height: 16,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
        },
        chevron: {
          width: 6,
          height: 6,
          marginTop: -3,
          borderRightWidth: 1.5,
          borderBottomWidth: 1.5,
          borderColor: theme.colors.foregroundMuted,
          transform: [{ rotate: "45deg" }],
        },
        optionList: {
          maxHeight: 190,
          borderRadius: 9,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.05,
          ),
        },
        optionListContent: { padding: 4 },
        option: {
          minHeight: 40,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingHorizontal: 9,
          paddingVertical: 6,
          borderRadius: 7,
        },
        optionSelected: {
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.accent,
            0.15,
          ),
        },
        optionCopy: { flex: 1, gap: 1 },
        optionLabel: {
          color: theme.colors.foreground,
          fontSize: 12,
          fontWeight: "500",
        },
        optionSubtitle: {
          color: theme.colors.foregroundMuted,
          fontSize: 10,
        },
        optionCheck: {
          color: theme.colors.accent,
          fontSize: 13,
          fontWeight: "700",
        },
        lockedConfiguration: {
          color: theme.colors.foregroundMuted,
          fontSize: 10,
          lineHeight: 14,
        },
        composer: {
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          borderRadius: 13,
          padding: 6,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.06,
          ),
        },
        composerInput: {
          flex: 1,
          minHeight: 40,
          maxHeight: 120,
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 8,
          outlineWidth: 0,
          color: theme.colors.foreground,
          fontSize: 13,
          lineHeight: 19,
          textAlignVertical: "top",
        },
        sendButton: {
          minWidth: 58,
          minHeight: 40,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          paddingHorizontal: 11,
          backgroundColor: theme.colors.accent,
        },
        sendButtonText: {
          color: theme.colors.accentForeground,
          fontSize: 12,
          fontWeight: "600",
        },
        archiveConfirmation: {
          flexDirection: compact ? "column" : "row",
          alignItems: compact ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 10,
          borderRadius: 10,
          padding: 10,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.foreground,
            0.05,
          ),
        },
        archiveCopy: { flex: 1, gap: 2 },
        archiveTitle: {
          color: theme.colors.foreground,
          fontSize: 12,
          fontWeight: "600",
        },
        archiveActions: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 4,
        },
        archiveButton: {
          minHeight: 30,
          justifyContent: "center",
          borderRadius: 7,
          paddingHorizontal: 9,
          backgroundColor: blendHex(
            theme.colors.surface0,
            theme.colors.statusDanger,
            0.14,
          ),
        },
        archiveButtonText: {
          color: theme.colors.statusDanger,
          fontSize: 12,
          fontWeight: "600",
        },
        inlineError: {
          minHeight: 120,
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 8,
        },
        controlPressed: { opacity: 0.72 },
        controlDisabled: { opacity: 0.42 },
      }),
    [compact, theme],
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
