import {
  Image,
  Linking,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { Dispatch, SetStateAction } from "react";

import {
  getInventoryWorkflowStatus,
  type InventoryItem,
} from "@palletscanner/core";
import {
  getPostingReadiness,
  getPostingReadinessMessage,
} from "@/lib/posting-validation";
import {
  copyFacebookListingValue,
  openListingDraft,
} from "@/lib/listing-posting";
import { updateInventoryItemFacebookStatus } from "@/lib/inventory-store";
import {
  displayNumber,
  displayPhotoUri,
  displayQuantity,
  displaySoldPrice,
  displayText,
  getListedPlatforms,
  hasListedPlatform,
} from "./inventory-helpers";
import type { InventoryStyles } from "./inventory-styles";

const showItemTools = () => false;

type InventoryItemCardProps = {
  item: InventoryItem;
  styles: InventoryStyles;
  getPalletName: (palletId: string) => string;
  openItemDetails: (item: InventoryItem) => void;
  confirmUnmarkListed: (item: InventoryItem, platform: "facebook" | "ebay") => void;
  showItemActionMenu: (item: InventoryItem) => void;
  removeItem: (item: InventoryItem) => void;
  editingSoldItemId: number | null;
  setEditingSoldItemId: Dispatch<SetStateAction<number | null>>;
  editingFacebookUrlItemId: number | null;
  setEditingFacebookUrlItemId: Dispatch<SetStateAction<number | null>>;
  setSoldDrafts: Dispatch<SetStateAction<Record<number, string>>>;
  setFacebookUrlDrafts: Dispatch<SetStateAction<Record<number, string>>>;
  getSoldDraftValue: (item: InventoryItem) => string;
  getFacebookUrlDraftValue: (item: InventoryItem) => string;
  saveSoldPrice: (item: InventoryItem) => void;
  clearSoldPrice: (item: InventoryItem) => void;
  pasteFacebookUrl: (item: InventoryItem) => Promise<void>;
  saveFacebookUrl: (item: InventoryItem) => void;
  clearFacebookUrl: (item: InventoryItem) => void;
};

export const InventoryItemCard = ({
  item,
  styles,
  getPalletName,
  openItemDetails,
  confirmUnmarkListed,
  showItemActionMenu,
  removeItem,
  editingSoldItemId,
  setEditingSoldItemId,
  editingFacebookUrlItemId,
  setEditingFacebookUrlItemId,
  setSoldDrafts,
  setFacebookUrlDrafts,
  getSoldDraftValue,
  getFacebookUrlDraftValue,
  saveSoldPrice,
  clearSoldPrice,
  pasteFacebookUrl,
  saveFacebookUrl,
  clearFacebookUrl,
}: InventoryItemCardProps) => {
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

  const itemPhotoUri = displayPhotoUri(item.photo);
  const itemSoldPrice = displaySoldPrice(item.soldPrice);
  const itemQuantity = displayQuantity(item.quantity);
  const facebookListingUrl = displayPhotoUri(item.facebookListingUrl);
  const ebayListingUrl = displayPhotoUri(item.ebayListingUrl);
  return (
  <View style={styles.itemCard}>
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
};
