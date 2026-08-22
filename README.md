# Paseo Productivity Plugins

Four trusted local plugins that extend Paseo with workspace notes and review workflows, a reusable prompt library, Linear issue tools, and safe development-port controls.

## Plugins

- `workspace-companion` — Markdown notes, a unified draggable workspace board, and transcript-aware manual QA plans.
- `prompt-library` — reusable prompts in the sidebar and composer attachment picker.
- `linear` — direct Linear issue search, comments, and status/priority updates with confirmation.
- `dev-ports` — workspace-scoped listening ports, system-browser links, safe `SIGTERM`, and private Tailscale Serve controls.

## Development

```bash
bun install
bun run test
bun run typecheck
```

Install or reload one plugin with Paseo's CLI:

```bash
paseo plugin install ./plugins/workspace-companion
paseo plugin reload workspace-companion
```

The plugins persist private state below `~/.paseo/plugin-data/`. The Linear plugin reads `LINEAR_API_KEY` from the daemon environment or, on this development machine, the documented hosting credential file. It never returns or logs the key.

See [docs/usage.md](docs/usage.md) for the user-facing workflows and safety behavior.
