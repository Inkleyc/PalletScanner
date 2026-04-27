import { useSyncExternalStore } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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

export default function SettingsScreen() {
  const { promptToPostOnSave } = useSyncExternalStore(
    subscribeAppSettings,
    getAppSettings,
    getAppSettings,
  );

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
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Choose how saving and posting should work</Text>

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
            trackColor={{ false: "#d9d9d9", true: "#9fd3b9" }}
            thumbColor={promptToPostOnSave ? "#2d6a4f" : "#f4f4f4"}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "600", color: "#111", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 24 },
  card: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
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
    color: "#111",
    marginBottom: 6,
  },
  settingDescription: {
    fontSize: 13,
    color: "#666",
    lineHeight: 19,
  },
  integrationStatus: {
    fontSize: 13,
    color: "#111",
    fontWeight: "600",
    marginTop: 12,
  },
  integrationHint: {
    fontSize: 12,
    color: "#666",
    lineHeight: 18,
    marginTop: 8,
  },
  connectBtn: {
    backgroundColor: "#e53238",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 14,
  },
  connectBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
