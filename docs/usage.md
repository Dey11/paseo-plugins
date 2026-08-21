# Using the plugins

All four plugins are installed against the local Paseo daemon. If the client was already open, refresh its plugin surfaces or reconnect the client so the new navigation items appear.

## Workspace Companion

- Open **Notes** from a workspace's right panel or the command center. Edit Markdown in **Source**, inspect it in **Preview**, and save it to the daemon.
- **Ask agent for draft** sends the current note to the most recently active workspace agent. The returned Markdown stays as an unsaved draft until you review and save it.
- Open **Agent board** from the sidebar. Active work remains in **Working**; finished work can be moved among **Unreviewed**, **Reviewed**, **Recheck**, and **Approved** with the card actions.
- Open **Review** from an agent panel. **Generate review plan** analyzes the current Git diff. **Start independent review** creates a child reviewer with Sol, high thinking, and auto-review mode.

## Prompt Library

- Open **Prompt library** from the sidebar to create, edit, tag, search, or delete prompts.
- In any composer, open the attachment picker and choose **Prompt library**. Selecting an item attaches a snapshot of its prompt text to that message.

## Linear

- Open **Linear** from an agent's right panel or command center. Search by issue text, open an issue, review comments, and open the canonical Linear URL.
- Choosing a status, priority, or comment creates a confirmation card. Nothing is written to Linear until **Confirm update** is pressed.
- Linear issues are also available from the composer attachment picker.

## Dev Ports

- Open **Dev ports** from the sidebar. The list includes only listening processes owned by the daemon user whose current directory is inside a registered Paseo workspace.
- **Stop process** requires confirmation, revalidates the process, and sends `SIGTERM` once. A surviving process is reported and is never force-killed.
- **Share on tailnet** creates a private Tailscale Serve URL using the same port. It does not enable Funnel. **Stop sharing** removes that port's mapping.
