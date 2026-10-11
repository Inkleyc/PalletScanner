import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AppPalette } from "@/constants/app-palette";
import { AppAlert as Alert } from "@/lib/app-alert";
import { getSupabaseClient } from "@/lib/supabase-auth";

const DASHBOARD_URL =
  process.env.EXPO_PUBLIC_DASHBOARD_URL?.trim() ?? "";

export default function DashboardScreen() {
  const [attentionCount, setAttentionCount] = useState<number | null>(null);
  const [attentionError, setAttentionError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const loadAttention = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setRefreshing(true); setAttentionError("");
    try {
      const result = await supabase.rpc("get_operational_attention_summary");
      if (result.error) throw result.error;
      const summary = result.data as { orderIssues?: number; returnIssues?: number; marketplaceIssues?: number; recoveryIssues?: number } | null;
      setAttentionCount(Number(summary?.orderIssues || 0) + Number(summary?.returnIssues || 0) + Number(summary?.marketplaceIssues || 0) + Number(summary?.recoveryIssues || 0));
    } catch (error) { setAttentionError(error instanceof Error ? error.message : "Could not load operational attention."); }
    finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void loadAttention(); }, [loadAttention]));
  const openDashboard = async () => {
    if (!DASHBOARD_URL) {
      Alert.alert(
        "Dashboard address not configured",
        "Add EXPO_PUBLIC_DASHBOARD_URL to this mobile build after the web dashboard is deployed.",
      );
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(DASHBOARD_URL);
    } catch (error) {
      Alert.alert(
        "Unable to open dashboard",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Business Dashboard</Text>
        <Text style={styles.description}>
          Manage inventory, review listings, and view reports in the web
          dashboard.
        </Text>
        {attentionCount !== null ? <View style={[styles.attentionCard, attentionCount === 0 && styles.attentionCardClear]}><Text style={styles.attentionValue}>{attentionCount}</Text><View style={styles.attentionCopy}><Text style={styles.attentionTitle}>{attentionCount === 0 ? "Operations are clear" : "Operational items need attention"}</Text><Text style={styles.attentionDetail}>Open the web dashboard to review orders, shipping, returns, and marketplace actions.</Text></View></View> : null}
        {attentionError ? <Text style={styles.configurationHint}>{attentionError}</Text> : null}
        <TouchableOpacity
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
        <TouchableOpacity style={styles.refreshButton} disabled={refreshing} onPress={() => { void loadAttention(); }}><Text style={styles.refreshButtonText}>{refreshing ? "Refreshing…" : "Refresh operational count"}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: AppPalette.background,
    padding: 24,
  },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  title: {
    color: AppPalette.text,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  description: {
    color: AppPalette.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: AppPalette.primaryOn,
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  configurationHint: {
    color: AppPalette.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  attentionCard: { alignItems: "center", backgroundColor: AppPalette.warningSoft, borderColor: AppPalette.warning, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 14, marginTop: 20, padding: 16 },
  attentionCardClear: { backgroundColor: AppPalette.successSoft, borderColor: AppPalette.success },
  attentionValue: { color: AppPalette.text, fontSize: 28, fontWeight: "800" },
  attentionCopy: { flex: 1 },
  attentionTitle: { color: AppPalette.text, fontSize: 15, fontWeight: "700" },
  attentionDetail: { color: AppPalette.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  refreshButton: { alignItems: "center", marginTop: 12, paddingVertical: 10 },
  refreshButtonText: { color: AppPalette.primary, fontSize: 14, fontWeight: "600" },
});
