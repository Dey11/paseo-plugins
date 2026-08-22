# Paseo Productivity Plugins — AGENTS.md

This repository contains trusted local Paseo plugins for workspace notes and review workflows, reusable prompts, Linear issue work, and development-port management. The plugins run against a local Paseo daemon and are intended for one developer controlling local or remote workspaces.

## Non-Negotiable Core Principles

- Treat every plugin as trusted, unsandboxed code. Keep each plugin's permissions and responsibilities narrow.
- Keep daemon-owned data under Paseo's home directory; never place plugin state inside a user's workspace.
- Validate every RPC input and output with Zod and keep client/server contracts shared.
- Require an explicit confirmation step for every Linear mutation.
- Only stop a same-user process whose current working directory is inside a currently registered Paseo workspace. Send `SIGTERM` only.
- Use Tailscale Serve for private tailnet access. Never enable Funnel.
- Never log or return credentials.

## Note

User instructions take precedence. Preserve unrelated files and running processes. Do not restart the Paseo daemon. Prefer small, reversible changes and keep this plan current in `docs/plans/`.

## Project Glossary

- **Workspace Companion**: Notes, one unified workspace board, and transcript-aware manual QA plans.
- **Prompt Library**: Globally stored reusable prompts exposed in the sidebar and composer attachment picker.
- **Linear**: Direct GraphQL integration for reading and explicitly confirmed issue mutations.
- **Dev Ports**: Same-user workspace process discovery, safe termination, and Tailscale Serve controls.
- **Board state**: `running` and `error` are derived from Paseo activity; `unreviewed`, `recheck`, and `approved` are plugin-owned review markers.
- **Paseo home**: The daemon-owned configuration directory, normally `~/.paseo`.

## Development & Execution Rules

- Use Bun for dependency installation, scripts, and tests.
- Each directory under `plugins/` is independently installable and must keep its own `paseo-plugin.json`, `package.json`, and `tsconfig.json`.
- Client modules must end in `.client.tsx` and may import only React, React Native, TanStack Query, Zod, and Paseo's plugin/client interfaces.
- Server-only modules must end in `.server.ts` when they import Node built-ins or access credentials, processes, Git, or the filesystem.
- Keep shared RPC contracts in ordinary `.ts` files that are safe for both client and server imports.
- Prefer pure domain functions behind small interfaces; test those functions with `bun test`.
- Run `bun run typecheck` and `bun test` in every plugin before installation or reload.
- Install with `paseo plugin install <directory>` and reload with `paseo plugin reload <id>`; never restart the daemon.
- Do not exercise live Linear writes in automated tests.
- Do not kill unknown processes, escalate to `SIGKILL`, or change an existing Tailscale Serve mapping without explicit user action.
