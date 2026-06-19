import { Stack, useRouter } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { AppLayout, AppPalette } from "@/constants/app-palette";
import {
  getEbayConnectionStatus,
  getEbayIntegrationStatusLabel,
  isEbayApiConfigured,
  type EbayConnectionStatus,
} from "@/lib/ebay-integration";
import { getInventory, subscribeInventory } from "@/lib/inventory-store";
import {
  getSupabaseAuthSnapshot,
  isSupabaseConfigured,
  subscribeSupabaseAuth,
} from "@/lib/supabase-auth";
import { getWorkflowStats } from "@/lib/workflow-guidance";

export default function ProductionReadinessScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const items = useSyncExternalStore(
    subscribeInventory,
    getInventory,
    getInventory,
  );
  const supabaseAuth = useSyncExternalStore(
    subscribeSupabaseAuth,
    getSupabaseAuthSnapshot,
    getSupabaseAuthSnapshot,
  );
  const [ebayStatus, setEbayStatus] = useState<EbayConnectionStatus | null>(null);
  const [ebayError, setEbayError] = useState<string | null>(null);
  const isLargeLayout = width >= 900;
  const stats = getWorkflowStats(items);

  useEffect(() => {
    if (!isEbayApiConfigured()) {
      return;
    }

    void getEbayConnectionStatus()
      .then((status) => {
        setEbayStatus(status);
        setEbayError(null);
      })
      .catch((error) => {
        setEbayStatus(null);
        setEbayError(error instanceof Error ? error.message : "Backend unavailable");
      });
  }, []);

  const checks = [
    {
      label: "eBay backend",
      ready: isEbayApiConfigured(),
      detail: getEbayIntegrationStatusLabel(),
    },
    {
      label: "eBay seller account",
      ready: Boolean(ebayStatus?.connected),
      detail: ebayStatus
        ? `${ebayStatus.environment} · ${ebayStatus.marketplaceId}`
        : ebayError ?? "Not connected yet",
    },
    {
      label: "Supabase app login",
      ready: !isSupabaseConfigured() || supabaseAuth.signedIn,
      detail: !isSupabaseConfigured()
        ? "Optional until public login is enabled"
        : supabaseAuth.signedIn
          ? "Signed in"
          : "Configured but not signed in",
    },
    {
      label: "Inventory posting checks",
      ready: stats.needsCopyFixes === 0,
      detail:
        stats.needsCopyFixes === 0
          ? "No current posting blockers"
          : `${stats.needsCopyFixes} item${stats.needsCopyFixes === 1 ? "" : "s"} need cleanup`,
    },
    {
      label: "Photo readiness",
      ready: stats.needsPhotos === 0,
      detail:
        stats.needsPhotos === 0
          ? "Current inventory has photos"
          : `${stats.needsPhotos} item${stats.needsPhotos === 1 ? "" : "s"} need photos`,
    },
    {
      label: "Facebook workflow",
      ready: true,
      detail: "Manual queue, copy steps, and URL tracking are available",
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Production Readiness" }} />
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Production Readiness</Text>
        <Text style={styles.subtitle}>
          One place to check what is ready before leaving sandbox and sharing the app.
        </Text>

        <View style={styles.card}>
          {checks.map((check) => (
            <View key={check.label} style={styles.checkRow}>
              <View
                style={[
                  styles.checkDot,
                  check.ready ? styles.checkDotReady : styles.checkDotAttention,
                ]}
              />
              <View style={styles.checkCopy}>
                <Text style={styles.checkLabel}>{check.label}</Text>
                <Text style={styles.checkDetail}>{check.detail}</Text>
              </View>
              <Text
                style={[
                  styles.checkStatus,
                  check.ready ? styles.checkStatusReady : styles.checkStatusAttention,
                ]}
              >
                {check.ready ? "Ready" : "Check"}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Before Production</Text>
          <Text style={styles.todoText}>Use real eBay production keys and policies.</Text>
          <Text style={styles.todoText}>Confirm the Render backend environment is production.</Text>
          <Text style={styles.todoText}>Complete Apple Developer registration for iOS builds.</Text>
          <Text style={styles.todoText}>Test one live low-risk listing end to end.</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push("/settings" as never)}
          >
            <Text style={styles.primaryBtnText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push("/daily" as never)}
          >
            <Text style={styles.secondaryBtnText}>Daily Mode</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 20, paddingTop: 52, paddingBottom: 28 },
  innerContent: { width: "100%", alignSelf: "center" },
  innerContentWide: { maxWidth: AppLayout.maxContentWidth },
  backBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  backBtnText: { color: AppPalette.text, fontSize: 13, fontWeight: "800" },
  title: { color: AppPalette.text, fontSize: 30, fontWeight: "800" },
  subtitle: {
    color: AppPalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 16,
  },
  card: {
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: AppPalette.border,
  },
  checkDot: { width: 10, height: 10, borderRadius: 5 },
  checkDotReady: { backgroundColor: AppPalette.success },
  checkDotAttention: { backgroundColor: AppPalette.warning },
  checkCopy: { flex: 1 },
  checkLabel: { color: AppPalette.text, fontSize: 14, fontWeight: "800" },
  checkDetail: { color: AppPalette.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  checkStatus: { fontSize: 12, fontWeight: "800" },
  checkStatusReady: { color: AppPalette.success },
  checkStatusAttention: { color: AppPalette.warning },
  cardTitle: { color: AppPalette.text, fontSize: 16, fontWeight: "800", marginBottom: 8 },
  todoText: { color: AppPalette.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 4 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryBtnText: { color: AppPalette.primaryOn, fontSize: 13, fontWeight: "800" },
  secondaryBtn: {
    flex: 1,
    minWidth: 130,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    backgroundColor: AppPalette.surface,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryBtnText: { color: AppPalette.text, fontSize: 13, fontWeight: "800" },
});
