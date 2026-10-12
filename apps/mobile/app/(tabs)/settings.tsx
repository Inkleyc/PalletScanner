import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "expo-router";
import {
  AppState,
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
import {
  getAppSettings,
  setFacebookSellerNote,
  setPromptToPostOnSave,
  subscribeAppSettings,
} from "@/lib/app-settings";
import {
  disableTestMode,
  getSupabaseAuthSnapshot,
  signOutSupabase,
  subscribeSupabaseAuth,
} from "@/lib/supabase-auth";
import {
  disconnectEbayAccount,
  getEbayConnectUrl,
  getEbayConnectionStatus,
  isEbayApiConfigured,
  type EbayConnectionStatus,
} from "@/lib/ebay-integration";
import {
  openFacebookLogin,
  openFacebookSelling,
} from "@/lib/facebook-integration";
import {
  getResetBackupSummary,
  resetAllPalletSessions,
  restoreResetBackup,
  type ResetBackupSummary,
  subscribeInventory,
} from "@/lib/inventory-store";

const getResetBackupTimeLabel = (resetBackup: ResetBackupSummary | null) => {
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
};

export default function SettingsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLargeLayout = width >= 900;
  const [ebayStatus, setEbayStatus] = useState<EbayConnectionStatus | null>(
    null,
  );
  const [ebayStatusError, setEbayStatusError] = useState<string | null>(null);
  const [isRefreshingEbay, setIsRefreshingEbay] = useState(false);
  const [facebookSellerNoteDraft, setFacebookSellerNoteDraft] = useState("");
  const { facebookSellerNote, promptToPostOnSave } = useSyncExternalStore(
    subscribeAppSettings,
    getAppSettings,
    getAppSettings,
  );
  const supabaseAuth = useSyncExternalStore(
    subscribeSupabaseAuth,
    getSupabaseAuthSnapshot,
    getSupabaseAuthSnapshot,
  );
  const resetBackup = useSyncExternalStore(
    subscribeInventory,
    getResetBackupSummary,
    getResetBackupSummary,
  );
  const missingEbayRequirements = ebayStatus?.missingRequirements ?? [];
  const resetBackupTimeLabel = getResetBackupTimeLabel(resetBackup);
  const ebayStatusLabel = !isEbayApiConfigured()
    ? "Backend not configured"
    : ebayStatusError
      ? "Backend unavailable"
      : ebayStatus?.readyToList
        ? "Ready to list"
        : ebayStatus?.connected
          ? "Connected, setup incomplete"
          : isRefreshingEbay
            ? "Checking..."
            : "Seller account not connected";

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
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshEbayStatus();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshEbayStatus]);

  useEffect(() => {
    setFacebookSellerNoteDraft(facebookSellerNote);
  }, [facebookSellerNote]);

  const signOut = async () => {
    await signOutSupabase();
    router.replace("/login");
  };

  const confirmSignOut = () => {
    Alert.alert(
      "Sign out of PalletFlip?",
      "You will need a new verification code to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            void signOut();
          },
        },
      ],
    );
  };

  const exitTestMode = async () => {
    await disableTestMode();
    router.replace("/login");
  };

  const confirmExitTestMode = () => {
    Alert.alert(
      "Exit Test Mode?",
      "You will return to the PalletFlip sign-in screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit Test Mode",
          style: "destructive",
          onPress: () => {
            void exitTestMode();
          },
        },
      ],
    );
  };

  const connectEbayAccount = async () => {
    if (!isEbayApiConfigured()) {
      Alert.alert(
        "eBay backend not configured",
        "The app needs the eBay backend URL before it can connect an account.",
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

  const openFacebookAccountLogin = async () => {
    try {
      await openFacebookLogin();
    } catch (error) {
      Alert.alert(
        "Unable to open Facebook",
        error instanceof Error ? error.message : "Try opening Facebook manually.",
      );
    }
  };

  const openFacebookSellingPage = async () => {
    try {
      await openFacebookSelling();
    } catch (error) {
      Alert.alert(
        "Unable to open Marketplace",
        error instanceof Error ? error.message : "Try opening Facebook manually.",
      );
    }
  };

  const saveFacebookSellerNote = () => {
    setFacebookSellerNote(facebookSellerNoteDraft);
    Alert.alert(
      "Facebook note saved",
      "This note will be appended to future Facebook Marketplace descriptions.",
    );
  };

  const confirmDeleteAppData = () => {
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
  };

  const restoreDeletedAppData = () => {
    const restored = restoreResetBackup();
    if (restored) {
      Alert.alert("Restore complete", "Your deleted pallets and inventory are back.");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Connect accounts and choose how posting should work on this device.
        </Text>

        <View style={styles.card}>
          <Text style={styles.settingTitle}>Posting After Save</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingDescription}>
              Ask whether to open Facebook Marketplace or eBay after saving a new
              item. Leave this off for fast pallet scanning.
            </Text>
            <Switch
              value={promptToPostOnSave}
              onValueChange={setPromptToPostOnSave}
              trackColor={{ false: AppPalette.borderStrong, true: "#a9c8df" }}
              thumbColor={promptToPostOnSave ? AppPalette.primaryStrong : "#f4f4f4"}
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>eBay</Text>

        <View style={styles.card}>
          <Text style={styles.settingTitle}>eBay Account</Text>
          <Text style={styles.settingDescription}>
            Connect the seller account this phone should use when posting to eBay.
          </Text>
          <Text style={styles.integrationStatus}>
            Status: {ebayStatusLabel}
          </Text>
          {ebayStatus ? (
            <Text style={styles.integrationHint}>
              {ebayStatus.environment === "sandbox" ? "Sandbox" : "Production"}{" "}
              - {ebayStatus.marketplaceId} - App auth: {ebayStatus.authMode}
            </Text>
          ) : null}
          {missingEbayRequirements.length > 0 ? (
            <View style={styles.requirementsBox}>
              <Text style={styles.requirementsTitle}>Still needed</Text>
              {missingEbayRequirements.slice(0, 4).map((requirement) => (
                <Text key={requirement} style={styles.requirementItem}>
                  - {requirement}
                </Text>
              ))}
              {missingEbayRequirements.length > 4 ? (
                <Text style={styles.requirementItem}>
                  - {missingEbayRequirements.length - 4} more in web settings
                </Text>
              ) : null}
            </View>
          ) : null}
          {ebayStatusError ? (
            <Text style={styles.integrationError}>{ebayStatusError}</Text>
          ) : null}
          {supabaseAuth.configured && !supabaseAuth.signedIn ? (
            <Text style={styles.integrationHint}>
              Sign in to PalletFlip before connecting eBay when the backend is
              using account auth.
            </Text>
          ) : null}
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              !isEbayApiConfigured() && styles.disabledBtn,
            ]}
            disabled={!isEbayApiConfigured()}
            onPress={() => {
              void connectEbayAccount();
            }}
          >
            <Text style={styles.primaryBtnText}>
              {!isEbayApiConfigured()
                ? "eBay Backend Not Configured"
                : ebayStatus?.connected
                  ? "Reconnect eBay Account"
                  : "Connect eBay Account"}
            </Text>
          </TouchableOpacity>
          {isEbayApiConfigured() ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              disabled={isRefreshingEbay}
              onPress={() => {
                void refreshEbayStatus();
              }}
            >
              <Text style={styles.secondaryBtnText}>
                {isRefreshingEbay ? "Checking..." : "Refresh Status"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {ebayStatus?.connected ? (
            <TouchableOpacity
              style={styles.dangerOutlineBtn}
              onPress={() => {
                void disconnectEbay();
              }}
            >
              <Text style={styles.dangerOutlineBtnText}>Disconnect eBay</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.sectionHeader}>Facebook</Text>

        <View style={styles.card}>
          <Text style={styles.settingTitle}>Facebook Account</Text>
          <Text style={styles.settingDescription}>
            Facebook Marketplace uses whichever account is active in the Facebook
            app or browser. Open Facebook here before posting if you need to
            switch accounts.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                void openFacebookAccountLogin();
              }}
            >
              <Text style={styles.primaryBtnText}>Open Facebook Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                void openFacebookSellingPage();
              }}
            >
              <Text style={styles.secondaryBtnText}>Open Selling Page</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.settingTitle}>Facebook Listing Note</Text>
          <Text style={styles.settingDescription}>
            This note is added to Facebook Marketplace descriptions when you use
            listing tools.
          </Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={facebookSellerNoteDraft}
            onChangeText={setFacebookSellerNoteDraft}
            placeholder="Local pickup. Message with questions."
            placeholderTextColor={AppPalette.textSoft}
            multiline
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={saveFacebookSellerNote}
          >
            <Text style={styles.primaryBtnText}>Save Facebook Note</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>Data</Text>

        <View style={styles.resetCard}>
          <Text style={styles.settingTitle}>Delete App Data</Text>
          <Text style={styles.settingDescription}>
            Delete all pallets and inventory items on this device. We keep one
            undo snapshot for 3 days.
          </Text>
          {resetBackup ? (
            <View style={styles.undoBox}>
              <Text style={styles.undoTitle}>Undo available</Text>
              <Text style={styles.undoText}>
                {resetBackup.palletCount} pallet
                {resetBackup.palletCount === 1 ? "" : "s"} and{" "}
                {resetBackup.itemCount} item
                {resetBackup.itemCount === 1 ? "" : "s"} can still be restored.
              </Text>
              <Text style={styles.undoMeta}>{resetBackupTimeLabel}</Text>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={restoreDeletedAppData}
              >
                <Text style={styles.secondaryBtnText}>Undo Delete</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.resetHint}>
              No delete snapshot is currently available.
            </Text>
          )}
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={confirmDeleteAppData}
          >
            <Text style={styles.dangerBtnText}>Delete All Pallets and Items</Text>
          </TouchableOpacity>
        </View>

        {supabaseAuth.signedIn || supabaseAuth.testMode ? (
          <>
            <Text style={styles.sectionHeader}>Account</Text>
            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={
                supabaseAuth.testMode ? confirmExitTestMode : confirmSignOut
              }
            >
              <Text style={styles.signOutBtnText}>
                {supabaseAuth.testMode ? "Exit Test Mode" : "Sign Out"}
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 24, paddingTop: 60, paddingBottom: 32 },
  innerContent: { width: "100%", alignSelf: "center" },
  innerContentWide: { maxWidth: AppLayout.maxContentWidth },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: AppPalette.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: AppPalette.textMuted,
    marginBottom: 20,
    lineHeight: 20,
  },
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
  sectionHeader: {
    color: AppPalette.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 4,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: AppPalette.text,
    marginBottom: 6,
  },
  settingDescription: {
    flex: 1,
    fontSize: 13,
    color: AppPalette.textMuted,
    lineHeight: 19,
  },
  integrationStatus: {
    fontSize: 13,
    color: AppPalette.text,
    fontWeight: "700",
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
  requirementsBox: {
    backgroundColor: AppPalette.surfaceMuted,
    borderColor: AppPalette.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 10,
  },
  requirementsTitle: {
    color: AppPalette.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  requirementItem: {
    color: AppPalette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    backgroundColor: AppPalette.surface,
    color: AppPalette.text,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
  },
  noteInput: {
    minHeight: 92,
    lineHeight: 19,
    textAlignVertical: "top",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  primaryBtn: {
    flexGrow: 1,
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    marginTop: 12,
  },
  primaryBtnText: {
    color: AppPalette.primaryOn,
    fontSize: 13,
    fontWeight: "700",
  },
  disabledBtn: {
    opacity: 0.56,
  },
  secondaryBtn: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    backgroundColor: AppPalette.surfaceMuted,
    marginTop: 12,
  },
  secondaryBtnText: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  dangerOutlineBtn: {
    borderWidth: 1,
    borderColor: AppPalette.dangerStrong,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  dangerOutlineBtnText: {
    color: AppPalette.dangerStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  resetCard: {
    backgroundColor: AppPalette.dangerSoft,
    borderColor: AppPalette.dangerBorder,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  resetHint: {
    color: AppPalette.dangerStrong,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  undoBox: {
    backgroundColor: AppPalette.surface,
    borderColor: AppPalette.border,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  undoTitle: {
    color: AppPalette.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  undoText: {
    color: AppPalette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  undoMeta: {
    color: AppPalette.dangerStrong,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
  },
  dangerBtn: {
    alignItems: "center",
    backgroundColor: AppPalette.dangerStrong,
    borderRadius: 8,
    marginTop: 14,
    paddingVertical: 12,
  },
  dangerBtnText: {
    color: AppPalette.primaryOn,
    fontSize: 13,
    fontWeight: "700",
  },
  signOutBtn: {
    alignItems: "center",
    borderColor: AppPalette.dangerStrong,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    paddingVertical: 13,
  },
  signOutBtnText: {
    color: AppPalette.dangerStrong,
    fontSize: 14,
    fontWeight: "700",
  },
});
