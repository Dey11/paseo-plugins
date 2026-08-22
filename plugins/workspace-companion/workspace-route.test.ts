import { describe, expect, test } from "bun:test";
import { buildWorkspaceDeepLink, buildWorkspaceRoute } from "./workspace-route";

describe("workspace card navigation", () => {
  test("builds Paseo's canonical workspace route", () => {
    expect(buildWorkspaceRoute("devbox", "wks_04b36de694f21084")).toBe(
      "/h/devbox/workspace/wks_04b36de694f21084",
    );
  });

  test("builds a native Paseo deep link", () => {
    expect(buildWorkspaceDeepLink("devbox", "wks_04b36de694f21084")).toBe(
      "paseo://h/devbox/workspace/wks_04b36de694f21084",
    );
  });

  test("encodes legacy path-shaped workspace IDs", () => {
    expect(buildWorkspaceRoute("devbox", "/srv/projects/example")).toBe(
      "/h/devbox/workspace/b64_L3Nydi9wcm9qZWN0cy9leGFtcGxl",
    );
  });
});
