import { describe, expect, test } from "bun:test";
import { openExternalLinearUrl } from "./external-url";

describe("external Linear issue links", () => {
  test("prefers Paseo desktop's system-browser bridge", async () => {
    const calls: string[] = [];
    await openExternalLinearUrl(
      "https://linear.app/example/issue/ENG-42/fix-sync",
      {
        platform: "web",
        desktopOpen: (url) => {
          calls.push(`desktop:${url}`);
        },
        browserOpen: (url) => {
          calls.push(`browser:${url}`);
        },
        nativeOpen: (url) => {
          calls.push(`native:${url}`);
        },
      },
    );

    expect(calls).toEqual([
      "desktop:https://linear.app/example/issue/ENG-42/fix-sync",
    ]);
  });

  test("opens a new browser tab outside Electron", async () => {
    const calls: string[] = [];
    await openExternalLinearUrl("https://linear.app/example/issue/ENG-42", {
      platform: "web",
      browserOpen: (url) => {
        calls.push(url);
      },
      nativeOpen: () => {
        calls.push("native");
      },
    });

    expect(calls).toEqual(["https://linear.app/example/issue/ENG-42"]);
  });

  test("refuses non-http protocols", async () => {
    const calls: string[] = [];
    await expect(
      openExternalLinearUrl("file:///etc/passwd", {
        platform: "web",
        browserOpen: (url) => {
          calls.push(url);
        },
        nativeOpen: (url) => {
          calls.push(url);
        },
      }),
    ).rejects.toThrow("Only HTTP and HTTPS links can be opened");
    expect(calls).toEqual([]);
  });
});
