import { Stack, useRouter } from "expo-router";
import { useMemo, useSyncExternalStore } from "react";
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
  getInventory,
  getPallets,
  subscribeInventory,
} from "@/lib/inventory-store";
import {
  getItemNextAction,
  getTodayWork,
  getWorkflowStats,
} from "@/lib/workflow-guidance";

export default function DailySellingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const items = useSyncExternalStore(
    subscribeInventory,
    getInventory,
    getInventory,
  );
  const pallets = useSyncExternalStore(
    subscribeInventory,
    getPallets,
    getPallets,
  );
  const isLargeLayout = width >= 900;
  const stats = getWorkflowStats(items);
  const todayWork = getTodayWork(items, pallets);
  const prioritizedItems = useMemo(
    () =>
      items
        .map((item) => ({ item, action: getItemNextAction(item) }))
        .filter(({ action }) => action.action !== "clear")
        .sort((a, b) => {
          const priority = {
            "add-photos": 0,
            "fix-copy": 1,
            "post-ebay": 2,
            "post-facebook": 3,
            "save-facebook-url": 4,
            "mark-sold": 5,
            clear: 6,
            "capture-item": 7,
            "create-pallet": 8,
          } as Record<string, number>;
          return priority[a.action.action] - priority[b.action.action];
        })
        .slice(0, 12),
    [items],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Daily Selling" }} />
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Daily Selling Mode</Text>
        <Text style={styles.subtitle}>
          Work through the highest-impact tasks without bouncing around the app.
        </Text>

        <View style={styles.metricGrid}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Photos</Text>
            <Text style={styles.metricValue}>{stats.needsPhotos}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Ready eBay</Text>
            <Text style={styles.metricValue}>{stats.readyForEbay}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Ready FB</Text>
            <Text style={styles.metricValue}>{stats.readyForFacebook}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>URLs</Text>
            <Text style={styles.metricValue}>{stats.missingFacebookUrls}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Workflow</Text>
          {todayWork.map((work) => (
            <View key={`${work.action}-${work.label}`} style={styles.stepRow}>
              <View style={[styles.stepDot, styles[`stepDot_${work.tone}`]]} />
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{work.label}</Text>
                <Text style={styles.stepText}>{work.detail}</Text>
              </View>
            </View>
          ))}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/capture")}
            >
              <Text style={styles.primaryBtnText}>Capture Photos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.infoBtn}
              onPress={() => router.push("/facebook" as never)}
            >
              <Text style={styles.primaryBtnText}>Facebook Queue</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Next Items</Text>
          {prioritizedItems.length === 0 ? (
            <Text style={styles.emptyText}>
              Nothing needs attention right now. Capture more inventory or watch
              active listings for sales.
            </Text>
          ) : (
            prioritizedItems.map(({ item, action }) => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemRow}
                onPress={() => router.push(`/item/${item.id}` as never)}
              >
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle}>{item.name}</Text>
                  <Text style={styles.itemText}>{action.label}: {action.detail}</Text>
                </View>
                <Text style={styles.itemOpenText}>Review</Text>
              </TouchableOpacity>
            ))
          )}
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
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  metricBox: {
    flex: 1,
    minWidth: 120,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 10,
    padding: 12,
  },
  metricLabel: { color: AppPalette.textSoft, fontSize: 11, fontWeight: "800" },
  metricValue: { color: AppPalette.text, fontSize: 24, fontWeight: "800", marginTop: 4 },
  card: {
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: { color: AppPalette.text, fontSize: 16, fontWeight: "800", marginBottom: 10 },
  stepRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: AppPalette.border,
  },
  stepDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  stepDot_danger: { backgroundColor: AppPalette.dangerStrong },
  stepDot_warning: { backgroundColor: AppPalette.warning },
  stepDot_info: { backgroundColor: AppPalette.info },
  stepDot_success: { backgroundColor: AppPalette.success },
  stepCopy: { flex: 1 },
  stepTitle: { color: AppPalette.text, fontSize: 14, fontWeight: "800" },
  stepText: { color: AppPalette.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  primaryBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  infoBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: AppPalette.info,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryBtnText: { color: AppPalette.primaryOn, fontSize: 13, fontWeight: "800" },
  emptyText: { color: AppPalette.textMuted, fontSize: 13, lineHeight: 19 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: AppPalette.border,
  },
  itemCopy: { flex: 1 },
  itemTitle: { color: AppPalette.text, fontSize: 14, fontWeight: "800" },
  itemText: { color: AppPalette.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  itemOpenText: { color: AppPalette.primary, fontSize: 12, fontWeight: "800" },
});
