import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { Dispatch, SetStateAction } from "react";

import type { AppPaletteShape } from "@/constants/app-palette";
import type {
  InventoryItem,
  InventorySortMode,
  ListingFilter,
  PalletSession,
} from "@palletscanner/core";
import type { InventoryStyles } from "./inventory-styles";

type InventoryFilterCardProps = {
  styles: InventoryStyles;
  palette: AppPaletteShape;
  isLargeLayout: boolean;
  filtersExpanded: boolean;
  setFiltersExpanded: Dispatch<SetStateAction<boolean>>;
  setFilterModalVisible: Dispatch<SetStateAction<boolean>>;
  selectedPallet: PalletSession | null;
  activePallet: PalletSession | null;
  activePalletId: string | null;
  pallets: PalletSession[];
  selectedPalletId: string;
  setSelectedPalletId: Dispatch<SetStateAction<string>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  sortMode: InventorySortMode;
  setSortMode: Dispatch<SetStateAction<InventorySortMode>>;
  listingFilter: ListingFilter;
  setListingFilter: Dispatch<SetStateAction<ListingFilter>>;
  listingFilterLabel: string;
  filteredItems: InventoryItem[];
  palletScopedItemCount: number;
  makeSelectedPalletActive: () => void;
  removeSelectedPallet: () => void;
};

export const InventoryFilterCard = ({
  styles,
  palette,
  isLargeLayout,
  filtersExpanded,
  setFiltersExpanded,
  setFilterModalVisible,
  selectedPallet,
  activePallet,
  activePalletId,
  pallets,
  selectedPalletId,
  setSelectedPalletId,
  searchQuery,
  setSearchQuery,
  sortMode,
  setSortMode,
  listingFilter,
  setListingFilter,
  listingFilterLabel,
  filteredItems,
  palletScopedItemCount,
  makeSelectedPalletActive,
  removeSelectedPallet,
}: InventoryFilterCardProps) => {
  return (
  <View style={styles.filterCard}>
    <TouchableOpacity
      style={styles.sectionHeader}
      onPress={() => {
        if (isLargeLayout) {
          setFiltersExpanded((current) => !current);
          return;
        }
        setFilterModalVisible(true);
      }}
    >
      <View>
        <Text style={styles.filterLabel}>FILTERS</Text>
        <Text style={styles.sectionSummaryText}>
          {selectedPallet ? selectedPallet.name : "All Inventory"} | {sortMode === "date"
            ? "Newest"
            : sortMode === "high-desc"
              ? "High to Low"
              : "Low to High"} | {listingFilterLabel} | {filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}
        </Text>
      </View>
      <Text style={styles.sectionToggleText}>
        {isLargeLayout ? (filtersExpanded ? "Hide" : "Show") : "Edit"}
      </Text>
    </TouchableOpacity>

    {isLargeLayout && filtersExpanded ? (
      <>
        <View style={styles.filterHeader}>
          <View>
            <Text style={styles.filterActiveText}>
              Active save target: {activePallet?.name ?? "None yet"}
            </Text>
          </View>
        </View>
        {(selectedPallet || pallets.length > 1) && (
          <View style={styles.filterActions}>
            {selectedPallet && selectedPallet.id !== activePalletId && (
              <TouchableOpacity
                style={styles.makeActiveBtn}
                onPress={makeSelectedPalletActive}
              >
                <Text style={styles.makeActiveBtnText}>Make Active</Text>
              </TouchableOpacity>
            )}
            {isLargeLayout && selectedPallet && (
              <TouchableOpacity
                style={styles.deletePalletBtn}
                onPress={removeSelectedPallet}
              >
                <Text style={styles.deletePalletBtnText}>Delete Pallet</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipRow}
        >
          {isLargeLayout ? (
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedPalletId === "all" && styles.filterChipActive,
              ]}
              onPress={() => setSelectedPalletId("all")}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedPalletId === "all" && styles.filterChipTextActive,
                ]}
              >
                All Inventory
              </Text>
            </TouchableOpacity>
          ) : null}
          {pallets.map((pallet) => {
            const isSelected = selectedPalletId === pallet.id;
            const isActive = activePalletId === pallet.id;
            return (
              <TouchableOpacity
                key={pallet.id}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipActive,
                ]}
                onPress={() => setSelectedPalletId(pallet.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive,
                  ]}
                >
                  {pallet.name}
                  {isActive ? " Active" : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search inventory by item name"
          placeholderTextColor={palette.textSoft}
        />
        <View style={styles.sortRow}>
          {[
            { key: "date", label: "Newest" },
            { key: "high-desc", label: "High to Low" },
            { key: "low-asc", label: "Low to High" },
          ].map((option) => {
            const isActive = sortMode === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortChip, isActive && styles.sortChipActive]}
                onPress={() =>
                  setSortMode(option.key as "date" | "high-desc" | "low-asc")
                }
              >
                <Text
                  style={[
                    styles.sortChipText,
                    isActive && styles.sortChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.sortRow}>
          {[
            { key: "all", label: "All Statuses" },
            { key: "needs-facebook", label: "Needs Facebook" },
            { key: "facebook-drafts", label: "Facebook Drafts" },
            { key: "missing-facebook-url", label: "Missing FB URL" },
            { key: "no-photos", label: "No Photos" },
            { key: "needs-ebay", label: "Needs eBay" },
            { key: "listed", label: "Listed" },
          ].map((option) => {
            const isActive = listingFilter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortChip, isActive && styles.sortChipActive]}
                onPress={() => setListingFilter(option.key as ListingFilter)}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    isActive && styles.sortChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.resultCount}>
          Showing {filteredItems.length} of {palletScopedItemCount} items
        </Text>
      </>
    ) : null}
  </View>
  );
};

type InventoryFilterModalProps = {
  styles: InventoryStyles;
  palette: AppPaletteShape;
  filterModalVisible: boolean;
  setFilterModalVisible: Dispatch<SetStateAction<boolean>>;
  selectedPallet: PalletSession | null;
  activePallet: PalletSession | null;
  activePalletId: string | null;
  pallets: PalletSession[];
  selectedPalletId: string;
  setSelectedPalletId: Dispatch<SetStateAction<string>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  sortMode: InventorySortMode;
  setSortMode: Dispatch<SetStateAction<InventorySortMode>>;
  listingFilter: ListingFilter;
  setListingFilter: Dispatch<SetStateAction<ListingFilter>>;
  filteredItems: InventoryItem[];
  palletScopedItemCount: number;
  makeSelectedPalletActive: () => void;
};

export const InventoryFilterModal = ({
  styles,
  palette,
  filterModalVisible,
  setFilterModalVisible,
  selectedPallet,
  activePallet,
  activePalletId,
  pallets,
  selectedPalletId,
  setSelectedPalletId,
  searchQuery,
  setSearchQuery,
  sortMode,
  setSortMode,
  listingFilter,
  setListingFilter,
  filteredItems,
  palletScopedItemCount,
  makeSelectedPalletActive,
}: InventoryFilterModalProps) => {
  return (
  <Modal
    visible={filterModalVisible}
    transparent
    animationType="fade"
    onRequestClose={() => setFilterModalVisible(false)}
  >
    <View style={styles.filterModalBackdrop}>
      <View style={styles.filterModalCard}>
        <View style={styles.filterModalHeader}>
          <View>
            <Text style={styles.filterLabel}>FILTERS</Text>
            <Text style={styles.filterModalTitle}>
              Find inventory
            </Text>
          </View>
          <TouchableOpacity
            style={styles.filterModalCloseBtn}
            onPress={() => setFilterModalVisible(false)}
          >
            <Text style={styles.filterModalCloseText}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.filterActiveText}>
          Active save target: {activePallet?.name ?? "None yet"}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipRow}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedPalletId === "all" && styles.filterChipActive,
            ]}
            onPress={() => setSelectedPalletId("all")}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedPalletId === "all" && styles.filterChipTextActive,
              ]}
            >
              All Inventory
            </Text>
          </TouchableOpacity>
          {pallets.map((pallet) => {
            const isSelected = selectedPalletId === pallet.id;
            const isActive = activePalletId === pallet.id;
            return (
              <TouchableOpacity
                key={pallet.id}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipActive,
                ]}
                onPress={() => setSelectedPalletId(pallet.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive,
                  ]}
                >
                  {pallet.name}
                  {isActive ? " Active" : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {(selectedPallet || pallets.length > 1) && (
          <View style={styles.filterActions}>
            {selectedPallet && selectedPallet.id !== activePalletId && (
              <TouchableOpacity
                style={styles.makeActiveBtn}
                onPress={makeSelectedPalletActive}
              >
                <Text style={styles.makeActiveBtnText}>Make Active</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search inventory by item name"
          placeholderTextColor={palette.textSoft}
        />
        <Text style={styles.filterModalSectionLabel}>Sort</Text>
        <View style={styles.sortRow}>
          {[
            { key: "date", label: "Newest" },
            { key: "high-desc", label: "High to Low" },
            { key: "low-asc", label: "Low to High" },
          ].map((option) => {
            const isActive = sortMode === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortChip, isActive && styles.sortChipActive]}
                onPress={() =>
                  setSortMode(
                    option.key as "date" | "high-desc" | "low-asc",
                  )
                }
              >
                <Text
                  style={[
                    styles.sortChipText,
                    isActive && styles.sortChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.filterModalSectionLabel}>Status</Text>
        <View style={styles.sortRow}>
          {[
            { key: "all", label: "All Statuses" },
            { key: "needs-facebook", label: "Needs Facebook" },
            { key: "facebook-drafts", label: "Facebook Drafts" },
            { key: "missing-facebook-url", label: "Missing FB URL" },
            { key: "no-photos", label: "No Photos" },
            { key: "needs-ebay", label: "Needs eBay" },
            { key: "listed", label: "Listed" },
          ].map((option) => {
            const isActive = listingFilter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortChip, isActive && styles.sortChipActive]}
                onPress={() => setListingFilter(option.key as ListingFilter)}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    isActive && styles.sortChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.resultCount}>
          Showing {filteredItems.length} of {palletScopedItemCount} items
        </Text>
        </ScrollView>
      </View>
    </View>
  </Modal>
  );
};
