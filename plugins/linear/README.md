# Linear

The Linear plugin adds a workspace panel for:

- Searching issues by text with Previous/Next pagination
- Reading Markdown-formatted issue descriptions and comments
- Opening the canonical issue in the operating system browser
- Changing status, priority, or assignee
- Adding comments

Every write creates a confirmation card. Linear receives nothing until you press **Confirm update**. The assignee picker lists active, assignable members of the issue's team and supports returning the issue to **Unassigned**.

Descriptions and recent comments render headings, bold and italic text, links, lists, task markers, blockquotes, inline code, and fenced code blocks. Links use the operating system browser.

## Install

From the repository root:

```bash
bun install --frozen-lockfile
bun run --filter linear typecheck
paseo plugin install "$PWD/plugins/linear"
paseo plugin ls
```

Open **Linear** from the workspace **+** menu or the Command Center.

## Configure the API key

Create a Linear personal API key. Put it in the daemon process environment as `LINEAR_API_KEY`, or create:

```text
~/.config/paseo-plugins/linear.env
```

with:

```bash
LINEAR_API_KEY=lin_api_your_key_here
```

Then restrict and reload it:

```bash
chmod 600 ~/.config/paseo-plugins/linear.env
paseo plugin reload linear
```

The environment variable takes precedence over the file. The plugin reads only the named key and never returns or logs it.

## Permissions and safety

The Linear key controls which teams and issues the plugin can access. Use a key belonging to the intended account and revoke it from Linear if the daemon is compromised.

The plugin sends GraphQL requests directly to Linear. It redacts key-shaped strings from surfaced errors. Automated tests never call a live Linear account.

## Verify and debug

```bash
bun test plugins/linear
bun run --filter linear typecheck
paseo plugin reload linear
paseo plugin logs linear
```

If the panel says Linear is not configured, check the key on the daemon machine rather than the client machine.
