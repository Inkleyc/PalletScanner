import * as Clipboard from "expo-clipboard";
import { Alert, Linking } from "react-native";

import {
  markInventoryItemListed,
  type InventoryItem,
} from "@/lib/inventory-store";

export const buildListingText = (item: InventoryItem) =>
  [
    item.listing_title,
    `Price: $${item.low_price}-$${item.high_price}`,
    `Condition: ${item.condition}`,
    `Best platform: ${item.best_platform}`,
    "",
    item.listing_description,
  ].join("\n");

export const openListingDraft = async (
  item: InventoryItem,
  platform: "facebook" | "ebay",
) => {
  markInventoryItemListed(item.id, platform);

  const listingText = buildListingText(item);
  const url =
    platform === "facebook"
      ? "https://www.facebook.com/marketplace/create/item"
      : "https://www.ebay.com/sl/sell";
  const platformLabel =
    platform === "facebook" ? "Facebook Marketplace" : "eBay";

  try {
    await Clipboard.setStringAsync(listingText);
    const supported = await Linking.canOpenURL(url);

    if (!supported) {
      Alert.alert(
        "Link unavailable",
        `${platformLabel} could not be opened, but the listing text is copied and ready to paste.`,
      );
      return;
    }

    await Linking.openURL(url);
    Alert.alert(
      `${platformLabel} opened`,
      "The listing details were copied to your clipboard so you can paste them into the new listing.",
    );
  } catch {
    Alert.alert(
      "Unable to open listing flow",
      `I copied the listing details, but couldn't open ${platformLabel}.`,
    );
  }
};
