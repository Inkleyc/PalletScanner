import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
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
  clearInventoryItemFacebookCopiedSteps,
  subscribeInventory,
  updateInventoryItemFacebookCopiedStep,
  updateInventoryItemFacebookListingUrl,
  updateInventoryItemFacebookStatus,
} from "@/lib/inventory-store";
import {
  copyFacebookListingValue,
  openListingDraft,
} from "@/lib/listing-posting";
import { getPostingReadiness } from "@/lib/posting-validation";
import { isFacebookListingUrl, normalizeListingUrl } from "@/lib/listing-url";

const facebookCopySteps = [
  "Title",
  "Price",
  "Description",
  "Condition",
  "Quantity",
  "Photo checklist",
] as const;

export default function FacebookQueueScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const items = useSyncExternalStore(
    subscribeInventory,
    getInventory,
    getInventory,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [facebookUrlDrafts, setFacebookUrlDrafts] = useState<Record<number, string>>({});
  const isLargeLayout = width >= 900;

  const queueItems = useMemo(
    () =>
      items
        .filter(
          (item) =>
            !item.listedPlatforms.includes("facebook") &&
            item.facebookStatus !== "skipped",
        )
        .sort((a, b) => b.id - a.id),
    [items],
  );
  const skippedItems = useMemo(
    () => items.filter((item) => item.facebookStatus === "skipped"),
    [items],
  );
  const draftItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.facebookStatus === "opened" &&
          !item.listedPlatforms.includes("facebook"),
      ),
    [items],
  );
  const listedMissingUrlItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.listedPlatforms.includes("facebook") && !item.facebookListingUrl,
      ),
    [items],
  );

  const activeItem = queueItems[Math.min(activeIndex, Math.max(queueItems.length - 1, 0))];
  const readiness = activeItem
    ? getPostingReadiness(activeItem, "facebook")
    : null;
  const activePhotos = activeItem?.photos?.length
    ? activeItem.photos
    : activeItem?.photo
      ? [activeItem.photo]
      : [];
  const activeUrlDraft =
    activeItem ? facebookUrlDrafts[activeItem.id] ?? activeItem.facebookListingUrl ?? "" : "";

  const moveQueue = (direction: "next" | "previous") => {
    setActiveIndex((current) => {
      if (direction === "previous") {
        return Math.max(current - 1, 0);
      }

      return Math.min(current + 1, Math.max(queueItems.length - 1, 0));
    });
  };

  const saveFacebookUrl = (itemId: number, rawUrl: string) => {
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) {
      Alert.alert(
        "Paste the listing URL",
        "Open the Facebook listing, copy its URL, then paste it here.",
      );
      return;
    }

    const normalizedUrl = normalizeListingUrl(trimmedUrl);
    if (!isFacebookListingUrl(normalizedUrl)) {
      Alert.alert(
        "Check the URL",
        "Use the full Facebook listing URL, starting with https://.",
      );
      return;
    }

    updateInventoryItemFacebookListingUrl(itemId, normalizedUrl);
    clearInventoryItemFacebookCopiedSteps(itemId);
    Alert.alert("Facebook URL saved", "You can reopen this listing from Inventory.");
  };

  const pasteFacebookUrl = async (itemId: number) => {
    const clipboardValue = await Clipboard.getStringAsync();
    setFacebookUrlDrafts((current) => ({
      ...current,
      [itemId]: clipboardValue.trim(),
    }));
  };

  const markListed = (itemId: number) => {
    updateInventoryItemFacebookStatus(itemId, { status: "listed" });
    Alert.alert(
      "Marked listed",
      "Paste the final Facebook URL when you have it so this listing is easy to reopen later.",
    );
  };

  const skipForNow = (itemId: number) => {
    updateInventoryItemFacebookStatus(itemId, { status: "skipped" });
    setActiveIndex((current) =>
      Math.min(current, Math.max(queueItems.length - 2, 0)),
    );
  };

  const restoreSkipped = () => {
    skippedItems.forEach((item) => {
      updateInventoryItemFacebookStatus(item.id, { status: "idle" });
    });
    setActiveIndex(0);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.innerContent, isLargeLayout && styles.innerContentWide]}>
        <Text style={styles.title}>Facebook Queue</Text>
        <Text style={styles.subtitle}>
          Finish Marketplace posts one item at a time
        </Text>

        <View style={styles.metricsGrid}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Needs Posting</Text>
            <Text style={styles.metricValue}>{queueItems.length}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Drafts Open</Text>
            <Text style={styles.metricValue}>{draftItems.length}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Missing URLs</Text>
            <Text style={styles.metricValue}>{listedMissingUrlItems.length}</Text>
          </View>
          <TouchableOpacity
            style={styles.metricBox}
            onPress={restoreSkipped}
            disabled={skippedItems.length === 0}
          >
            <Text style={styles.metricLabel}>Skipped</Text>
            <Text style={styles.metricValue}>{skippedItems.length}</Text>
          </TouchableOpacity>
        </View>

        {!activeItem ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Facebook queue is clear</Text>
            <Text style={styles.emptyText}>
              Every saved item is marked listed to Facebook. Check Inventory for
              missing listing URLs or sold status updates.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/explore")}
            >
              <Text style={styles.primaryBtnText}>Open Inventory</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.queueCard}>
            <View style={styles.queueHeader}>
              <View>
                <Text style={styles.queueEyebrow}>
                  Item {Math.min(activeIndex + 1, queueItems.length)} of {queueItems.length}
                </Text>
                <Text style={styles.itemTitle}>{activeItem.name}</Text>
              </View>
              {activePhotos[0] ? (
                <Image source={{ uri: activePhotos[0] }} style={styles.itemPhoto} />
              ) : null}
            </View>

            <View style={styles.badgeRow}>
              <Text style={styles.priceBadge}>
                ${activeItem.low_price}-${activeItem.high_price}
              </Text>
              <Text style={styles.quantityBadge}>
                Qty {activeItem.quantity ?? 1}
              </Text>
              <Text style={styles.conditionBadge}>{activeItem.condition}</Text>
              <Text style={styles.photoBadge}>
                {activePhotos.length} photo{activePhotos.length === 1 ? "" : "s"}
              </Text>
            </View>

            {readiness && !readiness.ready ? (
              <View style={styles.blockerBox}>
                <Text style={styles.blockerTitle}>Needs attention before posting</Text>
                {readiness.errors.map((error) => (
                  <Text key={error} style={styles.blockerText}>
                    {error}
                  </Text>
                ))}
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => router.push("/explore")}
                >
                  <Text style={styles.secondaryBtnText}>Fix in Inventory</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.readyBox}>
                <Text style={styles.readyTitle}>Ready for Marketplace</Text>
                <Text style={styles.readyText}>
                  Copy each field, open Facebook, add photos, publish, then mark
                  it listed.
                </Text>
              </View>
            )}

            <View style={styles.stepSection}>
              <Text style={styles.sectionTitle}>Copy Fields</Text>
              <View style={styles.copyGrid}>
                {facebookCopySteps.map((label, index) => (
                  <TouchableOpacity
                    key={label}
                    style={[
                      styles.copyBtn,
                      activeItem.facebookCopiedSteps?.includes(label) &&
                        styles.copyBtnDone,
                    ]}
                    onPress={() => {
                      void copyFacebookListingValue(activeItem, label);
                      updateInventoryItemFacebookCopiedStep(activeItem.id, label);
                    }}
                  >
                    <Text style={styles.copyBtnText}>
                      {activeItem.facebookCopiedSteps?.includes(label) ? "Done" : index + 1}. Copy {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.resetStepsBtn}
                onPress={() => clearInventoryItemFacebookCopiedSteps(activeItem.id)}
              >
                <Text style={styles.resetStepsBtnText}>Reset copied steps</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.openMarketplaceBtn,
                readiness && !readiness.ready && styles.disabledBtn,
              ]}
              disabled={Boolean(readiness && !readiness.ready)}
              onPress={() => {
                void openListingDraft(activeItem, "facebook");
              }}
            >
              <Text style={styles.openMarketplaceBtnText}>
                Open Facebook Marketplace
              </Text>
            </TouchableOpacity>

            <View style={styles.urlBox}>
              <Text style={styles.sectionTitle}>After Publishing</Text>
              <Text style={styles.urlHint}>
                Mark listed, then save the final Facebook URL so you can reopen
                it from Inventory.
              </Text>
              <View style={styles.afterPublishActions}>
                <TouchableOpacity
                  style={styles.markListedBtn}
                  onPress={() => markListed(activeItem.id)}
                >
                  <Text style={styles.markListedBtnText}>Mark Listed</Text>
                </TouchableOpacity>
                {activeItem.facebookListingUrl ? (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => {
                      void Linking.openURL(activeItem.facebookListingUrl as string);
                    }}
                  >
                    <Text style={styles.secondaryBtnText}>View Listing</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TextInput
                style={styles.urlInput}
                value={activeUrlDraft}
                onChangeText={(value) =>
                  setFacebookUrlDrafts((current) => ({
                    ...current,
                    [activeItem.id]: value,
                  }))
                }
                placeholder="https://www.facebook.com/marketplace/item/..."
                placeholderTextColor={AppPalette.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.urlActions}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    void pasteFacebookUrl(activeItem.id);
                  }}
                >
                  <Text style={styles.secondaryBtnText}>Paste URL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primarySmallBtn}
                  onPress={() => saveFacebookUrl(activeItem.id, activeUrlDraft)}
                >
                  <Text style={styles.primarySmallBtnText}>Save URL</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.queueNav}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => moveQueue("previous")}
              >
                <Text style={styles.secondaryBtnText}>Previous</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => skipForNow(activeItem.id)}
              >
                <Text style={styles.secondaryBtnText}>Skip for Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primarySmallBtn}
                onPress={() => moveQueue("next")}
              >
                <Text style={styles.primarySmallBtnText}>Next Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  content: { padding: 20, paddingTop: 52, paddingBottom: 24 },
  innerContent: { width: "100%", alignSelf: "center" },
  innerContentWide: { maxWidth: AppLayout.maxContentWidth },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: AppPalette.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: AppPalette.textMuted,
    marginBottom: 16,
    lineHeight: 20,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  metricBox: {
    flex: 1,
    minWidth: 120,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 10,
    padding: 12,
  },
  metricLabel: {
    color: AppPalette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  metricValue: {
    color: AppPalette.text,
    fontSize: 24,
    fontWeight: "800",
  },
  emptyCard: {
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 12,
    padding: 18,
  },
  emptyTitle: {
    color: AppPalette.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: AppPalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  queueCard: {
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  queueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    padding: 14,
  },
  queueEyebrow: {
    color: AppPalette.textSoft,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },
  itemTitle: {
    flex: 1,
    color: AppPalette.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25,
  },
  itemPhoto: {
    width: 78,
    height: 78,
    borderRadius: 8,
    backgroundColor: AppPalette.surfaceMuted,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  priceBadge: {
    backgroundColor: AppPalette.successSoft,
    color: AppPalette.success,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quantityBadge: {
    backgroundColor: AppPalette.infoSoft,
    color: AppPalette.info,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  conditionBadge: {
    backgroundColor: AppPalette.warningSoft,
    color: AppPalette.warning,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  photoBadge: {
    backgroundColor: AppPalette.primarySoft,
    color: AppPalette.primary,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  blockerBox: {
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: AppPalette.dangerSoft,
    borderWidth: 1,
    borderColor: "#efc0b9",
    borderRadius: 10,
    padding: 12,
  },
  blockerTitle: {
    color: AppPalette.dangerStrong,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
  },
  blockerText: {
    color: AppPalette.dangerStrong,
    fontSize: 12,
    lineHeight: 17,
  },
  readyBox: {
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: AppPalette.successSoft,
    borderWidth: 1,
    borderColor: "#cfe7dc",
    borderRadius: 10,
    padding: 12,
  },
  readyTitle: {
    color: AppPalette.success,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
  },
  readyText: {
    color: AppPalette.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  stepSection: {
    borderTopWidth: 1,
    borderTopColor: AppPalette.border,
    padding: 14,
  },
  sectionTitle: {
    color: AppPalette.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
  },
  copyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  copyBtn: {
    minWidth: 132,
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  copyBtnDone: {
    backgroundColor: AppPalette.successSoft,
    borderColor: "#cfe7dc",
  },
  copyBtnText: {
    color: AppPalette.text,
    fontSize: 12,
    fontWeight: "800",
  },
  resetStepsBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderWidth: 1,
    borderColor: AppPalette.border,
    backgroundColor: AppPalette.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resetStepsBtnText: {
    color: AppPalette.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  openMarketplaceBtn: {
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  openMarketplaceBtnText: {
    color: AppPalette.primaryOn,
    fontSize: 14,
    fontWeight: "800",
  },
  disabledBtn: {
    opacity: 0.48,
  },
  urlBox: {
    borderTopWidth: 1,
    borderTopColor: AppPalette.border,
    padding: 14,
  },
  urlHint: {
    color: AppPalette.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  afterPublishActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  markListedBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: AppPalette.info,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  markListedBtnText: {
    color: AppPalette.primaryOn,
    fontSize: 13,
    fontWeight: "800",
  },
  urlInput: {
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    backgroundColor: AppPalette.surface,
    color: AppPalette.text,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
  },
  urlActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  queueNav: {
    borderTopWidth: 1,
    borderTopColor: AppPalette.border,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    color: AppPalette.primaryOn,
    fontSize: 14,
    fontWeight: "800",
  },
  primarySmallBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  primarySmallBtnText: {
    color: AppPalette.primaryOn,
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryBtn: {
    flex: 1,
    minWidth: 130,
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    backgroundColor: AppPalette.surfaceMuted,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryBtnText: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
