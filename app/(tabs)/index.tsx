import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
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

import { getAppSettings, subscribeAppSettings } from "@/lib/app-settings";
import { lookupBarcodeProduct } from "@/lib/barcode-lookup";
import { saveInventoryItem, type InventoryItem } from "@/lib/inventory-store";
import { openListingDraft } from "@/lib/listing-posting";

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

export default function HomeScreen() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [editableTitle, setEditableTitle] = useState("");
  const [editableDescription, setEditableDescription] = useState("");
  const [editablePrice, setEditablePrice] = useState("");
  const [editableFloorPrice, setEditableFloorPrice] = useState("");
  const [currentItemId, setCurrentItemId] = useState<number | null>(null);
  const [productImageUri, setProductImageUri] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [hasScannedBarcode, setHasScannedBarcode] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const barcodeScanLock = useRef(false);
  const { promptToPostOnSave } = useSyncExternalStore(
    subscribeAppSettings,
    getAppSettings,
    getAppSettings,
  );

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      alert("Camera permission is required to take photos.");
    }
  };

  const addPhoto = async () => {
    await requestPermissions();
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
    await requestPermissions();
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
    setEditableTitle("");
    setEditableDescription("");
    setEditablePrice("");
    setEditableFloorPrice("");
    setProductImageUri(null);
    setScannerOpen(false);
    setBarcodeValue("");
    setHasScannedBarcode(false);
    barcodeScanLock.current = false;
    setCurrentItemId(null);
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
                  text: `You are a resale expert. I am showing you ${images.length} photo(s) of the same item. Analyze it like a reseller preparing to list it online. For pricing, estimate a realistic low_price and high_price by checking the item against current eBay and Facebook Marketplace listings for identical or very similar items whenever that market context is available to you. Favor recent sold or active comparable listings, adjust for condition, brand, completeness, and visible wear, and make sure the suggested price range follows the real market rather than a generic guess. Also provide a floor_price, meaning the lowest reasonable price a seller should accept before walking away during negotiation. Then respond ONLY with raw JSON, no markdown:
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
  "listing_description": "3-4 sentence listing description"
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
      setEditableTitle(parsed.listing_title);
      setEditableDescription(parsed.listing_description);
      setEditablePrice(`${parsed.low_price}-${parsed.high_price}`);
      setEditableFloorPrice(`${parsed.floor_price ?? parsed.low_price}`);
    } catch {
      alert("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const copyListing = async () => {
    const text = editableTitle + "\n\n" + editableDescription;
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied!", "Listing copied to clipboard.");
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
                  text: `You are a resale expert. Use this barcode lookup result to identify the product instead of analyzing photos. Create a resale-ready summary and pricing estimate. For pricing, estimate a realistic low_price and high_price by checking the item against current eBay and Facebook Marketplace listings for identical or very similar items whenever that market context is available to you. Favor recent sold or active comparable listings, adjust for condition, brand, completeness, and visible wear, and make sure the suggested price range follows the real market rather than a generic guess. Also provide a floor_price, meaning the lowest reasonable price a seller should accept before walking away during negotiation. Assume a typical secondhand condition unless the barcode data clearly suggests new sealed merchandise. Respond ONLY with raw JSON, no markdown:
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
  "listing_description": "3-4 sentence listing description"
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
      setEditableTitle(parsed.listing_title);
      setEditableDescription(parsed.listing_description);
      setEditablePrice(`${parsed.low_price}-${parsed.high_price}`);
      setEditableFloorPrice(`${parsed.floor_price ?? parsed.low_price}`);
    } catch (error) {
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
          { text: "Cancel", style: "cancel" },
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

    barcodeScanLock.current = false;
    setHasScannedBarcode(false);
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

  const saveToInventory = () => {
    if (!result) {
      Alert.alert("Nothing to save", "Analyze an item before saving it.");
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

    const itemId = currentItemId ?? Date.now();
    const inventoryItem: InventoryItem = {
      id: itemId,
      photo: images[0]?.uri ?? productImageUri ?? null,
      name: result.name,
      condition: result.condition,
      low_price: parsedPriceRange.low,
      high_price: parsedPriceRange.high,
      floor_price: Math.min(parsedFloorPrice, parsedPriceRange.high),
      best_platform: result.best_platform,
      listing_title: editableTitle,
      listing_description: editableDescription,
      listedPlatforms: [],
    };

    if (currentItemId !== null) {
      saveInventoryItem(inventoryItem);
      Alert.alert("Updated!", result.name + " updated in inventory.");
    } else {
      saveInventoryItem(inventoryItem);
      setCurrentItemId(itemId);
      if (promptToPostOnSave) {
        promptForListingDestination(inventoryItem);
      } else {
        Alert.alert("Saved!", result.name + " added to inventory.");
      }
    }
  };

  const addAnother = () => {
    setCurrentItemId(null);
    Alert.alert("Ready!", "Tap Save to Inventory to add another copy.");
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
        <Text style={styles.title}>Pallet Scanner</Text>
        <Text style={styles.subtitle}>
          Add multiple photos then analyze the item
        </Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btn} onPress={addPhoto}>
            <Text style={styles.btnText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={pickImage}>
            <Text style={styles.btnText}>Upload Photo</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.barcodeBtn}
          onPress={openBarcodeScanner}
        >
          <Text style={styles.barcodeBtnText}>Scan Barcode</Text>
        </TouchableOpacity>

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

        {loading && (
          <ActivityIndicator
            size="large"
            color="#000"
            style={{ marginTop: 20 }}
          />
        )}

        {result && (
          <View style={styles.resultCard}>
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
            <Text style={styles.platformReason}>{result.platform_reason}</Text>

            <View style={styles.listingBox}>
              <Text style={styles.listingLabel}>LISTING TITLE</Text>
              <TextInput
                style={styles.editableInput}
                value={editableTitle}
                onChangeText={setEditableTitle}
                multiline
                placeholder="Listing title"
              />

              <Text style={styles.listingLabel}>DESCRIPTION</Text>
              <TextInput
                style={[styles.editableInput, styles.editableInputTall]}
                value={editableDescription}
                onChangeText={setEditableDescription}
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

              <TouchableOpacity style={styles.copyBtn} onPress={copyListing}>
                <Text style={styles.copyBtnText}>Copy Listing</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={saveToInventory}
              >
                <Text style={styles.saveBtnText}>
                  {currentItemId !== null
                    ? "Update Inventory"
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
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "600", color: "#111", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 24 },
  buttonRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  btn: {
    flex: 1,
    backgroundColor: "#111",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "500", fontSize: 15 },
  barcodeBtn: {
    backgroundColor: "#1a56db",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  barcodeBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  scannerCard: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111",
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
  closeScannerBtnText: { color: "#111", fontWeight: "600", fontSize: 13 },
  barcodeStatus: {
    fontSize: 13,
    color: "#1a56db",
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
  photoCount: { fontSize: 13, color: "#666", marginTop: 8 },
  actionRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  analyzeBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#111",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  analyzeBtnText: { color: "#111", fontWeight: "500", fontSize: 15 },
  clearBtn: {
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  clearBtnText: { color: "#666", fontWeight: "500", fontSize: 15 },
  resultCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  itemName: { fontSize: 20, fontWeight: "600", color: "#111", marginBottom: 4 },
  itemDesc: { fontSize: 14, color: "#555", marginBottom: 12, lineHeight: 20 },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  priceBadge: {
    backgroundColor: "#e6f4ea",
    color: "#2d6a4f",
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  floorBadge: {
    backgroundColor: "#fff3cd",
    color: "#8a6d1f",
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  conditionBadge: {
    backgroundColor: "#fff8e1",
    color: "#856404",
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  platformBadge: {
    backgroundColor: "#e8f0fe",
    color: "#1a56db",
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  platformReason: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
    fontStyle: "italic",
  },
  listingBox: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 0.5,
    borderColor: "#ddd",
  },
  listingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 8,
  },
  editableInput: {
    fontSize: 14,
    color: "#111",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 6,
    padding: 8,
    backgroundColor: "#fafafa",
    marginBottom: 4,
  },
  editableInputTall: { minHeight: 100, textAlignVertical: "top" },
  copyBtn: {
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  copyBtnText: { color: "#fff", fontWeight: "500", fontSize: 14 },
  saveBtn: {
    backgroundColor: "#2d6a4f",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontWeight: "500", fontSize: 14 },
  addAnotherBtn: {
    borderWidth: 1,
    borderColor: "#2d6a4f",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  addAnotherBtnText: { color: "#2d6a4f", fontWeight: "500", fontSize: 14 },
  nextItemBtn: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  nextItemBtnText: { color: "#111", fontWeight: "500", fontSize: 14 },
});
