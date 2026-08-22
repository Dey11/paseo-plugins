const URL_SAFE_WORKSPACE_ID = /^[A-Za-z0-9._~-]+$/;

/** Mirrors Paseo's canonical host/workspace route, including legacy path IDs. */
export function buildWorkspaceRoute(
  hostId: string,
  workspaceId: string,
): string {
  const host = hostId.trim();
  const workspace = workspaceId.trim();
  if (!host || !workspace) return "/";
  const workspaceSegment = URL_SAFE_WORKSPACE_ID.test(workspace)
    ? workspace
    : `b64_${toBase64Url(workspace)}`;
  return `/h/${encodeURIComponent(host)}/workspace/${encodeURIComponent(workspaceSegment)}`;
}

export function buildWorkspaceDeepLink(
  hostId: string,
  workspaceId: string,
): string {
  return `paseo:/${buildWorkspaceRoute(hostId, workspaceId)}`;
}

function toBase64Url(value: string): string {
  const binary = Array.from(new TextEncoder().encode(value), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
