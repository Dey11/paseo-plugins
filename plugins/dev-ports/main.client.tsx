import type {
  PluginAgentPanelProps,
  PluginSurfaceProps,
  PluginTheme,
} from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.grow}>
          <Text style={styles.title}>Dev ports</Text>
          <Text style={styles.muted}>
            {workspaceId
              ? "Same-user listeners for this workspace."
              : "Only same-user listeners inside registered Paseo workspaces appear here."}
          </Text>
        </View>
        <Button
          label="Refresh"
          onPress={() => data.refetch()}
          styles={styles}
        />
      </View>
      {!data.data?.tailscaleAvailable ? (
        <View style={styles.warning}>
          <Text style={styles.cardTitle}>Tailscale unavailable</Text>
          <Text style={styles.muted}>
            Port discovery still works, but private sharing is disabled.
          </Text>
        </View>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <View style={styles.stack}>
        {visiblePorts.map((port) => {
          const key = `${port.pid}:${port.port}`;
          const forward = data.data?.forwards.find(
            (candidate) => candidate.sourcePort === port.port,
          );
          return (
            <View key={key} style={styles.card}>
              <View style={styles.row}>
                <View>
                  <Text style={styles.port}>:{port.port}</Text>
                  <Text style={styles.cardTitle}>{port.workspaceName}</Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    port.publiclyBound && styles.warningBadge,
                  ]}
                >
                  <Text style={styles.badgeText}>
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
                <Pressable onPress={() => Linking.openURL(forward.url)}>
                  <Text style={styles.link}>{forward.url}</Text>
                </Pressable>
              ) : null}
              <View style={styles.actions}>
                <Button
                  label={
                    busy === key
                      ? "Stopping…"
                      : confirmStop === key
                        ? "Confirm stop"
                        : "Stop process"
                  }
                  onPress={() => stop(port)}
                  disabled={busy !== null}
                  danger={confirmStop === key}
                  styles={styles}
                />
                {forward ? (
                  <Button
                    label={
                      busy === `unshare:${port.port}`
                        ? "Removing…"
                        : "Stop sharing"
                    }
                    onPress={() => unshare(port.port)}
                    disabled={busy !== null}
                    styles={styles}
                  />
                ) : (
                  <Button
                    label={
                      busy === `share:${port.port}`
                        ? "Sharing…"
                        : "Share on tailnet"
                    }
                    onPress={() => share(port)}
                    disabled={busy !== null || !data.data?.tailscaleAvailable}
                    primary
                    styles={styles}
                  />
                )}
              </View>
            </View>
          );
        })}
        {visiblePorts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>
              No workspace development servers are listening.
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.footnote}>
        Stopping sends SIGTERM once and never escalates. Sharing uses Tailscale
        Serve, not Funnel, so the URL remains private to your tailnet.
      </Text>
    </ScrollView>
  );
}

function Button({
  label,
  onPress,
  disabled,
  primary,
  danger,
  styles,
}: {
  label: string;
  onPress: () => void | Promise<unknown>;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        danger && styles.danger,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          primary && styles.primaryText,
          danger && styles.dangerText,
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
  return useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: theme.colors.surface0 },
        content: { padding: compact ? 16 : 24, gap: 16 },
        header: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        },
        grow: { flex: 1, gap: 4 },
        title: {
          color: theme.colors.foreground,
          fontSize: 24,
          fontWeight: "700",
          letterSpacing: -0.4,
        },
        cardTitle: {
          color: theme.colors.foreground,
          fontSize: 14,
          fontWeight: "600",
        },
        muted: {
          color: theme.colors.foregroundMuted,
          fontSize: 13,
          lineHeight: 19,
        },
        notice: { color: theme.colors.foregroundMuted, fontSize: 13 },
        stack: { gap: 10 },
        card: {
          gap: 8,
          padding: 14,
          borderRadius: 13,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        },
        actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        port: { color: theme.colors.accent, fontSize: 21, fontWeight: "700" },
        command: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          lineHeight: 16,
        },
        link: {
          color: theme.colors.accent,
          fontSize: 13,
          textDecorationLine: "underline",
        },
        badge: {
          minHeight: 28,
          justifyContent: "center",
          paddingHorizontal: 9,
          borderRadius: 14,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
        },
        warningBadge: { borderColor: theme.colors.statusDanger },
        badgeText: {
          color: theme.colors.foreground,
          fontSize: 11,
          fontWeight: "600",
        },
        button: {
          minHeight: 44,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 13,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
        },
        buttonText: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontWeight: "600",
        },
        primary: {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.accent,
        },
        primaryText: { color: theme.colors.accentForeground },
        danger: { borderColor: theme.colors.statusDanger },
        dangerText: { color: theme.colors.statusDanger },
        pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
        warning: {
          gap: 4,
          padding: 13,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.statusDanger,
        },
        empty: {
          minHeight: 180,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 13,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
        },
        footnote: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          lineHeight: 17,
        },
      }),
    [theme, compact],
  );
}
