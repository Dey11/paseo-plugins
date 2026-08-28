export const TEMP_CHAT_LABEL = "workspace-companion.temp-chat";
export const TEMP_CHAT_LABEL_VALUE = "v1";
export const MAX_CONTEXT_CHARS = 48_000;
export const MAX_CONTEXT_AGENTS = 10;
export const MAX_MESSAGES_PER_AGENT = 24;

const CONTEXT_START = "<<<PASEO_TEMP_CHAT_CONTEXT>>>";
const CONTEXT_END = "<<<END_PASEO_TEMP_CHAT_CONTEXT>>>";
const QUESTION_START = "<<<PASEO_TEMP_CHAT_QUESTION>>>";
const QUESTION_END = "<<<END_PASEO_TEMP_CHAT_QUESTION>>>";

export const TEMP_CHAT_SYSTEM_PROMPT = `You are Temp Chat, a read-only clarification assistant for one Paseo workspace.

Answer questions using the captured workspace context in each prompt and read-only inspection of the current workspace when useful. Explain decisions, summarize relevant work, and resolve ambiguity. The captured context is bounded and may be stale; say when the available evidence is incomplete or conflicts.

Do not edit files, run destructive commands, change git state, send external messages, or mutate any local or remote service. Do not act as an implementation agent. Keep answers direct and grounded in the workspace.`;

export interface TempChatAgentLike {
  id: string;
  workspaceId?: string;
  provider: string;
  model: string | null;
  currentModeId: string | null;
  thinkingOptionId?: string | null;
  title: string | null;
  status: string;
  updatedAt: string;
  labels: Readonly<Record<string, string>>;
  archivedAt?: string | null;
}

export interface TempChatModeOption {
  id: string;
  label: string;
}

export interface TempChatThinkingOption {
  id: string;
  label: string;
  isDefault?: boolean;
}

export interface TempChatModelOption {
  provider: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  isDefault?: boolean;
  defaultModeId: string | null;
  modes: readonly TempChatModeOption[];
  defaultThinkingOptionId: string | null;
  thinkingOptions: readonly TempChatThinkingOption[];
}

export interface TempChatSelection {
  provider: string;
  modelId: string;
  modeId: string | null;
  thinkingOptionId: string | null;
}

export interface TempChatContextMessage {
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
}

export interface TempChatContextSource {
  id: string;
  title: string;
  provider: string;
  model: string | null;
  status: string;
  updatedAt: string;
  messages: readonly TempChatContextMessage[];
}

export interface TempChatContextBuildInput {
  workspaceName: string;
  directory: string;
  note: string;
  sources: readonly TempChatContextSource[];
  maxChars?: number;
}

export interface BuiltTempChatContext {
  snapshot: string;
  sourceAgentCount: number;
  omittedAgentCount: number;
  includesNote: boolean;
}

export interface TempChatTimelineEntry {
  item: {
    type: string;
    text?: string;
    message?: string;
  };
  timestamp: string;
}

export interface TempChatVisibleMessage {
  role: "user" | "assistant" | "error";
  text: string;
  timestamp: string;
}

export interface TempChatContextApplication {
  capturedAt: string | null;
  appliedAgentId: string | null;
  appliedCapturedAt: string | null;
}

export function isTempChatAgent(agent: TempChatAgentLike): boolean {
  return agent.labels[TEMP_CHAT_LABEL] === TEMP_CHAT_LABEL_VALUE;
}

export function findActiveTempChatAgent<Agent extends TempChatAgentLike>(
  agents: readonly Agent[],
  workspaceId: string,
): Agent | null {
  return (
    agents
      .filter(
        (agent) =>
          agent.workspaceId === workspaceId &&
          !agent.archivedAt &&
          isTempChatAgent(agent),
      )
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )[0] ?? null
  );
}

export function chooseInitialTempChatSelection(
  options: readonly TempChatModelOption[],
  agents: readonly TempChatAgentLike[],
  workspaceId: string,
): TempChatSelection | null {
  const latestWorkspaceAgent = agents
    .filter(
      (agent) =>
        agent.workspaceId === workspaceId &&
        !agent.archivedAt &&
        !isTempChatAgent(agent) &&
        agent.model !== null,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const matchingOption = latestWorkspaceAgent
    ? options.find(
        (option) =>
          option.provider === latestWorkspaceAgent.provider &&
          option.modelId === latestWorkspaceAgent.model,
      )
    : undefined;
  const option =
    matchingOption ??
    options.find((candidate) => candidate.isDefault) ??
    options[0];
  if (!option) return null;
  return selectionForModel(option, {
    modeId:
      matchingOption && latestWorkspaceAgent
        ? latestWorkspaceAgent.currentModeId
        : null,
    thinkingOptionId:
      matchingOption && latestWorkspaceAgent
        ? (latestWorkspaceAgent.thinkingOptionId ?? null)
        : null,
  });
}

export function selectionForModel(
  option: TempChatModelOption,
  preferred?: {
    modeId?: string | null;
    thinkingOptionId?: string | null;
  },
): TempChatSelection {
  const modeId = validOptionId(option.modes, preferred?.modeId)
    ? (preferred?.modeId ?? null)
    : validOptionId(option.modes, option.defaultModeId)
      ? option.defaultModeId
      : (option.modes[0]?.id ?? null);
  const thinkingOptionId = validOptionId(
    option.thinkingOptions,
    preferred?.thinkingOptionId,
  )
    ? (preferred?.thinkingOptionId ?? null)
    : validOptionId(option.thinkingOptions, option.defaultThinkingOptionId)
      ? option.defaultThinkingOptionId
      : (option.thinkingOptions.find((item) => item.isDefault)?.id ??
        option.thinkingOptions[0]?.id ??
        null);
  return {
    provider: option.provider,
    modelId: option.modelId,
    modeId,
    thinkingOptionId,
  };
}

export function buildTempChatContext({
  workspaceName,
  directory,
  note,
  sources,
  maxChars = MAX_CONTEXT_CHARS,
}: TempChatContextBuildInput): BuiltTempChatContext {
  const boundedLimit = Math.max(1_000, maxChars);
  const sortedSources = [...sources]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_CONTEXT_AGENTS);
  const parts = [
    [
      "# Captured workspace context",
      "",
      `Workspace: ${workspaceName}`,
      `Directory: ${directory}`,
      "This is a bounded snapshot. Inspect the workspace read-only when the answer depends on current files or git state.",
    ].join("\n"),
  ];
  let length = parts[0]?.length ?? 0;
  const trimmedNote = note.trim();
  let includesNote = false;
  if (trimmedNote) {
    const noteChunk = `## Workspace note\n\n${truncate(trimmedNote, 12_000)}`;
    const appended = appendBounded(parts, noteChunk, length, boundedLimit);
    length = appended.length;
    includesNote = appended.added;
  }
  let sourceAgentCount = 0;
  for (const source of sortedSources) {
    const recentMessages = source.messages.slice(-MAX_MESSAGES_PER_AGENT);
    const transcript = recentMessages
      .map(
        (entry) =>
          `### ${entry.role === "user" ? "User" : "Assistant"}\n${truncate(entry.text.trim(), 4_000)}`,
      )
      .filter((entry) => !entry.endsWith("\n"))
      .join("\n\n");
    const chunk = [
      `## Agent: ${source.title}`,
      `${source.provider}${source.model ? `/${source.model}` : ""} · ${source.status}`,
      transcript || "No recent user or assistant messages were available.",
    ].join("\n\n");
    const appended = appendBounded(parts, chunk, length, boundedLimit);
    length = appended.length;
    if (!appended.added) break;
    sourceAgentCount += 1;
  }
  if (sourceAgentCount === 0) {
    appendBounded(
      parts,
      "## Agent transcripts\n\nNo other agent transcript was available.",
      length,
      boundedLimit,
    );
  }
  return {
    snapshot: parts.join("\n\n").slice(0, boundedLimit),
    sourceAgentCount,
    omittedAgentCount: Math.max(0, sources.length - sourceAgentCount),
    includesNote,
  };
}

export function wrapTempChatPrompt(context: string, question: string): string {
  return [
    CONTEXT_START,
    context.trim(),
    CONTEXT_END,
    QUESTION_START,
    question.trim(),
    QUESTION_END,
  ].join("\n");
}

export function shouldAttachTempChatContext(
  context: TempChatContextApplication,
  agentId: string | null,
): boolean {
  return (
    agentId === null ||
    context.appliedAgentId !== agentId ||
    context.appliedCapturedAt !== context.capturedAt
  );
}

export function visibleQuestionFromPrompt(prompt: string): string {
  const start = prompt.indexOf(QUESTION_START);
  if (start < 0) return prompt.trim();
  const questionStart = start + QUESTION_START.length;
  const end = prompt.indexOf(QUESTION_END, questionStart);
  return prompt.slice(questionStart, end < 0 ? undefined : end).trim();
}

export function projectTempChatTimeline(
  entries: readonly TempChatTimelineEntry[],
): TempChatVisibleMessage[] {
  return entries.flatMap((entry): TempChatVisibleMessage[] => {
    if (entry.item.type === "user_message" && entry.item.text) {
      const text = visibleQuestionFromPrompt(entry.item.text);
      return text ? [{ role: "user", text, timestamp: entry.timestamp }] : [];
    }
    if (entry.item.type === "assistant_message" && entry.item.text) {
      return [
        {
          role: "assistant",
          text: entry.item.text,
          timestamp: entry.timestamp,
        },
      ];
    }
    if (entry.item.type === "error" && entry.item.message) {
      return [
        { role: "error", text: entry.item.message, timestamp: entry.timestamp },
      ];
    }
    return [];
  });
}

function validOptionId(
  options: readonly { id: string }[],
  value: string | null | undefined,
): value is string {
  return (
    value !== null &&
    value !== undefined &&
    options.some((item) => item.id === value)
  );
}

function appendBounded(
  parts: string[],
  chunk: string,
  currentLength: number,
  limit: number,
): { added: boolean; length: number } {
  const separatorLength = parts.length > 0 ? 2 : 0;
  const remaining = limit - currentLength - separatorLength;
  if (remaining < 160) return { added: false, length: currentLength };
  const value = truncate(chunk, remaining);
  parts.push(value);
  return {
    added: true,
    length: currentLength + separatorLength + value.length,
  };
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  if (limit <= 1) return value.slice(0, limit);
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
