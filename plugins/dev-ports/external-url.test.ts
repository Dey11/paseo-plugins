import { describe, expect, test } from "bun:test";
import { openExternalHttpUrl } from "./external-url";

describe("external dev server links", () => {
  test("prefers Paseo desktop's system-browser bridge", async () => {
    const calls: string[] = [];
    await openExternalHttpUrl("https://devbox.example:3000", {
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
    });

    expect(calls).toEqual(["desktop:https://devbox.example:3000"]);
  });

  test("opens a new browser tab outside Electron", async () => {
    const calls: string[] = [];
    await openExternalHttpUrl("http://localhost:3000", {
      platform: "web",
      browserOpen: (url) => {
        calls.push(url);
      },
      nativeOpen: () => {
        calls.push("native");
      },
    });

    expect(calls).toEqual(["http://localhost:3000"]);
  });

  test("refuses non-http protocols", async () => {
    const calls: string[] = [];
    await expect(
      openExternalHttpUrl("file:///etc/passwd", {
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
