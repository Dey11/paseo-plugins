# Public repository release

## Goal

Publish the plugin suite to `Dey11/paseo-plugins` with enough setup, security, and troubleshooting information for another Paseo user to install one plugin without maintainer help.

## Context

Paseo's plugin API is experimental and currently distributes local source directories rather than stable packages. The repository must explain that trust model, pin its development tools, and keep every plugin independently installable.

## Scope

- Root installation, update, removal, security, and contribution guides
- One README per plugin
- Portable configuration for Linear
- CI for formatting, tests, and strict TypeScript checks
- MIT license and repository metadata

## Non-goals

- npm publication or a plugin marketplace package
- Automatic installation scripts that enable trusted code without review
- Changing plugin product behavior beyond the release requirements
- Making the GitHub repository public; the owner will do that later

## Chosen approach

Use the existing Bun workspace as the repository root. Paseo installs each `plugins/<id>` directory directly. Keep secrets outside both the Git repository and Paseo workspaces. Environment variables take precedence, while `~/.config/paseo-plugins/*.env` provides a daemon-local option that also works for desktop-managed and long-running hosts.

## Validation

- Run formatting, all focused tests, and every plugin's strict typecheck.
- Verify installation commands use absolute paths.
- Test dependency installation and checks from a fresh clone of the committed tree.
- Push `HEAD` as the target repository's `main` branch and confirm GitHub reports the expected files and private visibility.

## Risks

- Paseo API changes may break source compatibility. The guides link to current official plugin documentation and describe the API as experimental.
- Tailscale and Linear operate outside Paseo. Their guides state exact permissions and avoid live mutation tests.

## Status

Completed on 2026-08-22. The initial four-plugin release was published with a clean `main` history. Prompt Library and QA Review were removed from the maintained suite on 2026-08-28; the root README and current installation guide define the supported set.
