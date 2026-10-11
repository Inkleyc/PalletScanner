import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Image,
  Linking,
  Modal,
  Platform,
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
  saveInventoryItem,
  setActivePalletSession,
  subscribeInventory,
  unmarkInventoryItemListed,
  updateInventoryItemSoldPrice,
  markInventoryItemEbayEnded,
  updateInventoryItemFacebookListingUrl,
  updateInventoryItemFacebookStatus,
} from "@/lib/inventory-store";
import { AppAlert as Alert, type AppAlertButton } from "@/lib/app-alert";
import { endEbayListing } from "@/lib/ebay-integration";
import {
  copyFacebookListingValue,
  openListingDraft,
} from "@/lib/listing-posting";
import {
  getPostingReadiness,
  getPostingReadinessMessage,
} from "@/lib/posting-validation";
import { AppLayout, AppPalette } from "@/constants/app-palette";
import {
  ANTHROPIC_MODEL,
  isAnthropicConfigured,
  requestAnthropicMessage,
} from "@/lib/anthropic";
import {
  filterInventoryItems,
  getFacebookDraftItems,
  getFacebookMissingUrlItems,
  getItemsMissingPlatformListing,
  getItemsWithoutPhotos,
  getInventoryWorkflowStatus,
  getListingFilterLabel,
  hasActiveInventoryFilters,
  type InventoryItem,
  type InventorySortMode,
  type ListingFilter,
} from "@palletscanner/core";
import {
  buildInventoryCsv,
  calculateInventoryValueSummary,
  createInventoryExportBasename,
} from "@palletscanner/core";

type BundleSuggestion = {
  title: string;
  items: string[];
  price: number;
  reason: string;
};

const demoInventorySeed = [
  { id: 910001, name: "KitchenAid Classic Stand Mixer K45SS", category: "Small kitchen appliances", condition: "Used - good", low: 90, high: 145, floor: 75, list: 129.99, platform: "eBay", photo: "https://i.ebayimg.com/images/g/4uUAAeSwKO1psiam/s-l960.jpg", title: "KitchenAid Classic K45SS 4.5 Qt Tilt-Head Stand Mixer White With Bowl", description: "Tested KitchenAid Classic stand mixer with stainless bowl. Normal cosmetic wear from use; see photos for condition and included pieces." },
  { id: 910002, name: "DeWalt DCD785 18V Cordless Drill", category: "Power tools", condition: "Used - fair", low: 45, high: 80, floor: 35, list: 69.99, platform: "eBay", photo: "https://cgxuk.co.uk/media/catalog/product/b/0/b0317aac-82e5-4370-b2dc-e5acfc89e1c8.jpeg?height=600&image-type=image&store=default&width=600", title: "DeWalt DCD785 18V XR Cordless Combi Drill Driver Tool", description: "Pre-owned DeWalt cordless drill with visible cosmetic wear. Confirm battery, charger, and accessories shown in photos before purchase." },
  { id: 910003, name: "Bose QuietComfort Wireless Headphones", category: "Headphones", condition: "Used - good", low: 95, high: 150, floor: 80, list: 139.99, platform: "eBay", photo: "https://i.ebayimg.com/images/g/7LQAAOSwBNNlg5k8/s-l1200.jpg", title: "Bose QuietComfort Wireless Bluetooth Noise Cancelling Headphones Black", description: "Bose QuietComfort over-ear wireless headphones in good working condition with light cosmetic wear. Includes the accessories pictured." },
  { id: 910004, name: "Electrolux ERB30 Robot Vacuum", category: "Vacuum cleaners", condition: "Open box", low: 75, high: 125, floor: 65, list: 109.99, platform: "Facebook", photo: "https://static.wixstatic.com/media/507b47_d7d1b87453c9462db58dfee0dec8c297~mv2.jpg/v1/fill/w_679%2Ch_711%2Cal_c%2Cq_85%2Cenc_avif%2Cquality_auto/507b47_d7d1b87453c9462db58dfee0dec8c297~mv2.jpg", title: "Electrolux ERB30 Robot Vacuum and Mop", description: "Open-box Electrolux robotic vacuum with remote and charging accessories. Inspect photos for package contents and condition." },
  { id: 910005, name: "Kobot RV353 Slim Robot Vacuum", category: "Vacuum cleaners", condition: "New - open box", low: 65, high: 110, floor: 55, list: 99.99, platform: "Facebook", photo: "https://media-www.canadiantire.ca/product/living/cleaning/vacuums-and-floorcare/0438152/kobot-rv353-slim-robotic-vacuum-a2801347-ff51-4d6c-ac57-232f2b0098a1.png?imwidth=1024", title: "Kobot RV353 Slim Robotic Vacuum With Charging Dock", description: "Open-box slim robotic vacuum with charging dock. Includes the pieces shown and is ready for final functional verification." },
  { id: 910006, name: "Samsung VR5000 Robot Vacuum and Mop", category: "Vacuum cleaners", condition: "Used - excellent", low: 115, high: 175, floor: 95, list: 159.99, platform: "eBay", photo: "https://www.galaxus.ch/im/productimages/2/7/1/3/5/3/4/1/5/4/7/5/2/8/6/8/8/2/6/1abccb06-67a7-48c6-a5e2-2453abc039ee_cropped.png", title: "Samsung VR5000 2-in-1 Robot Vacuum and Mop Wi-Fi", description: "Clean Samsung VR5000 robotic vacuum and mop in excellent used condition. Includes charging equipment and accessories pictured." },
  { id: 910007, name: "Bose QuietComfort Headphones With Case", category: "Headphones", condition: "Seller refurbished", low: 110, high: 165, floor: 95, list: 149.99, platform: "eBay", photo: "https://i.ebayimg.com/images/g/IaoAAeSwNKxptCJe/s-l1200.jpg", title: "Bose QuietComfort Wireless Headphones Beige With Case and Charger", description: "Professionally refurbished Bose QuietComfort headphones with carrying case and charging cable. Tested and ready to use." },
];


const getListedPlatforms = (item: InventoryItem) =>
  Array.isArray(item.listedPlatforms)
    ? item.listedPlatforms.filter(
        (platform): platform is "facebook" | "ebay" =>
          platform === "facebook" || platform === "ebay",
      )
    : [];

const hasListedPlatform = (item: InventoryItem, platform: "facebook" | "ebay") =>
  getListedPlatforms(item).includes(platform);

const displayText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;

const displayNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && !Number.isNaN(value) ? value : fallback;

const displayId = (value: unknown) =>
  typeof value === "number" && !Number.isNaN(value)
    ? value
    : typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;

const displayPhotoUri = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const displayQuantity = (value: unknown) =>
  typeof value === "number" && !Number.isNaN(value) && value > 0
    ? Math.floor(value)
    : 1;

const displaySoldPrice = (value: unknown) =>
  typeof value === "number" && !Number.isNaN(value) ? value : null;

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
    if (!__DEV__ || demoSeedStarted.current || items.length === 0 || pallets.length === 0) return;
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
  }, [activePallet?.id, items, pallets]);
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
  const showItemTools = () => false;
  const getWorkflowStatusStyle = (
    status: ReturnType<typeof getInventoryWorkflowStatus>["status"],
  ) => {
    switch (status) {
      case "sold":
        return styles.workflowStatus_sold;
      case "listed":
        return styles.workflowStatus_listed;
      case "listing_in_progress":
        return styles.workflowStatus_listing_in_progress;
      case "ready_to_list":
        return styles.workflowStatus_ready_to_list;
      case "needs_review":
        return styles.workflowStatus_needs_review;
      case "needs_photos":
        return styles.workflowStatus_needs_photos;
      default:
        return styles.workflowStatus_captured;
    }
  };

  useEffect(() => {
    if (isLargeLayout && hasActiveFilters && !previousHasActiveFilters.current) {
      setFiltersExpanded(true);
    }
    previousHasActiveFilters.current = hasActiveFilters;
  }, [hasActiveFilters, isLargeLayout]);

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

        {!isLargeLayout ? (
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
                  placeholderTextColor={AppPalette.textSoft}
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
        ) : null}

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
              {isLargeLayout ? (
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
              ) : null}
              <View style={styles.facebookReadinessGrid}>
                <TouchableOpacity
                  style={styles.facebookReadinessBox}
                  onPress={() => setListingFilter("needs-facebook")}
                >
                  <Text style={styles.totalLabel}>Needs Facebook</Text>
                  <Text style={styles.facebookReadinessValue}>
                    {missingFacebookItems.length}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.facebookReadinessBox}
                  onPress={() => setListingFilter("facebook-drafts")}
                >
                  <Text style={styles.totalLabel}>Drafts Open</Text>
                  <Text style={styles.facebookReadinessValue}>
                    {facebookDraftItems.length}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.facebookReadinessBox}
                  onPress={() => setListingFilter("missing-facebook-url")}
                >
                  <Text style={styles.totalLabel}>Missing URLs</Text>
                  <Text style={styles.facebookReadinessValue}>
                    {facebookMissingUrlItems.length}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.facebookReadinessBox}
                  onPress={() => setListingFilter("no-photos")}
                >
                  <Text style={styles.totalLabel}>No Photos</Text>
                  <Text style={styles.facebookReadinessValue}>
                    {noPhotoItems.length}
                  </Text>
                </TouchableOpacity>
              </View>
              {isLargeLayout ? (
                <>
                  <View style={styles.exportRow}>
                    <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
                      <Text style={styles.exportBtnText}>Export CSV</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.emailBtn} onPress={emailInventory}>
                      <Text style={styles.emailBtnText}>Email Inventory</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.bulkFacebookBtn}
                    onPress={() => router.push("/facebook" as never)}
                  >
                    <Text style={styles.bulkFacebookBtnText}>
                      Open Facebook Queue ({missingFacebookItems.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bulkFacebookSecondaryBtn}
                    onPress={
                      bulkFacebookQueue.length > 0
                        ? continueBulkFacebookPosting
                        : startBulkFacebookPosting
                    }
                  >
                    <Text style={styles.bulkFacebookSecondaryBtnText}>
                      {bulkFacebookQueue.length > 0
                        ? `Continue Quick Posting (${bulkFacebookQueue.length} left)`
                        : "Quick Open Next Facebook Draft"}
                    </Text>
                  </TouchableOpacity>
                  {bulkFacebookQueue.length > 0 && (
                    <TouchableOpacity
                      style={styles.cancelBulkBtn}
                      onPress={cancelBulkFacebookPosting}
                    >
                      <Text style={styles.cancelBulkBtnText}>
                        Stop Facebook Posting
                      </Text>
                    </TouchableOpacity>
                  )}
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
        )}

        {filteredItems.map((item, index) => {
          const itemKey = displayId(item.id) ?? `item-${index}`;
          const itemPhotoUri = displayPhotoUri(item.photo);
          const itemSoldPrice = displaySoldPrice(item.soldPrice);
          const itemQuantity = displayQuantity(item.quantity);
          const facebookListingUrl = displayPhotoUri(item.facebookListingUrl);
          const ebayListingUrl = displayPhotoUri(item.ebayListingUrl);

          return (
          <View key={itemKey} style={styles.itemCard}>
            {(() => {
              const workflowStatus = getInventoryWorkflowStatus(item);
              return (
                <View
                  style={[
                    styles.workflowStatusBar,
                    getWorkflowStatusStyle(workflowStatus.status),
                  ]}
                >
                  <Text style={styles.workflowStatusText}>
                    {workflowStatus.label}
                  </Text>
                </View>
              );
            })()}
            {(() => {
              if (!showItemTools()) {
                return null;
              }

              const facebookReadiness = getPostingReadiness(item, "facebook");
              const ebayReadiness = getPostingReadiness(item, "ebay");
              if (facebookReadiness.ready && ebayReadiness.ready) {
                return null;
              }

              return (
                <View style={styles.postingReadinessBox}>
                  <Text style={styles.postingReadinessTitle}>
                    Posting checks
                  </Text>
                  {!facebookReadiness.ready ? (
                    <Text style={styles.postingReadinessText}>
                      Facebook: {getPostingReadinessMessage(item, "facebook")}
                    </Text>
                  ) : null}
                  {!ebayReadiness.ready ? (
                    <Text style={styles.postingReadinessText}>
                      eBay: {getPostingReadinessMessage(item, "ebay")}
                    </Text>
                  ) : null}
                </View>
              );
            })()}
            {(getListedPlatforms(item).length > 0 ||
              (item.facebookStatus === "opened" &&
                !hasListedPlatform(item, "facebook"))) && (
              <View style={styles.listedBannerRow}>
                {getListedPlatforms(item).map((platform: "facebook" | "ebay") => (
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
                      onPress={() => confirmUnmarkListed(item, platform)}
                    >
                      <Text style={styles.listedBannerCloseText}>x</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {item.facebookStatus === "opened" &&
                !hasListedPlatform(item, "facebook") ? (
                  <View style={[styles.listedBanner, styles.facebookDraftBanner]}>
                    <Text style={styles.listedBannerText}>Facebook draft opened</Text>
                  </View>
                ) : null}
              </View>
            )}
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.itemTop}
              onPress={() => openItemDetails(item)}
            >
              {itemPhotoUri ? (
                <Image source={{ uri: itemPhotoUri }} style={styles.itemPhoto} />
              ) : null}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{displayText(item.name, "Unnamed item")}</Text>
                <Text style={styles.palletTag}>{getPalletName(item.palletId)}</Text>
                <View style={styles.badgeRow}>
                  <Text style={styles.priceBadge}>
                    ${displayNumber(item.low_price)}-${displayNumber(item.high_price)}
                  </Text>
                  <Text style={styles.quantityBadge}>Qty {itemQuantity}</Text>
                  <Text style={styles.floorBadge}>
                    Floor ${displayNumber(item.floor_price, displayNumber(item.low_price))}
                  </Text>
                  <Text style={styles.listingPriceBadge}>
                    List ${displayNumber(item.listing_price, displayNumber(item.high_price))}
                  </Text>
                  <Text style={styles.conditionBadge}>
                    {displayText(item.condition, "Unknown")}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.platformText}>
                    {displayText(item.best_platform, "Review needed")}
                  </Text>
                  {itemSoldPrice !== null ? (
                    <Text style={styles.soldPill}>Sold for ${itemSoldPrice}</Text>
                  ) : (
                    <Text style={styles.unsoldText}>Not marked sold</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
            {false ? (
              <TouchableOpacity
                style={styles.listingToolsToggle}
                onPress={() => showItemActionMenu(item)}
              >
                <Text style={styles.listingToolsToggleText}>
                  Actions
                </Text>
              </TouchableOpacity>
            ) : null}
            {showItemTools() ? (
              <>
                <View style={styles.itemActions}>
                  <TouchableOpacity
                    style={[styles.platformBtn, styles.facebookBtn]}
                    onPress={() => openListingDraft(item, "facebook")}
                  >
                    <Text style={styles.platformBtnText}>
                      {item.facebookStatus === "opened" &&
                      !hasListedPlatform(item, "facebook")
                        ? "Continue Facebook Draft"
                        : hasListedPlatform(item, "facebook")
                          ? "Copy Facebook Details"
                          : "Post to Facebook"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.platformBtn, styles.ebayBtn]}
                    onPress={() => openListingDraft(item, "ebay")}
                  >
                    <Text style={styles.platformBtnText}>
                      {item.ebayStatus === "posting"
                        ? "Posting..."
                        : item.ebayListingUrl
                          ? "Update eBay Listing"
                          : "Post to eBay"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.facebookQuickCopyRow}
                >
                  {[
                    "Title",
                    "Price",
                    "Description",
                    "Condition",
                    "Photo checklist",
                  ].map((label) => (
                    <TouchableOpacity
                      key={label}
                      style={styles.facebookQuickCopyBtn}
                      onPress={() => {
                        void copyFacebookListingValue(
                          item,
                          label as
                            | "Title"
                            | "Price"
                            | "Description"
                            | "Condition"
                            | "Photo checklist",
                        );
                      }}
                    >
                      <Text style={styles.facebookQuickCopyBtnText}>
                        Copy {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {item.facebookStatus === "opened" &&
                !hasListedPlatform(item, "facebook") ? (
                  <TouchableOpacity
                    style={styles.markFacebookListedBtn}
                    onPress={() =>
                      {
                        updateInventoryItemFacebookStatus(item.id, {
                          status: "listed",
                        });
                        setEditingFacebookUrlItemId(item.id);
                      }
                    }
                  >
                    <Text style={styles.markFacebookListedBtnText}>
                      Mark Facebook Listed
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {(hasListedPlatform(item, "facebook") ||
                  item.facebookStatus === "opened" ||
                  facebookListingUrl) ? (
                  <View style={styles.facebookUrlActions}>
                    {facebookListingUrl ? (
                      <TouchableOpacity
                        style={styles.viewFacebookBtn}
                        onPress={() => {
                          void Linking.openURL(facebookListingUrl);
                        }}
                      >
                        <Text style={styles.viewFacebookBtnText}>
                          View Facebook Listing
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.facebookUrlBtn}
                      onPress={() =>
                        setEditingFacebookUrlItemId((current) =>
                          current === item.id ? null : item.id,
                        )
                      }
                    >
                      <Text style={styles.facebookUrlBtnText}>
                        {facebookListingUrl
                          ? "Edit Facebook URL"
                          : "Add Facebook URL"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {editingFacebookUrlItemId === item.id ? (
                  <View style={styles.facebookUrlEditorCard}>
                    <Text style={styles.soldEditorLabel}>Facebook Listing URL</Text>
                    <TextInput
                      style={styles.facebookUrlInput}
                      value={getFacebookUrlDraftValue(item)}
                      onChangeText={(value) =>
                        setFacebookUrlDrafts((current) => ({
                          ...current,
                          [item.id]: value,
                        }))
                      }
                      placeholder="https://www.facebook.com/marketplace/item/..."
                      placeholderTextColor="#999"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <View style={styles.facebookUrlEditorActions}>
                      <TouchableOpacity
                        style={styles.secondaryActionBtn}
                        onPress={() => {
                          void pasteFacebookUrl(item);
                        }}
                      >
                        <Text style={styles.secondaryActionBtnText}>Paste</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.saveSoldBtn}
                        onPress={() => saveFacebookUrl(item)}
                      >
                        <Text style={styles.saveSoldBtnText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.clearSoldBtn}
                        onPress={() => clearFacebookUrl(item)}
                      >
                        <Text style={styles.clearSoldBtnText}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
                {item.facebookStatus === "error" && item.facebookLastError ? (
                  <Text style={styles.facebookErrorText}>
                    {item.facebookLastError}
                  </Text>
                ) : null}
                {ebayListingUrl ? (
                  <TouchableOpacity
                    style={styles.viewEbayBtn}
                    onPress={() => {
                      void Linking.openURL(ebayListingUrl);
                    }}
                  >
                    <Text style={styles.viewEbayBtnText}>View on eBay</Text>
                  </TouchableOpacity>
                ) : null}
                {item.ebayStatus === "posting" ? (
                  <Text style={styles.ebayProgressText}>
                    {item.ebayProgress || "Posting to eBay..."}
                  </Text>
                ) : null}
                {item.ebayStatus === "error" && item.ebayLastError ? (
                  <Text style={styles.ebayErrorText}>{item.ebayLastError}</Text>
                ) : null}
              </>
            ) : null}
            {false ? (
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
                  {itemSoldPrice !== null
                    ? "Edit Sold Price"
                    : "Mark Sold"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeItem(item)}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
            ) : null}
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
                      {itemSoldPrice !== null
                        ? "Update"
                        : "Save"}
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
          <Pressable style={styles.itemDetailCard} onPress={() => undefined}>
            <View style={styles.itemDetailHeader}>
              <View style={styles.itemDetailHeading}>
                <Text style={styles.itemDetailTitle}>{selectedItem?.name ?? "Item details"}</Text>
                <Text style={styles.itemDetailSubtitle}>{selectedItem ? getPalletName(selectedItem.palletId) : ""}</Text>
              </View>
              <TouchableOpacity style={styles.itemDetailClose} onPress={() => setSelectedItemId(null)}>
                <Text style={styles.itemDetailCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.itemDetailContent}>
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
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Quantity</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.quantity} onChangeText={(value) => updateItemDetailDraft("quantity", value)} keyboardType="number-pad" /></View>
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Low estimate</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.low} onChangeText={(value) => updateItemDetailDraft("low", value)} keyboardType="decimal-pad" /></View>
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>High estimate</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.high} onChangeText={(value) => updateItemDetailDraft("high", value)} keyboardType="decimal-pad" /></View>
                <View style={styles.itemEditField}><Text style={styles.itemDetailLabel}>Floor price</Text><TextInput style={styles.itemEditInput} value={itemDetailDraft.floor} onChangeText={(value) => updateItemDetailDraft("floor", value)} keyboardType="decimal-pad" /></View>
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
  filterModalBackdrop: {
    flex: 1,
    backgroundColor: AppPalette.modalBackdrop,
    justifyContent: "center",
    padding: 20,
  },
  filterModalCard: {
    backgroundColor: AppPalette.surface,
    borderColor: AppPalette.border,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: "86%",
    padding: 18,
  },
  filterModalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 10,
  },
  filterModalTitle: {
    color: AppPalette.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
  },
  filterModalCloseBtn: {
    backgroundColor: AppPalette.surfaceMuted,
    borderColor: AppPalette.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  filterModalCloseText: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  filterModalSectionLabel: {
    color: AppPalette.textSoft,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 14,
    textTransform: "uppercase",
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
  facebookReadinessGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  facebookReadinessBox: {
    flex: 1,
    minWidth: 128,
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  facebookReadinessValue: {
    color: AppPalette.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 3,
  },
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
  bulkFacebookBtn: {
    backgroundColor: AppPalette.primarySoft,
    borderWidth: 1,
    borderColor: "#cfdeed",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  bulkFacebookBtnText: {
    color: AppPalette.primary,
    fontWeight: "700",
    fontSize: 14,
  },
  bulkFacebookSecondaryBtn: {
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  bulkFacebookSecondaryBtnText: {
    color: AppPalette.text,
    fontWeight: "700",
    fontSize: 13,
  },
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
  workflowStatusBar: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  workflowStatusText: {
    color: AppPalette.text,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  workflowStatus_captured: { backgroundColor: AppPalette.surfaceMuted },
  workflowStatus_needs_photos: { backgroundColor: AppPalette.warningSoft },
  workflowStatus_needs_review: { backgroundColor: AppPalette.dangerSoft },
  workflowStatus_ready_to_list: { backgroundColor: AppPalette.successSoft },
  workflowStatus_listing_in_progress: { backgroundColor: AppPalette.infoSoft },
  workflowStatus_listed: { backgroundColor: AppPalette.primarySoft },
  workflowStatus_sold: { backgroundColor: AppPalette.successSoft },
  postingReadinessBox: {
    marginHorizontal: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#efc0b9",
    backgroundColor: AppPalette.dangerSoft,
    borderRadius: 10,
    padding: 10,
  },
  postingReadinessTitle: {
    color: AppPalette.dangerStrong,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  postingReadinessText: {
    color: AppPalette.dangerStrong,
    fontSize: 12,
    lineHeight: 17,
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
  facebookDraftBanner: {
    backgroundColor: AppPalette.warningSoft,
    borderWidth: 1,
    borderColor: "#f4d7a2",
  },
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
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: {
    fontSize: 16,
    fontWeight: "700",
    color: AppPalette.text,
    lineHeight: 21,
    marginBottom: 4,
  },
  palletTag: { fontSize: 12, color: AppPalette.textMuted, marginBottom: 6 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
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
  listingToolsToggle: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  listingToolsToggleText: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: "700",
  },
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
  facebookQuickCopyRow: {
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  facebookQuickCopyBtn: {
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  facebookQuickCopyBtnText: {
    color: AppPalette.text,
    fontSize: 12,
    fontWeight: "700",
  },
  markFacebookListedBtn: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#c9d9f1",
    backgroundColor: AppPalette.infoSoft,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  markFacebookListedBtnText: {
    color: AppPalette.info,
    fontSize: 13,
    fontWeight: "700",
  },
  facebookUrlActions: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  viewFacebookBtn: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: AppPalette.primary,
    backgroundColor: AppPalette.primarySoft,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  viewFacebookBtnText: {
    color: AppPalette.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  facebookUrlBtn: {
    flex: 1,
    minWidth: 130,
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  facebookUrlBtnText: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  facebookUrlEditorCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppPalette.border,
    padding: 12,
  },
  facebookUrlInput: {
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    color: AppPalette.text,
    backgroundColor: AppPalette.surface,
  },
  facebookUrlEditorActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  viewEbayBtn: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: AppPalette.info,
    backgroundColor: AppPalette.infoSoft,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  viewEbayBtnText: {
    color: AppPalette.info,
    fontSize: 13,
    fontWeight: "700",
  },
  ebayErrorText: {
    marginHorizontal: 12,
    marginBottom: 10,
    color: AppPalette.dangerStrong,
    fontSize: 12,
    lineHeight: 17,
  },
  facebookErrorText: {
    marginHorizontal: 12,
    marginBottom: 10,
    color: AppPalette.dangerStrong,
    fontSize: 12,
    lineHeight: 17,
  },
  ebayProgressText: {
    marginHorizontal: 12,
    marginBottom: 10,
    color: AppPalette.info,
    fontSize: 12,
    fontWeight: "600",
  },
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
  listingPriceBadge: {
    backgroundColor: AppPalette.infoSoft,
    borderRadius: 8,
    color: AppPalette.info,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  itemDetailBackdrop: {
    backgroundColor: AppPalette.modalBackdrop,
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  itemDetailCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 8,
    maxHeight: "90%",
    overflow: "hidden",
  },
  itemDetailHeader: {
    alignItems: "center",
    borderBottomColor: AppPalette.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    padding: 16,
  },
  itemDetailHeading: { flex: 1, paddingRight: 12 },
  itemDetailTitle: { color: AppPalette.text, fontSize: 20, fontWeight: "700" },
  itemDetailSubtitle: { color: AppPalette.textMuted, fontSize: 13, marginTop: 3 },
  itemDetailClose: { borderColor: AppPalette.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  itemDetailCloseText: { color: AppPalette.text, fontSize: 13, fontWeight: "700" },
  itemDetailContent: { gap: 16, padding: 16 },
  itemDetailPhotos: { gap: 10 },
  itemDetailPhoto: { backgroundColor: AppPalette.surfaceMuted, borderRadius: 8, height: 180, resizeMode: "cover", width: 180 },
  itemDetailFacts: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  itemDetailFact: { backgroundColor: AppPalette.surfaceMuted, borderRadius: 8, minWidth: 130, padding: 10 },
  itemDetailLabel: { color: AppPalette.textSoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  itemDetailValue: { color: AppPalette.text, fontSize: 15, fontWeight: "600", marginTop: 4 },
  listingPriceEditor: { borderColor: AppPalette.border, borderRadius: 8, borderWidth: 1, padding: 12 },
  listingPriceHelp: { color: AppPalette.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  listingPriceRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 10 },
  listingPriceCurrency: { color: AppPalette.text, fontSize: 20, fontWeight: "700" },
  listingPriceInput: { borderColor: AppPalette.border, borderRadius: 8, borderWidth: 1, color: AppPalette.text, flex: 1, fontSize: 16, minHeight: 46, paddingHorizontal: 12 },
  saveListingPriceButton: { backgroundColor: AppPalette.primaryStrong, borderRadius: 8, minHeight: 46, justifyContent: "center", paddingHorizontal: 18 },
  saveListingPriceText: { color: AppPalette.primaryOn, fontSize: 14, fontWeight: "700" },
  itemDetailSection: { borderTopColor: AppPalette.border, borderTopWidth: 1, paddingTop: 14 },
  itemDetailBody: { color: AppPalette.text, fontSize: 14, lineHeight: 21, marginTop: 6 },
  itemEditGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  itemEditField: { flexGrow: 1, minWidth: 135 },
  itemEditWide: { width: "100%" },
  itemEditInput: { backgroundColor: AppPalette.surface, borderColor: AppPalette.border, borderRadius: 8, borderWidth: 1, color: AppPalette.text, fontSize: 14, marginTop: 5, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  itemEditTextArea: { minHeight: 120 },
  characterCount: { color: AppPalette.textMuted, fontSize: 11, marginTop: 4, textAlign: "right" },
  itemDetailSectionTitle: { color: AppPalette.text, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  itemSpecificField: { marginTop: 10 },
  itemDetailActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  itemDetailPlatformButton: { alignItems: "center", backgroundColor: AppPalette.primaryStrong, borderRadius: 8, flexGrow: 1, justifyContent: "center", minHeight: 46, minWidth: 140, paddingHorizontal: 14 },
  itemDetailEbayButton: { backgroundColor: AppPalette.info },
  itemDetailPlatformText: { color: AppPalette.primaryOn, fontSize: 13, fontWeight: "700" },
  itemDetailMoreButton: { alignItems: "center", borderColor: AppPalette.border, borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 46, paddingHorizontal: 14 },
  itemDetailMoreText: { color: AppPalette.text, fontSize: 13, fontWeight: "700" },
  itemDetailRemoveButton: { alignItems: "center", backgroundColor: AppPalette.dangerSoft, borderColor: AppPalette.danger, borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 46, paddingHorizontal: 14 },
  itemDetailRemoveText: { color: AppPalette.dangerStrong, fontSize: 13, fontWeight: "700" },
  saveItemChangesButton: { alignItems: "center", backgroundColor: AppPalette.primaryStrong, borderRadius: 8, minHeight: 50, justifyContent: "center", paddingHorizontal: 18 },
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
