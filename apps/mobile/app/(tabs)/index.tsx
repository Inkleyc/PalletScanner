import { useRouter } from "expo-router";
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
  getActivePallet,
  getInventory,
  getNextDefaultPalletName,
  getPallets,
  createPalletSession,
  setActivePalletSession,
  subscribeInventory,
} from "@/lib/inventory-store";
import { AppLayout, type AppPaletteShape } from "@/constants/app-palette";
import type { AppShape } from "@/constants/app-shape";
import { useAppPalette, useAppShape } from "@/lib/app-theme";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function HomeScreen() {
  const router = useRouter();
  const palette = useAppPalette();
  const shape = useAppShape();
  const styles = useMemo(() => createStyles(palette, shape), [palette, shape]);
  const { width } = useWindowDimensions();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [palletSelectorVisible, setPalletSelectorVisible] = useState(false);
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
  const pallets = useSyncExternalStore(
    subscribeInventory,
    getPallets,
    getPallets,
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

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
          <Text style={styles.title}>PalletFlip</Text>
          <Text style={styles.subtitle}>Choose a pallet, scan the item, save it, move on.</Text>

          {activePallet ? (
            <TouchableOpacity
              style={styles.palletSelector}
              onPress={() => setPalletSelectorVisible(true)}
            >
              <View>
                <Text style={styles.palletSelectorLabel}>ACTIVE PALLET</Text>
                <Text style={styles.palletSelectorName}>{activePallet.name}</Text>
              </View>
              <IconSymbol
                name="chevron.right"
                size={22}
                color={palette.primaryStrong}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.primaryCard}>
              <Text style={styles.cardEyebrow}>ACTIVE PALLET</Text>
              <Text style={styles.cardTitle}>No active pallet</Text>
              <Text style={styles.cardCopy}>
                Create a pallet first so new items have somewhere to go.
              </Text>
              <TouchableOpacity
                style={styles.cardAction}
                onPress={openCreatePalletModal}
              >
                <Text style={styles.cardActionText}>Create Your First Pallet</Text>
              </TouchableOpacity>
            </View>
          )}

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
              placeholderTextColor={palette.textSoft}
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

      <Modal
        visible={palletSelectorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPalletSelectorVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPalletSelectorVisible(false)}
        >
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Pallet</Text>
            <Text style={styles.modalCopy}>
              New scans and photos will be saved to the selected pallet.
            </Text>
            <ScrollView style={styles.palletList}>
              {pallets.map((pallet) => {
                const isActive = pallet.id === activePallet?.id;
                const itemCount = items.filter(
                  (item) => item.palletId === pallet.id,
                ).length;
                return (
                  <TouchableOpacity
                    key={pallet.id}
                    style={[
                      styles.palletOption,
                      isActive && styles.palletOptionActive,
                    ]}
                    onPress={() => {
                      setActivePalletSession(pallet.id);
                      setPalletSelectorVisible(false);
                    }}
                  >
                    <View style={styles.palletOptionText}>
                      <Text style={styles.palletOptionName}>{pallet.name}</Text>
                      <Text style={styles.palletOptionMeta}>
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                      </Text>
                    </View>
                    {isActive ? (
                      <Text style={styles.activePalletLabel}>Active</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalSecondaryAction}
              onPress={() => setPalletSelectorVisible(false)}
            >
              <Text style={styles.modalSecondaryActionText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** rgba() tint of a hex color (the soft on-primary copy colors below). */
const withAlpha = (hex: string, alpha: number): string => {
  const value = parseInt(hex.replace("#", ""), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// The Scan home follows the active theme palette and shape via
// useAppPalette/useAppShape (see lib/app-theme.tsx).
const createStyles = (palette: AppPaletteShape, shape: AppShape) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, paddingTop: 56, paddingBottom: 28 },
  innerContent: {
    width: "100%",
    alignSelf: "center",
  },
  innerContentWide: {
    maxWidth: AppLayout.maxContentWidth,
  },
  title: { fontSize: 30, fontWeight: "700", color: palette.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: palette.textMuted, marginBottom: 20 },
  primaryCard: {
    backgroundColor: palette.primaryStrong,
    borderRadius: shape.cardRadius,
    padding: 18,
    marginBottom: 16,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: withAlpha(palette.primaryOn, 0.72),
    marginBottom: 8,
  },
  cardTitle: { fontSize: 24, fontWeight: "700", color: palette.primaryOn, marginBottom: 6 },
  cardCopy: {
    fontSize: 14,
    color: withAlpha(palette.primaryOn, 0.86),
    lineHeight: 20,
    marginBottom: 16,
  },
  cardAction: {
    backgroundColor: palette.primaryOn,
    borderRadius: shape.cardRadius,
    paddingVertical: 12,
    alignItems: "center",
  },
  cardActionText: { color: palette.primaryStrong, fontWeight: "700", fontSize: 15 },
  palletSelector: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.borderStrong,
    borderWidth: shape.cardBorderWidth,
    borderRadius: shape.cardRadius,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  palletSelectorLabel: {
    color: palette.textMuted,
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 3,
  },
  palletSelectorName: {
    color: palette.primaryStrong,
    fontSize: 15,
    fontWeight: "700",
  },
  actionsCard: {
    backgroundColor: palette.surface,
    borderRadius: shape.cardRadius,
    borderWidth: shape.cardBorderWidth,
    borderColor: palette.borderStrong,
    padding: 16,
    marginBottom: 16,
  },
  workflowAction: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: shape.cardBorderWidth,
    borderColor: palette.borderStrong,
    borderRadius: shape.cardRadius,
    padding: 14,
    marginTop: 10,
  },
  primaryWorkflowAction: {
    backgroundColor: palette.primaryStrong,
    borderColor: palette.primaryStrong,
  },
  workflowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.text,
    marginBottom: 4,
  },
  workflowCopy: { fontSize: 13, color: palette.textMuted, lineHeight: 18 },
  primaryWorkflowTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.primaryOn,
    marginBottom: 4,
  },
  primaryWorkflowCopy: {
    fontSize: 13,
    color: withAlpha(palette.primaryOn, 0.82),
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: palette.modalBackdrop,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: palette.surface,
    borderRadius: shape.cardRadius,
    borderWidth: shape.cardBorderWidth,
    borderColor: palette.borderStrong,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: palette.text,
    marginBottom: 6,
  },
  modalCopy: {
    fontSize: 14,
    color: palette.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.surface,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalSecondaryAction: {
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.surface,
  },
  modalSecondaryActionText: {
    color: palette.text,
    fontWeight: "600",
    fontSize: 14,
  },
  modalPrimaryAction: {
    backgroundColor: palette.primaryStrong,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalPrimaryActionText: {
    color: palette.primaryOn,
    fontWeight: "700",
    fontSize: 14,
  },
  palletList: {
    maxHeight: 320,
    marginBottom: 16,
  },
  palletOption: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  palletOptionActive: {
    backgroundColor: palette.surfaceMuted,
  },
  palletOptionText: {
    flex: 1,
  },
  palletOptionName: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  palletOptionMeta: {
    color: palette.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  activePalletLabel: {
    color: palette.primaryStrong,
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 12,
  },
});
