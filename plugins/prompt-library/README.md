# Prompt Library

Prompt Library stores reusable prompts in Paseo and exposes them in two places:

- A sidebar page for creating, editing, tagging, searching, and deleting prompts.
- The composer attachment picker, where a saved prompt can be attached to any message on the selected host.

## Install

From the repository root:

```bash
bun install --frozen-lockfile
bun run --filter prompt-library typecheck
paseo plugin install "$PWD/plugins/prompt-library"
paseo plugin ls
```

Open **Prompt library** in the sidebar or Command Center. In a composer, open the attachment picker and choose **Prompt library**.

## How attachments work

Selecting a saved prompt attaches a text snapshot to the current message. Editing the library entry later does not change an attachment already added to a draft or sent to an agent.

Search matches prompt titles, tags, and content. The attachment picker returns at most 50 matching prompts.

## Stored data

Prompts live at:

```text
$PASEO_HOME/plugin-data/prompt-library/prompts.json
```

`PASEO_HOME` defaults to `~/.paseo`. The plugin creates owner-only directories and files and replaces the store atomically.

The library is local to one daemon. It does not sync prompts between separate daemons.

## Verify and debug

```bash
bun test plugins/prompt-library
bun run --filter prompt-library typecheck
paseo plugin reload prompt-library
paseo plugin logs prompt-library
```
