import { useMemo, useState, useSyncExternalStore } from "react";
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
import { AppLayout, type AppPaletteShape } from "@/constants/app-palette";
import { useAppPalette } from "@/lib/app-theme";
import { AppAlert as Alert } from "@/lib/app-alert";

type EditField = "name" | "cost";

export default function PalletsScreen() {
  const palette = useAppPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
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
    if (selectedPallet.isSystem) return closePalletDetails();
    if (!detailName.trim()) return Alert.alert("Name required", "Enter a name for this pallet.");
    const cost = detailCost.trim() ? Number(detailCost) : null;
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return Alert.alert("Invalid cost", "Enter a valid pallet cost.");
    renamePalletSession(selectedPallet.id, detailName.trim());
    updatePalletSessionCost(selectedPallet.id, cost);
    closePalletDetails();
  };

  const confirmDeleteSelectedPallet = () => {
    if (!selectedPallet) return;
    if (selectedPallet.isSystem) return;
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
            placeholderTextColor={palette.textSoft}
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
              <View><Text style={styles.valueLabel}>Name</Text><TextInput editable={!selectedPallet?.isSystem} style={styles.modalInput} value={detailName} onChangeText={setDetailName} placeholder="Pallet name" /></View>
              <View><Text style={styles.valueLabel}>Purchase cost</Text><TextInput editable={!selectedPallet?.isSystem} style={styles.modalInput} value={detailCost} onChangeText={setDetailCost} placeholder="Not set" keyboardType="decimal-pad" /></View>
              <View style={styles.palletStatsRow}>
                <View style={styles.palletStatBox}><Text style={styles.palletStatLabel}>Items</Text><Text style={styles.palletStatValue}>{selectedPalletItems.length}</Text></View>
                <View style={styles.palletStatBox}><Text style={styles.palletStatLabel}>Sold</Text><Text style={styles.palletStatValue}>{selectedPalletItems.filter((item) => item.soldPrice !== null).length}</Text></View>
                <View style={styles.palletStatBox}><Text style={styles.palletStatLabel}>List value</Text><Text style={styles.palletStatValue}>${selectedPalletItems.reduce((sum, item) => sum + (item.listing_price ?? item.high_price) * item.quantity, 0).toFixed(0)}</Text></View>
              </View>
              <View style={styles.palletDetailActions}>
                {selectedPallet && selectedPallet.id !== activePalletId ? <TouchableOpacity style={styles.secondaryBtn} onPress={() => setActivePalletSession(selectedPallet.id)}><Text style={styles.secondaryBtnText}>Make active</Text></TouchableOpacity> : <Text style={styles.activeDetailNote}>Active scan pallet</Text>}
                {!selectedPallet?.isSystem ? <TouchableOpacity style={styles.deleteBtn} onPress={confirmDeleteSelectedPallet}><Text style={styles.deleteBtnText}>Delete pallet</Text></TouchableOpacity> : <Text style={styles.activeDetailNote}>Built-in container</Text>}
              </View>
              {!selectedPallet?.isSystem ? <TouchableOpacity style={styles.primaryBtn} onPress={savePalletDetails}><Text style={styles.primaryBtnText}>Save changes</Text></TouchableOpacity> : null}
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
              placeholderTextColor={palette.textSoft}
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

const createStyles = (palette: AppPaletteShape) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, paddingTop: 56, paddingBottom: 28 },
  innerContent: { width: "100%", alignSelf: "center" },
  innerContentWide: { maxWidth: AppLayout.maxContentWidth },
  title: { fontSize: 30, fontWeight: "700", color: palette.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: palette.textMuted, marginBottom: 20, lineHeight: 20 },
  newCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  emptyCard: {
    backgroundColor: palette.surfaceTint,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  palletCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    shadowColor: palette.shadow,
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
  cardTitle: { fontSize: 18, fontWeight: "700", color: palette.text },
  cardMeta: { fontSize: 13, color: palette.textMuted, marginTop: 4 },
  activeBadge: {
    backgroundColor: palette.primaryStrong,
    color: palette.primaryOn,
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
  compactPalletCost: { color: palette.text, fontSize: 14, fontWeight: "700" },
  palletStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  palletStatBox: {
    flex: 1,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    padding: 10,
  },
  palletStatLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 3,
  },
  palletStatValue: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.text,
    backgroundColor: palette.surface,
    marginBottom: 10,
  },
  row: { flexDirection: "row", gap: 10, marginBottom: 8, flexWrap: "wrap" },
  primaryBtn: {
    backgroundColor: palette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: palette.primaryOn, fontWeight: "700", fontSize: 14 },
  secondaryBtn: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryBtnText: { color: palette.text, fontWeight: "600", fontSize: 13 },
  manageToggleBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  manageToggleBtnText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  managementPanel: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: 12,
    marginTop: 2,
  },
  valueLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  valueBox: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    minHeight: 46,
    paddingLeft: 12,
  },
  valueText: {
    color: palette.text,
    flex: 1,
    fontSize: 14,
  },
  editBtn: {
    alignItems: "center",
    alignSelf: "stretch",
    borderLeftColor: palette.border,
    borderLeftWidth: 1,
    justifyContent: "center",
    minWidth: 48,
  },
  deleteRow: {
    alignItems: "flex-start",
    marginTop: 2,
  },
  deleteBtn: {
    backgroundColor: palette.dangerSoft,
    borderWidth: 1,
    borderColor: palette.dangerBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  deleteBtnText: { color: palette.dangerStrong, fontWeight: "600", fontSize: 13 },
  modalBackdrop: {
    backgroundColor: palette.modalBackdrop,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 20,
  },
  palletDetailCard: { backgroundColor: palette.surface, borderRadius: 10, maxHeight: "88%", overflow: "hidden" },
  palletDetailHeader: { alignItems: "center", borderBottomColor: palette.border, borderBottomWidth: 1, flexDirection: "row", padding: 16 },
  palletDetailHeading: { flex: 1 },
  palletDetailContent: { gap: 4, padding: 16 },
  palletDetailActions: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  activeDetailNote: { backgroundColor: palette.successSoft, borderRadius: 8, color: palette.text, fontSize: 13, fontWeight: "700", overflow: "hidden", paddingHorizontal: 12, paddingVertical: 10 },
  modalTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: palette.surface,
    borderColor: palette.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    color: palette.text,
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
    borderColor: palette.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  modalCancelText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "600",
  },
  modalSaveBtn: {
    backgroundColor: palette.primaryStrong,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  modalSaveText: {
    color: palette.primaryOn,
    fontSize: 14,
    fontWeight: "700",
  },
});
