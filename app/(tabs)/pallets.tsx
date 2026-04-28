import { useState, useSyncExternalStore } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import {
  createPalletSession,
  deletePalletSession,
  getActivePalletId,
  getNextDefaultPalletName,
  getPallets,
  renamePalletSession,
  setActivePalletSession,
  subscribeInventory,
  updatePalletSessionCost,
} from "@/lib/inventory-store";
import { AppLayout, AppPalette } from "@/constants/app-palette";

export default function PalletsScreen() {
  const { width } = useWindowDimensions();
  const pallets = useSyncExternalStore(
    subscribeInventory,
    getPallets,
    getPallets,
  );
  const activePalletId = useSyncExternalStore(
    subscribeInventory,
    getActivePalletId,
    getActivePalletId,
  );
  const [newPalletName, setNewPalletName] = useState(getNextDefaultPalletName());
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const isLargeLayout = width >= 900;

  const handleCreatePallet = () => {
    const pallet = createPalletSession(newPalletName);
    setNewPalletName(getNextDefaultPalletName());
    Alert.alert("Pallet created", `${pallet.name} is now active.`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <Text style={styles.title}>Pallets</Text>
        <Text style={styles.subtitle}>
          Create, rename, switch, cost, or delete pallets from one place.
        </Text>

        <View style={styles.newCard}>
          <Text style={styles.cardTitle}>New Pallet</Text>
          <TextInput
            style={styles.input}
            value={newPalletName}
            onChangeText={setNewPalletName}
            placeholder="Leave blank for the default name"
            placeholderTextColor="#9ca3af"
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCreatePallet}>
            <Text style={styles.primaryBtnText}>Create Pallet</Text>
          </TouchableOpacity>
        </View>

        {pallets.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.cardTitle}>No pallets yet</Text>
            <Text style={styles.cardMeta}>
              Create a pallet to start saving inventory again.
            </Text>
          </View>
        )}

        {pallets.map((pallet) => {
          const isActive = pallet.id === activePalletId;
          return (
            <View key={pallet.id} style={styles.palletCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{pallet.name}</Text>
                <Text style={styles.cardMeta}>
                  {isActive ? "Active pallet" : "Tap below to make active"}
                </Text>
              </View>
              {isActive && <Text style={styles.activeBadge}>Active</Text>}
            </View>

            <TextInput
              style={styles.input}
              value={renameDrafts[pallet.id] ?? pallet.name}
              onChangeText={(value) =>
                setRenameDrafts((current) => ({ ...current, [pallet.id]: value }))
              }
              placeholder="Rename pallet"
              placeholderTextColor="#9ca3af"
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() =>
                  renamePalletSession(pallet.id, renameDrafts[pallet.id] ?? pallet.name)
                }
              >
                <Text style={styles.secondaryBtnText}>Save Name</Text>
              </TouchableOpacity>
              {!isActive && (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setActivePalletSession(pallet.id)}
                >
                  <Text style={styles.secondaryBtnText}>Make Active</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.input}
              value={
                costDrafts[pallet.id] ??
                (pallet.palletCost !== null ? String(pallet.palletCost) : "")
              }
              onChangeText={(value) =>
                setCostDrafts((current) => ({ ...current, [pallet.id]: value }))
              }
              placeholder="Pallet cost"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  const value = (costDrafts[pallet.id] ?? "").trim();
                  if (!value) {
                    updatePalletSessionCost(pallet.id, null);
                    return;
                  }
                  const parsed = Number(value);
                  if (Number.isNaN(parsed) || parsed < 0) {
                    Alert.alert("Invalid cost", "Enter a valid pallet cost.");
                    return;
                  }
                  updatePalletSessionCost(pallet.id, parsed);
                }}
              >
                <Text style={styles.secondaryBtnText}>Save Cost</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  Alert.alert(
                    "Delete pallet",
                    pallets.length === 1
                      ? `Delete ${pallet.name}? This will leave you with no pallets until you create another one.`
                      : `Delete ${pallet.name} and its items?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                          deletePalletSession(pallet.id);
                        },
                      },
                    ],
                  );
                }}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 20, paddingTop: 56, paddingBottom: 28 },
  innerContent: { width: "100%", alignSelf: "center" },
  innerContentWide: { maxWidth: AppLayout.maxContentWidth },
  title: { fontSize: 30, fontWeight: "700", color: AppPalette.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: AppPalette.textMuted, marginBottom: 20, lineHeight: 20 },
  newCard: {
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  emptyCard: {
    backgroundColor: AppPalette.surfaceTint,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  palletCard: {
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: AppPalette.text },
  cardMeta: { fontSize: 13, color: AppPalette.textMuted, marginTop: 4 },
  activeBadge: {
    backgroundColor: AppPalette.primaryStrong,
    color: AppPalette.primaryOn,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: AppPalette.text,
    backgroundColor: AppPalette.surface,
    marginBottom: 10,
  },
  row: { flexDirection: "row", gap: 10, marginBottom: 8, flexWrap: "wrap" },
  primaryBtn: {
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: AppPalette.primaryOn, fontWeight: "700", fontSize: 14 },
  secondaryBtn: {
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryBtnText: { color: AppPalette.text, fontWeight: "600", fontSize: 13 },
  deleteBtn: {
    backgroundColor: AppPalette.dangerSoft,
    borderWidth: 1,
    borderColor: "#efc0b9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  deleteBtnText: { color: AppPalette.dangerStrong, fontWeight: "600", fontSize: 13 },
});
