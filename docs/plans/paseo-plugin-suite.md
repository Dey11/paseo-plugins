# Paseo productivity plugin suite

## Goal

Add four trusted local Paseo plugins: workspace notes and review workflows, a reusable prompt library, direct Linear issue tools, and safe development-port controls.

## Context

Paseo 0.5 exposes global surfaces, sidebar items, workspace/agent panels, command-center actions, attachment sources, and validated backend RPC handlers. Plugins are trusted local code and can use Node APIs on the daemon side, so privileged behavior must remain narrow and auditable.

## Scope

1. Workspace-scoped Markdown notes with source and preview modes; the current agent can propose a replacement note that the user reviews before saving.
2. An agent board grouped by native Paseo lifecycle and a plugin-owned review-state Kanban.
3. A global prompt library exposed through both a sidebar surface and composer attachment picker.
4. A direct Linear GraphQL panel for search, issue detail, comments, status, and priority updates. Every write requires a second explicit confirmation.
5. A manual review plan generated from the current Git diff, plus an optional action that creates an independent Sol reviewer agent.
6. Workspace-scoped listening-port discovery, safe `SIGTERM`, and private Tailscale Serve controls.

## Non-goals

- Replacing Paseo's native workspace lifecycle.
- Automatic review popovers or automatic reviewer creation.
- Killing processes outside registered workspaces or escalating to `SIGKILL`.
- Public exposure through Tailscale Funnel.
- Linear project administration, bulk edits, or automation.
- Cross-device cloud synchronization beyond the shared Paseo daemon.

## Constraints

- Client bundles may only use host-provided React, React Native, TanStack Query, Zod, and Paseo interfaces.
- The interface must work in Paseo's web, macOS, iOS, and Android hosts.
- High-frequency board and command interactions remain intentionally low-motion.
- Plugin state lives in `~/.paseo/plugin-data/<plugin-id>` and is written atomically.

## Chosen architecture

Each plugin is a separate deep module with one responsibility and a small RPC interface. Shared contracts sit at the client/server seam. Filesystem, Git, Linear, `/proc`, and Tailscale details stay inside server adapters. Client surfaces render validated results and hold only temporary confirmation state.

The workspace companion owns review states instead of mutating Paseo's native status model. Moving a card is exposed as an accessible “Move to” action because Paseo's current plugin client runtime does not expose a portable gesture library.

## Alternatives considered

- One large plugin: rejected because it combines unrelated credentials and process privileges, increases blast radius, and makes independent disable/reload impossible.
- Workspace-file notes: rejected because checkouts and worktrees should not be dirtied by private operational notes.
- Automatic Linear writes: rejected because external mutations need explicit intent.
- Generic PID killing: rejected because PID reuse and unrelated same-user processes make it unsafe.
- SSH tunnels or Funnel: rejected in favor of existing private tailnet connectivity and Tailscale Serve.

## Implementation phases

1. Scaffold the repository and four plugin packages; establish contracts and pure domain tests.
2. Build Workspace Companion notes, board, review states, and deterministic review plan.
3. Build Prompt Library storage, management surface, and attachment search.
4. Build Linear GraphQL adapter and confirmed mutations.
5. Build Dev Ports discovery, safety classifier, process controls, and Tailscale adapter.
6. Typecheck, test, install, reload, inspect daemon health/logs, and review the complete diff.

## Validation

- Focused Bun tests for persistence behavior, workflow transitions, review heuristics, Linear GraphQL errors, port parsing/safety, and Tailscale command construction.
- Strict TypeScript checks in all four packages.
- Paseo plugin installation/reload without daemon restart.
- Daemon status and plugin list/log inspection after installation.

## Risks

- Paseo's plugin interface is experimental and may change between beta releases.
- Linear GraphQL schema changes can require query updates; the adapter surfaces GraphQL errors verbatim without credentials.
- Linux process metadata can disappear between discovery and action; stop/share handlers therefore revalidate immediately before acting.
- Tailscale Serve may require tailnet policy or HTTPS enablement; the UI should report the CLI error without falling back to public exposure.

## Status

Implemented and locally installed on 2026-08-21. All four plugins pass focused tests and strict TypeScript checks, report `running`, and loaded without plugin-log errors. A final source review remains before handoff.
