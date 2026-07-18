import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { LoadingStatus } from "@/components/loading-status";
import { PhotoReferenceCards } from "@/components/photo-reference-cards";
import { AppPalette } from "@/constants/app-palette";
import {
  ANTHROPIC_MODEL,
  readAnthropicMessageText,
} from "@/lib/anthropic";
import { AppAlert as Alert } from "@/lib/app-alert";
import { incrementScanCount } from "@/lib/app-meta";
import { getAppSettings, subscribeAppSettings } from "@/lib/app-settings";
import {
  lookupBarcodeProduct,
  type BarcodeLookupItem,
} from "@/lib/barcode-lookup";
import {
  triggerAnalysisCompleteFeedback,
  triggerCopyFeedback,
  triggerInventorySaveFeedback,
} from "@/lib/feedback";
import {
  buildInventoryItemDraft,
  duplicateInventoryItemDraft,
  type ImageAssetLike,
} from "@/lib/inventory-item-drafts";
import {
  createBarcodeFallbackDraft,
  createPhotoFallbackDraft,
} from "@/lib/offline-drafts";
import {
  getActivePallet,
  saveInventoryItem,
  subscribeInventory,
  type InventoryItem,
} from "@/lib/inventory-store";
import {
  createEmptyListingDrafts,
  createListingDrafts,
  getListingDraftPlatformLabel,
  type ListingDraftMap,
  type ListingDraftPlatform,
} from "@/lib/listing-drafts";
import { openListingDraft } from "@/lib/listing-posting";
import {
  type CaptureAnalysisResult,
  parseMoneyAmount,
  parsePositiveInteger,
  parsePriceRange as parseCorePriceRange,
  sanitizeBarcodeValue,
} from "@palletscanner/core";

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const LOADING_MESSAGES = [
  "Identifying item...",
  "Checking market prices...",
  "Writing your listing...",
];
const MAX_LISTING_PHOTOS = 5;
const RECOMMENDED_LISTING_PHOTOS = 3;
const BARCODE_TYPES = [
  "upc_a",
  "upc_e",
  "ean13",
  "ean8",
  "code128",
  "code39",
] as const;

const getImageUri = (image: ImageAssetLike) =>
  typeof image.uri === "string" && image.uri.trim().length > 0
    ? image.uri
    : null;

export default function BarcodeScanScreen() {
  const router = useRouter();
  const [images, setImages] = useState<ImageAssetLike[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<CaptureAnalysisResult | null>(null);
  const [activeListingPlatform, setActiveListingPlatform] =
    useState<ListingDraftPlatform>("general");
  const [listingDrafts, setListingDrafts] =
    useState<ListingDraftMap>(createEmptyListingDrafts());
  const [editablePrice, setEditablePrice] = useState("");
  const [editableFloorPrice, setEditableFloorPrice] = useState("");
  const [editableQuantity, setEditableQuantity] = useState("1");
  const [photoTipsExpanded, setPhotoTipsExpanded] = useState(false);
  const [advancedListingExpanded, setAdvancedListingExpanded] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<number | null>(null);
  const [currentItemPalletId, setCurrentItemPalletId] = useState<string | null>(null);
  const [productImageUri, setProductImageUri] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [listingPhotoActionStatus, setListingPhotoActionStatus] = useState("");
  const [manualBarcodeDraft, setManualBarcodeDraft] = useState("");
  const [manualBarcodeVisible, setManualBarcodeVisible] = useState(false);
  const [hasScannedBarcode, setHasScannedBarcode] = useState(false);
  const [scannerTroubleVisible, setScannerTroubleVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const barcodeScanLock = useRef(false);
  const autoOpenedBarcodeMode = useRef(false);
  const activePallet = useSyncExternalStore(
    subscribeInventory,
    getActivePallet,
    getActivePallet,
  );
  const { promptToPostOnSave } = useSyncExternalStore(
    subscribeAppSettings,
    getAppSettings,
    getAppSettings,
  );
  const activePalletName = activePallet?.name ?? "No active pallet";
  const photoExampleQueries = Array.isArray(result?.photo_example_queries)
    ? result.photo_example_queries.filter(
        (query: unknown): query is string =>
          typeof query === "string" && query.trim().length > 0,
      )
    : [];
  const currentListingDraft = listingDrafts[activeListingPlatform];
  const canSubmitManualBarcode =
    sanitizeBarcodeValue(manualBarcodeDraft).length > 0;

  const getSellabilityMeta = (score?: number) => {
    if (typeof score !== "number") {
      return null;
    }

    if (score >= 8) {
      return {
        label: "Strong Sell",
        backgroundColor: AppPalette.successSoft,
        color: AppPalette.success,
      };
    }

    if (score >= 5) {
      return {
        label: "Worth Listing",
        backgroundColor: AppPalette.warningSoft,
        color: AppPalette.warning,
      };
    }

    return {
      label: "Consider Donating",
      backgroundColor: AppPalette.dangerSoft,
      color: AppPalette.dangerStrong,
    };
  };

  const resetBarcodeScanState = () => {
    barcodeScanLock.current = false;
    setHasScannedBarcode(false);
    setScannerOpen(false);
  };

  const removePhoto = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    if (!barcodeValue) {
      setResult(null);
    }
  };

  const clearAll = () => {
    setImages([]);
    setResult(null);
    setListingDrafts(createEmptyListingDrafts());
    setActiveListingPlatform("general");
    setEditablePrice("");
    setEditableFloorPrice("");
    setEditableQuantity("1");
    setPhotoTipsExpanded(false);
    setAdvancedListingExpanded(false);
    setProductImageUri(null);
    setBarcodeValue("");
    setListingPhotoActionStatus("");
    setManualBarcodeDraft("");
    setManualBarcodeVisible(false);
    setScannerTroubleVisible(false);
    resetBarcodeScanState();
    setCurrentItemId(null);
    setCurrentItemPalletId(null);
  };

  const addListingPhoto = async (photoTips?: string) => {
    setListingPhotoActionStatus("Opening camera...");
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera permission required",
        "Allow camera access to take listing photos.",
      );
      setListingPhotoActionStatus("");
      return;
    }

    let photo: ImagePicker.ImagePickerResult;
    try {
      photo = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.7,
      });
    } catch (error) {
      Alert.alert(
        "Camera did not open",
        error instanceof Error
          ? error.message
          : "Expo could not open the camera. Try again or use the photo capture flow.",
      );
      setListingPhotoActionStatus("Camera could not open.");
      return;
    }
    if (!photo.canceled) {
      const nextCount = Math.min(images.length + 1, MAX_LISTING_PHOTOS);
      setImages((current) =>
        [...current, photo.assets[0]].slice(0, MAX_LISTING_PHOTOS),
      );
      setListingPhotoActionStatus(
        nextCount < RECOMMENDED_LISTING_PHOTOS
          ? `Listing photo added. Add ${
              RECOMMENDED_LISTING_PHOTOS - nextCount
            } more angle${RECOMMENDED_LISTING_PHOTOS - nextCount === 1 ? "" : "s"} for a stronger listing.`
          : "Listing photo added.",
      );
    } else {
      setListingPhotoActionStatus("");
    }
  };

  const applyAnalysisResult = (
    parsed: CaptureAnalysisResult,
    options: {
      barcode?: string;
      productImageUri?: string | null;
      clearImages?: boolean;
    } = {},
  ) => {
    if (options.clearImages) {
      setImages([]);
    }
    setBarcodeValue(options.barcode ?? "");
    setProductImageUri(options.productImageUri ?? null);
    setResult(parsed);
    setListingDrafts(createListingDrafts(parsed));
    setActiveListingPlatform("general");
    setAdvancedListingExpanded(false);
    setEditablePrice(`${parsed.low_price}-${parsed.high_price}`);
    setEditableFloorPrice(`${parsed.floor_price ?? parsed.low_price}`);
    setPhotoTipsExpanded(false);
  };

  const updateListingDraft = (
    field: keyof ListingDraftMap["general"],
    value: string,
  ) => {
    setListingDrafts((current) => ({
      ...current,
      [activeListingPlatform]: {
        ...current[activeListingPlatform],
        [field]: value,
      },
    }));
  };

  const analyzeImage = async () => {
    if (images.length === 0) return;
    setLoading(true);
    setCurrentItemId(null);
    if (!API_KEY?.trim()) {
      const fallbackDraft = createPhotoFallbackDraft();
      applyAnalysisResult(fallbackDraft);
      setLoading(false);
      Alert.alert(
        "Online analysis not configured",
        "A basic editable draft was created so you can still save this item.",
      );
      return;
    }

    try {
      const imagesWithBase64 = images.filter(
        (img) => typeof img.base64 === "string" && img.base64.trim().length > 0,
      );
      if (imagesWithBase64.length === 0) {
        throw new Error(
          "The selected photo did not include image data for analysis. Take the photo again or upload it from the library.",
        );
      }

      const existingDraftContext = result
        ? `Current barcode draft:
Barcode: ${barcodeValue || "none"}
Name: ${result.name}
Description: ${result.description}
Condition: ${result.condition}
Price range: ${result.low_price}-${result.high_price}
Platform: ${result.best_platform}`
        : "No barcode draft exists yet. Use the photos as the primary source.";

      const imageContent = imagesWithBase64.map((img) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: img.base64,
        },
      }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        } as HeadersInit,
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                ...imageContent,
                {
                  type: "text",
                  text: `You are a resale expert. I am showing you ${images.length} photo(s) of the same item.

${existingDraftContext}

If a barcode draft exists, use it as product identity context and use the photos to improve condition, completeness, accessories, damage notes, pricing confidence, sellability, and listing copy. Do not replace a specific product name with a vague one unless the photos clearly contradict the barcode draft. If no barcode draft exists, analyze the photos like a reseller preparing to list the item online. For pricing, estimate a realistic low_price and high_price by checking the item against current eBay and Facebook Marketplace listings for identical or very similar items whenever that market context is available to you. Favor recent sold or active comparable listings, adjust for condition, brand, completeness, and visible wear, and make sure the suggested price range follows the real market rather than a generic guess. Also provide a floor_price, meaning the lowest reasonable price a seller should accept before walking away during negotiation. Include practical photo tips, 2-3 short web image search queries that would help the user find example listing photos, and a sellability score based on condition, estimated demand, and effort versus return. Also write platform-specific listing copy for Facebook Marketplace and eBay. eBay titles should be keyword-heavy and concise; Facebook copy should sound a little more casual and local-buyer friendly. Then respond ONLY with raw JSON, no markdown:
{
  "name": "item name",
  "description": "1-2 sentence description",
  "condition": "New / Like New / Good / Fair",
  "low_price": 10,
  "high_price": 30,
  "floor_price": 12,
  "best_platform": "eBay",
  "platform_reason": "one sentence why",
  "listing_title": "SEO title under 80 chars",
  "listing_description": "3-4 sentence listing description",
  "listing_title_ebay": "SEO title under 80 chars for eBay",
  "listing_description_ebay": "3-4 sentence eBay description",
  "listing_title_facebook": "Facebook Marketplace title",
  "listing_description_facebook": "3-4 sentence Facebook description",
  "photo_tips": "short practical photo advice",
  "photo_example_queries": ["query one", "query two"],
  "sellability_score": 7,
  "sellability_reason": "one sentence why"
}`,
                },
              ],
            },
          ],
        }),
      });
      const text = await readAnthropicMessageText(response);
      const parsed = JSON.parse(
        text.replace(/```json|```/g, "").trim(),
      ) as CaptureAnalysisResult;
      applyAnalysisResult(parsed, {
        barcode: barcodeValue,
        productImageUri,
      });
      incrementScanCount();
      void triggerAnalysisCompleteFeedback();
    } catch (error) {
      if (!result) {
        const fallbackDraft = createPhotoFallbackDraft();
        applyAnalysisResult(fallbackDraft, {
          barcode: barcodeValue,
          productImageUri,
        });
      }
      Alert.alert(
        "Photo draft update unavailable",
        error instanceof Error
          ? `${error.message}\n\nThe current draft is still editable, but the photos did not update it.`
          : "The current draft is still editable, but the photos did not update it.",
      );
    }
    setLoading(false);
  };

  const copyListing = async () => {
    const text =
      currentListingDraft.title + "\n\n" + currentListingDraft.description;
    await Clipboard.setStringAsync(text);
    void triggerCopyFeedback();
  };

  const parsePriceRange = () => parseCorePriceRange(editablePrice);
  const parseFloorPrice = () => parseMoneyAmount(editableFloorPrice);
  const parseQuantity = () => parsePositiveInteger(editableQuantity);

  const promptForListingDestination = (item: InventoryItem) => {
    Alert.alert("Post this listing now?", "Choose where you want to post it.", [
      {
        text: "Facebook",
        onPress: () => {
          void openListingDraft(item, "facebook");
        },
      },
      {
        text: "eBay",
        onPress: () => {
          void openListingDraft(item, "ebay");
        },
      },
      { text: "Not now", style: "cancel" },
    ]);
  };

  const promptForBarcodeFallback = (
    fallbackDraft: CaptureAnalysisResult,
    options: {
      barcode: string;
      productImageUri?: string | null;
      message: string;
    },
  ) => {
    const applyFallbackDraft = () => {
      applyAnalysisResult(fallbackDraft, {
        barcode: options.barcode,
        productImageUri: options.productImageUri ?? null,
        clearImages: true,
      });
      incrementScanCount();
    };

    Alert.alert(
      "Barcode needs review",
      options.message,
      [
        {
          text: "Scan Again",
          onPress: () => {
            clearAll();
            void openBarcodeScanner();
          },
        },
        {
          text: "Take Photos",
          onPress: () => {
            openCapturePhotoFlow();
          },
        },
        {
          text: "Use Basic Draft",
          onPress: applyFallbackDraft,
        },
      ],
    );
  };

  const promptForScannerTrouble = () => {
    resetBarcodeScanState();
    setListingPhotoActionStatus("");
    setScannerTroubleVisible(true);
  };

  const openCapturePhotoFlow = () => {
    resetBarcodeScanState();
    setScannerTroubleVisible(false);
    setManualBarcodeVisible(false);
    router.replace("/capture");
  };

  const analyzeBarcode = async (barcode: string) => {
    const normalizedBarcode = sanitizeBarcodeValue(barcode);
    if (!normalizedBarcode) {
      Alert.alert("Invalid barcode", "Try scanning the barcode again.");
      return;
    }

    setLoading(true);
    setCurrentItemId(null);

    let product: BarcodeLookupItem | null = null;

    try {
      product = await lookupBarcodeProduct(normalizedBarcode);
    } catch {
      product = null;
    }

    const productSummary = [
      `Barcode: ${normalizedBarcode}`,
      product?.title ? `Title: ${product.title}` : null,
      product?.brand ? `Brand: ${product.brand}` : null,
      product?.category ? `Category: ${product.category}` : null,
      product?.description ? `Description: ${product.description}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (!API_KEY?.trim()) {
      const fallbackDraft = createBarcodeFallbackDraft(
        normalizedBarcode,
        product,
      );
      setLoading(false);
      promptForBarcodeFallback(fallbackDraft, {
        barcode: normalizedBarcode,
        productImageUri: product?.images?.[0] ?? null,
        message:
          "Claude drafting is not configured, so this scan is only a basic barcode lookup. Scan again, add photos for analysis, or choose to use the basic draft.",
      });
      return;
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        } as HeadersInit,
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are a resale expert. Use this barcode lookup result to identify the product instead of analyzing photos. Create a resale-ready summary and pricing estimate. For pricing, estimate a realistic low_price and high_price by checking the item against current eBay and Facebook Marketplace listings for identical or very similar items whenever that market context is available to you. Favor recent sold or active comparable listings, adjust for condition, brand, completeness, and visible wear, and make sure the suggested price range follows the real market rather than a generic guess. Also provide a floor_price, meaning the lowest reasonable price a seller should accept before walking away during negotiation. Assume a typical secondhand condition unless the barcode data clearly suggests new sealed merchandise. Include practical photo tips, 2-3 short web image search queries that would help the user find example listing photos, and a sellability score based on condition, demand, and effort versus return. Also write platform-specific listing copy for Facebook Marketplace and eBay. eBay titles should be keyword-heavy and concise; Facebook copy should sound a little more casual and local-buyer friendly. Respond ONLY with raw JSON, no markdown:
${productSummary}

{
  "name": "item name",
  "description": "1-2 sentence description",
  "condition": "New / Like New / Good / Fair",
  "low_price": 10,
  "high_price": 30,
  "floor_price": 12,
  "best_platform": "eBay",
  "platform_reason": "one sentence why",
  "listing_title": "SEO title under 80 chars",
  "listing_description": "3-4 sentence listing description",
  "listing_title_ebay": "SEO title under 80 chars for eBay",
  "listing_description_ebay": "3-4 sentence eBay description",
  "listing_title_facebook": "Facebook Marketplace title",
  "listing_description_facebook": "3-4 sentence Facebook description",
  "photo_tips": "short practical photo advice",
  "photo_example_queries": ["query one", "query two"],
  "sellability_score": 7,
  "sellability_reason": "one sentence why"
}`,
                },
              ],
            },
          ],
        }),
      });
      const text = await readAnthropicMessageText(response);
      const parsed = JSON.parse(
        text.replace(/```json|```/g, "").trim(),
      ) as CaptureAnalysisResult;
      applyAnalysisResult(parsed, {
        barcode: normalizedBarcode,
        productImageUri: product?.images?.[0] ?? null,
        clearImages: true,
      });
      incrementScanCount();
      void triggerAnalysisCompleteFeedback();
    } catch (error) {
      const fallbackDraft = createBarcodeFallbackDraft(
        normalizedBarcode,
        product,
      );
      promptForBarcodeFallback(fallbackDraft, {
        barcode: normalizedBarcode,
        productImageUri: product?.images?.[0] ?? null,
        message: product
          ? `Claude could not turn this barcode lookup into a full resale draft.${
              error instanceof Error ? `\n\n${error.message}` : ""
            }\n\nScan again, add photos for analysis, or choose to use the basic barcode draft.`
          : `The barcode lookup did not return enough product detail.${
              error instanceof Error ? `\n\n${error.message}` : ""
            }\n\nScan again, add photos for analysis, or choose to use the basic barcode draft.`,
      });
    }

    setLoading(false);
  };

  const openBarcodeScanner = async () => {
    if (!activePallet) {
      Alert.alert(
        "Choose a pallet first",
        "Pick or create a pallet before scanning barcodes.",
      );
      return;
    }

    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();

    if (!permission?.granted) {
      Alert.alert(
        "Camera permission required",
        "Allow camera access to scan barcodes.",
      );
      return;
    }

    try {
      setScannerTroubleVisible(false);
      resetBarcodeScanState();
      setManualBarcodeVisible(false);
      setListingPhotoActionStatus("Scanner open. Hold the barcode steady inside the frame.");
      setScannerOpen(true);
    } catch (error) {
      Alert.alert(
        "Scanner did not open",
        error instanceof Error
          ? error.message
          : "Expo could not open the barcode scanner. Type the barcode instead.",
      );
      setManualBarcodeVisible(true);
    }
  };

  const submitManualBarcode = () => {
    const normalizedBarcode = sanitizeBarcodeValue(manualBarcodeDraft);
    if (!normalizedBarcode) {
      Alert.alert("Enter a barcode", "Type the UPC or product code first.");
      return;
    }

    resetBarcodeScanState();
    setManualBarcodeVisible(false);
    setScannerTroubleVisible(false);
    void analyzeBarcode(normalizedBarcode);
  };

  useEffect(() => {
    if (autoOpenedBarcodeMode.current || !activePallet) {
      return;
    }

    autoOpenedBarcodeMode.current = true;
    void (async () => {
      const permission = cameraPermission?.granted
        ? cameraPermission
        : await requestCameraPermission();

      if (!permission?.granted) {
        Alert.alert(
          "Camera permission required",
          "Allow camera access to scan barcodes.",
        );
        return;
      }

      resetBarcodeScanState();
      setScannerOpen(true);
    })();
  }, [activePallet, cameraPermission, requestCameraPermission]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (barcodeScanLock.current || hasScannedBarcode) {
      return;
    }

    barcodeScanLock.current = true;
    setHasScannedBarcode(true);
    setScannerOpen(false);
    setScannerTroubleVisible(false);
    setListingPhotoActionStatus("Barcode captured. Building draft...");
    void analyzeBarcode(data);
  };

  const saveToInventory = async (afterSave: "stay" | "next" = "stay") => {
    if (isSaving) {
      return;
    }

    if (!result) {
      Alert.alert("Nothing to save", "Analyze an item before saving it.");
      return;
    }

    if (!currentItemPalletId && !activePallet) {
      Alert.alert(
        "Create a pallet first",
        "Choose or create a pallet before saving inventory.",
      );
      return;
    }

    const parsedPriceRange = parsePriceRange();
    if (!parsedPriceRange) {
      Alert.alert(
        "Invalid price range",
        'Enter a range like "10-30" before saving.',
      );
      return;
    }

    const parsedFloorPrice = parseFloorPrice();
    if (parsedFloorPrice === null) {
      Alert.alert(
        "Invalid floor price",
        "Enter your walk-away price before saving.",
      );
      return;
    }

    const parsedQuantity = parseQuantity();
    if (parsedQuantity === null) {
      Alert.alert("Invalid quantity", "Enter a quantity of at least 1.");
      return;
    }

    const palletId = currentItemPalletId ?? activePallet?.id;
    if (!palletId) {
      return;
    }

    setIsSaving(true);
    const baseInventoryItem = buildInventoryItemDraft({
      currentItemId,
      palletId,
      analysis: result,
      listingDrafts,
      images,
      productImageUri,
      priceRange: parsedPriceRange,
      floorPrice: parsedFloorPrice,
    });

    try {
      if (currentItemId !== null) {
        await saveInventoryItem(baseInventoryItem);
        void triggerInventorySaveFeedback();
        if (afterSave === "next") {
          clearAll();
          void openBarcodeScanner();
        }
      } else {
        const itemsToSave = duplicateInventoryItemDraft(
          baseInventoryItem,
          parsedQuantity,
        );
        await Promise.all(itemsToSave.map((item) => saveInventoryItem(item)));
        void triggerInventorySaveFeedback();
        if (promptToPostOnSave) {
          promptForListingDestination(itemsToSave[0]);
        }
        if (afterSave === "next") {
          clearAll();
          void openBarcodeScanner();
          return;
        }
        setCurrentItemId(baseInventoryItem.id);
        setCurrentItemPalletId(palletId);
      }
    } catch (error) {
      Alert.alert(
        "Save failed",
        error instanceof Error
          ? error.message
          : "The item could not be saved. Try again before moving to the next item.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const getSaveAndNextLabel = () => {
    if (isSaving) {
      return "Saving...";
    }
    if (currentItemId !== null) {
      return "Update & Next Item";
    }
    const quantity = parseQuantity();
    return quantity && quantity > 1
      ? `Save ${quantity} Copies & Next`
      : "Save & Next Item";
  };

  const getSaveAndStayLabel = () => {
    if (isSaving) {
      return "Saving...";
    }
    return currentItemId !== null ? "Update and Stay" : "Save and Stay";
  };

  const addAnother = () => {
    setCurrentItemId(null);
    setCurrentItemPalletId(null);
  };

  const goToNextItem = () => {
    clearAll();
  };

  const getPhotoAnalysisLabel = () => {
    if (result) {
      return "Update Draft From Photos";
    }
    return "Analyze Photos";
  };

  const closeScannerFlow = () => {
    resetBarcodeScanState();
    setScannerTroubleVisible(false);
    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={24}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.captureHeader}>
          <View style={styles.captureHeaderCopy}>
            <Text style={styles.title}>Capture Item</Text>
            <Text style={styles.subtitle}>
              Scan a barcode and build a draft from product data.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeCaptureBtn, (loading || isSaving) && styles.disabledAction]}
            disabled={loading || isSaving}
            onPress={closeScannerFlow}
          >
            <Text style={styles.closeCaptureBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.palletCard}>
          <View style={styles.palletHeader}>
            <View>
              <Text style={styles.palletLabel}>ACTIVE PALLET</Text>
              <Text style={styles.palletName}>{activePalletName}</Text>
              <Text style={styles.palletMeta}>
                {activePallet
                  ? "Scans and saved drafts will go into this pallet."
                  : "Choose a pallet on Scan or in the Pallets tab before scanning."}
              </Text>
            </View>
          </View>
        </View>

        {!scannerOpen ? (
          <TouchableOpacity
            style={[styles.barcodeBtn, (loading || isSaving) && styles.disabledAction]}
            disabled={loading || isSaving}
            onPress={openBarcodeScanner}
          >
            <Text style={styles.barcodeBtnText}>Open Scanner</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.manualBarcodeToggle,
            (loading || isSaving) && styles.disabledAction,
          ]}
          disabled={loading || isSaving}
          onPress={() => setManualBarcodeVisible((current) => !current)}
        >
          <Text style={styles.manualBarcodeToggleText}>
            {manualBarcodeVisible ? "Hide Manual Entry" : "Type Barcode Instead"}
          </Text>
        </TouchableOpacity>

        {manualBarcodeVisible ? (
          <View style={styles.manualBarcodeCard}>
            <Text style={styles.manualBarcodeTitle}>Manual barcode entry</Text>
            <Text style={styles.manualBarcodeCopy}>
              Type the UPC or product code when the camera cannot read the label.
            </Text>
            <TextInput
              style={styles.manualBarcodeInput}
              value={manualBarcodeDraft}
              onChangeText={setManualBarcodeDraft}
              placeholder="e.g. 012345678905"
              placeholderTextColor={AppPalette.textSoft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
            />
            <TouchableOpacity
              style={[
                styles.manualBarcodeSubmit,
                (!canSubmitManualBarcode || loading || isSaving) &&
                  styles.disabledAction,
              ]}
              disabled={!canSubmitManualBarcode || loading || isSaving}
              onPress={submitManualBarcode}
            >
              <Text style={styles.manualBarcodeSubmitText}>Build Draft</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {scannerOpen && (
          <View style={styles.scannerCard}>
            <CameraView
              style={styles.scannerView}
              active={scannerOpen}
              autofocus="on"
              facing="back"
              onBarcodeScanned={
                hasScannedBarcode ? undefined : handleBarcodeScanned
              }
              onCameraReady={() => {
                setListingPhotoActionStatus(
                  "Scanner ready. Hold the barcode steady inside the frame.",
                );
              }}
              onMountError={(event) => {
                setScannerOpen(false);
                setListingPhotoActionStatus("Scanner could not start.");
                Alert.alert(
                  "Scanner could not start",
                  event.message || "Close and reopen the scanner, then try again.",
                );
              }}
              barcodeScannerSettings={{
                barcodeTypes: [...BARCODE_TYPES],
              }}
            />
            <View style={styles.scannerOverlay}>
              <Text style={styles.scannerTitle}>
                Center the barcode in the frame
              </Text>
              <Text style={styles.scannerSubtitle}>
                We&apos;ll look up the product before falling back to the photo
                workflow.
              </Text>
              <TouchableOpacity
                style={styles.closeScannerBtn}
                onPress={promptForScannerTrouble}
              >
                <Text style={styles.closeScannerBtnText}>Cancel Scanner</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {barcodeValue ? (
          <Text style={styles.barcodeStatus}>Barcode: {barcodeValue}</Text>
        ) : null}

        <Modal
          visible={scannerTroubleVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setScannerTroubleVisible(false)}
        >
          <View style={styles.scannerTroubleBackdrop}>
            <View style={styles.scannerTroubleDialog}>
              <Text style={styles.scannerTroubleTitle}>
                Scanner had a hard time
              </Text>
              <Text style={styles.scannerTroubleCopy}>
                The barcode was not captured. Try scanning again, or switch to
                photos so Claude can identify the item from the product and
                label.
              </Text>
              <TouchableOpacity
                style={styles.scannerTroublePrimary}
                onPress={() => {
                  setScannerTroubleVisible(false);
                  void openBarcodeScanner();
                }}
              >
                <Text style={styles.scannerTroublePrimaryText}>Scan Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.scannerTroubleSecondary}
                onPress={openCapturePhotoFlow}
              >
                <Text style={styles.scannerTroubleSecondaryText}>Use Photos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.scannerTroubleCancel}
                onPress={() => setScannerTroubleVisible(false)}
              >
                <Text style={styles.scannerTroubleCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {result && images.length < MAX_LISTING_PHOTOS ? (
          <View style={styles.nextStepCard}>
            <Text style={styles.nextStepTitle}>Add listing photos</Text>
            <Text style={styles.nextStepCopy}>
              {result.photo_tips?.trim() ||
                "Take 2-5 photos: front, back, label or model number, accessories, and any visible wear."}
            </Text>
            <TouchableOpacity
              style={[
                styles.barcodeBtn,
                (loading || isSaving) && styles.disabledAction,
              ]}
              disabled={loading || isSaving}
              onPress={() => {
                void addListingPhoto(result.photo_tips);
              }}
            >
              <Text style={styles.barcodeBtnText}>
                {images.length === 0 ? "Take Listing Photos" : "Add Listing Photo"}
              </Text>
            </TouchableOpacity>
            {listingPhotoActionStatus ? (
              <Text style={styles.actionStatus}>{listingPhotoActionStatus}</Text>
            ) : null}
          </View>
        ) : null}

        {images.length > 0 && (
          <View style={styles.photoStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {images.map((img, index) => {
                const imageUri = getImageUri(img);
                return (
                  <View key={index} style={styles.thumbContainer}>
                    {imageUri ? (
                      <Image source={{ uri: imageUri }} style={styles.thumb} />
                    ) : null}
                    <TouchableOpacity
                      style={styles.removeBtn}
                      disabled={loading || isSaving}
                      onPress={() => removePhoto(index)}
                    >
                      <Text style={styles.removeBtnText}>x</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
            <Text style={styles.photoCount}>
              {images.length} of {MAX_LISTING_PHOTOS} photos added
            </Text>
          </View>
        )}

        {images.length > 0 && !loading && !isSaving && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.analyzeBtn} onPress={analyzeImage}>
              <Text style={styles.analyzeBtnText}>{getPhotoAnalysisLabel()}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && <LoadingStatus messages={LOADING_MESSAGES} />}

        {result && (
          <View style={styles.resultCard}>
            <Text style={styles.sectionLabel}>READY TO SAVE</Text>
            <Text style={styles.itemName}>{result.name}</Text>
            <Text style={styles.itemDesc}>{result.description}</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.priceBadge}>
                ${result.low_price}-${result.high_price}
              </Text>
              <Text style={styles.floorBadge}>
                Floor $
                {editableFloorPrice || result.floor_price || result.low_price}
              </Text>
              <Text style={styles.conditionBadge}>{result.condition}</Text>
              <Text style={styles.platformBadge}>{result.best_platform}</Text>
            </View>
            {getSellabilityMeta(result.sellability_score) ? (
              <View
                style={[
                  styles.sellabilityCard,
                  {
                    backgroundColor:
                      getSellabilityMeta(result.sellability_score)?.backgroundColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sellabilityTitle,
                    { color: getSellabilityMeta(result.sellability_score)?.color },
                  ]}
                >
                  {getSellabilityMeta(result.sellability_score)?.label} ({result.sellability_score}/10)
                </Text>
                <Text style={styles.sellabilityReason}>
                  {result.sellability_reason}
                </Text>
              </View>
            ) : null}
            <Text style={styles.platformReason}>{result.platform_reason}</Text>

            <View style={styles.listingBox}>
              <View style={styles.quickEditGrid}>
                <View style={styles.quickEditField}>
                  <Text style={styles.listingLabel}>PRICE RANGE</Text>
                  <TextInput
                    style={styles.editableInput}
                    value={editablePrice}
                    onChangeText={setEditablePrice}
                    placeholder="e.g. 10-30"
                  />
                </View>

                <View style={styles.quickEditField}>
                  <Text style={styles.listingLabel}>FLOOR</Text>
                  <TextInput
                    style={styles.editableInput}
                    value={editableFloorPrice}
                    onChangeText={setEditableFloorPrice}
                    placeholder="lowest"
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.quickEditQtyField}>
                  <Text style={styles.listingLabel}>QTY</Text>
                  <TextInput
                    style={styles.editableInput}
                    value={editableQuantity}
                    onChangeText={setEditableQuantity}
                    placeholder="1"
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, isSaving && styles.disabledAction]}
                disabled={isSaving}
                onPress={() => {
                  void saveToInventory("next");
                }}
              >
                <Text style={styles.saveBtnText}>{getSaveAndNextLabel()}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.stayBtn, isSaving && styles.disabledAction]}
                disabled={isSaving}
                onPress={() => {
                  void saveToInventory("stay");
                }}
              >
                <Text style={styles.stayBtnText}>{getSaveAndStayLabel()}</Text>
              </TouchableOpacity>

              {currentItemId !== null && (
                <>
                  <TouchableOpacity
                    style={styles.addAnotherBtn}
                    onPress={addAnother}
                  >
                    <Text style={styles.addAnotherBtnText}>
                      + Add Another Copy
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.nextItemBtn}
                    onPress={goToNextItem}
                  >
                    <Text style={styles.nextItemBtnText}>Next Item</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.finishedBtn}
                    onPress={closeScannerFlow}
                  >
                    <Text style={styles.finishedBtnText}>Finished</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={styles.advancedToggle}
                onPress={() => setAdvancedListingExpanded((current) => !current)}
              >
                <Text style={styles.advancedToggleText}>
                  {advancedListingExpanded ? "Hide listing draft" : "Edit listing draft"}
                </Text>
              </TouchableOpacity>

              {advancedListingExpanded ? (
                <View style={styles.advancedListingBox}>
                  <View style={styles.listingPlatformTabs}>
                    {(["general", "facebook", "ebay"] as const).map((platform) => (
                      <TouchableOpacity
                        key={platform}
                        style={[
                          styles.listingPlatformTab,
                          activeListingPlatform === platform &&
                            styles.listingPlatformTabActive,
                        ]}
                        onPress={() => setActiveListingPlatform(platform)}
                      >
                        <Text
                          style={[
                            styles.listingPlatformTabText,
                            activeListingPlatform === platform &&
                              styles.listingPlatformTabTextActive,
                          ]}
                        >
                          {getListingDraftPlatformLabel(platform)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.listingLabel}>LISTING TITLE</Text>
                  <TextInput
                    style={styles.editableInput}
                    value={currentListingDraft.title}
                    onChangeText={(value) => updateListingDraft("title", value)}
                    multiline
                    placeholder="Listing title"
                  />

                  <Text style={styles.listingLabel}>DESCRIPTION</Text>
                  <TextInput
                    style={[styles.editableInput, styles.editableInputTall]}
                    value={currentListingDraft.description}
                    onChangeText={(value) =>
                      updateListingDraft("description", value)
                    }
                    multiline
                    placeholder="Listing description"
                  />

                  <TouchableOpacity style={styles.copyBtn} onPress={copyListing}>
                    <Text style={styles.copyBtnText}>
                      Copy {getListingDraftPlatformLabel(activeListingPlatform)} Listing
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {result.photo_tips ? (
              <View style={styles.photoTipsCard}>
                <TouchableOpacity
                  style={styles.photoTipsToggle}
                  onPress={() => setPhotoTipsExpanded((current) => !current)}
                >
                  <Text style={styles.photoTipsTitle}>Photo Tips</Text>
                  <Text style={styles.photoTipsToggleText}>
                    {photoTipsExpanded ? "Hide" : "Show"}
                  </Text>
                </TouchableOpacity>
                {photoTipsExpanded ? (
                  <>
                    <Text style={styles.photoTipsBody}>{result.photo_tips}</Text>
                    <PhotoReferenceCards queries={photoExampleQueries} />
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 20, paddingTop: 56, paddingBottom: 28 },
  captureHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },
  captureHeaderCopy: { flex: 1 },
  title: { fontSize: 30, fontWeight: "700", color: AppPalette.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: AppPalette.textMuted, marginBottom: 20, lineHeight: 20 },
  closeCaptureBtn: {
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  closeCaptureBtnText: { color: AppPalette.text, fontWeight: "600", fontSize: 13 },
  palletCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  palletHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  palletLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: AppPalette.textSoft,
    marginBottom: 4,
  },
  palletName: { fontSize: 20, fontWeight: "700", color: AppPalette.text },
  palletMeta: { fontSize: 13, color: AppPalette.textMuted, marginTop: 4 },
  buttonRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  btn: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  btnText: { color: "#111827", fontWeight: "600", fontSize: 15 },
  barcodeBtn: {
    backgroundColor: AppPalette.primaryStrong,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  barcodeBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  manualBarcodeToggle: {
    alignItems: "center",
    borderColor: AppPalette.border,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    padding: 12,
  },
  manualBarcodeToggleText: {
    color: AppPalette.primaryStrong,
    fontSize: 14,
    fontWeight: "700",
  },
  manualBarcodeCard: {
    backgroundColor: AppPalette.surface,
    borderColor: AppPalette.border,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  manualBarcodeTitle: {
    color: AppPalette.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  manualBarcodeCopy: {
    color: AppPalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  manualBarcodeInput: {
    backgroundColor: AppPalette.surface,
    borderColor: AppPalette.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: AppPalette.text,
    fontSize: 15,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  manualBarcodeSubmit: {
    alignItems: "center",
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 10,
    padding: 12,
  },
  manualBarcodeSubmitText: {
    color: AppPalette.primaryOn,
    fontSize: 14,
    fontWeight: "700",
  },
  scannerCard: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: AppPalette.primaryStrong,
    marginBottom: 16,
  },
  scannerView: { height: 280, width: "100%" },
  scannerOverlay: {
    padding: 16,
    backgroundColor: "#111",
  },
  scannerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  scannerSubtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  closeScannerBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeScannerBtnText: { color: AppPalette.text, fontWeight: "600", fontSize: 13 },
  scannerTroubleBackdrop: {
    flex: 1,
    backgroundColor: AppPalette.modalBackdrop,
    justifyContent: "center",
    padding: 20,
  },
  scannerTroubleDialog: {
    backgroundColor: AppPalette.surface,
    borderColor: AppPalette.border,
    borderRadius: 10,
    borderWidth: 1,
    padding: 18,
  },
  scannerTroubleTitle: {
    color: AppPalette.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  scannerTroubleCopy: {
    color: AppPalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  scannerTroublePrimary: {
    alignItems: "center",
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 10,
    marginBottom: 8,
    paddingVertical: 12,
  },
  scannerTroublePrimaryText: {
    color: AppPalette.primaryOn,
    fontSize: 14,
    fontWeight: "700",
  },
  scannerTroubleSecondary: {
    alignItems: "center",
    backgroundColor: AppPalette.surfaceMuted,
    borderColor: AppPalette.border,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    paddingVertical: 12,
  },
  scannerTroubleSecondaryText: {
    color: AppPalette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  scannerTroubleCancel: {
    alignItems: "center",
    paddingVertical: 10,
  },
  scannerTroubleCancelText: {
    color: AppPalette.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  barcodeStatus: {
    fontSize: 13,
    color: AppPalette.info,
    marginBottom: 12,
    fontWeight: "500",
  },
  nextStepCard: {
    backgroundColor: AppPalette.surface,
    borderColor: AppPalette.border,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  nextStepTitle: {
    color: AppPalette.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  nextStepCopy: {
    color: AppPalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  actionStatus: {
    color: AppPalette.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  photoStrip: { marginBottom: 16 },
  thumbContainer: { position: "relative", marginRight: 8 },
  thumb: { width: 90, height: 90, borderRadius: 8, backgroundColor: "#f0f0f0" },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  photoCount: { fontSize: 13, color: AppPalette.textMuted, marginTop: 8 },
  actionRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  analyzeBtn: {
    flex: 1,
    backgroundColor: AppPalette.primaryStrong,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  analyzeBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  clearBtn: {
    backgroundColor: AppPalette.surfaceMuted,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  clearBtnText: { color: AppPalette.textMuted, fontWeight: "600", fontSize: 15 },
  resultCard: {
    backgroundColor: AppPalette.surface,
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: AppPalette.textSoft, marginBottom: 8 },
  itemName: { fontSize: 22, fontWeight: "700", color: AppPalette.text, marginBottom: 4 },
  itemDesc: { fontSize: 14, color: AppPalette.textMuted, marginBottom: 12, lineHeight: 20 },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  priceBadge: {
    backgroundColor: AppPalette.successSoft,
    color: AppPalette.success,
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  floorBadge: {
    backgroundColor: AppPalette.surfaceTint,
    color: AppPalette.primary,
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  conditionBadge: {
    backgroundColor: AppPalette.warningSoft,
    color: AppPalette.warning,
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  platformBadge: {
    backgroundColor: AppPalette.infoSoft,
    color: AppPalette.info,
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  platformReason: { fontSize: 13, color: AppPalette.textMuted, marginBottom: 16, lineHeight: 18 },
  sellabilityCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  sellabilityTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  sellabilityReason: {
    fontSize: 13,
    color: AppPalette.textMuted,
    lineHeight: 18,
  },
  listingBox: {
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  quickEditGrid: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  quickEditField: { flex: 1 },
  quickEditQtyField: { width: 72 },
  advancedToggle: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  advancedToggleText: {
    color: AppPalette.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  advancedListingBox: {
    borderTopWidth: 1,
    borderTopColor: AppPalette.border,
    paddingTop: 12,
    marginTop: 4,
  },
  listingPlatformTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  listingPlatformTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    alignItems: "center",
  },
  listingPlatformTabActive: {
    backgroundColor: AppPalette.primaryStrong,
    borderColor: AppPalette.primaryStrong,
  },
  listingPlatformTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: AppPalette.textMuted,
  },
  listingPlatformTabTextActive: {
    color: AppPalette.primaryOn,
  },
  listingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: AppPalette.textSoft,
    marginBottom: 4,
    marginTop: 8,
  },
  editableInput: {
    fontSize: 14,
    color: AppPalette.text,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 6,
    padding: 10,
    backgroundColor: AppPalette.surface,
    marginBottom: 6,
  },
  editableInputTall: { minHeight: 100, textAlignVertical: "top" },
  copyBtn: {
    backgroundColor: AppPalette.surfaceTint,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  copyBtnText: { color: AppPalette.primary, fontWeight: "600", fontSize: 14 },
  saveBtn: {
    backgroundColor: AppPalette.primaryStrong,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  stayBtn: {
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surface,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  stayBtnText: { color: AppPalette.text, fontWeight: "600", fontSize: 14 },
  disabledAction: { opacity: 0.62 },
  addAnotherBtn: {
    borderWidth: 1,
    borderColor: AppPalette.border,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  addAnotherBtnText: { color: AppPalette.text, fontWeight: "600", fontSize: 14 },
  nextItemBtn: {
    backgroundColor: AppPalette.infoSoft,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  nextItemBtnText: { color: AppPalette.info, fontWeight: "600", fontSize: 14 },
  finishedBtn: {
    backgroundColor: AppPalette.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  finishedBtnText: { color: AppPalette.primaryOn, fontWeight: "600", fontSize: 14 },
  photoTipsCard: {
    marginTop: 14,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppPalette.border,
    padding: 12,
  },
  photoTipsToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  photoTipsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: AppPalette.text,
  },
  photoTipsToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: AppPalette.primary,
  },
  photoTipsBody: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: AppPalette.textMuted,
  },
});
