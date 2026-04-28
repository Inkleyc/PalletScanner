import { useMemo, useState, useSyncExternalStore } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import {
  getInventory,
  getPallets,
  subscribeInventory,
  updatePalletSessionCost,
} from "@/lib/inventory-store";
import { AppLayout, AppPalette } from "@/constants/app-palette";

const currency = (value: number) => `$${value.toFixed(2)}`;

export default function AnalyticsScreen() {
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
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const isLargeLayout = width >= 900;

  const totals = useMemo(() => {
    const soldItems = items.filter((item) => item.soldPrice !== null);
    const unsoldItems = items.filter((item) => item.soldPrice === null);
    const soldRevenue = soldItems.reduce(
      (sum, item) => sum + (item.soldPrice ?? 0),
      0,
    );
    const estimatedRemainingLow = unsoldItems.reduce(
      (sum, item) => sum + item.low_price,
      0,
    );
    const estimatedRemainingHigh = unsoldItems.reduce(
      (sum, item) => sum + item.high_price,
      0,
    );

    return {
      soldCount: soldItems.length,
      unsoldCount: unsoldItems.length,
      soldRevenue,
      estimatedRemainingLow,
      estimatedRemainingHigh,
      totalCost: pallets.reduce(
        (sum, pallet) => sum + (pallet.palletCost ?? 0),
        0,
      ),
      sellThrough:
        items.length > 0 ? (soldItems.length / items.length) * 100 : 0,
    };
  }, [items, pallets]);

  const palletMetrics = useMemo(
    () =>
      pallets.map((pallet) => {
        const palletItems = items.filter((item) => item.palletId === pallet.id);
        const soldItems = palletItems.filter((item) => item.soldPrice !== null);
        const unsoldItems = palletItems.filter((item) => item.soldPrice === null);
        const totalLow = palletItems.reduce((sum, item) => sum + item.low_price, 0);
        const totalHigh = palletItems.reduce((sum, item) => sum + item.high_price, 0);
        const totalFloor = palletItems.reduce(
          (sum, item) => sum + item.floor_price,
          0,
        );
        const soldRevenue = soldItems.reduce(
          (sum, item) => sum + (item.soldPrice ?? 0),
          0,
        );
        const remainingLow = unsoldItems.reduce(
          (sum, item) => sum + item.low_price,
          0,
        );
        const remainingHigh = unsoldItems.reduce(
          (sum, item) => sum + item.high_price,
          0,
        );

        return {
          pallet,
          itemCount: palletItems.length,
          soldCount: soldItems.length,
          unsoldCount: unsoldItems.length,
          totalLow,
          totalHigh,
          totalFloor,
          soldRevenue,
          remainingLow,
          remainingHigh,
          grossProfit: soldRevenue - (pallet.palletCost ?? 0),
          roi:
            typeof pallet.palletCost === "number" && pallet.palletCost > 0
              ? ((soldRevenue - pallet.palletCost) / pallet.palletCost) * 100
              : 0,
          averageSoldPrice:
            soldItems.length > 0 ? soldRevenue / soldItems.length : 0,
          sellThrough:
            palletItems.length > 0 ? (soldItems.length / palletItems.length) * 100 : 0,
        };
      }),
    [items, pallets],
  );

  const savePalletCost = (palletId: string) => {
    const rawValue = (costDrafts[palletId] ?? "").trim();
    if (!rawValue) {
      updatePalletSessionCost(palletId, null);
      return;
    }

    const parsedValue = Number(rawValue);
    if (Number.isNaN(parsedValue) || parsedValue < 0) {
      return;
    }

    updatePalletSessionCost(palletId, parsedValue);
    setCostDrafts((current) => ({
      ...current,
      [palletId]: String(parsedValue),
    }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <Text style={styles.title}>Pallet Stats</Text>
        <Text style={styles.subtitle}>Clean numbers for revenue, costs, and remaining value.</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.cardTitle}>All Inventory</Text>
          <View style={styles.metricGrid}>
            <View style={[styles.metricBox, styles.summaryMetricBox]}>
              <Text style={[styles.metricLabel, styles.summaryMetricLabel]}>Sold Revenue</Text>
              <Text style={[styles.metricValue, styles.summaryMetricValue]}>
                {currency(totals.soldRevenue)}
              </Text>
            </View>
            <View style={[styles.metricBox, styles.summaryMetricBox]}>
              <Text style={[styles.metricLabel, styles.summaryMetricLabel]}>Sell Through</Text>
              <Text style={[styles.metricValue, styles.summaryMetricValue]}>
                {totals.sellThrough.toFixed(0)}%
              </Text>
            </View>
            <View style={[styles.metricBox, styles.summaryMetricBox]}>
              <Text style={[styles.metricLabel, styles.summaryMetricLabel]}>Unsold</Text>
              <Text style={[styles.metricValue, styles.summaryMetricValue]}>
                {totals.unsoldCount}
              </Text>
            </View>
            <View style={[styles.metricBox, styles.summaryMetricBox]}>
              <Text style={[styles.metricLabel, styles.summaryMetricLabel]}>Remaining Low</Text>
              <Text style={[styles.metricValue, styles.summaryMetricValue]}>
                {currency(totals.estimatedRemainingLow)}
              </Text>
            </View>
            <View style={[styles.metricBox, styles.summaryMetricBox]}>
              <Text style={[styles.metricLabel, styles.summaryMetricLabel]}>Pallet Cost</Text>
              <Text style={[styles.metricValue, styles.summaryMetricValue]}>
                {currency(totals.totalCost)}
              </Text>
            </View>
            <View style={[styles.metricBox, styles.summaryMetricBox]}>
              <Text style={[styles.metricLabel, styles.summaryMetricLabel]}>Gross Profit</Text>
              <Text style={[styles.metricValue, styles.summaryMetricValue]}>
                {currency(totals.soldRevenue - totals.totalCost)}
              </Text>
            </View>
          </View>
          <Text style={styles.summaryText}>
            Remaining estimate: {currency(totals.estimatedRemainingLow)} to{" "}
            {currency(totals.estimatedRemainingHigh)}
          </Text>
        </View>

        {palletMetrics.map((metric) => (
          <View key={metric.pallet.id} style={styles.palletCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{metric.pallet.name}</Text>
              <Text style={styles.cardDate}>
                {new Date(metric.pallet.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.metricGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Items</Text>
                <Text style={styles.metricValue}>{metric.itemCount}</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Sold</Text>
                <Text style={styles.metricValue}>{metric.soldCount}</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Revenue</Text>
                <Text style={styles.metricValue}>{currency(metric.soldRevenue)}</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Sell Through</Text>
                <Text style={styles.metricValue}>
                  {metric.sellThrough.toFixed(0)}%
                </Text>
              </View>
            </View>
            <Text style={styles.detailText}>
              Estimated range: {currency(metric.totalLow)} to {currency(metric.totalHigh)}
            </Text>
            <Text style={styles.detailText}>
              Floor total: {currency(metric.totalFloor)}
            </Text>
            <View style={styles.costRow}>
              <TextInput
                style={styles.costInput}
                value={
                  costDrafts[metric.pallet.id] ??
                  (metric.pallet.palletCost !== null ? String(metric.pallet.palletCost) : "")
                }
                onChangeText={(value) =>
                  setCostDrafts((current) => ({
                    ...current,
                    [metric.pallet.id]: value,
                  }))
                }
                placeholder="Pallet cost"
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={styles.costSaveBtn}
                onPress={() => savePalletCost(metric.pallet.id)}
              >
                <Text style={styles.costSaveBtnText}>Save Cost</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.detailText}>
              Gross profit: {currency(metric.grossProfit)}
            </Text>
            <Text style={styles.detailText}>ROI: {metric.roi.toFixed(0)}%</Text>
            <Text style={styles.detailText}>
              Average sold price: {currency(metric.averageSoldPrice)}
            </Text>
            <Text style={styles.detailText}>
              Remaining estimate: {currency(metric.remainingLow)} to{" "}
              {currency(metric.remainingHigh)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 20, paddingTop: 56, paddingBottom: 28 },
  innerContent: {
    width: "100%",
    alignSelf: "center",
  },
  innerContentWide: {
    maxWidth: AppLayout.maxContentWidth,
  },
  title: { fontSize: 30, fontWeight: "700", color: AppPalette.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: AppPalette.textMuted, marginBottom: 20, lineHeight: 20 },
  summaryCard: {
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  palletCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: AppPalette.text },
  cardDate: { fontSize: 12, color: AppPalette.textMuted },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  metricBox: {
    minWidth: "47%",
    flexGrow: 1,
    backgroundColor: AppPalette.surface,
    borderRadius: 12,
    padding: 12,
  },
  metricLabel: { fontSize: 12, color: AppPalette.textMuted, marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: "700", color: AppPalette.text },
  summaryMetricBox: { backgroundColor: "rgba(255,255,255,0.10)" },
  summaryMetricLabel: { color: "rgba(255,255,255,0.7)" },
  summaryMetricValue: { color: AppPalette.primaryOn },
  summaryText: { fontSize: 13, color: "rgba(255,255,255,0.8)" },
  detailText: { fontSize: 13, color: AppPalette.textMuted, marginTop: 6 },
  costRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 10,
  },
  costInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: AppPalette.text,
    backgroundColor: AppPalette.surface,
  },
  costSaveBtn: {
    backgroundColor: AppPalette.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  costSaveBtnText: { color: AppPalette.primaryOn, fontSize: 12, fontWeight: "600" },
});
