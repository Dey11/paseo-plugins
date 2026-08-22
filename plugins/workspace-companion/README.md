# Workspace Companion

Workspace Companion adds three Paseo tools:

- **Notes**, a Markdown note attached to the current workspace, with Write and Preview modes and optional agent refinement.
- **Agent board**, one draggable board for Running, Unreviewed, Recheck, Error, and Approved workspaces, with real Paseo workspace archiving.
- **QA review**, an on-demand manual test plan built from the focused agent's transcript and the current workspace changes.

The plugin does not perform code review. QA plans name the screens and flows a person should exercise, with concrete steps and product-level risks to watch.

## Install

From the repository root:

```bash
bun install --frozen-lockfile
bun run --filter workspace-companion typecheck
paseo plugin install "$PWD/plugins/workspace-companion"
paseo plugin ls
```

Open **Agent board** in the sidebar. Open **Notes** and **QA review** from an agent tab or the Command Center.

## Configure QA generation

Generating a QA plan creates a temporary child agent in the same workspace. The child reads the focused agent's projected transcript and inspects the working tree. It archives itself when finished.

The default agent configuration is:

```text
provider: codex/gpt-5.6-sol
mode: auto-review
thinking: high
```

To use IDs available on another daemon, create `~/.config/paseo-plugins/workspace-companion.env`:

```bash
PASEO_QA_PROVIDER=codex/gpt-5.5
PASEO_QA_MODE=auto-review
PASEO_QA_THINKING=high
```

Environment variables with the same names take precedence over the file. Reload the plugin after changing its configuration:

```bash
paseo plugin reload workspace-companion
```

## Stored data

Workspace notes, board state, and generated QA plans live under:

```text
$PASEO_HOME/plugin-data/workspace-companion/
```

`PASEO_HOME` defaults to `~/.paseo`. Workspace IDs are hashed before they become filenames. Stores use owner-only directories and files and write updates atomically.

## Behavior and limits

- Running and Error come from live Paseo workspace and agent state. They cannot be assigned manually.
- Desktop and web clients support drag-and-drop. The quiet **Move to** actions remain available for review-state changes.
- Drag a card onto the **Archive** target in the board header to archive the actual Paseo workspace. The card disappears immediately and returns if Paseo rejects the request. Archiving closes the workspace runtime.
- Touch and keyboard users can press **Archive** on a card and then **Confirm archive**. Archive is an action, not a sixth board status, so archived workspaces do not remain on the active board.
- Notes are private to the daemon until you send or attach their contents elsewhere.
- QA generation sends transcript and workspace evidence to the configured coding-agent provider.
- Paseo does not yet let plugins add permanent controls to its built-in right-pane navigation. The plugin registers panel types and Command Center actions instead.

## Verify and debug

```bash
bun test plugins/workspace-companion
bun run --filter workspace-companion typecheck
paseo plugin reload workspace-companion
paseo plugin logs workspace-companion
```
