import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";

import { AppAlert as Alert } from "@/lib/app-alert";
import { createEbayListing, isEbayApiConfigured } from "@/lib/ebay-integration";
import { triggerCopyFeedback } from "@/lib/feedback";
import {
  markInventoryItemListed,
  type InventoryItem,
  updateInventoryItemEbayStatus,
} from "@/lib/inventory-store";

const FACEBOOK_LISTING_URLS = [
  "fb://marketplace/create/item",
  "fb://facewebmodal/f?href=https://www.facebook.com/marketplace/create/item",
  "https://www.facebook.com/marketplace/create/item",
] as const;

const getListingContentForPlatform = (
  item: InventoryItem,
  platform: "facebook" | "ebay",
) => {
  if (platform === "facebook") {
    return {
      title: item.listing_title_facebook || item.listing_title,
      description:
        item.listing_description_facebook || item.listing_description,
    };
  }

  return {
    title: item.listing_title_ebay || item.listing_title,
    description: item.listing_description_ebay || item.listing_description,
  };
};

export const buildListingText = (
  item: InventoryItem,
  platform: "facebook" | "ebay" = "facebook",
) => {
  const content = getListingContentForPlatform(item, platform);

  return (
  [
    content.title,
    `Price: $${item.low_price}-$${item.high_price}`,
    `Condition: ${item.condition}`,
    `Best platform: ${item.best_platform}`,
    "",
    content.description,
  ].join("\n")
  );
};

export const openListingDraft = async (
  item: InventoryItem,
  platform: "facebook" | "ebay",
  options?: {
    showSuccessAlert?: boolean;
    onProgress?: (message: string) => void;
  },
) => {
  if (platform === "ebay" && isEbayApiConfigured()) {
    updateInventoryItemEbayStatus(item.id, {
      status: "posting",
      progress: "Preparing listing",
    });
    options?.onProgress?.("Preparing listing");
    try {
      const result = await createEbayListing(item, (message) => {
        updateInventoryItemEbayStatus(item.id, {
          status: "posting",
          progress: message,
        });
        options?.onProgress?.(message);
      });
      updateInventoryItemEbayStatus(item.id, {
        status: "active",
        listingId: result.listingId,
        listingUrl: result.listingUrl,
        sku: result.sku,
        offerId: result.offerId,
        categoryId: result.categoryId,
        categoryName: result.categoryName,
      });

      if (options?.showSuccessAlert !== false) {
        const message = result.categoryName
          ? `Published in ${result.categoryName}.`
          : "Your eBay listing was created successfully.";
        Alert.alert(
          result.updated ? "eBay listing updated" : "eBay listing created",
          result.listingId
            ? `${
                result.updated
                  ? "Your existing eBay listing was updated."
                  : message
              }\n\nListing ID: ${result.listingId}`
            : message,
          result.listingUrl
            ? [
                { text: "Done", style: "cancel" },
                {
                  text: "View on eBay",
                  onPress: () => {
                    void Linking.openURL(result.listingUrl as string);
                  },
                },
              ]
            : undefined,
        );
      }
      return;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown eBay listing error.";
      updateInventoryItemEbayStatus(item.id, {
        status: "error",
        error: errorMessage,
      });
      Alert.alert(
        "eBay API listing failed",
        error instanceof Error
          ? `${error.message}\n\nThe item was not marked as listed. Fix the issue and try again.`
          : "The item was not marked as listed. Fix the issue and try again.",
      );
      return;
    }
  }

  const listingText = buildListingText(item, platform);
  const ebayUrl = "https://www.ebay.com/sl/sell";
  const platformLabel =
    platform === "facebook" ? "Facebook Marketplace" : "eBay";

  try {
    await Clipboard.setStringAsync(listingText);
    void triggerCopyFeedback();
    if (platform === "facebook") {
      let opened = false;

      for (const candidateUrl of FACEBOOK_LISTING_URLS) {
        try {
          await Linking.openURL(candidateUrl);
          opened = true;
          break;
        } catch {
          // Try the next Marketplace route.
        }
      }

      if (!opened) {
        Alert.alert(
          "Link unavailable",
          "Facebook Marketplace could not be opened, but the listing text is copied and ready to paste.",
        );
        return;
      }
    } else {
      const supported = await Linking.canOpenURL(ebayUrl);

      if (!supported) {
        Alert.alert(
          "Link unavailable",
          `${platformLabel} could not be opened, but the listing text is copied and ready to paste.`,
        );
        return;
      }

      await Linking.openURL(ebayUrl);
    }

    markInventoryItemListed(item.id, platform);
    if (options?.showSuccessAlert !== false) {
      Alert.alert(
        `${platformLabel} opened`,
        platform === "facebook"
          ? "The listing details were copied to your clipboard so you can paste them into the new Marketplace listing."
          : "The listing details were copied to your clipboard so you can paste them into the new listing.",
      );
    }
  } catch {
    Alert.alert(
      "Unable to open listing flow",
      `I copied the listing details, but couldn't open ${platformLabel}.`,
    );
  }
};
