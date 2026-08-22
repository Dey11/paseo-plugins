# Security

## Trust model

Paseo plugins are trusted local code. Server-side code runs without a sandbox on the daemon machine, and client code runs inside connected Paseo apps. Installing a plugin grants the permissions used by its source.

Review the plugin directory before installing it. On shared daemons, treat plugin installation as an administrator action.

## Plugin permissions

- `workspace-companion` reads workspace Git metadata and the focused agent's projected transcript when you manually generate a QA plan. It stores notes, board state, and QA plans under Paseo's plugin-data directory.
- `prompt-library` reads and writes its own prompt store under Paseo's plugin-data directory. Attached prompts become part of the message sent to the selected agent.
- `linear` sends requests to Linear with the configured personal API key. Writes require an explicit confirmation in the panel.
- `dev-ports` reads Linux socket and `/proc` metadata, can send `SIGTERM` to a verified same-user workspace process, and can create or remove Tailscale Serve mappings that it owns.

None of the plugins should log credentials or stored content.

## Credentials

Never commit a Linear key or a QA-provider secret. Keep credentials in the daemon environment or the documented user-only configuration files. Restrict credential files to the daemon user:

```bash
chmod 600 ~/.config/paseo-plugins/*.env
```

## Reporting a vulnerability

Do not open a public issue containing a credential, private transcript, prompt, workspace path, or exploit details. Use GitHub's private vulnerability reporting when it is available, or contact the repository owner privately through GitHub. Include the affected plugin, Paseo version, daemon operating system, reproduction steps, and the smallest redacted log excerpt that proves the problem.
