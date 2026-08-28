# Paseo plugins

Three local plugins for [Paseo](https://paseo.sh): workspace notes and an agent board, Linear issue work, and development-port controls.

> [!WARNING]
> Paseo plugins are experimental, trusted code. Server-side plugin code runs without a sandbox on the daemon machine. Read the source before installing it, and expect Paseo API changes to require updates.

## Included plugins

| Plugin                                             | What it adds                                                                                         | Extra requirement                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------- |
| [Workspace Companion](plugins/workspace-companion) | Workspace-tab Markdown notes and a draggable agent board with workspace archiving                    | None                                |
| [Linear](plugins/linear)                           | Paged issue search, comments, assignee, status, and priority changes in a workspace tab              | A Linear personal API key           |
| [Dev Ports](plugins/dev-ports)                     | Workspace port discovery, safe process stopping, browser links, and private Tailscale Serve controls | Linux daemon; Tailscale is optional |

Each plugin is independently installable. You do not need to enable all three.

## Quick start

Requirements:

- A current Paseo daemon and CLI with plugin support
- [Bun](https://bun.sh) for dependency installation and verification
- Git

Clone the repository on the machine that runs the Paseo daemon:

```bash
git clone https://github.com/Dey11/paseo-plugins.git
cd paseo-plugins
bun install --frozen-lockfile
bun run test
bun run typecheck
```

In Paseo, open **Settings → Plugins** and enable plugins. Then install only the directories you want:

```bash
paseo plugin install "$PWD/plugins/workspace-companion"
paseo plugin install "$PWD/plugins/linear"
paseo plugin install "$PWD/plugins/dev-ports"
paseo plugin ls
```

Every installed plugin should report `running`. Open the Command Center with **⌘K** on macOS or **Ctrl+K** on Windows and Linux to find its actions.

See the [installation guide](docs/installation.md) for remote daemons, updates, removal, and plugin-specific configuration. The [usage guide](docs/usage.md) explains each workflow.

## Updating

Pull the repository, install any changed dependencies, run the checks, then reload the installed plugins:

```bash
git pull --ff-only
bun install --frozen-lockfile
bun run test
bun run typecheck
paseo plugin reload workspace-companion
paseo plugin reload linear
paseo plugin reload dev-ports
```

Reloading a plugin does not restart the Paseo daemon or interrupt unrelated agents.

## Data and security

Plugin state is stored under the daemon's Paseo home, normally `~/.paseo/plugin-data/`. The repository never needs access to your project files beyond the behavior described in each plugin guide.

- Linear mutations require an explicit confirmation in the UI.
- Dev Ports only shows same-user listeners inside registered Paseo workspaces. It sends `SIGTERM` and never force-kills a process.
- Dev Ports creates private Tailscale Serve mappings. It never enables Tailscale Funnel.

Read [SECURITY.md](SECURITY.md) before installing the plugins on a shared daemon.

## Development

```bash
bun install
bun run format:check
bun run test
bun run typecheck
```

The suite uses Bun workspaces. Each plugin keeps its own Paseo manifest, strict TypeScript project, runtime contracts, and focused tests. See [CONTRIBUTING.md](CONTRIBUTING.md) for repository rules.

## Paseo compatibility

Paseo's plugin API is experimental. This repository distributes source directories that the daemon compiles locally. Use a recent Paseo release and consult the official [plugin quickstart](https://paseo.sh/docs/plugins) and [plugin reference](https://paseo.sh/docs/plugins/reference) when the API changes.

## License

[MIT](LICENSE)
