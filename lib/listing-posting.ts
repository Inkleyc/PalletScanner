import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";

import { AppAlert as Alert } from "@/lib/app-alert";
import { getAppSettings } from "@/lib/app-settings";
import { createEbayListing, isEbayApiConfigured } from "@/lib/ebay-integration";
import { triggerCopyFeedback } from "@/lib/feedback";
import {
  markInventoryItemListed,
  type InventoryItem,
  updateInventoryItemEbayStatus,
  updateInventoryItemFacebookStatus,
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

export const buildFacebookListingPackage = (item: InventoryItem) => {
  const content = getListingContentForPlatform(item, "facebook");
  const sellerNote = getAppSettings().facebookSellerNote.trim();
  const description = sellerNote
    ? `${content.description}\n\n${sellerNote}`
    : content.description;
  const photos = item.photos?.length
    ? item.photos
    : item.photo
      ? [item.photo]
      : [];
  const photoChecklist =
    "Main front shot, model/label, condition flaws, accessories, charging ports, and any serial/model details.";

  return {
    title: content.title,
    price: String(item.high_price),
    description,
    condition: item.condition,
    quantity: String(item.quantity ?? 1),
    photoCount: photos.length,
    photoChecklist,
    sellerNote,
    fullText: [
      content.title,
      `Price: $${item.high_price}`,
      `Condition: ${item.condition}`,
      `Quantity: ${item.quantity ?? 1}`,
      "",
      description,
    ].join("\n"),
  };
};

export const buildListingText = (
  item: InventoryItem,
  platform: "facebook" | "ebay" = "facebook",
) => {
  if (platform === "facebook") {
    return buildFacebookListingPackage(item).fullText;
  }

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

const copyFacebookValue = async (
  item: InventoryItem,
  label: string,
  value: string,
) => {
  await Clipboard.setStringAsync(value);
  void triggerCopyFeedback();
  showFacebookPostingGuide(item, `${label} copied.`);
};

export const copyFacebookListingValue = async (
  item: InventoryItem,
  label:
    | "Title"
    | "Price"
    | "Description"
    | "Condition"
    | "Quantity"
    | "Photo checklist"
    | "Full listing",
) => {
  const facebookPackage = buildFacebookListingPackage(item);
  const valueByLabel = {
    Title: facebookPackage.title,
    Price: facebookPackage.price,
    Description: facebookPackage.description,
    Condition: facebookPackage.condition,
    Quantity: facebookPackage.quantity,
    "Photo checklist": facebookPackage.photoChecklist,
    "Full listing": facebookPackage.fullText,
  };

  await Clipboard.setStringAsync(valueByLabel[label]);
  void triggerCopyFeedback();
  Alert.alert(`${label} copied`, "Ready to paste into Facebook Marketplace.");
};

const markFacebookListed = (item: InventoryItem) => {
  updateInventoryItemFacebookStatus(item.id, { status: "listed" });
  Alert.alert(
    "Facebook listing marked",
    "The item is now marked as listed to Facebook in your inventory. Add the final listing URL from the inventory card when you have it.",
  );
};

const showFacebookPostingGuide = (
  item: InventoryItem,
  statusMessage?: string,
) => {
  const facebookPackage = buildFacebookListingPackage(item);
  const photoMessage =
    facebookPackage.photoCount > 0
      ? `Add the ${facebookPackage.photoCount} saved photo${
          facebookPackage.photoCount === 1 ? "" : "s"
        } from this item, then paste each field as needed.`
      : "Add photos before publishing if you have them.";

  Alert.alert(
    statusMessage ?? "Facebook Marketplace opened",
    `${photoMessage}\n\nPhoto checklist: ${facebookPackage.photoChecklist}\n\nThe full listing is already copied. Use these buttons when Facebook asks for a specific field.`,
    [
      {
        text: "Copy Title",
        onPress: () => {
          void copyFacebookValue(item, "Title", facebookPackage.title);
        },
      },
      {
        text: "Copy Price",
        onPress: () => {
          void copyFacebookValue(item, "Price", facebookPackage.price);
        },
      },
      {
        text: "Copy Description",
        onPress: () => {
          void copyFacebookValue(
            item,
            "Description",
            facebookPackage.description,
          );
        },
      },
      {
        text: "Copy Condition",
        onPress: () => {
          void copyFacebookValue(item, "Condition", facebookPackage.condition);
        },
      },
      {
        text: "Copy Quantity",
        onPress: () => {
          void copyFacebookValue(item, "Quantity", facebookPackage.quantity);
        },
      },
      {
        text: "Copy Photo Checklist",
        onPress: () => {
          void copyFacebookValue(
            item,
            "Photo checklist",
            facebookPackage.photoChecklist,
          );
        },
      },
      {
        text: "Copy All",
        onPress: () => {
          void copyFacebookValue(item, "Full listing", facebookPackage.fullText);
        },
      },
      {
        text: "Mark Listed",
        onPress: () => markFacebookListed(item),
      },
      { text: "Done", style: "cancel" },
    ],
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

  const ebayUrl = "https://www.ebay.com/sl/sell";
  const platformLabel =
    platform === "facebook" ? "Facebook Marketplace" : "eBay";

  try {
    const listingText = buildListingText(item, platform);
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
        updateInventoryItemFacebookStatus(item.id, {
          status: "error",
          error: "Facebook Marketplace could not be opened.",
        });
        Alert.alert(
          "Link unavailable",
          "Facebook Marketplace could not be opened, but the listing text is copied and ready to paste.",
        );
        return;
      }

      updateInventoryItemFacebookStatus(item.id, { status: "opened" });
      if (options?.showSuccessAlert !== false) {
        showFacebookPostingGuide(item);
      }
      return;
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
        "The listing details were copied to your clipboard so you can paste them into the new listing.",
      );
    }
  } catch (error) {
    if (platform === "facebook") {
      updateInventoryItemFacebookStatus(item.id, {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to open Facebook listing flow.",
      });
    }
    Alert.alert(
      "Unable to open listing flow",
      `I copied the listing details, but couldn't open ${platformLabel}.`,
    );
  }
};
