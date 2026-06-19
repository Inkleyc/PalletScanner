import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { AppLayout, AppPalette } from "@/constants/app-palette";
import { AppAlert as Alert } from "@/lib/app-alert";
import {
  getInventory,
  subscribeInventory,
  updateInventoryItemFacebookListingUrl,
  updateInventoryItemFacebookStatus,
  updateInventoryItemSoldPrice,
} from "@/lib/inventory-store";
import { isFacebookListingUrl, normalizeListingUrl } from "@/lib/listing-url";
import { openListingDraft } from "@/lib/listing-posting";
import {
  getItemNextAction,
  getItemPhotoScore,
  getListingConfidence,
  getPhotoSlots,
} from "@/lib/workflow-guidance";
import {
  getPostingReadiness,
  getPostingReadinessMessage,
} from "@/lib/posting-validation";

export default function ItemReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const items = useSyncExternalStore(
    subscribeInventory,
    getInventory,
    getInventory,
  );
  const item = useMemo(
    () => items.find((candidate) => String(candidate.id) === String(params.id)),
    [items, params.id],
  );
  const [facebookUrlDraft, setFacebookUrlDraft] = useState("");
  const [soldPriceDraft, setSoldPriceDraft] = useState("");
  const isLargeLayout = width >= 900;

  if (!item) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: "Review Item" }} />
        <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
          <Text style={styles.title}>Item not found</Text>
          <Text style={styles.subtitle}>
            This item may have been removed from inventory.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const photos = item.photos?.length ? item.photos : item.photo ? [item.photo] : [];
  const nextAction = getItemNextAction(item);
  const confidence = getListingConfidence(item);
  const photoScore = getItemPhotoScore(item);
  const facebookReadiness = getPostingReadiness(item, "facebook");
  const ebayReadiness = getPostingReadiness(item, "ebay");
  const activeFacebookUrl = facebookUrlDraft || item.facebookListingUrl || "";
  const activeSoldPrice =
    soldPriceDraft || (item.soldPrice !== null ? String(item.soldPrice) : "");

  const saveFacebookUrl = () => {
    const normalizedUrl = normalizeListingUrl(activeFacebookUrl);
    if (!isFacebookListingUrl(normalizedUrl)) {
      Alert.alert(
        "Check the URL",
        "Paste the full Facebook listing URL, starting with https://.",
      );
      return;
    }
    updateInventoryItemFacebookListingUrl(item.id, normalizedUrl);
    setFacebookUrlDraft(normalizedUrl);
    Alert.alert("Facebook URL saved", "This listing is now easy to reopen.");
  };

  const pasteFacebookUrl = async () => {
    setFacebookUrlDraft(normalizeListingUrl(await Clipboard.getStringAsync()));
  };

  const saveSoldPrice = () => {
    const parsedValue = Number(activeSoldPrice);
    if (Number.isNaN(parsedValue) || parsedValue < 0) {
      Alert.alert("Invalid sold price", "Enter a valid number like 25 or 25.50.");
      return;
    }
    updateInventoryItemSoldPrice(item.id, parsedValue);
    Alert.alert("Sold price saved", "The item is marked sold in inventory.");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Review Item" }} />
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.subtitle}>{nextAction.label}: {nextAction.detail}</Text>

        <View style={styles.heroCard}>
          {photos[0] ? (
            <Image source={{ uri: photos[0] }} style={styles.heroPhoto} />
          ) : (
            <View style={styles.heroPhotoMissing}>
              <Text style={styles.heroPhotoMissingText}>No photo</Text>
            </View>
          )}
          <View style={styles.heroCopy}>
            <Text style={styles.heroLabel}>Listing Confidence</Text>
            <Text style={styles.heroTitle}>{confidence.label}</Text>
            <Text style={styles.heroText}>{confidence.detail}</Text>
            <Text style={styles.heroText}>{photoScore.label}: {photoScore.detail}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Photo Slots</Text>
          <View style={styles.photoSlotGrid}>
            {getPhotoSlots(item).map((slot) => (
              <View
                key={slot.label}
                style={[
                  styles.photoSlot,
                  slot.done ? styles.photoSlotDone : styles.photoSlotMissing,
                ]}
              >
                <Text
                  style={[
                    styles.photoSlotTitle,
                    slot.done
                      ? styles.photoSlotTitleDone
                      : styles.photoSlotTitleMissing,
                  ]}
                >
                  {slot.done ? "Done" : "Missing"}
                </Text>
                <Text style={styles.photoSlotLabel}>{slot.label}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push("/capture")}
          >
            <Text style={styles.secondaryBtnText}>Open Photo Capture</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Posting Checks</Text>
          <Text style={styles.checkTitle}>Facebook</Text>
          <Text style={facebookReadiness.ready ? styles.goodText : styles.badText}>
            {getPostingReadinessMessage(item, "facebook")}
          </Text>
          <Text style={styles.checkTitle}>eBay</Text>
          <Text style={ebayReadiness.ready ? styles.goodText : styles.badText}>
            {getPostingReadinessMessage(item, "ebay")}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Platform Actions</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/facebook" as never)}
            >
              <Text style={styles.primaryBtnText}>Open Facebook Queue</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.infoBtn}
              onPress={() => {
                void openListingDraft(item, "ebay");
              }}
            >
              <Text style={styles.primaryBtnText}>Post to eBay</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() =>
              updateInventoryItemFacebookStatus(item.id, { status: "listed" })
            }
          >
            <Text style={styles.secondaryBtnText}>Mark Facebook Listed</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Listing URLs</Text>
          {item.ebayListingUrl ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                void Linking.openURL(item.ebayListingUrl as string);
              }}
            >
              <Text style={styles.secondaryBtnText}>Open eBay Listing</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.mutedText}>No eBay listing URL saved yet.</Text>
          )}
          {item.facebookListingUrl ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                void Linking.openURL(item.facebookListingUrl as string);
              }}
            >
              <Text style={styles.secondaryBtnText}>Open Facebook Listing</Text>
            </TouchableOpacity>
          ) : null}
          <TextInput
            style={styles.input}
            value={activeFacebookUrl}
            onChangeText={setFacebookUrlDraft}
            placeholder="Facebook listing URL"
            placeholderTextColor={AppPalette.textSoft}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={pasteFacebookUrl}>
              <Text style={styles.secondaryBtnText}>Paste URL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={saveFacebookUrl}>
              <Text style={styles.primaryBtnText}>Save URL</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sold Tracking</Text>
          <TextInput
            style={styles.input}
            value={activeSoldPrice}
            onChangeText={setSoldPriceDraft}
            placeholder="Sold price"
            placeholderTextColor={AppPalette.textSoft}
            keyboardType="decimal-pad"
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={saveSoldPrice}>
            <Text style={styles.primaryBtnText}>Save Sold Price</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 20, paddingTop: 52, paddingBottom: 28 },
  innerContent: { width: "100%", alignSelf: "center" },
  innerContentWide: { maxWidth: AppLayout.maxContentWidth },
  backBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  backBtnText: { color: AppPalette.text, fontSize: 13, fontWeight: "800" },
  title: { color: AppPalette.text, fontSize: 28, fontWeight: "800", lineHeight: 34 },
  subtitle: {
    color: AppPalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 16,
  },
  heroCard: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  heroPhoto: {
    width: 110,
    height: 110,
    borderRadius: 10,
    backgroundColor: AppPalette.surfaceMuted,
  },
  heroPhotoMissing: {
    width: 110,
    height: 110,
    borderRadius: 10,
    backgroundColor: AppPalette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPhotoMissingText: { color: AppPalette.textMuted, fontSize: 13, fontWeight: "700" },
  heroCopy: { flex: 1 },
  heroLabel: {
    color: AppPalette.textSoft,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },
  heroTitle: { color: AppPalette.text, fontSize: 20, fontWeight: "800" },
  heroText: {
    color: AppPalette.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  card: {
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: {
    color: AppPalette.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  photoSlotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoSlot: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  photoSlotDone: {
    backgroundColor: AppPalette.successSoft,
    borderColor: "#cfe7dc",
  },
  photoSlotMissing: {
    backgroundColor: AppPalette.warningSoft,
    borderColor: "#f4d7a2",
  },
  photoSlotTitle: { fontSize: 11, fontWeight: "800", marginBottom: 3 },
  photoSlotTitleDone: { color: AppPalette.success },
  photoSlotTitleMissing: { color: AppPalette.warning },
  photoSlotLabel: { color: AppPalette.text, fontSize: 13, fontWeight: "700" },
  checkTitle: {
    color: AppPalette.textSoft,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 8,
  },
  goodText: { color: AppPalette.success, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  badText: { color: AppPalette.dangerStrong, fontSize: 13, lineHeight: 19 },
  mutedText: { color: AppPalette.textMuted, fontSize: 13, lineHeight: 19 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  primaryBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  infoBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: AppPalette.info,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryBtnText: { color: AppPalette.primaryOn, fontSize: 13, fontWeight: "800" },
  secondaryBtn: {
    flex: 1,
    minWidth: 130,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryBtnText: { color: AppPalette.text, fontSize: 13, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    backgroundColor: AppPalette.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: AppPalette.text,
    fontSize: 13,
    marginTop: 8,
  },
});
