# Installation

Install plugins on the machine that runs the target Paseo daemon. A desktop client connected to a remote daemon cannot install source from the desktop machine's filesystem.

## Requirements

- A current Paseo daemon and CLI
- Bun
- Git
- Plugin support enabled under **Settings → Plugins** on the target host

Paseo plugins are trusted, unsandboxed code. Review the source before enabling them.

## Install one plugin

Clone the repository and install its dependencies:

```bash
git clone https://github.com/Dey11/paseo-plugins.git
cd paseo-plugins
bun install --frozen-lockfile
```

Run the repository checks:

```bash
bun run test
bun run typecheck
```

Install a plugin with an absolute directory path:

```bash
paseo plugin install "$PWD/plugins/workspace-companion"
paseo plugin ls
```

The plugin should report `running`. If it does not, inspect its retained log:

```bash
paseo plugin logs workspace-companion
```

## Install on a remote host

SSH into the daemon machine, clone the repository there, and run the same commands. If you use the Paseo CLI from another machine, pass the target daemon with `--host`, but the install directory must still exist on the daemon machine.

Plugins are installed per daemon. When the same plugin is installed on several connected hosts, Paseo provides a host picker for that contribution.

## Configure Linear

Create a Linear personal API key. Put it in the daemon's environment as `LINEAR_API_KEY`, or create this file on the daemon machine:

```text
~/.config/paseo-plugins/linear.env
```

The file contents are:

```bash
LINEAR_API_KEY=lin_api_your_key_here
```

Restrict it and reload the plugin:

```bash
chmod 600 ~/.config/paseo-plugins/linear.env
paseo plugin reload linear
```

The plugin reads the key when it handles a request. It does not return or log the key.

## Configure Dev Ports

Dev Ports requires a Linux daemon with `ss` and `/proc`. Port discovery and safe process stopping work without Tailscale.

Private sharing also requires Tailscale to be installed, connected, and permitted to manage Serve configuration. If Tailscale denies the daemon user, run this once on the daemon machine:

```bash
sudo tailscale set --operator="$USER"
```

The plugin never enables Tailscale Funnel.

## Update

```bash
git pull --ff-only
bun install --frozen-lockfile
bun run test
bun run typecheck
paseo plugin reload <plugin-id>
```

Reload each installed plugin whose source or dependencies changed.

## Disable or remove

```bash
paseo plugin disable <plugin-id>
paseo plugin enable <plugin-id>
paseo plugin remove <plugin-id>
```

Removing a plugin removes Paseo's installation record. It does not delete the cloned source directory or that plugin's stored data.

## Troubleshooting

| Problem                          | Check                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Plugin does not appear           | Confirm the selected host, global plugin switch, and `running` status.                                       |
| Plugin failed to load            | Run `bun run typecheck`, then inspect `paseo plugin logs <id>`.                                              |
| Edited code is stale             | Run `paseo plugin reload <id>`.                                                                              |
| Linear says it is not configured | Put the key in the daemon environment or the documented credential file, then reload.                        |
| Dev Ports shows no listeners     | Confirm the daemon is Linux, `ss` is installed, and the process directory belongs to a registered workspace. |
| Tailscale access is denied       | Set the daemon user as the Tailscale operator once.                                                          |

See Paseo's official [plugin quickstart](https://paseo.sh/docs/plugins) and [plugin reference](https://paseo.sh/docs/plugins/reference) for current host behavior.
