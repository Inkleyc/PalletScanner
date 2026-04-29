import * as Clipboard from "expo-clipboard";
import { Alert, Linking } from "react-native";

import { createEbayListing, isEbayApiConfigured } from "@/lib/ebay-integration";
import { triggerCopyFeedback } from "@/lib/feedback";
import {
  markInventoryItemListed,
  type InventoryItem,
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
  },
) => {
  if (platform === "ebay" && isEbayApiConfigured()) {
    try {
      const result = await createEbayListing(item);
      markInventoryItemListed(item.id, platform);

      if (options?.showSuccessAlert !== false) {
        Alert.alert(
          "eBay listing created",
          result.listingId
            ? `Your eBay listing was created successfully. Listing ID: ${result.listingId}`
            : "Your eBay listing was created successfully.",
        );
      }
      return;
    } catch (error) {
      Alert.alert(
        "eBay API listing failed",
        error instanceof Error
          ? `${error.message}\n\nFalling back to the browser listing flow.`
          : "Falling back to the browser listing flow.",
      );
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
