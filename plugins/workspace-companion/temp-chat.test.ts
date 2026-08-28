import { describe, expect, test } from "bun:test";
import {
  buildTempChatContext,
  chooseInitialTempChatSelection,
  findActiveTempChatAgent,
  isTempChatAgent,
  projectTempChatTimeline,
  selectionForModel,
  shouldAttachTempChatContext,
  shouldSendTempChatKey,
  TEMP_CHAT_LABEL,
  TEMP_CHAT_LABEL_VALUE,
  type TempChatAgentLike,
  type TempChatModelOption,
  visibleQuestionFromPrompt,
  wrapTempChatPrompt,
} from "./temp-chat";

const models: TempChatModelOption[] = [
  {
    provider: "codex",
    providerLabel: "Codex",
    modelId: "gpt-5.6",
    modelLabel: "GPT-5.6",
    isDefault: true,
    defaultModeId: "plan",
    modes: [
      { id: "plan", label: "Plan" },
      { id: "build", label: "Build" },
    ],
    defaultThinkingOptionId: "high",
    thinkingOptions: [
      { id: "medium", label: "Medium" },
      { id: "high", label: "High", isDefault: true },
    ],
  },
  {
    provider: "opencode",
    providerLabel: "OpenCode",
    modelId: "deepseek",
    modelLabel: "DeepSeek",
    defaultModeId: "ask",
    modes: [{ id: "ask", label: "Ask" }],
    defaultThinkingOptionId: null,
    thinkingOptions: [],
  },
];

describe("Temp Chat agents", () => {
  test("selects the newest active labeled agent in one workspace", () => {
    const agents = [
      agent({ id: "old", updatedAt: "2026-08-28T10:00:00.000Z" }),
      agent({ id: "other-workspace", workspaceId: "workspace-2" }),
      agent({ id: "normal", labels: {} }),
      agent({ id: "archived", archivedAt: "2026-08-28T12:00:00.000Z" }),
      agent({ id: "new", updatedAt: "2026-08-28T11:00:00.000Z" }),
    ];

    expect(findActiveTempChatAgent(agents, "workspace-1")?.id).toBe("new");
    expect(isTempChatAgent(agents[2]!)).toBe(false);
  });

  test("inherits a matching recent workspace agent configuration", () => {
    const selection = chooseInitialTempChatSelection(
      models,
      [
        agent({
          id: "primary",
          labels: {},
          provider: "codex",
          model: "gpt-5.6",
          currentModeId: "build",
          thinkingOptionId: "medium",
        }),
      ],
      "workspace-1",
    );

    expect(selection).toEqual({
      provider: "codex",
      modelId: "gpt-5.6",
      modeId: "build",
      thinkingOptionId: "medium",
    });
  });

  test("falls back to model defaults when preferred values are unavailable", () => {
    expect(
      selectionForModel(models[0]!, {
        modeId: "missing",
        thinkingOptionId: "missing",
      }),
    ).toEqual({
      provider: "codex",
      modelId: "gpt-5.6",
      modeId: "plan",
      thinkingOptionId: "high",
    });
  });
});

describe("Temp Chat context", () => {
  test("captures notes and recent agent messages in activity order", () => {
    const context = buildTempChatContext({
      workspaceName: "Checkout",
      directory: "/work/checkout",
      note: "- Verify guest checkout",
      sources: [
        {
          id: "older",
          title: "Older work",
          provider: "codex",
          model: "gpt-5.6",
          status: "idle",
          updatedAt: "2026-08-28T10:00:00.000Z",
          messages: [{ role: "assistant", text: "Older answer" }],
        },
        {
          id: "newer",
          title: "Payment flow",
          provider: "codex",
          model: "gpt-5.6",
          status: "running",
          updatedAt: "2026-08-28T11:00:00.000Z",
          messages: [
            { role: "user", text: "Move validation earlier" },
            { role: "assistant", text: "Validation now precedes payment" },
          ],
        },
      ],
    });

    expect(context.includesNote).toBe(true);
    expect(context.sourceAgentCount).toBe(2);
    expect(context.omittedAgentCount).toBe(0);
    expect(context.snapshot).toContain("Workspace: Checkout");
    expect(context.snapshot).toContain("Verify guest checkout");
    expect(context.snapshot.indexOf("Payment flow")).toBeLessThan(
      context.snapshot.indexOf("Older work"),
    );
    expect(context.snapshot).toContain("Validation now precedes payment");
  });

  test("bounds context and reports omitted agents", () => {
    const context = buildTempChatContext({
      workspaceName: "Large workspace",
      directory: "/work/large",
      note: "n".repeat(20_000),
      maxChars: 1_500,
      sources: Array.from({ length: 12 }, (_, index) => ({
        id: `agent-${index}`,
        title: `Agent ${index}`,
        provider: "codex",
        model: "gpt-5.6",
        status: "idle",
        updatedAt: new Date(Date.UTC(2026, 7, 28, 12, index)).toISOString(),
        messages: [{ role: "assistant" as const, text: "x".repeat(800) }],
      })),
    });

    expect(context.snapshot.length).toBeLessThanOrEqual(1_500);
    expect(context.omittedAgentCount).toBeGreaterThan(0);
  });

  test("attaches a snapshot only for a new agent or a refreshed capture", () => {
    const applied = {
      capturedAt: "2026-08-28T12:00:00.000Z",
      appliedAgentId: "temp-1",
      appliedCapturedAt: "2026-08-28T12:00:00.000Z",
    };

    expect(shouldAttachTempChatContext(applied, null)).toBe(true);
    expect(shouldAttachTempChatContext(applied, "temp-1")).toBe(false);
    expect(
      shouldAttachTempChatContext(
        { ...applied, capturedAt: "2026-08-28T12:30:00.000Z" },
        "temp-1",
      ),
    ).toBe(true);
  });
});

describe("Temp Chat visible timeline", () => {
  test("hides the context envelope and keeps the question", () => {
    const prompt = wrapTempChatPrompt(
      "private context",
      "Why did this change?",
    );

    expect(prompt).toContain("private context");
    expect(visibleQuestionFromPrompt(prompt)).toBe("Why did this change?");
    expect(visibleQuestionFromPrompt("A normal follow-up")).toBe(
      "A normal follow-up",
    );
  });

  test("projects only conversation and errors", () => {
    const prompt = wrapTempChatPrompt("context", "Explain the flow");
    const messages = projectTempChatTimeline([
      {
        item: { type: "reasoning", text: "hidden reasoning" },
        timestamp: "1",
      },
      { item: { type: "user_message", text: prompt }, timestamp: "2" },
      {
        item: { type: "assistant_message", text: "The flow is…" },
        timestamp: "3",
      },
      { item: { type: "error", message: "Provider stopped" }, timestamp: "4" },
    ]);

    expect(messages).toEqual([
      { role: "user", text: "Explain the flow", timestamp: "2" },
      { role: "assistant", text: "The flow is…", timestamp: "3" },
      { role: "error", text: "Provider stopped", timestamp: "4" },
    ]);
  });
});

describe("Temp Chat composer", () => {
  test("sends Enter on web while preserving Shift+Enter and composition", () => {
    expect(
      shouldSendTempChatKey({
        key: "Enter",
        platform: "web",
        shiftKey: false,
        isComposing: false,
      }),
    ).toBe(true);
    expect(
      shouldSendTempChatKey({
        key: "Enter",
        platform: "web",
        shiftKey: true,
        isComposing: false,
      }),
    ).toBe(false);
    expect(
      shouldSendTempChatKey({
        key: "Enter",
        platform: "web",
        shiftKey: false,
        isComposing: true,
      }),
    ).toBe(false);
  });

  test("leaves native submission to TextInput submit behavior", () => {
    expect(
      shouldSendTempChatKey({
        key: "Enter",
        platform: "ios",
        shiftKey: false,
        isComposing: false,
      }),
    ).toBe(false);
  });
});

function agent(overrides: Partial<TempChatAgentLike>): TempChatAgentLike {
  return {
    id: "temp-chat",
    workspaceId: "workspace-1",
    provider: "codex",
    model: "gpt-5.6",
    currentModeId: "plan",
    thinkingOptionId: "high",
    title: "Temp chat",
    status: "idle",
    updatedAt: "2026-08-28T10:30:00.000Z",
    labels: { [TEMP_CHAT_LABEL]: TEMP_CHAT_LABEL_VALUE },
    archivedAt: null,
    ...overrides,
  };
}
