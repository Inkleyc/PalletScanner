import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  getActivePalletId,
  getInventory,
  getPallets,
  saveInventoryItem,
  subscribeInventory,
} from "@/lib/inventory-store";
import { createStyles } from "@/components/inventory/inventory-styles";
import { useAppTheme } from "@/lib/app-theme";
import {
  filterInventoryItems,
  getFacebookDraftItems,
  getFacebookMissingUrlItems,
  getItemsMissingPlatformListing,
  getItemsWithoutPhotos,
  getListingFilterLabel,
  hasActiveInventoryFilters,
  type InventorySortMode,
  type ListingFilter,
} from "@palletscanner/core";
import {
  getSupabaseAuthSnapshot,
  subscribeSupabaseAuth,
} from "@/lib/supabase-auth";
import { calculateInventoryValueSummary } from "@palletscanner/core";
import {
  DEMO_INVENTORY_ENABLED,
  demoInventorySeed,
  displayId,
  type BundleSuggestion,
} from "@/components/inventory/inventory-helpers";
import { useInventoryActions } from "@/components/inventory/use-inventory-actions";
import {
  InventoryFilterCard,
  InventoryFilterModal,
} from "@/components/inventory/inventory-filters";
import { InventorySummaryCard } from "@/components/inventory/inventory-summary";
import { InventoryEmptyState } from "@/components/inventory/inventory-empty-state";
import { InventoryItemCard } from "@/components/inventory/inventory-item-card";
import { ItemDetailModal } from "@/components/inventory/item-detail-modal";
import { BundleSuggestionsModal } from "@/components/inventory/bundle-suggestions-modal";


export default function InventoryScreen() {
  const { palette, shape } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, shape), [palette, shape]);
  const { width } = useWindowDimensions();
  const router = useRouter();
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
  const activePalletId = useSyncExternalStore(
    subscribeInventory,
    getActivePalletId,
    getActivePalletId,
  );
  const auth = useSyncExternalStore(
    subscribeSupabaseAuth,
    getSupabaseAuthSnapshot,
    getSupabaseAuthSnapshot,
  );
  const [bulkEbayQueue, setBulkEbayQueue] = useState<number[]>([]);
  const [bulkFacebookQueue, setBulkFacebookQueue] = useState<number[]>([]);
  const [selectedPalletId, setSelectedPalletId] = useState<string>("all");
  const [soldDrafts, setSoldDrafts] = useState<Record<number, string>>({});
  const [facebookUrlDrafts, setFacebookUrlDrafts] = useState<Record<number, string>>({});
  const [editingSoldItemId, setEditingSoldItemId] = useState<number | null>(null);
  const [editingFacebookUrlItemId, setEditingFacebookUrlItemId] = useState<
    number | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<InventorySortMode>("date");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleModalVisible, setBundleModalVisible] = useState(false);
  const [bundleSuggestions, setBundleSuggestions] = useState<BundleSuggestion[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [itemDetailDraft, setItemDetailDraft] = useState({
    name: "", category: "", condition: "", quantity: "1",
    low: "", high: "", floor: "", listingPrice: "",
    ebayTitle: "", ebayDescription: "",
    ebayItemSpecifics: {} as Record<string, string>,
  });
  const isLargeLayout = width >= 900;
  const previousHasActiveFilters = useRef(false);
  const demoSeedStarted = useRef(false);
  const listingFilterLabel = getListingFilterLabel(listingFilter);

  const selectedPallet =
    selectedPalletId === "all"
      ? null
      : pallets.find((pallet) => pallet.id === selectedPalletId) ?? null;
  const activePallet =
    pallets.find((pallet) => pallet.id === activePalletId) ?? null;

  useEffect(() => {
    if (
      !__DEV__ ||
      !DEMO_INVENTORY_ENABLED ||
      !auth.testMode ||
      auth.signedIn ||
      demoSeedStarted.current ||
      items.length === 0 ||
      pallets.length === 0
    ) return;
    const missing = demoInventorySeed.filter((seed) => !items.some((item) => item.id === seed.id));
    if (missing.length === 0) return;
    demoSeedStarted.current = true;
    const palletId = activePallet?.id ?? pallets[0].id;
    void Promise.all(missing.map((seed, index) => saveInventoryItem({
      id: seed.id,
      photo: seed.photo,
      photos: [seed.photo],
      name: seed.name,
      category: seed.category,
      condition: seed.condition,
      quantity: 1,
      low_price: seed.low,
      high_price: seed.high,
      floor_price: seed.floor,
      listing_price: seed.list,
      best_platform: seed.platform,
      listing_title: seed.title,
      listing_description: seed.description,
      listing_title_ebay: seed.title,
      listing_description_ebay: seed.description,
      listing_title_facebook: seed.name,
      listing_description_facebook: seed.description,
      listedPlatforms: [],
      palletId,
      soldPrice: null,
      ebayItemSpecifics: {},
      capturedAt: new Date(Date.now() - (index + 1) * 86400000).toISOString(),
    })));
  }, [activePallet?.id, auth.signedIn, auth.testMode, items, pallets]);
  const getPalletName = (palletId: string) =>
    pallets.find((pallet) => pallet.id === palletId)?.name ?? "Unknown pallet";
  const filterOptions = useMemo(
    () => ({
      selectedPalletId,
      searchQuery,
      listingFilter,
      sortMode,
    }),
    [listingFilter, searchQuery, selectedPalletId, sortMode],
  );
  const filteredItems = useMemo(
    () => filterInventoryItems(items, filterOptions),
    [filterOptions, items],
  );
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  const palletScopedItemCount =
    selectedPalletId === "all"
      ? items.length
      : items.filter((item) => item.palletId === selectedPalletId).length;

  const {
    totalLow,
    totalHigh,
    totalPalletCost,
    projectedProfitLow,
    projectedProfitHigh,
  } = useMemo(
    () => calculateInventoryValueSummary(filteredItems, pallets, selectedPallet),
    [filteredItems, pallets, selectedPallet],
  );
  const bundleCandidateItems = selectedPallet
    ? filteredItems
    : items.filter((item) => item.palletId === activePalletId);
  const missingEbayItems = useMemo(
    () => getItemsMissingPlatformListing(filteredItems, "ebay"),
    [filteredItems],
  );
  const missingFacebookItems = useMemo(
    () => getItemsMissingPlatformListing(filteredItems, "facebook"),
    [filteredItems],
  );
  const facebookDraftItems = useMemo(
    () => getFacebookDraftItems(filteredItems),
    [filteredItems],
  );
  const facebookMissingUrlItems = useMemo(
    () => getFacebookMissingUrlItems(filteredItems),
    [filteredItems],
  );
  const noPhotoItems = useMemo(
    () => getItemsWithoutPhotos(filteredItems),
    [filteredItems],
  );
  const hasActiveFilters = hasActiveInventoryFilters(filterOptions);
  useEffect(() => {
    if (isLargeLayout && hasActiveFilters && !previousHasActiveFilters.current) {
      setFiltersExpanded(true);
    }
    previousHasActiveFilters.current = hasActiveFilters;
  }, [hasActiveFilters, isLargeLayout]);

  const {
    openItemDetails,
    updateItemDetailDraft,
    saveItemDetails,
    postItemFromDetails,
    markSoldFromDetails,
    removeItemFromDetails,
    removeItem,
    getSoldDraftValue,
    getFacebookUrlDraftValue,
    saveSoldPrice,
    clearSoldPrice,
    confirmUnmarkListed,
    showItemActionMenu,
    pasteFacebookUrl,
    saveFacebookUrl,
    clearFacebookUrl,
    exportCSV,
    emailInventory,
    startBulkEbayPosting,
    continueBulkEbayPosting,
    cancelBulkEbayPosting,
    startBulkFacebookPosting,
    continueBulkFacebookPosting,
    cancelBulkFacebookPosting,
    makeSelectedPalletActive,
    removeSelectedPallet,
    suggestBundle,
  } = useInventoryActions({
    items,
    pallets,
    selectedItem,
    selectedPallet,
    filteredItems,
    missingEbayItems,
    missingFacebookItems,
    bundleCandidateItems,
    bulkEbayQueue,
    bulkFacebookQueue,
    soldDrafts,
    facebookUrlDrafts,
    editingSoldItemId,
    editingFacebookUrlItemId,
    itemDetailDraft,
    setBulkEbayQueue,
    setBulkFacebookQueue,
    setSelectedPalletId,
    setSoldDrafts,
    setFacebookUrlDrafts,
    setEditingSoldItemId,
    setEditingFacebookUrlItemId,
    setFilterModalVisible,
    setSelectedItemId,
    setItemDetailDraft,
    setBundleLoading,
    setBundleModalVisible,
    setBundleSuggestions,
  });

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>
          {selectedPallet ? `${selectedPallet.name} inventory` : "Everything you have saved so far"}
        </Text>

        <InventoryFilterCard
          styles={styles}
          palette={palette}
          isLargeLayout={isLargeLayout}
          filtersExpanded={filtersExpanded}
          setFiltersExpanded={setFiltersExpanded}
          setFilterModalVisible={setFilterModalVisible}
          selectedPallet={selectedPallet}
          activePallet={activePallet}
          activePalletId={activePalletId}
          pallets={pallets}
          selectedPalletId={selectedPalletId}
          setSelectedPalletId={setSelectedPalletId}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortMode={sortMode}
          setSortMode={setSortMode}
          listingFilter={listingFilter}
          setListingFilter={setListingFilter}
          listingFilterLabel={listingFilterLabel}
          filteredItems={filteredItems}
          palletScopedItemCount={palletScopedItemCount}
          makeSelectedPalletActive={makeSelectedPalletActive}
          removeSelectedPallet={removeSelectedPallet}
        />

        {!isLargeLayout ? (
          <InventoryFilterModal
            styles={styles}
            palette={palette}
            filterModalVisible={filterModalVisible}
            setFilterModalVisible={setFilterModalVisible}
            selectedPallet={selectedPallet}
            activePallet={activePallet}
            activePalletId={activePalletId}
            pallets={pallets}
            selectedPalletId={selectedPalletId}
            setSelectedPalletId={setSelectedPalletId}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sortMode={sortMode}
            setSortMode={setSortMode}
            listingFilter={listingFilter}
            setListingFilter={setListingFilter}
            filteredItems={filteredItems}
            palletScopedItemCount={palletScopedItemCount}
            makeSelectedPalletActive={makeSelectedPalletActive}
          />
        ) : null}
        <InventorySummaryCard
          styles={styles}
          isLargeLayout={isLargeLayout}
          summaryExpanded={summaryExpanded}
          setSummaryExpanded={setSummaryExpanded}
          filteredItems={filteredItems}
          totalLow={totalLow}
          totalHigh={totalHigh}
          totalPalletCost={totalPalletCost}
          projectedProfitLow={projectedProfitLow}
          projectedProfitHigh={projectedProfitHigh}
          missingFacebookItems={missingFacebookItems}
          facebookDraftItems={facebookDraftItems}
          facebookMissingUrlItems={facebookMissingUrlItems}
          noPhotoItems={noPhotoItems}
          missingEbayItems={missingEbayItems}
          setListingFilter={setListingFilter}
          exportCSV={exportCSV}
          emailInventory={emailInventory}
          router={router}
          bulkFacebookQueue={bulkFacebookQueue}
          bulkEbayQueue={bulkEbayQueue}
          startBulkFacebookPosting={startBulkFacebookPosting}
          continueBulkFacebookPosting={continueBulkFacebookPosting}
          cancelBulkFacebookPosting={cancelBulkFacebookPosting}
          startBulkEbayPosting={startBulkEbayPosting}
          continueBulkEbayPosting={continueBulkEbayPosting}
          cancelBulkEbayPosting={cancelBulkEbayPosting}
          bundleCandidateItems={bundleCandidateItems}
          bundleLoading={bundleLoading}
          suggestBundle={suggestBundle}
        />
        {filteredItems.length === 0 && (
          <InventoryEmptyState
            styles={styles}
            selectedPallet={selectedPallet}
            pallets={pallets}
            router={router}
          />
        )}

        {filteredItems.map((item, index) => {
          const itemKey = displayId(item.id) ?? `item-${index}`;
          return (
            <InventoryItemCard
              key={itemKey}
              item={item}
              styles={styles}
              getPalletName={getPalletName}
              openItemDetails={openItemDetails}
              confirmUnmarkListed={confirmUnmarkListed}
              showItemActionMenu={showItemActionMenu}
              removeItem={removeItem}
              editingSoldItemId={editingSoldItemId}
              setEditingSoldItemId={setEditingSoldItemId}
              editingFacebookUrlItemId={editingFacebookUrlItemId}
              setEditingFacebookUrlItemId={setEditingFacebookUrlItemId}
              setSoldDrafts={setSoldDrafts}
              setFacebookUrlDrafts={setFacebookUrlDrafts}
              getSoldDraftValue={getSoldDraftValue}
              getFacebookUrlDraftValue={getFacebookUrlDraftValue}
              saveSoldPrice={saveSoldPrice}
              clearSoldPrice={clearSoldPrice}
              pasteFacebookUrl={pasteFacebookUrl}
              saveFacebookUrl={saveFacebookUrl}
              clearFacebookUrl={clearFacebookUrl}
            />
          );
        })}
        </View>
      </ScrollView>
      <ItemDetailModal
        styles={styles}
        selectedItem={selectedItem}
        itemDetailDraft={itemDetailDraft}
        updateItemDetailDraft={updateItemDetailDraft}
        setItemDetailDraft={setItemDetailDraft}
        setSelectedItemId={setSelectedItemId}
        getPalletName={getPalletName}
        postItemFromDetails={postItemFromDetails}
        markSoldFromDetails={markSoldFromDetails}
        removeItemFromDetails={removeItemFromDetails}
        saveItemDetails={saveItemDetails}
      />
      <BundleSuggestionsModal
        styles={styles}
        bundleModalVisible={bundleModalVisible}
        setBundleModalVisible={setBundleModalVisible}
        bundleSuggestions={bundleSuggestions}
      />
    </>
  );
}
