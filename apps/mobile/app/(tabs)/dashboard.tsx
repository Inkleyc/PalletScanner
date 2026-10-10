import * as WebBrowser from "expo-web-browser";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AppPalette } from "@/constants/app-palette";
import { AppAlert as Alert } from "@/lib/app-alert";

const DASHBOARD_URL =
  process.env.EXPO_PUBLIC_DASHBOARD_URL?.trim() ?? "";

export default function DashboardScreen() {
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
});
