# Dev Ports

Dev Ports finds development servers owned by the Paseo daemon user and tied to registered workspaces. It adds a global sidebar page and an agent-context panel.

For each verified listener, the plugin can:

- Open the server in the operating system browser
- Send `SIGTERM` after confirmation
- Create a private Tailscale Serve URL
- Remove a Tailscale Serve mapping created by this plugin

## Requirements

Port discovery requires a Linux daemon with:

- `/proc`
- `ss`, normally supplied by `iproute2`

Tailscale is optional. Install and connect it only if you want private Serve URLs.

## Install

From the repository root:

```bash
bun install --frozen-lockfile
bun run --filter dev-ports typecheck
paseo plugin install "$PWD/plugins/dev-ports"
paseo plugin ls
```

Open **Dev ports** from the sidebar, an agent tab, or the Command Center.

## Allow Tailscale Serve

If Tailscale denies Serve configuration, authorize the daemon user once:

```bash
sudo tailscale set --operator="$USER"
```

The plugin runs the equivalent of:

```bash
tailscale serve --bg --yes --https=3000 http://localhost:3000
```

This is private to the tailnet. The plugin never runs `tailscale funnel`.

The browser URL uses HTTPS on the Tailscale device name and source port. Opening `http://...` against that HTTPS listener produces an HTTP-to-HTTPS protocol error.

## Process safety

Before stopping or sharing a listener, the plugin rechecks all of these facts:

- The PID still owns the expected port.
- The process belongs to the daemon user.
- Its current working directory is inside the expected registered workspace.

Stopping sends `SIGTERM` once. The plugin never sends `SIGKILL`. A process that survives is reported as still running.

The plugin records the Serve ports it creates under `$PASEO_HOME/plugin-data/dev-ports/`. It refuses to remove matching or conflicting mappings owned outside the plugin.

## Verify and debug

The automated suite parses recorded command output and never stops a real process or changes live Tailscale state.

```bash
bun test plugins/dev-ports
bun run --filter dev-ports typecheck
paseo plugin reload dev-ports
paseo plugin logs dev-ports
```
