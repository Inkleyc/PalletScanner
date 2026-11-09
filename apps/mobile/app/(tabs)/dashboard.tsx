import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AppTextStyles, type AppPaletteShape } from "@/constants/app-palette";
import { useAppPalette } from "@/lib/app-theme";
import { AppAlert as Alert } from "@/lib/app-alert";
import { getSupabaseClient } from "@/lib/supabase-auth";

const DASHBOARD_URL =
  process.env.EXPO_PUBLIC_DASHBOARD_URL?.trim() ?? "";

type OperationalAttention = {
  orderIssues: number;
  returnIssues: number;
  marketplaceIssues: number;
  recoveryIssues: number;
};

const emptyAttention: OperationalAttention = {
  orderIssues: 0,
  returnIssues: 0,
  marketplaceIssues: 0,
  recoveryIssues: 0,
};

export default function DashboardScreen() {
  const palette = useAppPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [attention, setAttention] = useState<OperationalAttention | null>(null);
  const [attentionError, setAttentionError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const loadAttention = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setRefreshing(true); setAttentionError("");
    try {
      const result = await supabase.rpc("get_operational_attention_summary");
      if (result.error) throw result.error;
      const summary = result.data as Partial<OperationalAttention> | null;
      setAttention({
        orderIssues: Number(summary?.orderIssues || 0),
        returnIssues: Number(summary?.returnIssues || 0),
        marketplaceIssues: Number(summary?.marketplaceIssues || 0),
        recoveryIssues: Number(summary?.recoveryIssues || 0),
      });
    } catch (error) { setAttentionError(error instanceof Error ? error.message : "Could not load operational attention."); }
    finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void loadAttention(); }, [loadAttention]));
  const openDashboard = async (view = "overview", ordersSection?: "orders" | "returns") => {
    if (!DASHBOARD_URL) {
      Alert.alert(
        "Dashboard address not configured",
        "Add EXPO_PUBLIC_DASHBOARD_URL to this mobile build after the web dashboard is deployed.",
      );
      return;
    }

    try {
      const target = new URL(DASHBOARD_URL);
      target.hash = view;
      if (ordersSection) {
        target.searchParams.set("ordersSection", ordersSection);
      }
      await WebBrowser.openBrowserAsync(target.toString());
    } catch (error) {
      Alert.alert(
        "Unable to open dashboard",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    }
  };
  const attentionCount = Object.values(attention ?? emptyAttention).reduce(
    (total, count) => total + count,
    0,
  );
  const attentionEntries = attention ? [
    { key: "orders", label: "Orders and shipping", count: attention.orderIssues, view: "orders", section: "orders" as const },
    { key: "returns", label: "Returns", count: attention.returnIssues, view: "orders", section: "returns" as const },
    { key: "marketplace", label: "Marketplace actions", count: attention.marketplaceIssues, view: "settings" },
    { key: "recovery", label: "Sale recovery", count: attention.recoveryIssues, view: "analysis" },
  ] : [];

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Business Dashboard</Text>
        <Text style={styles.description}>
          Manage inventory, review listings, and view reports in the web
          dashboard.
        </Text>
        {attention ? <View style={[styles.attentionCard, attentionCount === 0 && styles.attentionCardClear]}><View style={styles.attentionHeading}><Text accessibilityRole="text" accessibilityLabel={`${attentionCount} operational items need attention`} style={styles.attentionValue}>{attentionCount}</Text><View style={styles.attentionCopy}><Text style={styles.attentionTitle}>{attentionCount === 0 ? "Operations are clear" : "Operational items need attention"}</Text><Text style={styles.attentionDetail}>{attentionCount === 0 ? "No urgent order, return, marketplace, or recovery work." : "Open the exact web queue that needs your attention."}</Text></View></View>{attentionEntries.filter((entry) => entry.count > 0).map((entry) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${entry.label}, ${entry.count} items need attention`} accessibilityState={{ disabled: !DASHBOARD_URL }} key={entry.key} style={[styles.attentionRow, !DASHBOARD_URL && styles.disabledAction]} disabled={!DASHBOARD_URL} onPress={() => { void openDashboard(entry.view, entry.section); }}><Text style={styles.attentionRowLabel}>{entry.label}</Text><Text style={styles.attentionRowCount}>{entry.count} ›</Text></TouchableOpacity>)}</View> : null}
        {attentionError ? <Text style={styles.configurationHint}>{attentionError}</Text> : null}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open PalletFlip web dashboard"
          style={[
            styles.primaryButton,
            !DASHBOARD_URL && styles.primaryButtonDisabled,
          ]}
          onPress={() => {
            void openDashboard();
          }}
        >
          <Text style={styles.primaryButtonText}>Open Dashboard</Text>
        </TouchableOpacity>
        {!DASHBOARD_URL ? (
          <Text style={styles.configurationHint}>
            The web dashboard address has not been added to this build yet.
          </Text>
        ) : null}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh operational attention count" accessibilityState={{ busy: refreshing, disabled: refreshing }} style={styles.refreshButton} disabled={refreshing} onPress={() => { void loadAttention(); }}><Text style={styles.refreshButtonText}>{refreshing ? "Refreshing…" : "Refresh operational count"}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (palette: AppPaletteShape) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: palette.background,
    padding: 24,
  },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  description: {
    color: palette.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primaryStrong,
    borderRadius: 8,
    marginTop: 24,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: palette.primaryOn,
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  configurationHint: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  attentionCard: { backgroundColor: palette.warningSoft, borderColor: palette.warning, borderRadius: 10, borderWidth: 1, marginTop: 20, padding: 16 },
  attentionCardClear: { backgroundColor: palette.successSoft, borderColor: palette.success },
  attentionHeading: { alignItems: "center", flexDirection: "row", gap: 14 },
  attentionValue: { color: palette.text, fontSize: 28, fontWeight: "800", ...AppTextStyles.num },
  attentionCopy: { flex: 1 },
  attentionTitle: { color: palette.text, fontSize: 15, fontWeight: "700" },
  attentionDetail: { color: palette.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  attentionRow: { alignItems: "center", borderTopColor: palette.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 8, minHeight: 44, paddingTop: 8 },
  disabledAction: { opacity: 0.55 },
  attentionRowLabel: { color: palette.text, fontSize: 14, fontWeight: "600" },
  attentionRowCount: { color: palette.primaryStrong, fontSize: 14, fontWeight: "800", ...AppTextStyles.num },
  refreshButton: { alignItems: "center", justifyContent: "center", marginTop: 12, minHeight: 44, paddingVertical: 10 },
  refreshButtonText: { color: palette.primary, fontSize: 14, fontWeight: "600" },
});
