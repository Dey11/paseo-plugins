import { describe, expect, test } from "bun:test";
import {
  buildServeArgs,
  buildUnserveArgs,
  explainServeFailure,
  isPathInside,
  isPublicBind,
  parseServeMappings,
  parseServeOccupiedPorts,
  parseServeSourcePorts,
  parseSsListeners,
} from "./discovery.server";

describe("development port safety", () => {
  test("parses same-user process metadata from ss output", () => {
    const listeners = parseSsListeners(
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=20))\nLISTEN 0 128 [::]:4000 [::]:* users:(("bun",pid=88,fd=9))',
    );
    expect(listeners).toEqual([
      { address: "127.0.0.1", port: 3000, pid: 1234, processName: "node" },
      { address: "::", port: 4000, pid: 88, processName: "bun" },
    ]);
  });

  test("accepts only paths truly inside a workspace", () => {
    expect(isPathInside("/work/app", "/work/app/packages/web")).toBe(true);
    expect(isPathInside("/work/app", "/work/application")).toBe(false);
    expect(isPublicBind("0.0.0.0")).toBe(true);
    expect(isPublicBind("127.0.0.1")).toBe(false);
  });

  test("builds private Serve commands and reads local proxy targets", () => {
    expect(buildServeArgs(3000)).toEqual([
      "serve",
      "--bg",
      "--yes",
      "--https=3000",
      "http://localhost:3000",
    ]);
    expect(buildUnserveArgs(3000)).toEqual([
      "serve",
      "--yes",
      "--https=3000",
      "off",
    ]);
    expect(
      parseServeSourcePorts({
        Web: {
          "host:3000": {
            Handlers: { "/": { Proxy: "http://127.0.0.1:3000" } },
          },
        },
      }),
    ).toEqual([3000]);
    expect(
      parseServeMappings({
        Web: {
          "host:3000": {
            Handlers: { "/": { Proxy: "http://127.0.0.1:4000" } },
          },
        },
      }),
    ).toEqual([{ exposedPort: 3000, sourcePort: 4000 }]);
    expect(
      parseServeOccupiedPorts({ TCP: { "3000": { HTTPS: true }, "8443": {} } }),
    ).toEqual([3000, 8443]);
  });

  test("turns Tailscale operator denial into a one-time setup instruction", () => {
    expect(
      explainServeFailure(
        new Error("sending serve config: Access denied: serve config denied"),
        "dev",
      ).message,
    ).toBe(
      "Tailscale Serve is not authorized for dev. Run `sudo tailscale set --operator=dev` once on this host, then try again.",
    );
  });
});
