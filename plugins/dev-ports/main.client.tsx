import type {
  PluginAgentPanelProps,
  PluginSurfaceProps,
  PluginTheme,
} from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ListDevPortsRpc,
  ServeDevPortRpc,
  StopDevPortRpc,
  UnserveDevPortRpc,
  type DevPort,
} from "./contracts";
import { openExternalHttpUrl } from "./external-url";

declare global {
  interface Window {
    paseoDesktop?: {
      opener?: { openUrl?: (url: string) => Promise<void> };
    };
  }
}

export function DevPortsSurface({ theme, layout }: PluginSurfaceProps) {
  return <DevPortsContent theme={theme} layout={layout} />;
}

export function DevPortsPanel({
  workspaceId,
  theme,
  layout,
}: PluginAgentPanelProps) {
  return (
    <DevPortsContent workspaceId={workspaceId} theme={theme} layout={layout} />
  );
}

function DevPortsContent({
  workspaceId,
  theme,
  layout,
}: Pick<PluginSurfaceProps, "theme" | "layout"> & { workspaceId?: string }) {
  const listPorts = useRpc(ListDevPortsRpc);
  const stopPort = useRpc(StopDevPortRpc);
  const servePort = useRpc(ServeDevPortRpc);
  const unservePort = useRpc(UnserveDevPortRpc);
  const styles = useStyles(theme, layout.compact);
  const [confirmStop, setConfirmStop] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const data = useQuery({
    queryKey: ["dev-ports"],
    queryFn: () => listPorts({}),
    refetchInterval: 5_000,
  });
  const visiblePorts =
    data.data?.ports.filter(
      (port) => !workspaceId || port.workspaceId === workspaceId,
    ) ?? [];

  async function stop(port: DevPort) {
    const key = `${port.pid}:${port.port}`;
    if (confirmStop !== key) {
      setConfirmStop(key);
      return;
    }
    setBusy(key);
    setNotice("");
    try {
      const result = await stopPort({
        pid: port.pid,
        port: port.port,
        workspaceId: port.workspaceId,
      });
      setNotice(
        result.stopped
          ? `Sent SIGTERM; port ${port.port} closed.`
          : `SIGTERM was sent, but PID ${port.pid} is still running.`,
      );
      setConfirmStop(null);
      await data.refetch();
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function share(port: DevPort) {
    const key = `share:${port.port}`;
    setBusy(key);
    setNotice("");
    try {
      const forward = await servePort({
        pid: port.pid,
        port: port.port,
        workspaceId: port.workspaceId,
      });
      setNotice(`Private tailnet URL ready: ${forward.url}`);
      await data.refetch();
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function unshare(port: number) {
    const key = `unshare:${port}`;
    setBusy(key);
    setNotice("");
    try {
      const result = await unservePort({ port });
      setNotice(
        result.removed
          ? `Private mapping for port ${port} removed.`
          : `Tailscale still reports the mapping for port ${port}.`,
      );
      await data.refetch();
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(null);
    }
  }

  async function openInBrowser(url: string) {
    setNotice("");
    try {
      const desktopOpen =
        typeof window !== "undefined" &&
        typeof window.paseoDesktop?.opener?.openUrl === "function"
          ? (value: string) => window.paseoDesktop?.opener?.openUrl?.(value)
          : undefined;
      await openExternalHttpUrl(url, {
        platform: layout.platform,
        desktopOpen,
        browserOpen: (value) => {
          if (typeof window !== "undefined") {
            window.open(value, "_blank", "noopener,noreferrer");
          }
        },
        nativeOpen: Linking.openURL,
      });
    } catch (error) {
      setNotice(message(error));
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.grow}>
          <Text style={styles.sectionTitle}>Development servers</Text>
          <Text style={styles.muted}>
            {workspaceId
              ? "Workspace listeners available on this host"
              : "Same-user listeners inside registered Paseo workspaces"}
          </Text>
        </View>
        <Button
          label="Refresh"
          onPress={() => data.refetch()}
          variant="ghost"
          styles={styles}
        />
      </View>

      {data.data && !data.data.tailscaleAvailable ? (
        <View style={styles.warning} accessibilityRole="alert">
          <Text style={styles.warningTitle}>Tailscale unavailable</Text>
          <Text style={styles.muted}>
            Port discovery still works, but private sharing is disabled.
          </Text>
        </View>
      ) : null}

      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}

      {data.isLoading && !data.data ? (
        <View style={styles.empty}>
          <ActivityIndicator color={theme.colors.foregroundMuted} />
        </View>
      ) : data.isError ? (
        <View style={styles.warning} accessibilityRole="alert">
          <Text style={styles.warningTitle}>
            Unable to load development servers
          </Text>
          <Text style={styles.muted}>{message(data.error)}</Text>
          <View style={styles.inlineAction}>
            <Button
              label="Try again"
              onPress={() => data.refetch()}
              variant="secondary"
              styles={styles}
            />
          </View>
        </View>
      ) : visiblePorts.length > 0 ? (
        <View style={styles.listFrame}>
          {visiblePorts.map((port, index) => {
            const key = `${port.pid}:${port.port}`;
            const forward = data.data?.forwards.find(
              (candidate) => candidate.sourcePort === port.port,
            );
            return (
              <View
                key={key}
                style={[styles.portRow, index > 0 && styles.portRowDivider]}
              >
                <View style={styles.row}>
                  <View style={styles.grow}>
                    <Text style={styles.port}>:{port.port}</Text>
                    <Text numberOfLines={1} style={styles.cardTitle}>
                      {port.workspaceName}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      port.publiclyBound && styles.warningBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        port.publiclyBound && styles.warningBadgeText,
                      ]}
                    >
                      {port.publiclyBound ? "All interfaces" : "Local only"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.muted}>
                  {port.processName} · PID {port.pid}
                </Text>
                <Text numberOfLines={2} style={styles.command}>
                  {port.command || port.cwd}
                </Text>

                {forward ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Open port ${port.port} in your browser`}
                    onPress={() => void openInBrowser(forward.url)}
                    style={({ pressed }) => [
                      styles.forwardRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text numberOfLines={1} style={styles.forwardUrl}>
                      {forward.url}
                    </Text>
                    <Text style={styles.forwardAction}>Open in browser ↗</Text>
                  </Pressable>
                ) : null}

                <View style={styles.actions}>
                  <Button
                    label={
                      busy === key
                        ? "Stopping..."
                        : confirmStop === key
                          ? "Confirm stop"
                          : "Stop process"
                    }
                    onPress={() => stop(port)}
                    disabled={busy !== null}
                    variant={confirmStop === key ? "danger" : "secondary"}
                    styles={styles}
                  />
                  {forward ? (
                    <Button
                      label={
                        busy === `unshare:${port.port}`
                          ? "Removing..."
                          : "Stop sharing"
                      }
                      onPress={() => unshare(port.port)}
                      disabled={busy !== null}
                      variant="secondary"
                      styles={styles}
                    />
                  ) : (
                    <Button
                      label={
                        busy === `share:${port.port}`
                          ? "Sharing..."
                          : "Share on tailnet"
                      }
                      onPress={() => share(port)}
                      disabled={busy !== null || !data.data?.tailscaleAvailable}
                      variant="primary"
                      styles={styles}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.muted}>No development servers are listening</Text>
        </View>
      )}

      <Text style={styles.footnote}>
        Stop sends SIGTERM once. Sharing uses private Tailscale Serve and never
        enables Funnel.
      </Text>
    </ScrollView>
  );
}

type ButtonVariant = "ghost" | "secondary" | "primary" | "danger";

function Button({
  label,
  onPress,
  disabled,
  variant,
  styles,
}: {
  label: string;
  onPress: () => void | Promise<unknown>;
  disabled?: boolean;
  variant: ButtonVariant;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "ghost" && styles.ghostButton,
        variant === "secondary" && styles.secondaryButton,
        variant === "primary" && styles.primaryButton,
        variant === "danger" && styles.dangerButton,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "ghost" && styles.ghostButtonText,
          variant === "primary" && styles.primaryButtonText,
          variant === "danger" && styles.dangerButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Port operation failed.";
}

type Styles = ReturnType<typeof useStyles>;

function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(() => {
    const raised = blendHex(
      theme.colors.surface0,
      theme.colors.foreground,
      0.055,
    );
    const control = blendHex(
      theme.colors.surface0,
      theme.colors.foreground,
      0.1,
    );
    const divider = blendHex(
      theme.colors.surface0,
      theme.colors.foreground,
      0.15,
    );
    const dangerSurface = blendHex(
      theme.colors.surface0,
      theme.colors.statusDanger,
      0.12,
    );

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: compact ? 16 : 24, gap: 16 },
      header: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      },
      grow: { flex: 1, gap: 3, minWidth: 0 },
      sectionTitle: {
        color: theme.colors.foreground,
        fontSize: 15,
        fontWeight: "500",
      },
      cardTitle: {
        color: theme.colors.foreground,
        fontSize: 14,
        fontWeight: "400",
      },
      muted: {
        color: theme.colors.foregroundMuted,
        fontSize: 13,
        lineHeight: 19,
      },
      notice: {
        color: theme.colors.foregroundMuted,
        fontSize: 13,
        lineHeight: 19,
      },
      listFrame: {
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: divider,
        overflow: "hidden",
      },
      portRow: { gap: 8, padding: compact ? 14 : 16 },
      portRowDivider: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: divider,
      },
      row: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      },
      actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 },
      inlineAction: { alignSelf: "flex-start", marginTop: 4 },
      port: {
        color: theme.colors.accent,
        fontSize: 18,
        fontWeight: "500",
        fontVariant: ["tabular-nums"],
      },
      command: {
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
      },
      badge: {
        minHeight: 26,
        justifyContent: "center",
        paddingHorizontal: 9,
        borderRadius: 13,
        backgroundColor: control,
      },
      warningBadge: { backgroundColor: dangerSurface },
      badgeText: {
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        fontWeight: "500",
      },
      warningBadgeText: { color: theme.colors.statusDanger },
      forwardRow: {
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingHorizontal: 11,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: control,
      },
      forwardUrl: {
        flex: 1,
        color: theme.colors.foregroundMuted,
        fontSize: 12,
      },
      forwardAction: {
        color: theme.colors.foreground,
        fontSize: 12,
        fontWeight: "500",
      },
      button: {
        minHeight: 36,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 12,
        borderRadius: 9,
      },
      buttonText: {
        color: theme.colors.foreground,
        fontSize: 13,
        fontWeight: "400",
      },
      ghostButton: { backgroundColor: "transparent" },
      ghostButtonText: { color: theme.colors.foregroundMuted },
      secondaryButton: { backgroundColor: control },
      primaryButton: { backgroundColor: theme.colors.accent },
      primaryButtonText: { color: theme.colors.accentForeground },
      dangerButton: { backgroundColor: dangerSurface },
      dangerButtonText: { color: theme.colors.statusDanger },
      pressed: { opacity: 0.7 },
      warning: {
        gap: 3,
        padding: 13,
        borderRadius: 12,
        backgroundColor: dangerSurface,
      },
      warningTitle: {
        color: theme.colors.statusDanger,
        fontSize: 13,
        fontWeight: "500",
      },
      empty: {
        minHeight: 160,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        backgroundColor: raised,
      },
      footnote: {
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        lineHeight: 17,
      },
    });
  }, [theme, compact]);
}

function blendHex(base: string, overlay: string, amount: number): string {
  const left = parseHex(base);
  const right = parseHex(overlay);
  if (!left || !right) return base;
  const channel = (index: number) =>
    Math.round(left[index]! * (1 - amount) + right[index]! * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(value: string): readonly [number, number, number] | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(value);
  return match
    ? [
        Number.parseInt(match[1]!, 16),
        Number.parseInt(match[2]!, 16),
        Number.parseInt(match[3]!, 16),
      ]
    : null;
}
