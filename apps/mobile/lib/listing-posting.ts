import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
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
import { getPostingReadiness } from "@/lib/posting-validation";

const FACEBOOK_MARKETPLACE_CREATE_URL =
  "https://m.facebook.com/marketplace/create/item";

const FACEBOOK_LISTING_URLS = [
  `fb://facewebmodal/f?href=${encodeURIComponent(FACEBOOK_MARKETPLACE_CREATE_URL)}`,
  "fb://marketplace/create/item",
  FACEBOOK_MARKETPLACE_CREATE_URL,
] as const;

export type ListingDraftOutcome = {
  status: "blocked" | "posted" | "failed" | "opened";
  title: string;
  message: string;
  listingUrl?: string;
};

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

const openFacebookMarketplaceCreate = async () => {
  try {
    await WebBrowser.openBrowserAsync(FACEBOOK_MARKETPLACE_CREATE_URL);
    return true;
  } catch {
    // Fall back to Facebook app routes below.
  }

  for (const candidateUrl of FACEBOOK_LISTING_URLS) {
    try {
      await Linking.openURL(candidateUrl);
      return true;
    } catch {
      // Try the next Marketplace route.
    }
  }

  return false;
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
): Promise<ListingDraftOutcome> => {
  const readiness = getPostingReadiness(item, platform);
  if (!readiness.ready) {
    const platformLabel = platform === "facebook" ? "Facebook" : "eBay";
    const title = `${platformLabel} needs more details`;
    const message = readiness.errors.join("\n");
    if (options?.showSuccessAlert !== false) {
      Alert.alert(title, message);
    }
    return { status: "blocked", title, message };
  }

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

      const message = result.categoryName
        ? `Published in ${result.categoryName}.`
        : "Your eBay listing was created successfully.";
      const title = result.updated ? "eBay listing updated" : "eBay listing created";
      const detail = result.listingId
        ? `${
            result.updated
              ? "Your existing eBay listing was updated."
              : message
          }\n\nListing ID: ${result.listingId}`
        : message;

      if (options?.showSuccessAlert !== false) {
        Alert.alert(
          title,
          detail,
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
      return {
        status: "posted",
        title,
        message: detail,
        listingUrl: result.listingUrl,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown eBay listing error.";
      updateInventoryItemEbayStatus(item.id, {
        status: "error",
        error: errorMessage,
      });
      const title = "eBay API listing failed";
      const message =
        error instanceof Error
          ? `${error.message}\n\nThe item was not marked as listed. Fix the issue and try again.`
          : "The item was not marked as listed. Fix the issue and try again.";
      if (options?.showSuccessAlert !== false) {
        Alert.alert(title, message);
      }
      return { status: "failed", title, message };
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
      const opened = await openFacebookMarketplaceCreate();

      if (!opened) {
        updateInventoryItemFacebookStatus(item.id, {
          status: "error",
          error: "Facebook Marketplace could not be opened.",
        });
        Alert.alert(
          "Link unavailable",
          "Facebook Marketplace could not be opened, but the listing text is copied and ready to paste.",
        );
        return {
          status: "failed",
          title: "Link unavailable",
          message:
            "Facebook Marketplace could not be opened, but the listing text is copied and ready to paste.",
        };
      }

      updateInventoryItemFacebookStatus(item.id, { status: "opened" });
      if (options?.showSuccessAlert !== false) {
        showFacebookPostingGuide(item);
      }
      return {
        status: "opened",
        title: "Facebook Marketplace opened",
        message: "The listing details were copied and Facebook was opened.",
      };
    } else {
      const supported = await Linking.canOpenURL(ebayUrl);

      if (!supported) {
        const title = "Link unavailable";
        const message = `${platformLabel} could not be opened, but the listing text is copied and ready to paste.`;
        if (options?.showSuccessAlert !== false) {
          Alert.alert(title, message);
        }
        return { status: "failed", title, message };
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
    return {
      status: "opened",
      title: `${platformLabel} opened`,
      message:
        "The listing details were copied to your clipboard so you can paste them into the new listing.",
    };
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
    const title = "Unable to open listing flow";
    const message = `I copied the listing details, but couldn't open ${platformLabel}.`;
    if (options?.showSuccessAlert !== false) {
      Alert.alert(title, message);
    }
    return { status: "failed", title, message };
  }
};
