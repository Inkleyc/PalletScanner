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
  const isLargeLayout = width >= 900;
  const activePallet = useSyncExternalStore(
    subscribeInventory,
    getActivePallet,
    getActivePallet,
  );

  const openCreatePalletModal = () => {
    setNewPalletName(getNextDefaultPalletName());
    setCreateModalVisible(true);
  };

  const closeCreatePalletModal = () => {
    setCreateModalVisible(false);
    setNewPalletName("");
  };

  const createPallet = () => {
    createPalletSession(newPalletName);
    closeCreatePalletModal();
  };

  const activePalletName = activePallet?.name ?? "No active pallet";

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
          <Text style={styles.title}>Pallet Scanner</Text>
          <Text style={styles.subtitle}>Start with a pallet, then capture the next item.</Text>

          <View style={styles.primaryCard}>
            <Text style={styles.cardEyebrow}>ACTIVE PALLET</Text>
            <Text style={styles.cardTitle}>{activePalletName}</Text>
            <Text style={styles.cardCopy}>
              {activePallet
                ? "New scans and new photo drafts will save into this pallet."
                : "Create a pallet first so new items have somewhere to go."}
            </Text>

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
              style={styles.secondaryAction}
              onPress={() => router.push("/capture")}
            >
              <Text style={styles.secondaryActionTitle}>Capture with Photos</Text>
              <Text style={styles.secondaryActionCopy}>
                Take photos or upload them in a dedicated temporary screen.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => router.push("/scan-barcode")}
            >
              <Text style={styles.secondaryActionTitle}>Scan Barcode</Text>
              <Text style={styles.secondaryActionCopy}>
                Open the scanner and build a draft from product data.
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
              Start with the default name or edit it before saving.
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
  secondaryAction: {
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  secondaryActionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: AppPalette.text,
    marginBottom: 4,
  },
  secondaryActionCopy: { fontSize: 13, color: AppPalette.textMuted, lineHeight: 18 },
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
