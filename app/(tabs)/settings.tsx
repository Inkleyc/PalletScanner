import { useSyncExternalStore } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

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
});
