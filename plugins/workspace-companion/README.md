# Workspace Companion

Workspace Companion adds three Paseo tools:

- **Notes**, a Markdown note attached to the current workspace, with Write and Preview modes, auto-saving preview checklists, and optional agent refinement.
- **Temp chat**, a persistent, workspace-specific clarification chat backed by its own Paseo agent. It uses a manually refreshed snapshot of workspace notes and recent agent conversations without writing to the primary thread.
- **Agent board**, one draggable board for Running, Unreviewed, Recheck, Error, and Approved workspaces, with real Paseo workspace archiving.

## Install

From the repository root:

```bash
bun install --frozen-lockfile
bun run --filter workspace-companion typecheck
paseo plugin install "$PWD/plugins/workspace-companion"
paseo plugin ls
```

Open **Agent board** in the sidebar. Open **Workspace notes** or **Temp chat** from the Explorer **+** menu or the Command Center. Both panels open in the right-side Explorer beside Changes and Files.

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
- **Refine with agent** uses the most recently updated agent in the workspace. It loads the result as an unsaved draft for you to review.
- Temp Chat creates one labeled Paseo agent in the current workspace. Its messages do not enter or steer the primary agent thread.
- Before the first question, choose the model, mode, and reasoning level. Those choices stay fixed for that chat; archive it to begin again with a different configuration.
- The first question captures the workspace note and bounded recent user/assistant messages from up to ten other workspace agents. **Refresh context** replaces that snapshot without sending a model turn; the refreshed snapshot is applied with the next question.
- Temp Chat is instructed to perform read-only clarification. Context can still contain private workspace material and is stored under the daemon's plugin data directory and in the dedicated agent transcript.
- **Archive** requires confirmation, soft-deletes the dedicated agent, clears the active context snapshot, and returns the panel to a new-chat state. The transcript remains recoverable through Paseo's normal archive/history surfaces.

## Verify and debug

```bash
bun test plugins/workspace-companion
bun run --filter workspace-companion typecheck
paseo plugin reload workspace-companion
paseo plugin logs workspace-companion
```
