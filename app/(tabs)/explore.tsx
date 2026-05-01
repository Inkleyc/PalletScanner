import * as FileSystem from "expo-file-system/legacy";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Alert,
  Image,
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
  deletePalletSession,
  getActivePalletId,
  getInventory,
  getPallets,
  removeInventoryItem,
  setActivePalletSession,
  subscribeInventory,
  unmarkInventoryItemListed,
  updateInventoryItemSoldPrice,
} from "@/lib/inventory-store";
import { openListingDraft } from "@/lib/listing-posting";
import { AppLayout, AppPalette } from "@/constants/app-palette";

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

type BundleSuggestion = {
  title: string;
  items: string[];
  price: number;
  reason: string;
};

export default function InventoryScreen() {
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
  const [bulkEbayQueue, setBulkEbayQueue] = useState<number[]>([]);
  const [selectedPalletId, setSelectedPalletId] = useState<string>("all");
  const [soldDrafts, setSoldDrafts] = useState<Record<number, string>>({});
  const [editingSoldItemId, setEditingSoldItemId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"date" | "high-desc" | "low-asc">("date");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleModalVisible, setBundleModalVisible] = useState(false);
  const [bundleSuggestions, setBundleSuggestions] = useState<BundleSuggestion[]>([]);
  const isLargeLayout = width >= 900;
  const previousHasActiveFilters = useRef(false);

  const selectedPallet =
    selectedPalletId === "all"
      ? null
      : pallets.find((pallet) => pallet.id === selectedPalletId) ?? null;
  const activePallet =
    pallets.find((pallet) => pallet.id === activePalletId) ?? null;
  const filteredItems = useMemo(() => {
    const palletFiltered =
      selectedPalletId === "all"
        ? items
        : items.filter((item: any) => item.palletId === selectedPalletId);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const searchFiltered = normalizedQuery
      ? palletFiltered.filter((item: any) =>
          item.name.toLowerCase().includes(normalizedQuery),
        )
      : palletFiltered;

    const sortedItems = [...searchFiltered];
    if (sortMode === "high-desc") {
      sortedItems.sort((a: any, b: any) => b.high_price - a.high_price);
    } else if (sortMode === "low-asc") {
      sortedItems.sort((a: any, b: any) => a.low_price - b.low_price);
    } else {
      sortedItems.sort((a: any, b: any) => b.id - a.id);
    }

    return sortedItems;
  }, [items, searchQuery, selectedPalletId, sortMode]);

  const palletScopedItemCount =
    selectedPalletId === "all"
      ? items.length
      : items.filter((item: any) => item.palletId === selectedPalletId).length;

  const totalLow = filteredItems.reduce(
    (sum: number, item: any) => sum + item.low_price * (item.quantity ?? 1),
    0,
  );
  const totalHigh = filteredItems.reduce(
    (sum: number, item: any) => sum + item.high_price * (item.quantity ?? 1),
    0,
  );
  const totalPalletCost = selectedPallet
    ? selectedPallet.palletCost ?? 0
    : pallets.reduce((sum, pallet) => sum + (pallet.palletCost ?? 0), 0);
  const projectedProfitLow = totalLow - totalPalletCost;
  const projectedProfitHigh = totalHigh - totalPalletCost;
  const bundleCandidateItems = selectedPallet
    ? filteredItems
    : items.filter((item: any) => item.palletId === activePalletId);
  const missingEbayItems = useMemo(
    () =>
      filteredItems.filter((item: any) => !item.listedPlatforms.includes("ebay")),
    [filteredItems],
  );
  const hasActiveFilters =
    selectedPalletId !== "all" ||
    searchQuery.trim().length > 0 ||
    sortMode !== "date";

  useEffect(() => {
    if (hasActiveFilters && !previousHasActiveFilters.current) {
      setFiltersExpanded(true);
    }
    previousHasActiveFilters.current = hasActiveFilters;
  }, [hasActiveFilters]);

  const removeItem = (id: number) => {
    Alert.alert("Remove Item", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
          onPress: () => {
            void removeInventoryItem(id);
          },
        },
      ]);
  };

  const getPalletName = (palletId: string) =>
    pallets.find((pallet) => pallet.id === palletId)?.name ?? "Unknown pallet";

  const getSoldDraftValue = (item: any) =>
    soldDrafts[item.id] ?? (item.soldPrice !== null ? String(item.soldPrice) : "");

  const saveSoldPrice = (item: any) => {
    const rawValue = getSoldDraftValue(item).trim();
    if (!rawValue) {
      Alert.alert("Enter a sold price", "Type the amount the item sold for.");
      return;
    }

    const parsedValue = Number(rawValue);
    if (Number.isNaN(parsedValue) || parsedValue < 0) {
      Alert.alert("Invalid sold price", "Enter a valid number like 25 or 25.50.");
      return;
    }

    updateInventoryItemSoldPrice(item.id, parsedValue);
    setSoldDrafts((current) => ({
      ...current,
      [item.id]: String(parsedValue),
    }));
  };

  const clearSoldPrice = (item: any) => {
    updateInventoryItemSoldPrice(item.id, null);
    setSoldDrafts((current) => ({
      ...current,
      [item.id]: "",
    }));
    if (editingSoldItemId === item.id) {
      setEditingSoldItemId(null);
    }
  };

  const getExportFilename = () => {
    const suffix =
      selectedPallet?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "all";
    return FileSystem.documentDirectory + `pallet-inventory-${suffix}.csv`;
  };

  const buildCSV = () => {
    const header =
      "Pallet,Name,Qty,Condition,Pallet Cost,Low Price,High Price,Floor Price,Projected Profit Low,Projected Profit High,Sold Price,Platform,Listing Title,Listing Description";
    const rows = filteredItems.map((item: any) =>
      [
        `"${getPalletName(item.palletId)}"`,
        `"${item.name}"`,
        item.quantity ?? 1,
        `"${item.condition}"`,
        pallets.find((pallet) => pallet.id === item.palletId)?.palletCost ?? "",
        item.low_price * (item.quantity ?? 1),
        item.high_price * (item.quantity ?? 1),
        item.floor_price,
        item.low_price * (item.quantity ?? 1) - (pallets.find((pallet) => pallet.id === item.palletId)?.palletCost ?? 0),
        item.high_price * (item.quantity ?? 1) - (pallets.find((pallet) => pallet.id === item.palletId)?.palletCost ?? 0),
        item.soldPrice ?? "",
        `"${item.best_platform}"`,
        `"${item.listing_title}"`,
        `"${item.listing_description.replace(/"/g, "'")}"`,
      ].join(","),
    );
    return [header, ...rows].join("\n");
  };

  const exportCSV = async () => {
    if (filteredItems.length === 0) {
      Alert.alert("No items", "Scan and save some items first.");
      return;
    }
    try {
      const csv = buildCSV();
      const filename = getExportFilename();
      await FileSystem.writeAsStringAsync(filename, csv, { encoding: "utf8" });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filename, {
          mimeType: "text/csv",
          dialogTitle: "Export Inventory",
          UTI: "public.comma-separated-values-text",
        });
      }
    } catch (e) {
      Alert.alert("Error", String(e));
    }
  };

  const emailInventory = async () => {
    if (filteredItems.length === 0) {
      Alert.alert("No items", "Scan and save some items first.");
      return;
    }
    try {
      const csv = buildCSV();
      const filename = getExportFilename();
      await FileSystem.writeAsStringAsync(filename, csv, { encoding: "utf8" });
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          "No mail app",
          "Please set up a mail account on your phone.",
        );
        return;
      }
      await MailComposer.composeAsync({
        subject: selectedPallet
          ? `${selectedPallet.name} Inventory Export`
          : "PalletScanner Inventory Export",
        body: selectedPallet
          ? `${selectedPallet.name} inventory is attached. Open in Google Sheets or Excel.`
          : "Your pallet inventory is attached. Open in Google Sheets or Excel.",
        attachments: [filename],
      });
    } catch (e) {
      Alert.alert("Error", String(e));
    }
  };

  const openNextBulkEbayItem = async (queueIds: number[]) => {
    const nextId = queueIds[0];
    if (nextId === undefined) {
      setBulkEbayQueue([]);
      Alert.alert(
        "Mass eBay posting complete",
        "No unposted eBay items remain.",
      );
      return;
    }

    const nextItem = items.find((item: any) => item.id === nextId);
    if (!nextItem) {
      const remainingQueue = queueIds.slice(1);
      setBulkEbayQueue(remainingQueue);
      if (remainingQueue.length === 0) {
        Alert.alert(
          "Mass eBay posting complete",
          "No unposted eBay items remain.",
        );
      }
      return;
    }

    const remainingQueue = queueIds.slice(1);
    setBulkEbayQueue(remainingQueue);
    await openListingDraft(nextItem, "ebay", { showSuccessAlert: false });

    if (remainingQueue.length === 0) {
      Alert.alert(
        "eBay listing opened",
        `Opened the last missing eBay listing for ${nextItem.name}.`,
      );
      return;
    }

    Alert.alert(
      "eBay listing opened",
      `${nextItem.name} is ready to post. Come back here when you're ready for the next item.`,
    );
  };

  const startBulkEbayPosting = () => {
    if (missingEbayItems.length === 0) {
      Alert.alert(
        "Nothing to post",
        "Every inventory item in this view already has the eBay flag.",
      );
      return;
    }

    const queueIds = missingEbayItems.map((item: any) => item.id);
    void openNextBulkEbayItem(queueIds);
  };

  const continueBulkEbayPosting = () => {
    if (bulkEbayQueue.length === 0) {
      startBulkEbayPosting();
      return;
    }

    void openNextBulkEbayItem(bulkEbayQueue);
  };

  const cancelBulkEbayPosting = () => {
    setBulkEbayQueue([]);
  };

  const makeSelectedPalletActive = () => {
    if (!selectedPallet) {
      return;
    }

    setActivePalletSession(selectedPallet.id);
    Alert.alert("Active pallet updated", `${selectedPallet.name} is now active.`);
  };

  const removeSelectedPallet = () => {
    if (!selectedPallet) {
      return;
    }

    Alert.alert(
      "Delete pallet",
      `Delete ${selectedPallet.name} and all items saved inside it?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const deleted = deletePalletSession(selectedPallet.id);
            if (deleted) {
              setSelectedPalletId("all");
            }
          },
        },
      ],
    );
  };

  const suggestBundle = async () => {
    if (!API_KEY) {
      Alert.alert("Missing API key", "Set your Anthropic API key before requesting bundle suggestions.");
      return;
    }

    if (bundleCandidateItems.length < 3) {
      Alert.alert("Not enough items", "Save at least 3 items in the current pallet/session first.");
      return;
    }

    setBundleLoading(true);
    try {
      const promptItems = bundleCandidateItems.map((item: any) => ({
        name: item.name,
        condition: item.condition,
        low_price: item.low_price,
        high_price: item.high_price,
      }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        } as HeadersInit,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are a reseller helping group inventory into sensible bundles. Based on the items below, suggest 1 to 3 bundles that are actually practical to list together. Respond ONLY with raw JSON in this shape:
{
  "bundles": [
    {
      "title": "bundle listing title",
      "items": ["item 1", "item 2"],
      "price": 42,
      "reason": "one sentence"
    }
  ]
}

Items:
${JSON.stringify(promptItems, null, 2)}`,
                },
              ],
            },
          ],
        }),
      });

      const data = await response.json();
      const text = data.content[0].text;
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      const bundles = Array.isArray(parsed.bundles) ? parsed.bundles : [];
      setBundleSuggestions(bundles);
      setBundleModalVisible(true);
    } catch {
      Alert.alert("Bundle suggestion failed", "We couldn't generate bundle suggestions right now.");
    } finally {
      setBundleLoading(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>
          {selectedPallet ? `${selectedPallet.name} inventory` : "Everything you have saved so far"}
        </Text>

        <View style={styles.filterCard}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setFiltersExpanded((current) => !current)}
          >
            <View>
              <Text style={styles.filterLabel}>FILTERS</Text>
              <Text style={styles.sectionSummaryText}>
                {selectedPallet ? selectedPallet.name : "All Inventory"} | {sortMode === "date"
                  ? "Newest"
                  : sortMode === "high-desc"
                    ? "High to Low"
                    : "Low to High"} | {filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}
              </Text>
            </View>
            <Text style={styles.sectionToggleText}>
              {filtersExpanded ? "Hide" : "Show"}
            </Text>
          </TouchableOpacity>

          {filtersExpanded ? (
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
                  {selectedPallet && (
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
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search inventory by item name"
                placeholderTextColor={AppPalette.textSoft}
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
              <Text style={styles.resultCount}>
                Showing {filteredItems.length} of {palletScopedItemCount} items
              </Text>
            </>
          ) : null}
        </View>

        <View style={styles.totalCard}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setSummaryExpanded((current) => !current)}
          >
            <View>
              <Text style={styles.filterLabel}>SUMMARY</Text>
              <Text style={styles.sectionSummaryText}>
                {filteredItems.length} items | Low ${totalLow} | High ${totalHigh}
              </Text>
            </View>
            <Text style={styles.sectionToggleText}>
              {summaryExpanded ? "Hide" : "Show"}
            </Text>
          </TouchableOpacity>

          {summaryExpanded ? (
            <>
              <View style={styles.totalRow}>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Items</Text>
                  <Text style={styles.totalValue}>{filteredItems.length}</Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Low</Text>
                  <Text style={styles.totalValue}>${totalLow}</Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>High</Text>
                  <Text style={styles.totalValue}>${totalHigh}</Text>
                </View>
              </View>
              <View style={styles.profitRow}>
                <View style={styles.profitBox}>
                  <Text style={styles.totalLabel}>Pallet Cost</Text>
                  <Text style={styles.profitValue}>${totalPalletCost}</Text>
                </View>
                <View style={styles.profitBox}>
                  <Text style={styles.totalLabel}>Profit Low</Text>
                  <Text style={styles.profitValue}>${projectedProfitLow}</Text>
                </View>
                <View style={styles.profitBox}>
                  <Text style={styles.totalLabel}>Profit High</Text>
                  <Text style={styles.profitValue}>${projectedProfitHigh}</Text>
                </View>
              </View>
              <View style={styles.exportRow}>
                <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
                  <Text style={styles.exportBtnText}>Export CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.emailBtn} onPress={emailInventory}>
                  <Text style={styles.emailBtnText}>Email Inventory</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.bulkEbayBtn}
                onPress={
                  bulkEbayQueue.length > 0
                    ? continueBulkEbayPosting
                    : startBulkEbayPosting
                }
              >
                <Text style={styles.bulkEbayBtnText}>
                  {bulkEbayQueue.length > 0
                    ? `Continue Mass eBay Posting (${bulkEbayQueue.length} left)`
                    : `Post All Missing to eBay (${missingEbayItems.length})`}
                </Text>
              </TouchableOpacity>
              {bulkEbayQueue.length > 0 && (
                <TouchableOpacity
                  style={styles.cancelBulkBtn}
                  onPress={cancelBulkEbayPosting}
                >
                  <Text style={styles.cancelBulkBtnText}>Stop Mass Posting</Text>
                </TouchableOpacity>
              )}
              {bundleCandidateItems.length >= 3 && (
                <TouchableOpacity
                  style={styles.bundleBtn}
                  onPress={() => {
                    void suggestBundle();
                  }}
                >
                  <Text style={styles.bundleBtnText}>
                    {bundleLoading ? "Suggesting Bundles..." : "Suggest Bundle"}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}
        </View>

        {filteredItems.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>+</Text>
            <Text style={styles.emptyText}>
              {selectedPallet ? `No items in ${selectedPallet.name}` : "No items yet"}
            </Text>
            <Text style={styles.emptySubtext}>
              {selectedPallet
                ? "Switch pallets or save more items on the Home tab."
                : pallets.length === 0
                  ? "Create a pallet first, then start saving items from Home."
                  : "Scan items on the Home tab and tap Save to Inventory"}
            </Text>
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={() => router.push("/(tabs)")}
            >
              <Text style={styles.emptyActionText}>Go to Home</Text>
            </TouchableOpacity>
          </View>
        )}

        {filteredItems.map((item: any) => (
          <View key={item.id} style={styles.itemCard}>
            {item.listedPlatforms.length > 0 && (
              <View style={styles.listedBannerRow}>
                {item.listedPlatforms.map((platform: "facebook" | "ebay") => (
                  <View
                    key={platform}
                    style={[
                      styles.listedBanner,
                      platform === "facebook"
                        ? styles.listedFacebookBanner
                        : styles.listedEbayBanner,
                    ]}
                  >
                    <Text style={styles.listedBannerText}>
                      Listed to {platform === "facebook" ? "Facebook" : "eBay"}
                    </Text>
                    <TouchableOpacity
                      style={styles.listedBannerClose}
                      onPress={() => unmarkInventoryItemListed(item.id, platform)}
                    >
                      <Text style={styles.listedBannerCloseText}>x</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.itemTop}>
              {item.photo && (
                <Image source={{ uri: item.photo }} style={styles.itemPhoto} />
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.palletTag}>{getPalletName(item.palletId)}</Text>
                <View style={styles.badgeRow}>
                  <Text style={styles.priceBadge}>
                    ${item.low_price}-${item.high_price}
                  </Text>
                  <Text style={styles.quantityBadge}>Qty {item.quantity ?? 1}</Text>
                  <Text style={styles.floorBadge}>Floor ${item.floor_price}</Text>
                  <Text style={styles.conditionBadge}>{item.condition}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.platformText}>{item.best_platform}</Text>
                  {item.soldPrice !== null ? (
                    <Text style={styles.soldPill}>Sold for ${item.soldPrice}</Text>
                  ) : (
                    <Text style={styles.unsoldText}>Not marked sold</Text>
                  )}
                </View>
              </View>
            </View>
            <View style={styles.itemActions}>
              <TouchableOpacity
                style={[styles.platformBtn, styles.facebookBtn]}
                onPress={() => openListingDraft(item, "facebook")}
              >
                <Text style={styles.platformBtnText}>Post to Facebook</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.platformBtn, styles.ebayBtn]}
                onPress={() => openListingDraft(item, "ebay")}
              >
                <Text style={styles.platformBtnText}>Post to eBay</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.itemSecondaryActions}>
              <TouchableOpacity
                style={styles.secondaryActionBtn}
                onPress={() =>
                  setEditingSoldItemId((current) =>
                    current === item.id ? null : item.id,
                  )
                }
              >
                <Text style={styles.secondaryActionBtnText}>
                  {item.soldPrice !== null ? "Edit Sold Price" : "Mark Sold"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeItem(item.id)}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
            {editingSoldItemId === item.id && (
              <View style={styles.soldEditorCard}>
                <Text style={styles.soldEditorLabel}>Sold Price</Text>
                <View style={styles.soldRow}>
                  <TextInput
                    style={styles.soldInput}
                    value={getSoldDraftValue(item)}
                    onChangeText={(value) =>
                      setSoldDrafts((current) => ({
                        ...current,
                        [item.id]: value,
                      }))
                    }
                    placeholder="Enter amount"
                    placeholderTextColor="#999"
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity
                    style={styles.saveSoldBtn}
                    onPress={() => saveSoldPrice(item)}
                  >
                    <Text style={styles.saveSoldBtnText}>
                      {item.soldPrice !== null ? "Update" : "Save"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.clearSoldBtn}
                    onPress={() => clearSoldPrice(item)}
                  >
                    <Text style={styles.clearSoldBtnText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))}
        </View>
      </ScrollView>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 20, paddingTop: 52, paddingBottom: 24 },
  innerContent: { width: "100%", alignSelf: "center" },
  innerContentWide: { maxWidth: AppLayout.maxContentWidth },
  title: { fontSize: 30, fontWeight: "700", color: AppPalette.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: AppPalette.textMuted, marginBottom: 16, lineHeight: 20 },
  filterCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AppPalette.border,
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  sectionSummaryText: {
    fontSize: 13,
    color: AppPalette.textMuted,
    marginTop: 4,
    fontWeight: "600",
  },
  sectionToggleText: {
    fontSize: 13,
    color: AppPalette.primary,
    fontWeight: "700",
  },
  filterHeader: { gap: 8 },
  filterActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginTop: 12,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: AppPalette.textSoft,
    marginBottom: 4,
  },
  filterActiveText: { fontSize: 13, color: AppPalette.textMuted },
  makeActiveBtn: {
    backgroundColor: AppPalette.primaryStrong,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  makeActiveBtnText: { color: AppPalette.primaryOn, fontSize: 13, fontWeight: "600" },
  deletePalletBtn: {
    backgroundColor: AppPalette.dangerSoft,
    borderWidth: 1,
    borderColor: "#efc0b9",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  deletePalletBtnText: { color: AppPalette.dangerStrong, fontSize: 13, fontWeight: "600" },
  filterChipRow: { gap: 8, paddingTop: 12 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  filterChipActive: { backgroundColor: AppPalette.primaryStrong, borderColor: AppPalette.primaryStrong },
  filterChipText: { color: AppPalette.textMuted, fontSize: 13, fontWeight: "500" },
  filterChipTextActive: { color: AppPalette.primaryOn, fontWeight: "600" },
  searchInput: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: AppPalette.text,
    backgroundColor: AppPalette.surface,
    fontSize: 14,
  },
  sortRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
  },
  sortChipActive: {
    backgroundColor: AppPalette.primary,
    borderColor: AppPalette.primary,
  },
  sortChipText: {
    color: AppPalette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  sortChipTextActive: {
    color: AppPalette.primaryOn,
  },
  resultCount: {
    marginTop: 12,
    fontSize: 12,
    color: AppPalette.textSoft,
    fontWeight: "600",
  },
  totalCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: AppPalette.border,
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  profitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 16,
  },
  totalBox: { alignItems: "center", flex: 1 },
  profitBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  totalLabel: { fontSize: 12, color: AppPalette.textSoft, marginBottom: 4 },
  totalValue: { fontSize: 22, fontWeight: "700", color: AppPalette.text },
  profitValue: { fontSize: 16, fontWeight: "700", color: AppPalette.text },
  exportRow: { flexDirection: "row", gap: 10 },
  exportBtn: {
    flex: 1,
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  exportBtnText: { color: AppPalette.text, fontWeight: "600", fontSize: 14 },
  emailBtn: {
    flex: 1,
    backgroundColor: AppPalette.successSoft,
    borderWidth: 1,
    borderColor: "#cfe7dc",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  emailBtnText: { color: AppPalette.success, fontWeight: "600", fontSize: 14 },
  bulkEbayBtn: {
    backgroundColor: AppPalette.infoSoft,
    borderWidth: 1,
    borderColor: "#c9d9f1",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  bulkEbayBtnText: { color: AppPalette.info, fontWeight: "700", fontSize: 14 },
  cancelBulkBtn: {
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
  },
  cancelBulkBtnText: { color: AppPalette.textMuted, fontWeight: "600", fontSize: 13 },
  bundleBtn: {
    backgroundColor: AppPalette.primarySoft,
    borderWidth: 1,
    borderColor: "#cfdeed",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  bundleBtnText: { color: AppPalette.primary, fontWeight: "700", fontSize: 14 },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppPalette.primarySoft,
    textAlign: "center",
    lineHeight: 56,
    fontSize: 28,
    color: AppPalette.primary,
    marginBottom: 12,
  },
  emptyText: { fontSize: 18, fontWeight: "600", color: AppPalette.text, marginBottom: 8 },
  emptySubtext: {
    fontSize: 14,
    color: AppPalette.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: 14,
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyActionText: {
    color: AppPalette.primaryOn,
    fontWeight: "700",
    fontSize: 14,
  },
  itemCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppPalette.border,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  listedBannerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  listedBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    gap: 8,
  },
  listedFacebookBanner: { backgroundColor: AppPalette.infoSoft },
  listedEbayBanner: { backgroundColor: AppPalette.primarySoft },
  listedBannerText: { fontSize: 12, fontWeight: "600", color: AppPalette.text },
  listedBannerClose: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  listedBannerCloseText: {
    fontSize: 11,
    lineHeight: 11,
    color: AppPalette.textMuted,
    fontWeight: "700",
  },
  itemTop: { flexDirection: "row", padding: 12, gap: 12 },
  itemPhoto: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: AppPalette.surfaceMuted,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: "700", color: AppPalette.text, marginBottom: 4 },
  palletTag: { fontSize: 12, color: AppPalette.textMuted, marginBottom: 6 },
  badgeRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  soldRow: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  soldInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: AppPalette.text,
    backgroundColor: AppPalette.surface,
  },
  saveSoldBtn: {
    backgroundColor: AppPalette.primaryStrong,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveSoldBtnText: { color: AppPalette.primaryOn, fontSize: 12, fontWeight: "600" },
  clearSoldBtn: {
    backgroundColor: AppPalette.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearSoldBtnText: { color: AppPalette.textMuted, fontSize: 12, fontWeight: "600" },
  soldPill: {
    fontSize: 12,
    color: AppPalette.success,
    fontWeight: "700",
    backgroundColor: AppPalette.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  unsoldText: {
    fontSize: 12,
    color: AppPalette.textSoft,
    fontWeight: "600",
  },
  priceBadge: {
    backgroundColor: AppPalette.successSoft,
    color: AppPalette.success,
    fontSize: 12,
    fontWeight: "500",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  quantityBadge: {
    backgroundColor: AppPalette.infoSoft,
    color: AppPalette.info,
    fontSize: 12,
    fontWeight: "500",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  conditionBadge: {
    backgroundColor: AppPalette.warningSoft,
    color: AppPalette.warning,
    fontSize: 12,
    fontWeight: "500",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  floorBadge: {
    backgroundColor: AppPalette.surfaceTint,
    color: AppPalette.primary,
    fontSize: 12,
    fontWeight: "500",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  platformText: { fontSize: 12, color: AppPalette.textMuted, fontWeight: "600" },
  itemActions: {
    borderTopWidth: 1,
    borderTopColor: AppPalette.border,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  itemSecondaryActions: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  platformBtn: {
    flex: 1,
    minWidth: 130,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  facebookBtn: { backgroundColor: AppPalette.primaryStrong },
  ebayBtn: { backgroundColor: AppPalette.info },
  platformBtnText: { fontSize: 13, color: AppPalette.primaryOn, fontWeight: "600" },
  secondaryActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
    alignItems: "center",
  },
  secondaryActionBtnText: {
    fontSize: 13,
    color: AppPalette.text,
    fontWeight: "600",
  },
  removeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.dangerSoft,
    alignItems: "center",
  },
  removeBtnText: { fontSize: 13, color: AppPalette.dangerStrong, fontWeight: "600" },
  soldEditorCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 2,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppPalette.border,
    padding: 12,
  },
  soldEditorLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: AppPalette.textSoft,
    marginBottom: 2,
  },
  bundleModalBackdrop: {
    flex: 1,
    backgroundColor: AppPalette.modalBackdrop,
    justifyContent: "center",
    padding: 20,
  },
  bundleModalCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 14,
    padding: 20,
    maxHeight: "80%",
  },
  bundleModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: AppPalette.text,
    marginBottom: 12,
  },
  bundleModalEmpty: {
    fontSize: 14,
    lineHeight: 20,
    color: AppPalette.textMuted,
  },
  bundleSuggestionCard: {
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppPalette.border,
    padding: 12,
    marginBottom: 10,
  },
  bundleSuggestionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: AppPalette.text,
    marginBottom: 4,
  },
  bundleSuggestionPrice: {
    fontSize: 13,
    fontWeight: "600",
    color: AppPalette.primary,
    marginBottom: 6,
  },
  bundleSuggestionItems: {
    fontSize: 13,
    lineHeight: 18,
    color: AppPalette.textMuted,
    marginBottom: 6,
  },
  bundleSuggestionReason: {
    fontSize: 12,
    lineHeight: 18,
    color: AppPalette.textSoft,
  },
  bundleCloseBtn: {
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  bundleCloseBtnText: {
    color: AppPalette.primaryOn,
    fontWeight: "700",
    fontSize: 14,
  },
});
