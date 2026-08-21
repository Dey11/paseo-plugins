# Using the plugins

All four plugins are installed against the local Paseo daemon. If the client was already open, refresh its plugin surfaces or reconnect the client so the new navigation items appear.

## Workspace Companion

- Open **Notes** from an agent's right panel or the command center. Edit Markdown in **Source**, inspect it in **Preview**, and save it to the daemon.
- **Ask agent for draft** sends the current note to the agent whose panel is open. The returned Markdown stays as an unsaved draft until you review and save it.
- Open **Agent board** from the sidebar. Agents are grouped by live state under **Running**, **Needs attention**, **Idle**, and **Error**. Finished work can be moved among **Unreviewed**, **Reviewed**, **Recheck**, and **Approved** with the card actions.
- Open **Review** from an agent panel. **Generate review plan** analyzes the current Git diff. **Start independent review** creates a child reviewer with Sol, high thinking, and auto-review mode.

## Prompt Library

- Open **Prompt library** from the sidebar to create, edit, tag, search, or delete prompts.
- In any composer, open the attachment picker and choose **Prompt library**. Selecting an item attaches a snapshot of its prompt text to that message.

## Linear

- Open **Linear** from an agent's right panel or command center. Search by issue text, page through all matching issues, open an issue, review comments, and open the canonical Linear URL.
- Choosing a status, priority, or comment creates a confirmation card. Nothing is written to Linear until **Confirm update** is pressed.

## Dev Ports

- Open **Dev ports** from the sidebar. The list includes only listening processes owned by the daemon user whose current directory is inside a registered Paseo workspace.
- Open **Dev ports** from an agent's right panel to see the same controls filtered to that workspace.
- **Stop process** requires confirmation, revalidates the process, and sends `SIGTERM` once. A surviving process is reported and is never force-killed.
- **Share on tailnet** creates a private Tailscale Serve URL using the same port. It does not enable Funnel. **Stop sharing** removes that port's mapping.
- The plugin records mappings it creates and refuses to remove a pre-existing or externally managed Tailscale mapping.
