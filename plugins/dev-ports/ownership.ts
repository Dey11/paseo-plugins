export type OwnedMappingState = "present" | "missing";

export function inspectOwnedMapping(
  ownedPorts: readonly number[],
  mappings: readonly { exposedPort: number; sourcePort: number }[],
  port: number,
): OwnedMappingState {
  if (!ownedPorts.includes(port)) {
    throw new Error(
      `Tailscale port ${port} is not owned by this plugin; it was not changed.`,
    );
  }
  return mappings.some(
    (mapping) => mapping.exposedPort === port && mapping.sourcePort === port,
  )
    ? "present"
    : "missing";
}
