# Contributing

Contributions are welcome while Paseo's plugin API remains experimental. Keep changes narrow and explain any daemon permissions they add.

## Set up the repository

```bash
git clone https://github.com/Dey11/paseo-plugins.git
cd paseo-plugins
bun install --frozen-lockfile
bun run test
bun run typecheck
```

Read [AGENTS.md](AGENTS.md) for the architecture and safety rules. Each plugin must remain independently installable from its directory.

## Before submitting a change

Run:

```bash
bun run format:check
bun run test
bun run typecheck
```

Add focused tests for behavior that can fail without freezing incidental UI markup. Do not use a real Linear account, stop real processes, or change live Tailscale mappings in automated tests.

For UI changes, test a wide desktop view and a compact view. Use Paseo theme colors rather than hardcoded foreground colors.

## Plugin boundaries

- Keep client code in `*.client.tsx` files.
- Keep Node APIs, credentials, shell commands, Git access, and filesystem access in `*.server.ts` files.
- Validate RPC inputs and outputs with Zod.
- Use Paseo's SDK for normal workspace and agent operations.
- Never log credentials, transcript contents, or private prompt-library entries.

Paseo plugin changes require a source reload:

```bash
paseo plugin reload <plugin-id>
paseo plugin ls
paseo plugin logs <plugin-id>
```

Do not restart the daemon to load plugin source.
