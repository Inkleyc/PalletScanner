import { useMemo, useSyncExternalStore } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { AppLayout, AppPalette } from "@/constants/app-palette";
import { FREE_SCAN_LIMIT, getAppMeta, subscribeAppMeta } from "@/lib/app-meta";
import {
  getEbayApiBaseUrl,
  getEbayIntegrationStatusLabel,
  isEbayApiConfigured,
} from "@/lib/ebay-integration";
import {
  getAppSettings,
  setPromptToPostOnSave,
  subscribeAppSettings,
} from "@/lib/app-settings";
import {
  getResetBackupSummary,
  resetAllPalletSessions,
  restoreResetBackup,
  subscribeInventory,
} from "@/lib/inventory-store";

export default function SettingsScreen() {
  const { width } = useWindowDimensions();
  const { promptToPostOnSave } = useSyncExternalStore(
    subscribeAppSettings,
    getAppSettings,
    getAppSettings,
  );
  const { lifetimeScans, currentMonthScans } = useSyncExternalStore(
    subscribeAppMeta,
    getAppMeta,
    getAppMeta,
  );
  const isLargeLayout = width >= 900;
  const resetBackup = useSyncExternalStore(
    subscribeInventory,
    getResetBackupSummary,
    getResetBackupSummary,
  );
  const resetBackupTimeLabel = useMemo(() => {
    if (!resetBackup) {
      return null;
    }

    const remainingMs = Math.max(resetBackup.expiresAt - Date.now(), 0);
    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    if (remainingHours >= 24) {
      const remainingDays = Math.ceil(remainingHours / 24);
      return `${remainingDays} day${remainingDays === 1 ? "" : "s"} left`;
    }

    return `${remainingHours} hour${remainingHours === 1 ? "" : "s"} left`;
  }, [resetBackup]);
  const scanUsageProgress = Math.min(currentMonthScans / FREE_SCAN_LIMIT, 1);

  const connectEbayAccount = async () => {
    if (!isEbayApiConfigured()) {
      Alert.alert(
        "eBay backend not configured",
        "Set EXPO_PUBLIC_EBAY_API_BASE_URL first so the app knows where your eBay server lives.",
      );
      return;
    }

    await Linking.openURL(`${getEbayApiBaseUrl()}/ebay/connect`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Choose how saving and posting should work</Text>

        <View style={styles.card}>
          <Text style={styles.settingTitle}>Scan Usage</Text>
          <Text style={styles.settingDescription}>
            Keep an eye on monthly usage while we get the future Pro plan shell in place.
          </Text>
          <Text style={styles.integrationStatus}>
            {currentMonthScans} / {FREE_SCAN_LIMIT} scans used this month
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${scanUsageProgress * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.integrationHint}>Lifetime scans: {lifetimeScans}</Text>
          <Text style={styles.upgradeHint}>
            Upgrade to Pro for unlimited scans
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Prompt To Post After Save</Text>
              <Text style={styles.settingDescription}>
                After saving a new inventory item, ask whether to open Facebook
                Marketplace or eBay right away.
              </Text>
            </View>
            <Switch
              value={promptToPostOnSave}
              onValueChange={setPromptToPostOnSave}
              trackColor={{ false: AppPalette.borderStrong, true: "#a9c8df" }}
              thumbColor={promptToPostOnSave ? AppPalette.primaryStrong : "#f4f4f4"}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.settingTitle}>eBay Integration</Text>
          <Text style={styles.settingDescription}>
            {isEbayApiConfigured()
              ? "The app will try your configured backend first for real eBay API listing creation."
              : "No eBay backend is configured yet, so eBay posting uses the browser helper flow for now."}
          </Text>
          <Text style={styles.integrationStatus}>
            Status: {getEbayIntegrationStatusLabel()}
          </Text>
          <Text style={styles.integrationHint}>
            Set `EXPO_PUBLIC_EBAY_API_BASE_URL` in your environment to point the
            app at a backend that handles eBay OAuth and Sell API calls.
          </Text>
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={() => {
              void connectEbayAccount();
            }}
          >
            <Text style={styles.connectBtnText}>Connect eBay Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.resetCard}>
          <Text style={styles.settingTitle}>Delete App Data</Text>
          <Text style={styles.settingDescription}>
            Delete all pallets and inventory items. We keep one undo snapshot for 3 days before it expires for good.
          </Text>
          {resetBackup ? (
            <View style={styles.undoBox}>
              <Text style={styles.undoTitle}>Undo available</Text>
              <Text style={styles.undoText}>
                {resetBackup.palletCount} pallet{resetBackup.palletCount === 1 ? "" : "s"} and{" "}
                {resetBackup.itemCount} item{resetBackup.itemCount === 1 ? "" : "s"} can still be restored.
              </Text>
              <Text style={styles.undoMeta}>{resetBackupTimeLabel}</Text>
              <TouchableOpacity
                style={styles.undoBtn}
                onPress={() => {
                  const restored = restoreResetBackup();
                  if (restored) {
                    Alert.alert("Restore complete", "Your deleted pallets and inventory are back.");
                  }
                }}
              >
                <Text style={styles.undoBtnText}>Undo Delete</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.resetHint}>No delete snapshot is currently available.</Text>
          )}
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              Alert.alert(
                "Delete all data",
                "This deletes every pallet and inventory item. You can undo it from Settings for up to 3 days.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      resetAllPalletSessions();
                    },
                  },
                ],
              );
            }}
          >
            <Text style={styles.resetBtnText}>Delete All Pallets and Items</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 24, paddingTop: 60 },
  innerContent: { width: "100%", alignSelf: "center" },
  innerContentWide: { maxWidth: AppLayout.maxContentWidth },
  title: { fontSize: 28, fontWeight: "600", color: AppPalette.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: AppPalette.textMuted, marginBottom: 24 },
  card: {
    backgroundColor: AppPalette.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AppPalette.border,
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  settingCopy: { flex: 1 },
  settingTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: AppPalette.text,
    marginBottom: 6,
  },
  settingDescription: {
    fontSize: 13,
    color: AppPalette.textMuted,
    lineHeight: 19,
  },
  integrationStatus: {
    fontSize: 13,
    color: AppPalette.text,
    fontWeight: "600",
    marginTop: 12,
  },
  integrationHint: {
    fontSize: 12,
    color: AppPalette.textMuted,
    lineHeight: 18,
    marginTop: 8,
  },
  progressTrack: {
    marginTop: 12,
    height: 10,
    borderRadius: 999,
    backgroundColor: AppPalette.surfaceMuted,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  progressFill: {
    height: "100%",
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 999,
  },
  upgradeHint: {
    fontSize: 13,
    color: AppPalette.primary,
    fontWeight: "600",
    marginTop: 10,
  },
  connectBtn: {
    backgroundColor: AppPalette.primaryStrong,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 14,
  },
  connectBtnText: { color: AppPalette.primaryOn, fontWeight: "600", fontSize: 14 },
  resetCard: {
    backgroundColor: AppPalette.dangerSoft,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#efc0b9",
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  resetHint: {
    fontSize: 12,
    color: AppPalette.dangerStrong,
    lineHeight: 18,
    marginTop: 10,
  },
  undoBox: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    padding: 12,
  },
  undoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: AppPalette.text,
    marginBottom: 4,
  },
  undoText: {
    fontSize: 12,
    color: AppPalette.textMuted,
    lineHeight: 18,
  },
  undoMeta: {
    fontSize: 12,
    color: AppPalette.dangerStrong,
    fontWeight: "600",
    marginTop: 8,
  },
  undoBtn: {
    marginTop: 12,
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  undoBtnText: { color: AppPalette.primaryOn, fontWeight: "600", fontSize: 14 },
  resetBtn: {
    marginTop: 14,
    backgroundColor: AppPalette.dangerStrong,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  resetBtnText: { color: AppPalette.primaryOn, fontWeight: "700", fontSize: 14 },
});
