import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { Dispatch, SetStateAction } from "react";

import {
  deletePalletSession,
  markInventoryItemEbayEnded,
  removeInventoryItem,
  saveInventoryItem,
  setActivePalletSession,
  unmarkInventoryItemListed,
  updateInventoryItemFacebookListingUrl,
  updateInventoryItemSoldPrice,
} from "@/lib/inventory-store";
import { AppAlert as Alert, type AppAlertButton } from "@/lib/app-alert";
import { endEbayListing } from "@/lib/ebay-integration";
import { openListingDraft } from "@/lib/listing-posting";
import {
  ANTHROPIC_MODEL,
  isAnthropicConfigured,
  requestAnthropicMessage,
} from "@/lib/anthropic";
import {
  buildInventoryCsv,
  createInventoryExportBasename,
  type InventoryItem,
  type PalletSession,
} from "@palletscanner/core";
import {
  displaySoldPrice,
  displayText,
  hasListedPlatform,
  type BundleSuggestion,
  type ItemDetailDraft,
} from "./inventory-helpers";

export type InventoryActionsInput = {
  items: InventoryItem[];
  pallets: PalletSession[];
  selectedItem: InventoryItem | null;
  selectedPallet: PalletSession | null;
  filteredItems: InventoryItem[];
  missingEbayItems: InventoryItem[];
  missingFacebookItems: InventoryItem[];
  bundleCandidateItems: InventoryItem[];
  bulkEbayQueue: number[];
  bulkFacebookQueue: number[];
  soldDrafts: Record<number, string>;
  facebookUrlDrafts: Record<number, string>;
  editingSoldItemId: number | null;
  editingFacebookUrlItemId: number | null;
  itemDetailDraft: ItemDetailDraft;
  setBulkEbayQueue: Dispatch<SetStateAction<number[]>>;
  setBulkFacebookQueue: Dispatch<SetStateAction<number[]>>;
  setSelectedPalletId: Dispatch<SetStateAction<string>>;
  setSoldDrafts: Dispatch<SetStateAction<Record<number, string>>>;
  setFacebookUrlDrafts: Dispatch<SetStateAction<Record<number, string>>>;
  setEditingSoldItemId: Dispatch<SetStateAction<number | null>>;
  setEditingFacebookUrlItemId: Dispatch<SetStateAction<number | null>>;
  setFilterModalVisible: Dispatch<SetStateAction<boolean>>;
  setSelectedItemId: Dispatch<SetStateAction<number | null>>;
  setItemDetailDraft: Dispatch<SetStateAction<ItemDetailDraft>>;
  setBundleLoading: Dispatch<SetStateAction<boolean>>;
  setBundleModalVisible: Dispatch<SetStateAction<boolean>>;
  setBundleSuggestions: Dispatch<SetStateAction<BundleSuggestion[]>>;
};

export const useInventoryActions = (input: InventoryActionsInput) => {
  const {
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
  } = input;

  const openItemDetails = (item: InventoryItem) => {
    setSelectedItemId(item.id);
    setItemDetailDraft({
      name: item.name,
      category: item.category ?? "",
      condition: item.condition,
      quantity: String(item.quantity),
      low: String(item.low_price),
      high: String(item.high_price),
      floor: String(item.floor_price),
      listingPrice: String(item.listing_price ?? item.high_price),
      ebayTitle: item.listing_title_ebay || item.listing_title,
      ebayDescription: item.listing_description_ebay || item.listing_description,
      ebayItemSpecifics: { ...(item.ebayItemSpecifics ?? {}) },
    });
  };

  const updateItemDetailDraft = (field: keyof typeof itemDetailDraft, value: string) =>
    setItemDetailDraft((current) => ({ ...current, [field]: value }));

  const saveItemDetails = async (closeAfterSave = true): Promise<InventoryItem | null> => {
    if (!selectedItem) return null;
    const quantity = Number(itemDetailDraft.quantity);
    const low = Number(itemDetailDraft.low);
    const high = Number(itemDetailDraft.high);
    const floor = Number(itemDetailDraft.floor);
    const listingPrice = Number(itemDetailDraft.listingPrice);
    if (!itemDetailDraft.name.trim()) {
      Alert.alert("Name required", "Enter an item name before saving.");
      return null;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      Alert.alert("Invalid quantity", "Quantity must be a whole number of at least one.");
      return null;
    }
    if (![low, high, floor, listingPrice].every((value) => Number.isFinite(value) && value >= 0) || listingPrice === 0) {
      Alert.alert("Invalid price", "Enter valid prices and a listing price greater than zero.");
      return null;
    }
    if (high < low) {
      Alert.alert("Invalid price range", "The high estimate cannot be lower than the low estimate.");
      return null;
    }
    if (listingPrice < floor) {
      Alert.alert("Listing price below floor", "The approved listing price cannot be lower than the floor price.");
      return null;
    }
    const updatedItem: InventoryItem = {
      ...selectedItem,
      name: itemDetailDraft.name.trim(),
      category: itemDetailDraft.category.trim() || "Uncategorized",
      condition: itemDetailDraft.condition.trim() || "Unknown",
      quantity, low_price: low, high_price: high, floor_price: floor,
      listing_price: listingPrice,
      listing_title: itemDetailDraft.ebayTitle.trim(),
      listing_title_ebay: itemDetailDraft.ebayTitle.trim(),
      listing_description: itemDetailDraft.ebayDescription.trim(),
      listing_description_ebay: itemDetailDraft.ebayDescription.trim(),
      ebayItemSpecifics: itemDetailDraft.ebayItemSpecifics,
    };
    await saveInventoryItem(updatedItem);
    if (closeAfterSave) {
      setSelectedItemId(null);
      Alert.alert("Item updated", "The listing details and eBay price have been saved.");
    }
    return updatedItem;
  };

  const postItemFromDetails = async (platform: "facebook" | "ebay") => {
    const updatedItem = await saveItemDetails(false);
    if (!updatedItem) return;
    setSelectedItemId(null);
    await openListingDraft(updatedItem, platform);
  };

  const markSoldFromDetails = (item: InventoryItem) => {
    setSelectedItemId(null);
    setTimeout(() => {
      void (async () => {
        const answer = await Alert.prompt(
          item.soldPrice !== null ? "Update sold price" : "Mark item sold",
          "Enter the final sale price.",
          item.soldPrice !== null ? String(item.soldPrice) : String(item.listing_price ?? item.high_price),
          "Sale price",
        );
        if (answer === null) return;
        const soldPrice = Number(answer.trim());
        if (!Number.isFinite(soldPrice) || soldPrice < 0) {
          Alert.alert("Invalid sold price", "Enter a valid amount like 25 or 25.50.");
          return;
        }
        try {
          await endItemEbayListing(item);
          updateInventoryItemSoldPrice(item.id, soldPrice);
        } catch (error) {
          Alert.alert("Could not mark sold", error instanceof Error ? error.message : "The active eBay listing could not be ended.");
        }
      })();
    }, 180);
  };

  const removeItemFromDetails = (item: InventoryItem) => {
    setSelectedItemId(null);
    setTimeout(() => removeItem(item), 180);
  };

  const endItemEbayListing = async (item: InventoryItem) => {
    if (!item.ebayOfferId) {
      return;
    }

    await endEbayListing(item.ebayOfferId);
    markInventoryItemEbayEnded(item.id);
  };

  const removeItem = (item: InventoryItem) => {
    Alert.alert("Remove Item", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await endItemEbayListing(item);
                await removeInventoryItem(item.id);
              } catch (error) {
                Alert.alert(
                  "eBay listing is still active",
                  `${
                    error instanceof Error
                      ? error.message
                      : "The listing could not be ended."
                  }\n\nThe item was kept in inventory so it cannot be sold by accident.`,
                );
              }
            })();
          },
        },
      ]);
  };

  const getSoldDraftValue = (item: InventoryItem) =>
    soldDrafts[item.id] ?? (item.soldPrice !== null ? String(item.soldPrice) : "");

  const getFacebookUrlDraftValue = (item: InventoryItem) =>
    facebookUrlDrafts[item.id] ?? item.facebookListingUrl ?? "";

  const saveSoldPrice = (item: InventoryItem) => {
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

    void (async () => {
      try {
        await endItemEbayListing(item);
        updateInventoryItemSoldPrice(item.id, parsedValue);
        setSoldDrafts((current) => ({
          ...current,
          [item.id]: String(parsedValue),
        }));
        setEditingSoldItemId(null);
      } catch (error) {
        Alert.alert(
          "Could not mark sold",
          `${
            error instanceof Error
              ? error.message
              : "The eBay listing could not be ended."
          }\n\nThe item remains unsold in the app.`,
        );
      }
    })();
  };

  const clearSoldPrice = (item: InventoryItem) => {
    updateInventoryItemSoldPrice(item.id, null);
    setSoldDrafts((current) => ({
      ...current,
      [item.id]: "",
    }));
    if (editingSoldItemId === item.id) {
      setEditingSoldItemId(null);
    }
  };

  const confirmUnmarkListed = (
    item: InventoryItem,
    platform: "facebook" | "ebay",
  ) => {
    const platformLabel = platform === "facebook" ? "Facebook" : "eBay";
    Alert.alert(
      `Unmark ${platformLabel} posted?`,
      "This only updates the item in PalletFlip. It will not remove or end anything on the marketplace.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Unmark ${platformLabel}`,
          style: "destructive",
          onPress: () => unmarkInventoryItemListed(item.id, platform),
        },
      ],
    );
  };

  const showItemActionMenu = (item: InventoryItem) => {
    const itemSoldPrice = displaySoldPrice(item.soldPrice);
    const facebookLabel =
      item.facebookStatus === "opened" && !hasListedPlatform(item, "facebook")
        ? "Continue Facebook Draft"
        : hasListedPlatform(item, "facebook")
          ? "Copy Facebook Details"
          : "Post to Facebook";
    const ebayLabel =
      item.ebayStatus === "posting"
        ? "Posting to eBay..."
        : item.ebayListingUrl
          ? "Update eBay Listing"
          : "Post to eBay";
    const actions: AppAlertButton[] = [
      {
        text: facebookLabel,
        onPress: () => {
          void openListingDraft(item, "facebook");
        },
      },
      {
        text: ebayLabel,
        onPress: () => {
          void openListingDraft(item, "ebay");
        },
      },
    ];

    if (hasListedPlatform(item, "facebook")) {
      actions.push({
        text: "Unmark Facebook Posted",
        onPress: () => confirmUnmarkListed(item, "facebook"),
      });
    }

    if (
      hasListedPlatform(item, "ebay") ||
      item.ebayStatus === "active" ||
      item.ebayListingUrl
    ) {
      actions.push({
        text: "Unmark eBay Posted",
        onPress: () => confirmUnmarkListed(item, "ebay"),
      });
    }

    actions.push(
      {
        text: itemSoldPrice !== null ? "Edit Sold Price" : "Mark Sold",
        onPress: () => setEditingSoldItemId(item.id),
      },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeItem(item),
      },
      { text: "Cancel", style: "cancel" },
    );

    Alert.alert("Item actions", displayText(item.name, "Inventory item"), actions);
  };

  const pasteFacebookUrl = async (item: InventoryItem) => {
    const value = await Clipboard.getStringAsync();
    setFacebookUrlDrafts((current) => ({
      ...current,
      [item.id]: value.trim(),
    }));
  };

  const saveFacebookUrl = (item: InventoryItem) => {
    const rawValue = getFacebookUrlDraftValue(item).trim();
    if (!rawValue) {
      Alert.alert("Paste the listing URL", "Open the Facebook listing, copy its URL, then paste it here.");
      return;
    }

    if (!/^https?:\/\//i.test(rawValue) || !/(facebook|fb)\.com/i.test(rawValue)) {
      Alert.alert(
        "Check the URL",
        "Use the full Facebook listing URL, starting with https://.",
      );
      return;
    }

    updateInventoryItemFacebookListingUrl(item.id, rawValue);
    setFacebookUrlDrafts((current) => ({
      ...current,
      [item.id]: rawValue,
    }));
    setEditingFacebookUrlItemId(null);
  };

  const clearFacebookUrl = (item: InventoryItem) => {
    updateInventoryItemFacebookListingUrl(item.id, undefined);
    setFacebookUrlDrafts((current) => ({
      ...current,
      [item.id]: "",
    }));
    if (editingFacebookUrlItemId === item.id) {
      setEditingFacebookUrlItemId(null);
    }
  };

  const getExportFilename = () => {
    return FileSystem.documentDirectory + createInventoryExportBasename(selectedPallet);
  };

  const exportCSV = async () => {
    if (filteredItems.length === 0) {
      Alert.alert("No items", "Scan and save some items first.");
      return;
    }
    try {
      const csv = buildInventoryCsv(filteredItems, pallets);
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = getExportFilename().split("/").pop() ?? "inventory.csv";
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }
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
      const csv = buildInventoryCsv(filteredItems, pallets);
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
          : "PalletFlip Inventory Export",
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

    const nextItem = items.find((item) => item.id === nextId);
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
    const outcome = await openListingDraft(nextItem, "ebay", { showSuccessAlert: false });
    if (outcome.status === "cancelled") {
      setBulkEbayQueue(queueIds);
      return;
    }
    setBulkEbayQueue(remainingQueue);

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

    const queueIds = missingEbayItems.map((item) => item.id);
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

  const openNextBulkFacebookItem = async (queueIds: number[]) => {
    const nextId = queueIds[0];
    if (nextId === undefined) {
      setBulkFacebookQueue([]);
      Alert.alert(
        "Facebook posting queue complete",
        "No unposted Facebook items remain in this view.",
      );
      return;
    }

    const nextItem = items.find((item) => item.id === nextId);
    if (!nextItem) {
      const remainingQueue = queueIds.slice(1);
      setBulkFacebookQueue(remainingQueue);
      if (remainingQueue.length === 0) {
        Alert.alert(
          "Facebook posting queue complete",
          "No unposted Facebook items remain in this view.",
        );
      }
      return;
    }

    const remainingQueue = queueIds.slice(1);
    const outcome = await openListingDraft(nextItem, "facebook");
    if (outcome.status === "cancelled") {
      setBulkFacebookQueue(queueIds);
      return;
    }
    setBulkFacebookQueue(remainingQueue);
  };

  const startBulkFacebookPosting = () => {
    if (missingFacebookItems.length === 0) {
      Alert.alert(
        "Nothing to post",
        "Every inventory item in this view already has the Facebook flag.",
      );
      return;
    }

    const queueIds = missingFacebookItems.map((item) => item.id);
    void openNextBulkFacebookItem(queueIds);
  };

  const continueBulkFacebookPosting = () => {
    if (bulkFacebookQueue.length === 0) {
      startBulkFacebookPosting();
      return;
    }

    void openNextBulkFacebookItem(bulkFacebookQueue);
  };

  const cancelBulkFacebookPosting = () => {
    setBulkFacebookQueue([]);
  };

  const makeSelectedPalletActive = () => {
    if (!selectedPallet) {
      return;
    }

    setActivePalletSession(selectedPallet.id);
    setFilterModalVisible(false);
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
    if (!isAnthropicConfigured()) {
      Alert.alert("AI unavailable", "The secure AI backend is not configured.");
      return;
    }

    if (bundleCandidateItems.length < 3) {
      Alert.alert("Not enough items", "Save at least 3 items in the current pallet/session first.");
      return;
    }

    setBundleLoading(true);
    try {
      const promptItems = bundleCandidateItems.map((item) => ({
        name: item.name,
        condition: item.condition,
        low_price: item.low_price,
        high_price: item.high_price,
      }));

      const text = await requestAnthropicMessage({
          model: ANTHROPIC_MODEL,
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
      });
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

  return {
    openItemDetails,
    updateItemDetailDraft,
    saveItemDetails,
    postItemFromDetails,
    markSoldFromDetails,
    removeItemFromDetails,
    endItemEbayListing,
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
  };
};
