export type ExternalUrlPlatform = "ios" | "android" | "web";
export type ExternalUrlOpener = (url: string) => void | Promise<void>;

export interface ExternalUrlAdapters {
  platform: ExternalUrlPlatform;
  desktopOpen?: ExternalUrlOpener;
  browserOpen: ExternalUrlOpener;
  nativeOpen: ExternalUrlOpener;
}

/** Opens an HTTP(S) note link through the host OS instead of Paseo's browser pane. */
export async function openExternalNoteUrl(
  value: string,
  adapters: ExternalUrlAdapters,
): Promise<void> {
  if (!isHttpUrl(value)) {
    throw new Error("Only HTTP and HTTPS links can be opened.");
  }

  if (adapters.platform === "web") {
    await (adapters.desktopOpen ?? adapters.browserOpen)(value);
    return;
  }

  await adapters.nativeOpen(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
