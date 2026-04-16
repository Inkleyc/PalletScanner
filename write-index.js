const fs = require("fs");

const code = `const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function HomeScreen() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

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
  };

  const analyzeImage = async () => {
    if (images.length === 0) return;
    setLoading(true);
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
                  text: \`You are a resale expert. I am showing you \${images.length} photo(s) of the same item. Analyze and respond ONLY with raw JSON, no markdown:
{
  "name": "item name",
  "description": "1-2 sentence description",
  "condition": "New / Like New / Good / Fair",
  "low_price": 10,
  "high_price": 30,
  "best_platform": "eBay",
  "platform_reason": "one sentence why",
  "listing_title": "SEO title under 80 chars",
  "listing_description": "3-4 sentence listing description"
}\`,
                },
              ],
            },
          ],
        }),
      });
      const data = await response.json();
      const text = data.content[0].text;
      const parsed = JSON.parse(text.replace(/\`\`\`json|\`\`\`/g, "").trim());
      setResult(parsed);
    } catch (e) {
      alert("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const copyListing = async () => {
    const text = result.listing_title + "\\n\\n" + result.listing_description;
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied!", "Listing copied to clipboard.");
  };

  const saveToInventory = () => {
    const item = {
      id: Date.now(),
      photo: images[0]?.uri ?? null,
      name: result.name,
      condition: result.condition,
      low_price: result.low_price,
      high_price: result.high_price,
      best_platform: result.best_platform,
      listing_title: result.listing_title,
      listing_description: result.listing_description,
    };
    global.inventory = global.inventory ?? [];
    global.inventory.push(item);
    Alert.alert("Saved!", result.name + " added to inventory.");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
              \${result.low_price}-\${result.high_price}
            </Text>
            <Text style={styles.conditionBadge}>{result.condition}</Text>
            <Text style={styles.platformBadge}>{result.best_platform}</Text>
          </View>
          <Text style={styles.platformReason}>{result.platform_reason}</Text>
          <View style={styles.listingBox}>
            <Text style={styles.listingLabel}>LISTING TITLE</Text>
            <Text style={styles.listingTitle}>{result.listing_title}</Text>
            <Text style={styles.listingLabel}>DESCRIPTION</Text>
            <Text style={styles.listingDesc}>{result.listing_description}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={copyListing}>
              <Text style={styles.copyBtnText}>Copy Listing</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={saveToInventory}>
              <Text style={styles.saveBtnText}>Save to Inventory</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "600", color: "#111", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 24 },
  buttonRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  btn: { flex: 1, backgroundColor: "#111", padding: 14, borderRadius: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "500", fontSize: 15 },
  photoStrip: { marginBottom: 16 },
  thumbContainer: { position: "relative", marginRight: 8 },
  thumb: { width: 90, height: 90, borderRadius: 8, backgroundColor: "#f0f0f0" },
  removeBtn: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  removeBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  photoCount: { fontSize: 13, color: "#666", marginTop: 8 },
  actionRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  analyzeBtn: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#111", padding: 14, borderRadius: 10, alignItems: "center" },
  analyzeBtnText: { color: "#111", fontWeight: "500", fontSize: 15 },
  clearBtn: { backgroundColor: "#f5f5f5", padding: 14, borderRadius: 10, alignItems: "center", paddingHorizontal: 20 },
  clearBtnText: { color: "#666", fontWeight: "500", fontSize: 15 },
  resultCard: { backgroundColor: "#f9f9f9", borderRadius: 12, padding: 16, marginTop: 8 },
  itemName: { fontSize: 20, fontWeight: "600", color: "#111", marginBottom: 4 },
  itemDesc: { fontSize: 14, color: "#555", marginBottom: 12, lineHeight: 20 },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  priceBadge: { backgroundColor: "#e6f4ea", color: "#2d6a4f", fontSize: 13, fontWeight: "500", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  conditionBadge: { backgroundColor: "#fff8e1", color: "#856404", fontSize: 13, fontWeight: "500", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  platformBadge: { backgroundColor: "#e8f0fe", color: "#1a56db", fontSize: 13, fontWeight: "500", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  platformReason: { fontSize: 13, color: "#666", marginBottom: 16, fontStyle: "italic" },
  listingBox: { backgroundColor: "#fff", borderRadius: 8, padding: 12, borderWidth: 0.5, borderColor: "#ddd" },
  listingLabel: { fontSize: 11, fontWeight: "600", color: "#999", letterSpacing: 0.5, marginBottom: 4, marginTop: 8 },
  listingTitle: { fontSize: 14, fontWeight: "500", color: "#111", marginBottom: 8 },
  listingDesc: { fontSize: 13, color: "#555", lineHeight: 20 },
  copyBtn: { backgroundColor: "#111", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 12 },
  copyBtnText: { color: "#fff", fontWeight: "500", fontSize: 14 },
  saveBtn: { backgroundColor: "#2d6a4f", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontWeight: "500", fontSize: 14 },
});
`;

fs.writeFileSync("app/(tabs)/index.tsx", code, "utf8");
console.log("index.tsx written successfully!");
