import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState, useSyncExternalStore } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { incrementScanCount } from "@/lib/app-meta";
import { getAppSettings, subscribeAppSettings } from "@/lib/app-settings";
import { lookupBarcodeProduct } from "@/lib/barcode-lookup";
import {
  triggerAnalysisCompleteFeedback,
  triggerCopyFeedback,
  triggerInventorySaveFeedback,
} from "@/lib/feedback";
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

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const LOADING_MESSAGES = [
  "Identifying item...",
  "Checking market prices...",
  "Writing your listing...",
];

export default function HomeScreen() {
  const router = useRouter();
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [activeListingPlatform, setActiveListingPlatform] =
    useState<ListingDraftPlatform>("general");
  const [listingDrafts, setListingDrafts] =
    useState<ListingDraftMap>(createEmptyListingDrafts());
  const [editablePrice, setEditablePrice] = useState("");
  const [editableFloorPrice, setEditableFloorPrice] = useState("");
  const [editableQuantity, setEditableQuantity] = useState("1");
  const [photoTipsExpanded, setPhotoTipsExpanded] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<number | null>(null);
  const [currentItemPalletId, setCurrentItemPalletId] = useState<string | null>(null);
  const [productImageUri, setProductImageUri] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [hasScannedBarcode, setHasScannedBarcode] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const barcodeScanLock = useRef(false);
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

  const requestPermissions = async () => {
    if (!activePallet) {
      Alert.alert(
        "Choose a pallet first",
        "Pick or create a pallet before taking photos.",
      );
      return false;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      alert("Camera permission is required to take photos.");
      return false;
    }
    return true;
  };

  const resetBarcodeScanState = () => {
    barcodeScanLock.current = false;
    setHasScannedBarcode(false);
    setScannerOpen(false);
  };

  const addPhoto = async () => {
    const canContinue = await requestPermissions();
    if (!canContinue) {
      return;
    }
    let photo = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
    });
    if (!photo.canceled) {
      setImages((prev) => [...prev, photo.assets[0]]);
      setProductImageUri(null);
      setBarcodeValue("");
      setResult(null);
    }
  };

  const pickImage = async () => {
    const canContinue = await requestPermissions();
    if (!canContinue) {
      return;
    }
    let picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (!picked.canceled) {
      setImages((prev) => [...prev, ...picked.assets]);
      setProductImageUri(null);
      setBarcodeValue("");
      setResult(null);
    }
  };

  const removePhoto = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
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
    setProductImageUri(null);
    setBarcodeValue("");
    resetBarcodeScanState();
    setCurrentItemId(null);
    setCurrentItemPalletId(null);
  };

  const applyParsedListingDrafts = (parsed: any) => {
    setListingDrafts(createListingDrafts(parsed));
    setActiveListingPlatform("general");
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
    try {
      const imageContent = images.map((img) => ({
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
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                ...imageContent,
                {
                  type: "text",
                  text: `You are a resale expert. I am showing you ${images.length} photo(s) of the same item. Analyze it like a reseller preparing to list it online. For pricing, estimate a realistic low_price and high_price by checking the item against current eBay and Facebook Marketplace listings for identical or very similar items whenever that market context is available to you. Favor recent sold or active comparable listings, adjust for condition, brand, completeness, and visible wear, and make sure the suggested price range follows the real market rather than a generic guess. Also provide a floor_price, meaning the lowest reasonable price a seller should accept before walking away during negotiation. Include practical photo tips, 2-3 short web image search queries that would help the user find example listing photos, and a sellability score based on condition, estimated demand, and effort versus return. Also write platform-specific listing copy for Facebook Marketplace and eBay. eBay titles should be keyword-heavy and concise; Facebook copy should sound a little more casual and local-buyer friendly. Then respond ONLY with raw JSON, no markdown:
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
      const data = await response.json();
      const text = data.content[0].text;
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setResult(parsed);
      setProductImageUri(null);
      setBarcodeValue("");
      applyParsedListingDrafts(parsed);
      setEditablePrice(`${parsed.low_price}-${parsed.high_price}`);
      setEditableFloorPrice(`${parsed.floor_price ?? parsed.low_price}`);
      setPhotoTipsExpanded(false);
      incrementScanCount();
      void triggerAnalysisCompleteFeedback();
    } catch {
      alert("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const copyListing = async () => {
    const text =
      currentListingDraft.title + "\n\n" + currentListingDraft.description;
    await Clipboard.setStringAsync(text);
    void triggerCopyFeedback();
  };

  const parsePriceRange = () => {
    const matches = editablePrice.match(/\d+(?:\.\d+)?/g) ?? [];
    if (matches.length < 2) {
      return null;
    }

    const [low, high] = matches.slice(0, 2).map(Number);
    if (Number.isNaN(low) || Number.isNaN(high)) {
      return null;
    }

    return {
      low: Math.min(low, high),
      high: Math.max(low, high),
    };
  };

  const parseFloorPrice = () => {
    const match = editableFloorPrice.match(/\d+(?:\.\d+)?/);
    if (!match) {
      return null;
    }

    const value = Number(match[0]);
    return Number.isNaN(value) ? null : value;
  };

  const parseQuantity = () => {
    const match = editableQuantity.match(/\d+/);
    if (!match) {
      return null;
    }

    const value = Number(match[0]);
    if (Number.isNaN(value) || value < 1) {
      return null;
    }

    return Math.floor(value);
  };

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

  const analyzeBarcode = async (barcode: string) => {
    setLoading(true);
    setCurrentItemId(null);

    try {
      const product = await lookupBarcodeProduct(barcode);
      const productSummary = [
        `Barcode: ${barcode}`,
        product.title ? `Title: ${product.title}` : null,
        product.brand ? `Brand: ${product.brand}` : null,
        product.category ? `Category: ${product.category}` : null,
        product.description ? `Description: ${product.description}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY ?? "",
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
                  text: `You are a resale expert. Use this barcode lookup result to identify the product instead of analyzing photos. Create a resale-ready summary and pricing estimate. For pricing, estimate a realistic low_price and high_price by checking the item against current eBay and Facebook Marketplace listings for identical or very similar items whenever that market context is available to you. Favor recent sold or active comparable listings, adjust for condition, brand, completeness, and visible wear, and make sure the suggested price range follows the real market rather than a generic guess. Also provide a floor_price, meaning the lowest reasonable price a seller should accept before walking away during negotiation. Assume a typical secondhand condition unless the barcode data clearly suggests new sealed merchandise. Also write platform-specific listing copy for Facebook Marketplace and eBay. eBay titles should be keyword-heavy and concise; Facebook copy should sound a little more casual and local-buyer friendly. Respond ONLY with raw JSON, no markdown:
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
  "listing_description_facebook": "3-4 sentence Facebook description"
}`,
                },
              ],
            },
          ],
        }),
      });
      const data = await response.json();
      const text = data.content[0].text;
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setImages([]);
      setBarcodeValue(barcode);
      setProductImageUri(product.images?.[0] ?? null);
      setResult(parsed);
      applyParsedListingDrafts(parsed);
      setEditablePrice(`${parsed.low_price}-${parsed.high_price}`);
      setEditableFloorPrice(`${parsed.floor_price ?? parsed.low_price}`);
      void triggerAnalysisCompleteFeedback();
    } catch (error) {
      resetBarcodeScanState();
      setBarcodeValue("");
      setProductImageUri(null);
      setResult(null);
      setLoading(false);
      Alert.alert(
        "Barcode lookup failed",
        error instanceof Error
          ? error.message
          : "We couldn't pull product info from that barcode.",
        [
          { text: "OK", style: "cancel" },
          {
            text: "Scan Again",
            onPress: () => {
              void openBarcodeScanner();
            },
          },
        ],
      );
      return;
    }

    setLoading(false);
  };

  const openBarcodeScanner = async () => {
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
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (barcodeScanLock.current || hasScannedBarcode) {
      return;
    }

    barcodeScanLock.current = true;
    setHasScannedBarcode(true);
    setScannerOpen(false);
    void analyzeBarcode(data);
  };

  const saveToInventory = async () => {
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
    const baseInventoryItem: InventoryItem = {
      id: currentItemId ?? Date.now(),
      photo: images[0]?.uri ?? productImageUri ?? null,
      name: result.name,
      condition: result.condition,
      quantity: 1,
      low_price: parsedPriceRange.low,
      high_price: parsedPriceRange.high,
      floor_price: Math.min(parsedFloorPrice, parsedPriceRange.high),
      best_platform: result.best_platform,
      listing_title: listingDrafts.general.title,
      listing_description: listingDrafts.general.description,
      listing_title_facebook: listingDrafts.facebook.title,
      listing_description_facebook: listingDrafts.facebook.description,
      listing_title_ebay: listingDrafts.ebay.title,
      listing_description_ebay: listingDrafts.ebay.description,
      listedPlatforms: [],
      palletId,
      soldPrice: null,
    };

    if (currentItemId !== null) {
      await saveInventoryItem(baseInventoryItem);
      void triggerInventorySaveFeedback();
    } else {
      const itemsToSave = Array.from({ length: parsedQuantity }, (_, index) => ({
        ...baseInventoryItem,
        id: baseInventoryItem.id + index,
      }));
      await Promise.all(itemsToSave.map((item) => saveInventoryItem(item)));
      void triggerInventorySaveFeedback();
      setCurrentItemId(baseInventoryItem.id);
      setCurrentItemPalletId(palletId);
      if (promptToPostOnSave) {
        promptForListingDestination(itemsToSave[0]);
      }
    }
  };

  const addAnother = () => {
    setCurrentItemId(null);
    setCurrentItemPalletId(null);
  };

  const goToNextItem = () => {
    clearAll();
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
              Use photos to build a draft, then save it back to your active pallet.
            </Text>
          </View>
          <TouchableOpacity style={styles.closeCaptureBtn} onPress={() => router.back()}>
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
                  ? "Photos and saved drafts will go into this pallet."
                  : "Choose a pallet on Home or in the Pallets tab before taking photos."}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btn} onPress={addPhoto}>
            <Text style={styles.btnText}>Take Photos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={pickImage}>
            <Text style={styles.btnText}>Upload Photos</Text>
          </TouchableOpacity>
        </View>

        {scannerOpen && (
          <View style={styles.scannerCard}>
            <CameraView
              style={styles.scannerView}
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: [
                  "upc_a",
                  "upc_e",
                  "ean13",
                  "ean8",
                  "code128",
                  "code39",
                ],
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
                onPress={() => setScannerOpen(false)}
              >
                <Text style={styles.closeScannerBtnText}>Cancel Scanner</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {barcodeValue ? (
          <Text style={styles.barcodeStatus}>Barcode: {barcodeValue}</Text>
        ) : null}

        {images.length > 0 && (
          <View style={styles.photoStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {images.map((img, index) => (
                <View key={index} style={styles.thumbContainer}>
                  <Image source={{ uri: img.uri }} style={styles.thumb} />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removePhoto(index)}
                  >
                    <Text style={styles.removeBtnText}>x</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.photoCount}>
              {images.length} photo{images.length > 1 ? "s" : ""} added
            </Text>
          </View>
        )}

        {images.length > 0 && !loading && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.analyzeBtn} onPress={analyzeImage}>
              <Text style={styles.analyzeBtnText}>Analyze Item</Text>
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
              <View style={styles.listingPlatformTabs}>
                {(["general", "facebook", "ebay"] as const).map((platform) => (
                  <TouchableOpacity
                    key={platform}
                    style={[
                      styles.listingPlatformTab,
                      activeListingPlatform === platform && styles.listingPlatformTabActive,
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
                onChangeText={(value) => updateListingDraft("description", value)}
                multiline
                placeholder="Listing description"
              />

              <Text style={styles.listingLabel}>PRICE RANGE</Text>
              <TextInput
                style={styles.editableInput}
                value={editablePrice}
                onChangeText={setEditablePrice}
                placeholder="e.g. 10-30"
              />

              <Text style={styles.listingLabel}>FLOOR PRICE</Text>
              <TextInput
                style={styles.editableInput}
                value={editableFloorPrice}
                onChangeText={setEditableFloorPrice}
                placeholder="lowest price you'd take"
                keyboardType="numeric"
              />

              <Text style={styles.listingLabel}>QTY</Text>
              <TextInput
                style={styles.editableInput}
                value={editableQuantity}
                onChangeText={setEditableQuantity}
                placeholder="1"
                keyboardType="number-pad"
              />

              <TouchableOpacity style={styles.copyBtn} onPress={copyListing}>
                <Text style={styles.copyBtnText}>
                  Copy {getListingDraftPlatformLabel(activeListingPlatform)} Listing
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => {
                  void saveToInventory();
                }}
              >
                <Text style={styles.saveBtnText}>
                  {currentItemId !== null
                    ? "Update Inventory"
                    : parseQuantity() && parseQuantity()! > 1
                      ? `Save ${parseQuantity()} Copies`
                      : "Save to Inventory"}
                </Text>
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
                    onPress={() => router.replace("/(tabs)")}
                  >
                    <Text style={styles.finishedBtnText}>Finished</Text>
                  </TouchableOpacity>
                </>
              )}
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
    backgroundColor: AppPalette.surface,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  btnText: { color: AppPalette.text, fontWeight: "600", fontSize: 15 },
  barcodeBtn: {
    backgroundColor: "#111827",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  barcodeBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  scannerCard: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: AppPalette.primaryStrong,
    marginBottom: 16,
  },
  scannerView: { height: 280, width: "100%" },
  scannerOverlay: {
    padding: 16,
    backgroundColor: AppPalette.primaryStrong,
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
  barcodeStatus: {
    fontSize: 13,
    color: AppPalette.info,
    marginBottom: 12,
    fontWeight: "500",
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
