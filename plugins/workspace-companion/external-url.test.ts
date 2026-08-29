import { describe, expect, test } from "bun:test";
import { openExternalNoteUrl } from "./external-url";

describe("external workspace note links", () => {
  test("prefers Paseo Desktop's system-browser bridge", async () => {
    const calls: string[] = [];
    await openExternalNoteUrl("https://example.com/docs", {
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

    expect(calls).toEqual(["desktop:https://example.com/docs"]);
  });

  test("opens a new browser tab outside Desktop", async () => {
    const calls: string[] = [];
    await openExternalNoteUrl("https://example.com/docs", {
      platform: "web",
      browserOpen: (url) => {
        calls.push(url);
      },
      nativeOpen: () => {
        calls.push("native");
      },
    });

    expect(calls).toEqual(["https://example.com/docs"]);
  });

  test("uses native linking on mobile", async () => {
    const calls: string[] = [];
    await openExternalNoteUrl("https://example.com/docs", {
      platform: "ios",
      browserOpen: () => {
        calls.push("browser");
      },
      nativeOpen: (url) => {
        calls.push(url);
      },
    });

    expect(calls).toEqual(["https://example.com/docs"]);
  });

  test("refuses non-http protocols", async () => {
    const calls: string[] = [];
    await expect(
      openExternalNoteUrl("file:///etc/passwd", {
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
