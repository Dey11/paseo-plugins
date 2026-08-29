# Workspace Companion

Workspace Companion adds two Paseo tools:

- **Notes**, a Markdown note attached to the current workspace, with Write and Preview modes, auto-saving preview checklists, and optional agent refinement.
- **Agent board**, one draggable board for Running, Unreviewed, Recheck, Error, and Approved workspaces, with real Paseo workspace archiving.

## Install

From the repository root:

```bash
bun install --frozen-lockfile
bun run --filter workspace-companion typecheck
paseo plugin install "$PWD/plugins/workspace-companion"
paseo plugin ls
```

Open **Agent board** in the sidebar. Open **Workspace notes** from the Explorer **+** menu or the Command Center. Notes opens in the right-side Explorer beside Changes and Files.

## Stored data

Workspace notes and board state live under:

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
- A task line such as `- [ ] Test checkout` becomes a checkbox in Preview. Selecting it updates the Markdown and immediately saves the entire current note, including any other unsaved edits.
- Selecting an HTTP or HTTPS link in Preview opens it in the operating system browser instead of Paseo's embedded browser pane.
- **Refine with agent** uses the most recently updated agent in the workspace. It loads the result as an unsaved draft for you to review.

## Verify and debug

```bash
bun test plugins/workspace-companion
bun run --filter workspace-companion typecheck
paseo plugin reload workspace-companion
paseo plugin logs workspace-companion
```
