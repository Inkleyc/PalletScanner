import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { Dispatch, SetStateAction } from "react";

import type { BundleSuggestion } from "./inventory-helpers";
import type { InventoryStyles } from "./inventory-styles";

type BundleSuggestionsModalProps = {
  styles: InventoryStyles;
  bundleModalVisible: boolean;
  setBundleModalVisible: Dispatch<SetStateAction<boolean>>;
  bundleSuggestions: BundleSuggestion[];
};

export const BundleSuggestionsModal = ({
  styles,
  bundleModalVisible,
  setBundleModalVisible,
  bundleSuggestions,
}: BundleSuggestionsModalProps) => {
  return (
  <Modal
    visible={bundleModalVisible}
    transparent
    animationType="fade"
    onRequestClose={() => setBundleModalVisible(false)}
  >
    <Pressable
      style={styles.bundleModalBackdrop}
      onPress={() => setBundleModalVisible(false)}
    >
      <Pressable style={styles.bundleModalCard}>
        <Text style={styles.bundleModalTitle}>Bundle Suggestions</Text>
        {bundleSuggestions.length === 0 ? (
          <Text style={styles.bundleModalEmpty}>No bundle suggestions came back this time.</Text>
        ) : (
          bundleSuggestions.map((bundle, index) => (
            <View key={`${bundle.title}-${index}`} style={styles.bundleSuggestionCard}>
              <Text style={styles.bundleSuggestionTitle}>{bundle.title}</Text>
              <Text style={styles.bundleSuggestionPrice}>Suggested price: ${bundle.price}</Text>
              <Text style={styles.bundleSuggestionItems}>
                {bundle.items.join(", ")}
              </Text>
              <Text style={styles.bundleSuggestionReason}>{bundle.reason}</Text>
            </View>
          ))
        )}
        <TouchableOpacity
          style={styles.bundleCloseBtn}
          onPress={() => setBundleModalVisible(false)}
        >
          <Text style={styles.bundleCloseBtnText}>Close</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  </Modal>
  );
};
