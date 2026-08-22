# Paseo productivity plugin suite

## Goal

Add four trusted local Paseo plugins: workspace notes and review workflows, a reusable prompt library, direct Linear issue tools, and safe development-port controls.

## Context

Paseo 0.5 exposes global surfaces, sidebar items, workspace/agent panels, command-center actions, attachment sources, and validated backend RPC handlers. Plugins are trusted local code and can use Node APIs on the daemon side, so privileged behavior must remain narrow and auditable.

## Scope

1. Workspace-scoped Markdown notes with source and preview modes; the current agent can propose a replacement note that the user reviews before saving.
2. One workspace board with exactly five columns: live `Running` and `Error`, plus plugin-owned `Unreviewed`, `Approved`, and `Recheck` review states.
3. A global prompt library exposed through both a sidebar surface and composer attachment picker.
4. A direct Linear GraphQL panel for search, issue detail, comments, status, and priority updates. Every write requires a second explicit confirmation.
5. A manual review plan generated from the current Git diff, plus an optional action that creates an independent Sol reviewer agent.
6. Workspace-scoped listening-port discovery, safe `SIGTERM`, private Tailscale Serve controls, and forwarded links opened by the operating system browser.

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
- Running and Error remain live states: they can be reordered within their own columns but cannot accept cross-column moves. Review cards can move among the three review columns, and touch or keyboard users retain explicit review-state actions.
- Plugin state lives in `~/.paseo/plugin-data/<plugin-id>` and is written atomically.

## Chosen architecture

Each plugin is a separate deep module with one responsibility and a small RPC interface. Shared contracts sit at the client/server seam. Filesystem, Git, Linear, `/proc`, and Tailscale details stay inside server adapters. Client surfaces render validated results and hold only temporary confirmation state.

The workspace companion renders one card per workspace. A real agent or workspace failure takes precedence, followed by active work, then the stored review state. This keeps `Running` and `Error` truthful without mutating Paseo's native lifecycle. Review markers and the order of all five columns are persisted together in one atomic workflow document. The client applies placements optimistically and pauses polling while the daemon saves, so cards land immediately without a refetch snap-back. Desktop/web cards use the platform's drag events because Paseo's plugin client runtime does not expose its internal `@dnd-kit` packages; compact and keyboard flows use quiet “Move to” actions.

Global plugin surfaces do not receive Paseo's internal router or external-link helper. Workspace cards therefore use Paseo's canonical host/workspace URL on web and its `paseo://` deep link on native. Dev Ports calls the desktop preload's allowlisted `opener.openUrl` bridge when present, then falls back to a normal browser tab or native Linking.

## Alternatives considered

- One large plugin: rejected because it combines unrelated credentials and process privileges, increases blast radius, and makes independent disable/reload impossible.
- Workspace-file notes: rejected because checkouts and worktrees should not be dirtied by private operational notes.
- Automatic Linear writes: rejected because external mutations need explicit intent.
- Generic PID killing: rejected because PID reuse and unrelated same-user processes make it unsafe.
- SSH tunnels or Funnel: rejected in favor of existing private tailnet connectivity and Tailscale Serve.
- A bundled drag library: rejected because arbitrary client modules fail Paseo plugin evaluation. Native HTML drag is paired with explicit accessible movement instead.

## Implementation phases

1. Scaffold the repository and four plugin packages; establish contracts and pure domain tests.
2. Build Workspace Companion notes, board, review states, and deterministic review plan.
3. Build Prompt Library storage, management surface, and attachment search.
4. Build Linear GraphQL adapter and confirmed mutations.
5. Build Dev Ports discovery, safety classifier, process controls, and Tailscale adapter.
6. Typecheck, test, install, reload, inspect daemon health/logs, and review the complete diff.

## Validation

- Focused Bun tests for concurrent persistence, board-state precedence, review workflow transitions and legacy-state migration, workspace routes, review heuristics, Linear credential/confirmation/error behavior, external browser selection, port parsing/safety, Tailscale command construction, and mapping ownership. No test mutates a live Linear account or Tailscale configuration.
- Strict TypeScript checks in all four packages.
- Paseo plugin installation/reload without daemon restart.
- Daemon status and plugin list/log inspection after installation.

## Risks

- Paseo's plugin interface is experimental and may change between beta releases.
- Linear GraphQL schema changes can require query updates; the adapter surfaces GraphQL errors verbatim without credentials.
- Linux process metadata can disappear between discovery and action; stop/share handlers therefore revalidate immediately before acting.
- Tailscale Serve may require tailnet policy or HTTPS enablement; the UI should report the CLI error without falling back to public exposure.

## Status

Implemented and locally installed on 2026-08-21. The Agent Board and Dev Ports native-quality pass was completed on 2026-08-22 against Paseo's current public plugin contract and repository design guidance. On 2026-08-22, Agent Board ordering was made persistent and movement optimistic. All 34 focused tests, all four strict typechecks, and formatting pass. Workspace Companion reloads as `running`, and its retained log ends in `Plugin ready` without errors.
