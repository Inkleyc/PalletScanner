import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import type { PalletSession } from "@palletscanner/core";
import type { InventoryStyles } from "./inventory-styles";

type InventoryEmptyStateProps = {
  styles: InventoryStyles;
  selectedPallet: PalletSession | null;
  pallets: PalletSession[];
  router: ReturnType<typeof useRouter>;
};

export const InventoryEmptyState = ({
  styles,
  selectedPallet,
  pallets,
  router,
}: InventoryEmptyStateProps) => {
  return (
  <View style={styles.emptyState}>
    <Text style={styles.emptyIcon}>+</Text>
    <Text style={styles.emptyText}>
      {selectedPallet ? `No items in ${selectedPallet.name}` : "No items yet"}
    </Text>
    <Text style={styles.emptySubtext}>
      {selectedPallet
        ? "Switch pallets or save more items on the Scan tab."
        : pallets.length === 0
          ? "Create a pallet first, then start saving items from Scan."
          : "Scan items on the Scan tab and tap Save to Inventory"}
    </Text>
    <TouchableOpacity
      style={styles.emptyAction}
      onPress={() => router.push("/(tabs)")}
    >
      <Text style={styles.emptyActionText}>Go to Scan</Text>
    </TouchableOpacity>
  </View>
  );
};
