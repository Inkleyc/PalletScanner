import { useRouter } from "expo-router";
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
  getActivePallet,
  getInventory,
  getNextDefaultPalletName,
  createPalletSession,
  subscribeInventory,
} from "@/lib/inventory-store";
import { AppLayout, AppPalette } from "@/constants/app-palette";

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPalletName, setNewPalletName] = useState("");
  const [pendingWorkflowRoute, setPendingWorkflowRoute] = useState<
    "/scan-barcode" | "/capture" | null
  >(null);
  const isLargeLayout = width >= 900;
  const activePallet = useSyncExternalStore(
    subscribeInventory,
    getActivePallet,
    getActivePallet,
  );
  const items = useSyncExternalStore(
    subscribeInventory,
    getInventory,
    getInventory,
  );

  const openCreatePalletModal = () => {
    setNewPalletName(getNextDefaultPalletName());
    setCreateModalVisible(true);
  };

  const closeCreatePalletModal = () => {
    setCreateModalVisible(false);
    setNewPalletName("");
    setPendingWorkflowRoute(null);
  };

  const createPallet = () => {
    createPalletSession(newPalletName);
    const route = pendingWorkflowRoute;
    closeCreatePalletModal();
    if (route) {
      router.push(route);
    }
  };

  const openWorkflow = (route: "/scan-barcode" | "/capture") => {
    if (!activePallet) {
      setPendingWorkflowRoute(route);
      openCreatePalletModal();
      return;
    }

    router.push(route);
  };

  const activePalletName = activePallet?.name ?? "No active pallet";
  const activePalletItems = activePallet
    ? items.filter((item) => item.palletId === activePallet.id)
    : [];
  const lastSavedItem = activePalletItems
    .slice()
    .sort((a, b) => b.id - a.id)[0];

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
          <Text style={styles.title}>Pallet Scanner</Text>
          <Text style={styles.subtitle}>Choose a pallet, scan the item, save it, move on.</Text>

          <View style={styles.primaryCard}>
            <Text style={styles.cardEyebrow}>ACTIVE PALLET</Text>
            <Text style={styles.cardTitle}>{activePalletName}</Text>
            <Text style={styles.cardCopy}>
              {activePallet
                ? `${activePalletItems.length} item${activePalletItems.length === 1 ? "" : "s"} saved here.`
                : "Create a pallet first so new items have somewhere to go."}
            </Text>
            {lastSavedItem ? (
              <View style={styles.lastItemBox}>
                <Text style={styles.lastItemLabel}>LAST SAVED</Text>
                <Text style={styles.lastItemName}>{lastSavedItem.name}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.cardAction}
              onPress={openCreatePalletModal}
            >
              <Text style={styles.cardActionText}>
                {activePallet ? "Create New Pallet" : "Create Your First Pallet"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionsCard}>
            <TouchableOpacity
              style={[styles.workflowAction, styles.primaryWorkflowAction]}
              onPress={() => openWorkflow("/scan-barcode")}
            >
              <Text style={styles.primaryWorkflowTitle}>Scan Barcode</Text>
              <Text style={styles.primaryWorkflowCopy}>
                {activePallet
                  ? "Fastest path when the item has a readable UPC or product code."
                  : "Create a pallet first, then start scanning items into it."}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.workflowAction}
              onPress={() => openWorkflow("/capture")}
            >
              <Text style={styles.workflowTitle}>Capture Photos</Text>
              <Text style={styles.workflowCopy}>
                {activePallet
                  ? "Use photos when there is no barcode or condition matters most."
                  : "Create a pallet first, then capture photos into it."}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.workflowAction}
              onPress={() => router.push("/explore")}
            >
              <Text style={styles.workflowTitle}>Review Inventory</Text>
              <Text style={styles.workflowCopy}>
                Check saved items, mark sold, or continue listing work.
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCreatePalletModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeCreatePalletModal}>
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create New Pallet</Text>
            <Text style={styles.modalCopy}>
              {pendingWorkflowRoute
                ? "Create the pallet, then we will continue where you were headed."
                : "Start with the default name or edit it before saving."}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={newPalletName}
              onChangeText={setNewPalletName}
              placeholder="Pallet name"
              placeholderTextColor="#9ca3af"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryAction}
                onPress={closeCreatePalletModal}
              >
                <Text style={styles.modalSecondaryActionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimaryAction}
                onPress={createPallet}
              >
                <Text style={styles.modalPrimaryActionText}>Create</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 20, paddingTop: 56, paddingBottom: 28 },
  innerContent: {
    width: "100%",
    alignSelf: "center",
  },
  innerContentWide: {
    maxWidth: AppLayout.maxContentWidth,
  },
  title: { fontSize: 30, fontWeight: "700", color: AppPalette.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: AppPalette.textMuted, marginBottom: 20 },
  primaryCard: {
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: AppPalette.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
    marginBottom: 8,
  },
  cardTitle: { fontSize: 24, fontWeight: "700", color: AppPalette.primaryOn, marginBottom: 6 },
  cardCopy: {
    fontSize: 14,
    color: "rgba(255,255,255,0.86)",
    lineHeight: 20,
    marginBottom: 16,
  },
  lastItemBox: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  lastItemLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 4,
  },
  lastItemName: {
    color: AppPalette.primaryOn,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  cardAction: {
    backgroundColor: AppPalette.primaryOn,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  cardActionText: { color: AppPalette.primaryStrong, fontWeight: "700", fontSize: 15 },
  actionsCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppPalette.border,
    padding: 16,
    marginBottom: 16,
  },
  workflowAction: {
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  primaryWorkflowAction: {
    backgroundColor: AppPalette.primaryStrong,
    borderColor: AppPalette.primaryStrong,
  },
  workflowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: AppPalette.text,
    marginBottom: 4,
  },
  workflowCopy: { fontSize: 13, color: AppPalette.textMuted, lineHeight: 18 },
  primaryWorkflowTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: AppPalette.primaryOn,
    marginBottom: 4,
  },
  primaryWorkflowCopy: {
    fontSize: 13,
    color: "rgba(255,255,255,0.82)",
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: AppPalette.modalBackdrop,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: AppPalette.text,
    marginBottom: 6,
  },
  modalCopy: {
    fontSize: 14,
    color: AppPalette.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: AppPalette.text,
    backgroundColor: AppPalette.surface,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalSecondaryAction: {
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: AppPalette.surface,
  },
  modalSecondaryActionText: {
    color: AppPalette.text,
    fontWeight: "600",
    fontSize: 14,
  },
  modalPrimaryAction: {
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalPrimaryActionText: {
    color: AppPalette.primaryOn,
    fontWeight: "700",
    fontSize: 14,
  },
});
