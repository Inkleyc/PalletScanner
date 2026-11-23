import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
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
      <Modal
        visible={Boolean(selectedItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedItemId(null)}
      >
        <Pressable style={styles.itemDetailBackdrop} onPress={() => setSelectedItemId(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable style={styles.itemDetailCard} onPress={Keyboard.dismiss}>
            <View style={styles.itemDetailHeader}>
              <View style={styles.itemDetailHeading}>
                <Text style={styles.itemDetailTitle}>{selectedItem?.name ?? "Item details"}</Text>
                <Text style={styles.itemDetailSubtitle}>{selectedItem ? getPalletName(selectedItem.palletId) : ""}</Text>
              </View>
              <TouchableOpacity style={styles.itemDetailClose} onPress={() => setSelectedItemId(null)}>
                <Text style={styles.itemDetailCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.itemDetailContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
              {selectedItem?.photos?.length || selectedItem?.photo ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemDetailPhotos}>
                  {(selectedItem.photos?.length ? selectedItem.photos : selectedItem.photo ? [selectedItem.photo] : []).map((uri, index) => (
                    <Image key={`${uri}-${index}`} source={{ uri }} style={styles.itemDetailPhoto} />
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.itemEditGrid}>
                <View style={styles.itemEditWide}><Text style={styles.itemDetailLabel}>Item name</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.name} onChangeText={(value) => updateItemDetailDraft("name", value)} /></View>
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Category</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.category} onChangeText={(value) => updateItemDetailDraft("category", value)} /></View>
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Condition</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.condition} onChangeText={(value) => updateItemDetailDraft("condition", value)} /></View>
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Quantity</Text><TextInput style={[styles.itemEditInput, styles.itemEditNumInput]} value={itemDetailDraft.quantity} onChangeText={(value) => updateItemDetailDraft("quantity", value)} keyboardType="number-pad" /></View>
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Low estimate</Text><TextInput style={[styles.itemEditInput, styles.itemEditNumInput]} value={itemDetailDraft.low} onChangeText={(value) => updateItemDetailDraft("low", value)} keyboardType="decimal-pad" /></View>
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>High estimate</Text><TextInput style={[styles.itemEditInput, styles.itemEditNumInput]} value={itemDetailDraft.high} onChangeText={(value) => updateItemDetailDraft("high", value)} keyboardType="decimal-pad" /></View>
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Floor price</Text><TextInput style={[styles.itemEditInput, styles.itemEditNumInput]} value={itemDetailDraft.floor} onChangeText={(value) => updateItemDetailDraft("floor", value)} keyboardType="decimal-pad" /></View>
              </View>
              <View style={styles.listingPriceEditor}><Text style={styles.itemDetailLabel}>Approved listing price</Text><Text style={styles.listingPriceHelp}>This exact price is used for eBay after you approve posting. Saving alone does not update an active listing.</Text><View style={styles.listingPriceRow}><Text style={styles.listingPriceCurrency}>$</Text><TextInput style={styles.listingPriceInput} value={itemDetailDraft.listingPrice} onChangeText={(value) => updateItemDetailDraft("listingPrice", value)} keyboardType="decimal-pad" placeholder="0.00" /></View></View>
              <View style={styles.itemDetailSection}><Text style={styles.itemDetailLabel}>eBay title</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.ebayTitle} onChangeText={(value) => updateItemDetailDraft("ebayTitle", value)} maxLength={80} /><Text style={styles.characterCount}>{itemDetailDraft.ebayTitle.length}/80</Text></View>
              <View style={styles.itemDetailSection}><Text style={styles.itemDetailLabel}>eBay description</Text><TextInput style={[styles.itemEditInput, styles.itemEditTextArea]} value={itemDetailDraft.ebayDescription} onChangeText={(value) => updateItemDetailDraft("ebayDescription", value)} multiline textAlignVertical="top" /></View>
              {Object.keys(itemDetailDraft.ebayItemSpecifics).length > 0 ? (
                <View style={styles.itemDetailSection}><Text style={styles.itemDetailSectionTitle}>eBay details</Text>{Object.entries(itemDetailDraft.ebayItemSpecifics).map(([key, value]) => <View key={key} style={styles.itemSpecificField}><Text style={styles.itemDetailLabel}>{key}</Text><TextInput style={styles.itemEditInput} value={value} onChangeText={(nextValue) => setItemDetailDraft((current) => ({ ...current, ebayItemSpecifics: { ...current.ebayItemSpecifics, [key]: nextValue } }))} /></View>)}</View>
              ) : null}
              {selectedItem ? (
                <View style={styles.itemDetailActions}>
                  <TouchableOpacity style={styles.itemDetailPlatformButton} onPress={() => { void postItemFromDetails("facebook"); }}><Text style={styles.itemDetailPlatformText}>Post to Facebook</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.itemDetailPlatformButton, styles.itemDetailEbayButton]} onPress={() => { void postItemFromDetails("ebay"); }}><Text style={styles.itemDetailPlatformText}>Post to eBay</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.itemDetailMoreButton} onPress={() => markSoldFromDetails(selectedItem)}><Text style={styles.itemDetailMoreText}>{selectedItem.soldPrice !== null ? "Edit sold price" : "Mark sold"}</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.itemDetailRemoveButton} onPress={() => removeItemFromDetails(selectedItem)}><Text style={styles.itemDetailRemoveText}>Remove item</Text></TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={styles.saveItemChangesButton} onPress={() => { void saveItemDetails(); }}><Text style={styles.saveListingPriceText}>Save changes</Text></TouchableOpacity>
            </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
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
    </>
  );
}
