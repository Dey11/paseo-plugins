# Using the plugins

The plugins are independently installable against a Paseo daemon. If a client was already open during installation, refresh or reconnect it so the new contributions appear.

## Workspace Companion

- Open **Workspace notes** from the workspace **+** menu or the Command Center. Edit Markdown in **Write**, inspect it in **Preview**, and save it to the daemon.
- Markdown task lines such as `- [ ] Test checkout` become interactive checkboxes in **Preview**. Selecting one updates the Markdown and immediately saves the entire current note, including any other unsaved edits.
- **Refine with agent** sends the current note to the most recently updated agent in that workspace. The returned Markdown stays as an unsaved draft until you review and save it.
- Open **Agent board** from the sidebar. There is one workspace board with **Running**, **Unreviewed**, **Recheck**, **Error**, and **Approved** columns. Drag cards to reorder any column on desktop/web; the order persists across reloads. Finished workspaces can also move among the three review columns, while Running and Error stay tied to live Paseo activity. Placements appear immediately while the daemon saves them. Use **Move to** for a non-drag review-state change, and select the card body to open its workspace.
- To archive a workspace on desktop/web, drag its card onto **Archive** in the board header. The board removes it immediately and restores it if Paseo rejects the request. Touch and keyboard users can press **Archive**, then **Confirm archive**, on the card. This archives the actual Paseo workspace and closes its runtime; Archive is not another board status.

## Linear

- Open **Linear** from the workspace **+** menu or Command Center. Search by issue text, use **Previous** and **Next** at the bottom to page through matching issues, open an issue, and review its comments.
- **Open in Linear** sends that issue's canonical URL to the operating system browser instead of Paseo's embedded browser pane.
- Issue descriptions and recent comments render Markdown headings, emphasis, links, lists, task markers, blockquotes, and inline or fenced code. Markdown links also open in the operating system browser.
- Choosing a status, priority, assignee, or comment creates a confirmation card. Nothing is written to Linear until **Confirm update** is pressed. The assignee picker contains active, assignable members of the issue's team.

## Dev Ports

- Open **Dev ports** from the sidebar. The list includes only listening processes owned by the daemon user whose current directory is inside a registered Paseo workspace.
- Open **Dev ports** from an agent's right panel to see the same controls filtered to that workspace.
- **Stop process** requires confirmation, revalidates the process, and sends `SIGTERM` once. A surviving process is reported and is never force-killed.
- **Share on tailnet** creates a private Tailscale Serve URL using the same port. It does not enable Funnel. **Stop sharing** removes that port's mapping.
- Select a shared URL to open it in the operating system browser. Paseo desktop uses its external opener instead of the small in-app browser pane.
- The plugin records mappings it creates and refuses to remove a pre-existing or externally managed Tailscale mapping.
