# Workspace Temp Chat

## Goal

Add a workspace-specific Temp Chat to Workspace Companion so a user can ask clarifying questions with the workspace's current context without adding messages to the primary agent thread.

## Context

Paseo plugins can register Explorer panels and use the TypeScript SDK to create, message, observe, and archive normal agents. There is no separate hidden-chat primitive, so Temp Chat is modeled as a dedicated labeled agent in the current workspace. The agent transcript supplies durable chat history; plugin-owned state supplies the context snapshot used by that chat.

## Scope

- Register **Temp chat** as an Explorer-only workspace panel and Command Center action.
- Maintain at most one active Temp Chat agent per workspace.
- Capture the workspace note and recent user/assistant transcript context from other workspace agents.
- Capture context automatically before the first question. Replace it only when the user selects **Refresh context**.
- Let the user select provider/model, mode, and reasoning level before the chat starts.
- Render the Temp Chat conversation without exposing the context envelope sent to the agent.
- Archive the active Temp Chat agent after explicit confirmation, then return the panel to a fresh-chat state.

## Non-goals

- A hidden or ephemeral Paseo session type.
- Writing messages into, steering, or otherwise changing the workspace's primary agent thread.
- Automatic context refresh on every question.
- Editing files or mutating external services from Temp Chat.
- Restoring or browsing archived Temp Chats inside the plugin panel; archived agents remain available through Paseo's normal archive/history surfaces.
- Reproducing Paseo's internal composer or provider-picker components, which are not exported to this plugin's current client runtime.

## Constraints

- The panel must work in web, desktop, iOS, and Android hosts using only the plugin runtime's React Native surface.
- Context must be bounded before it is sent to a model. The snapshot includes the workspace note plus recent user and assistant messages from the most recently active non-Temp-Chat agents.
- Context snapshots and chat metadata live under Paseo's plugin data directory, not inside the project checkout.
- Temp Chat uses a read-only system instruction. Provider mode still controls the provider session, but the feature itself is for explanation and clarification rather than implementation.
- High-frequency chat interactions remain immediate. No custom entrance, send, refresh, or scrolling animation is added; platform press and focus feedback are sufficient.

## Chosen architecture

`temp-chat.ts` owns the pure domain rules: identifying the active labeled agent, choosing sensible provider defaults, shaping the visible timeline, building a bounded context snapshot, and wrapping/unwrapping prompts so internal context is not rendered as a user message.

`temp-chat.client.tsx` owns the Explorer panel. It discovers the active agent through the Paseo SDK, polls its active snapshot and projected timeline, creates an agent on the first send, and archives it on confirmation. Model controls lock once the chat exists; archive and start a new chat to choose another configuration.

Workspace context is persisted through small Zod-validated RPCs backed by the existing atomic JSON store. Refreshing context updates that stored snapshot without sending a message. The first question and the first question after each refresh carry the snapshot in a delimited prompt envelope; later questions rely on the dedicated agent's retained session context. Applied snapshot metadata keeps that behavior deterministic across reconnects without repeatedly spending tokens on the same context.

## Isolated UI mock

The Explorer panel stays visually flat and dense, matching Paseo's Files/Changes utility surfaces rather than presenting a stack of outlined cards.

### Empty

```text
Temp chat                                      ···
Ask about this workspace without changing the main thread

Context  Not captured                   Refresh context

        Ask for clarification, decisions, or next steps.
        The first message captures workspace context.

[ Model: Codex · GPT-5.6 ] [ Mode: Full access ]
[ Reasoning: High ]

Message Temp chat…                                  [Send]
```

### Active

```text
Temp chat                              Refresh context  Archive
Context updated 2:14 PM · 3 agents · notes

                     Why did the checkout flow change?

The transcript indicates the validation moved before payment because…

Message Temp chat…                                  [Send]
```

### Working

```text
…message history…

Thinking…

Message Temp chat…                           [Working]
```

The composer is disabled while the dedicated agent is running so questions cannot be accidentally queued into the same turn.

### Archive confirmation

```text
Archive this chat?
Its agent and transcript remain in Paseo's archive.

                                      Cancel  Archive chat
```

## Alternatives considered

- Reuse the current workspace agent: rejected because it would pollute or steer the primary conversation.
- Keep context only in React state: rejected because it would disappear across panel remounts and clients.
- Refresh context every message: rejected by product choice; manual refresh gives explicit control over token use and context changes.
- Send a standalone refresh message to the agent: rejected because it creates an unnecessary assistant acknowledgement and visible transcript noise.
- Build a custom backend model client: rejected because Paseo already owns provider authentication, lifecycle, streaming, and archive semantics.

## Implementation phases

1. Add context contracts, persistence, and pure Temp Chat domain helpers.
2. Add the isolated Explorer panel and register its command.
3. Add focused tests and update user documentation.
4. Run formatting, focused tests, strict typecheck, and inspect the complete diff.

## Validation

- Unit tests for labeled-agent selection, provider defaults, prompt envelope parsing, context bounds, visible timeline projection, and applied-context metadata.
- Existing Workspace Companion tests remain green.
- Strict TypeScript checks pass for Workspace Companion and the root suite.
- Plugin reload and runtime-log inspection are performed without restarting the daemon.

## Risks

- Paseo's plugin and SDK contracts are experimental and may require regenerated declarations after an upgrade.
- Context from many long-running agents must be truncated; the UI reports source counts, and the system prompt tells the agent that the snapshot is bounded.
- Provider modes do not guarantee read-only behavior. The system instruction is explicit, and the UI describes Temp Chat as a clarification surface rather than an implementation agent.

## Status

Implemented and locally verified on 2026-08-28. Workspace Companion passes 27 focused tests, the complete 47-test plugin suite, formatting, and strict typechecking for all three plugins. The plugin reloads as `running` with a clean `Plugin ready` log and no daemon restart.
