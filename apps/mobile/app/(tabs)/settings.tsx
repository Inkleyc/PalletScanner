import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
  getSupabaseAuthSnapshot,
  handleSupabaseCallbackUrl,
  hydrateSupabaseAuth,
  isSupabaseConfigured,
  sendSupabaseMagicLink,
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

export default function SettingsScreen() {
  const { width } = useWindowDimensions();
  const isLargeLayout = width >= 900;
  const [ebayStatus, setEbayStatus] = useState<EbayConnectionStatus | null>(
    null,
  );
  const [ebayStatusError, setEbayStatusError] = useState<string | null>(null);
  const [isRefreshingEbay, setIsRefreshingEbay] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [isSendingLoginLink, setIsSendingLoginLink] = useState(false);
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
  const missingEbayRequirements = ebayStatus?.missingRequirements ?? [];
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
    void hydrateSupabaseAuth();
    void Linking.getInitialURL().then((url) => {
      void handleSupabaseCallbackUrl(url).then((handled) => {
        if (handled) {
          void refreshEbayStatus();
        }
      });
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleSupabaseCallbackUrl(url).then((handled) => {
        if (handled) {
          void refreshEbayStatus();
        }
      });
    });

    return () => {
      subscription.remove();
    };
  }, [refreshEbayStatus]);

  useEffect(() => {
    setFacebookSellerNoteDraft(facebookSellerNote);
  }, [facebookSellerNote]);

  const sendLoginLink = async () => {
    setIsSendingLoginLink(true);
    try {
      await sendSupabaseMagicLink(loginEmail);
      Alert.alert(
        "Check your email",
        "Open the magic link on this device to sign in.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to send login link",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    } finally {
      setIsSendingLoginLink(false);
    }
  };

  const signOut = async () => {
    await signOutSupabase();
    Alert.alert("Signed out", "The saved app login session was cleared.");
    await refreshEbayStatus();
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Connect accounts and choose how posting should work on this device.
        </Text>

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
              Sign in below before connecting eBay when the backend is using
              account auth.
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

        <View style={styles.card}>
          <Text style={styles.settingTitle}>App Login</Text>
          <Text style={styles.settingDescription}>
            Sign in on this device so marketplace actions can use your saved
            account. The eBay backend uses this session when account auth is
            enabled.
          </Text>
          <Text style={styles.integrationStatus}>
            {!isSupabaseConfigured()
              ? "Login is not configured yet"
              : supabaseAuth.signedIn
                ? `Signed in${supabaseAuth.email ? ` as ${supabaseAuth.email}` : ""}`
                : "Ready to sign in"}
          </Text>
          {supabaseAuth.configured && !supabaseAuth.signedIn ? (
            <>
              <TextInput
                style={styles.input}
                value={loginEmail}
                onChangeText={setLoginEmail}
                placeholder="Email address"
                placeholderTextColor={AppPalette.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              <TouchableOpacity
                style={styles.primaryBtn}
                disabled={isSendingLoginLink}
                onPress={() => {
                  void sendLoginLink();
                }}
              >
                <Text style={styles.primaryBtnText}>
                  {isSendingLoginLink ? "Sending..." : "Send Login Link"}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
          {supabaseAuth.signedIn ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                void signOut();
              }}
            >
              <Text style={styles.secondaryBtnText}>Sign Out</Text>
            </TouchableOpacity>
          ) : null}
        </View>

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
});
