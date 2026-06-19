import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { AppLayout, AppPalette } from "@/constants/app-palette";
import { AppAlert as Alert } from "@/lib/app-alert";
import { FREE_SCAN_LIMIT, getAppMeta, subscribeAppMeta } from "@/lib/app-meta";
import {
  clearRuntimeBearerToken,
  getAppAuth,
  setRuntimeBearerToken,
  subscribeAppAuth,
} from "@/lib/app-auth";
import {
  disconnectEbayAccount,
  getEbayConnectUrl,
  getEbayConnectionStatus,
  isEbayApiConfigured,
  type EbayConnectionStatus,
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
  const [ebayStatus, setEbayStatus] = useState<EbayConnectionStatus | null>(
    null,
  );
  const [ebayStatusError, setEbayStatusError] = useState<string | null>(null);
  const [isRefreshingEbay, setIsRefreshingEbay] = useState(false);
  const { promptToPostOnSave } = useSyncExternalStore(
    subscribeAppSettings,
    getAppSettings,
    getAppSettings,
  );
  const appAuth = useSyncExternalStore(
    subscribeAppAuth,
    getAppAuth,
    getAppAuth,
  );
  const [bearerTokenDraft, setBearerTokenDraft] = useState("");
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

  const refreshEbayStatus = useCallback(async () => {
    if (!isEbayApiConfigured()) {
      setEbayStatus(null);
      setEbayStatusError(null);
      return;
    }

    setIsRefreshingEbay(true);
    try {
      setEbayStatus(await getEbayConnectionStatus());
      setEbayStatusError(null);
    } catch (error) {
      setEbayStatus(null);
      setEbayStatusError(
        error instanceof Error ? error.message : "Backend unavailable",
      );
    } finally {
      setIsRefreshingEbay(false);
    }
  }, []);

  useEffect(() => {
    void refreshEbayStatus();
  }, [refreshEbayStatus]);

  useEffect(() => {
    setBearerTokenDraft(appAuth.bearerToken);
  }, [appAuth.bearerToken]);

  const saveBearerToken = async () => {
    setRuntimeBearerToken(bearerTokenDraft);
    Alert.alert(
      "App auth token saved",
      "Future eBay requests will use this runtime bearer token.",
    );
    await refreshEbayStatus();
  };

  const clearBearerToken = async () => {
    clearRuntimeBearerToken();
    setBearerTokenDraft("");
    Alert.alert(
      "App auth token cleared",
      "The app will fall back to any preview token baked into the build.",
    );
    await refreshEbayStatus();
  };

  const connectEbayAccount = async () => {
    if (!isEbayApiConfigured()) {
      Alert.alert(
        "eBay backend not configured",
        "Set EXPO_PUBLIC_EBAY_API_BASE_URL first so the app knows where your eBay server lives.",
      );
      return;
    }

    try {
      await Linking.openURL(await getEbayConnectUrl());
    } catch (error) {
      Alert.alert(
        "Unable to connect eBay",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    }
  };

  const disconnectEbay = async () => {
    try {
      await disconnectEbayAccount();
      Alert.alert(
        "eBay disconnected",
        "The stored seller authorization was removed.",
      );
      await refreshEbayStatus();
    } catch (error) {
      Alert.alert(
        "Unable to disconnect eBay",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    }
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
            Status:{" "}
            {!isEbayApiConfigured()
              ? "Browser fallback"
              : ebayStatusError
                ? "Backend unavailable"
                : ebayStatus?.connected
                  ? "Seller account connected"
                  : isRefreshingEbay
                    ? "Checking..."
                    : "Seller account not connected"}
          </Text>
          {ebayStatus ? (
            <Text style={styles.integrationHint}>
              {ebayStatus.environment === "sandbox" ? "Sandbox" : "Production"}{" "}
              · {ebayStatus.marketplaceId}
            </Text>
          ) : null}
          {ebayStatusError ? (
            <Text style={styles.integrationError}>{ebayStatusError}</Text>
          ) : null}
          <Text style={styles.integrationHint}>
            Set `EXPO_PUBLIC_EBAY_API_BASE_URL` in your environment to point the
            app at a backend that handles eBay OAuth and Sell API calls.
          </Text>
          <View style={styles.authBox}>
            <Text style={styles.authBoxTitle}>Runtime App Auth</Text>
            <Text style={styles.integrationHint}>
              Production backends require a user bearer token. Paste a JWT here
              for production testing until the final login provider is wired in.
            </Text>
            <TextInput
              style={styles.authInput}
              value={bearerTokenDraft}
              onChangeText={setBearerTokenDraft}
              placeholder="Bearer token / JWT"
              placeholderTextColor={AppPalette.textSoft}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            <Text style={styles.integrationHint}>
              Runtime token: {appAuth.bearerToken ? "Saved" : "Not saved"}
            </Text>
            <View style={styles.authActionRow}>
              <TouchableOpacity
                style={styles.authSaveBtn}
                onPress={() => {
                  void saveBearerToken();
                }}
              >
                <Text style={styles.authSaveBtnText}>Save Token</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.authClearBtn}
                onPress={() => {
                  void clearBearerToken();
                }}
              >
                <Text style={styles.authClearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={() => {
              void connectEbayAccount();
            }}
          >
            <Text style={styles.connectBtnText}>Connect eBay Account</Text>
          </TouchableOpacity>
          {isEbayApiConfigured() ? (
            <TouchableOpacity
              style={styles.refreshBtn}
              disabled={isRefreshingEbay}
              onPress={() => {
                void refreshEbayStatus();
              }}
            >
              <Text style={styles.refreshBtnText}>
                {isRefreshingEbay ? "Checking..." : "Refresh Status"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {ebayStatus?.connected ? (
            <TouchableOpacity
              style={styles.disconnectBtn}
              onPress={() => {
                void disconnectEbay();
              }}
            >
              <Text style={styles.disconnectBtnText}>Disconnect eBay</Text>
            </TouchableOpacity>
          ) : null}
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
  integrationError: {
    fontSize: 12,
    color: AppPalette.dangerStrong,
    lineHeight: 18,
    marginTop: 8,
  },
  authBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 10,
    padding: 12,
  },
  authBoxTitle: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  authInput: {
    marginTop: 10,
    minHeight: 76,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    backgroundColor: AppPalette.surface,
    color: AppPalette.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12,
    lineHeight: 17,
    textAlignVertical: "top",
  },
  authActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  authSaveBtn: {
    flex: 1,
    minWidth: 120,
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  authSaveBtnText: {
    color: AppPalette.primaryOn,
    fontSize: 13,
    fontWeight: "700",
  },
  authClearBtn: {
    minWidth: 92,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  authClearBtnText: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: "700",
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
  refreshBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  refreshBtnText: {
    color: AppPalette.text,
    fontWeight: "600",
    fontSize: 14,
  },
  disconnectBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: AppPalette.dangerStrong,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  disconnectBtnText: {
    color: AppPalette.dangerStrong,
    fontWeight: "600",
    fontSize: 14,
  },
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
