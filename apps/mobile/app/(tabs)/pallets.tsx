import { useState, useSyncExternalStore } from "react";
import {
  Modal,
  Pressable,
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
  getInventory,
  getNextDefaultPalletName,
  getPallets,
  renamePalletSession,
  setActivePalletSession,
  subscribeInventory,
  updatePalletSessionCost,
} from "@/lib/inventory-store";
import { AppLayout, AppPalette } from "@/constants/app-palette";
import { AppAlert as Alert } from "@/lib/app-alert";

type EditField = "name" | "cost";

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
  const items = useSyncExternalStore(
    subscribeInventory,
    getInventory,
    getInventory,
  );
  const [newPalletName, setNewPalletName] = useState(getNextDefaultPalletName());
  const [editing, setEditing] = useState<{
    palletId: string;
    field: EditField;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedPalletId, setSelectedPalletId] = useState<string | null>(null);
  const [detailName, setDetailName] = useState("");
  const [detailCost, setDetailCost] = useState("");
  const isLargeLayout = width >= 900;

  const handleCreatePallet = () => {
    const pallet = createPalletSession(newPalletName);
    setNewPalletName(getNextDefaultPalletName());
    Alert.alert("Pallet created", `${pallet.name} is now active.`);
  };

  const closeEditModal = () => {
    setEditing(null);
    setEditValue("");
  };

  const saveEdit = () => {
    if (!editing) return;

    if (editing.field === "name") {
      if (!editValue.trim()) {
        Alert.alert("Name required", "Enter a name for this pallet.");
        return;
      }
      renamePalletSession(editing.palletId, editValue);
    } else {
      const value = editValue.trim();
      if (!value) {
        updatePalletSessionCost(editing.palletId, null);
      } else {
        const parsed = Number(value);
        if (Number.isNaN(parsed) || parsed < 0) {
          Alert.alert("Invalid cost", "Enter a valid pallet cost.");
          return;
        }
        updatePalletSessionCost(editing.palletId, parsed);
      }
    }

    closeEditModal();
  };

  const selectedPallet = pallets.find((pallet) => pallet.id === selectedPalletId) ?? null;
  const selectedPalletItems = selectedPallet ? items.filter((item) => item.palletId === selectedPallet.id) : [];

  const openPalletDetails = (pallet: (typeof pallets)[number]) => {
    setSelectedPalletId(pallet.id);
    setDetailName(pallet.name);
    setDetailCost(pallet.palletCost === null ? "" : String(pallet.palletCost));
  };

  const closePalletDetails = () => setSelectedPalletId(null);

  const savePalletDetails = () => {
    if (!selectedPallet) return;
    if (!detailName.trim()) return Alert.alert("Name required", "Enter a name for this pallet.");
    const cost = detailCost.trim() ? Number(detailCost) : null;
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return Alert.alert("Invalid cost", "Enter a valid pallet cost.");
    renamePalletSession(selectedPallet.id, detailName.trim());
    updatePalletSessionCost(selectedPallet.id, cost);
    closePalletDetails();
  };

  const confirmDeleteSelectedPallet = () => {
    if (!selectedPallet) return;
    const pallet = selectedPallet;
    closePalletDetails();
    setTimeout(() => Alert.alert("Delete pallet", pallets.length === 1 ? `Delete ${pallet.name}? This will leave you with no pallets until you create another one.` : `Delete ${pallet.name} and its items?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deletePalletSession(pallet.id) },
    ]), 180);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <Text style={styles.title}>Pallets</Text>
        <Text style={styles.subtitle}>
          Create pallets and choose which one new scans save into.
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
          const palletItems = items.filter((item) => item.palletId === pallet.id);
          const soldCount = palletItems.filter(
            (item) => item.soldPrice !== null,
          ).length;
          return (
            <TouchableOpacity key={pallet.id} activeOpacity={0.8} style={styles.palletCard} onPress={() => openPalletDetails(pallet)}>
              <View style={styles.compactPalletMain}>
                <View style={styles.compactPalletIdentity}>
                  <Text style={styles.cardTitle}>{pallet.name}</Text>
                  <Text style={styles.cardMeta}>{palletItems.length} items · {soldCount} sold</Text>
                </View>
                <View style={styles.compactPalletSummary}>
                  <Text style={styles.compactPalletCost}>{pallet.palletCost === null ? "Cost not set" : `$${pallet.palletCost}`}</Text>
                  {isActive ? <Text style={styles.activeBadge}>Active</Text> : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={Boolean(selectedPallet)} transparent animationType="fade" onRequestClose={closePalletDetails}>
        <Pressable style={styles.modalBackdrop} onPress={closePalletDetails}>
          <Pressable style={styles.palletDetailCard} onPress={() => undefined}>
            <View style={styles.palletDetailHeader}>
              <View style={styles.palletDetailHeading}><Text style={styles.modalTitle}>Pallet details</Text><Text style={styles.cardMeta}>{selectedPallet?.id}</Text></View>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closePalletDetails}><Text style={styles.modalCancelText}>Close</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.palletDetailContent}>
              <View><Text style={styles.valueLabel}>Name</Text><TextInput style={styles.modalInput} value={detailName} onChangeText={setDetailName} placeholder="Pallet name" /></View>
              <View><Text style={styles.valueLabel}>Purchase cost</Text><TextInput style={styles.modalInput} value={detailCost} onChangeText={setDetailCost} placeholder="Not set" keyboardType="decimal-pad" /></View>
              <View style={styles.palletStatsRow}>
                <View style={styles.palletStatBox}><Text style={styles.palletStatLabel}>Items</Text><Text style={styles.palletStatValue}>{selectedPalletItems.length}</Text></View>
                <View style={styles.palletStatBox}><Text style={styles.palletStatLabel}>Sold</Text><Text style={styles.palletStatValue}>{selectedPalletItems.filter((item) => item.soldPrice !== null).length}</Text></View>
                <View style={styles.palletStatBox}><Text style={styles.palletStatLabel}>List value</Text><Text style={styles.palletStatValue}>${selectedPalletItems.reduce((sum, item) => sum + (item.listing_price ?? item.high_price) * item.quantity, 0).toFixed(0)}</Text></View>
              </View>
              <View style={styles.palletDetailActions}>
                {selectedPallet && selectedPallet.id !== activePalletId ? <TouchableOpacity style={styles.secondaryBtn} onPress={() => setActivePalletSession(selectedPallet.id)}><Text style={styles.secondaryBtnText}>Make active</Text></TouchableOpacity> : <Text style={styles.activeDetailNote}>Active scan pallet</Text>}
                <TouchableOpacity style={styles.deleteBtn} onPress={confirmDeleteSelectedPallet}><Text style={styles.deleteBtnText}>Delete pallet</Text></TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={savePalletDetails}><Text style={styles.primaryBtnText}>Save changes</Text></TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={closeEditModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeEditModal}>
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Edit Pallet {editing?.field === "cost" ? "Cost" : "Name"}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={editValue}
              onChangeText={setEditValue}
              placeholder={editing?.field === "cost" ? "Pallet cost" : "Pallet name"}
              placeholderTextColor="#9ca3af"
              keyboardType={editing?.field === "cost" ? "decimal-pad" : "default"}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={closeEditModal}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveEdit}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    padding: 14,
    marginBottom: 8,
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
  compactPalletMain: { alignItems: "center", flexDirection: "row", gap: 12 },
  compactPalletIdentity: { flex: 1, minWidth: 0 },
  compactPalletSummary: { alignItems: "flex-end", gap: 6 },
  compactPalletCost: { color: AppPalette.text, fontSize: 14, fontWeight: "700" },
  palletStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  palletStatBox: {
    flex: 1,
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 8,
    padding: 10,
  },
  palletStatLabel: {
    color: AppPalette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 3,
  },
  palletStatValue: {
    color: AppPalette.text,
    fontSize: 16,
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
  manageToggleBtn: {
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  manageToggleBtnText: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  managementPanel: {
    borderTopWidth: 1,
    borderTopColor: AppPalette.border,
    paddingTop: 12,
    marginTop: 2,
  },
  valueLabel: {
    color: AppPalette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  valueBox: {
    alignItems: "center",
    backgroundColor: AppPalette.surfaceMuted,
    borderColor: AppPalette.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    minHeight: 46,
    paddingLeft: 12,
  },
  valueText: {
    color: AppPalette.text,
    flex: 1,
    fontSize: 14,
  },
  editBtn: {
    alignItems: "center",
    alignSelf: "stretch",
    borderLeftColor: AppPalette.border,
    borderLeftWidth: 1,
    justifyContent: "center",
    minWidth: 48,
  },
  deleteRow: {
    alignItems: "flex-start",
    marginTop: 2,
  },
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
  modalBackdrop: {
    backgroundColor: AppPalette.modalBackdrop,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 12,
    padding: 20,
  },
  palletDetailCard: { backgroundColor: AppPalette.surface, borderRadius: 10, maxHeight: "88%", overflow: "hidden" },
  palletDetailHeader: { alignItems: "center", borderBottomColor: AppPalette.border, borderBottomWidth: 1, flexDirection: "row", padding: 16 },
  palletDetailHeading: { flex: 1 },
  palletDetailContent: { gap: 4, padding: 16 },
  palletDetailActions: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  activeDetailNote: { backgroundColor: AppPalette.successSoft, borderRadius: 8, color: AppPalette.text, fontSize: 13, fontWeight: "700", overflow: "hidden", paddingHorizontal: 12, paddingVertical: 10 },
  modalTitle: {
    color: AppPalette.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: AppPalette.surface,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    color: AppPalette.text,
    fontSize: 15,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  modalCancelBtn: {
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  modalCancelText: {
    color: AppPalette.text,
    fontSize: 14,
    fontWeight: "600",
  },
  modalSaveBtn: {
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  modalSaveText: {
    color: AppPalette.primaryOn,
    fontSize: 14,
    fontWeight: "700",
  },
});
