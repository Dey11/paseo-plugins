import { describe, expect, test } from "bun:test";
import { buildWorkspaceDeepLink, buildWorkspaceRoute } from "./workspace-route";

describe("workspace card navigation", () => {
  test("builds Paseo's canonical workspace route", () => {
    expect(buildWorkspaceRoute("codevps", "wks_04b36de694f21084")).toBe(
      "/h/codevps/workspace/wks_04b36de694f21084",
    );
  });

  test("builds a native Paseo deep link", () => {
    expect(buildWorkspaceDeepLink("codevps", "wks_04b36de694f21084")).toBe(
      "paseo://h/codevps/workspace/wks_04b36de694f21084",
    );
  });

  test("encodes legacy path-shaped workspace IDs", () => {
    expect(buildWorkspaceRoute("codevps", "/home/dev/system")).toBe(
      "/h/codevps/workspace/b64_L2hvbWUvZGV2L3N5c3RlbQ",
    );
  });
});
