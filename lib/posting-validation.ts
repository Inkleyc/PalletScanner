import type { InventoryItem } from "@/lib/inventory-store";

export type PostingPlatform = "facebook" | "ebay";

type PostingReadiness = {
  ready: boolean;
  errors: string[];
  warnings: string[];
};

const hasListingPhoto = (item: InventoryItem) =>
  Boolean(
    (Array.isArray(item.photos) && item.photos.length > 0) ||
      item.photo,
  );

const hasText = (value: string | null | undefined) =>
  typeof value === "string" && value.trim().length > 0;

const getPlatformTitle = (item: InventoryItem, platform: PostingPlatform) =>
  platform === "facebook"
    ? item.listing_title_facebook || item.listing_title
    : item.listing_title_ebay || item.listing_title;

const getPlatformDescription = (
  item: InventoryItem,
  platform: PostingPlatform,
) =>
  platform === "facebook"
    ? item.listing_description_facebook || item.listing_description
    : item.listing_description_ebay || item.listing_description;

export const getPostingReadiness = (
  item: InventoryItem,
  platform: PostingPlatform,
): PostingReadiness => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const platformLabel = platform === "facebook" ? "Facebook" : "eBay";
  const title = getPlatformTitle(item, platform);
  const description = getPlatformDescription(item, platform);

  if (!hasText(title)) {
    errors.push(`${platformLabel} title is missing.`);
  }

  if (!hasText(description)) {
    errors.push(`${platformLabel} description is missing.`);
  }

  if (!hasText(item.condition)) {
    errors.push("Condition is missing.");
  }

  if (
    typeof item.high_price !== "number" ||
    Number.isNaN(item.high_price) ||
    item.high_price <= 0
  ) {
    errors.push("Posting price is missing.");
  }

  if (
    typeof item.quantity !== "number" ||
    Number.isNaN(item.quantity) ||
    item.quantity <= 0
  ) {
    errors.push("Quantity is missing.");
  }

  if (!hasListingPhoto(item)) {
    errors.push("At least one listing photo is required.");
  }

  if (platform === "facebook") {
    if (description && description.length < 60) {
      warnings.push("Facebook description is short.");
    }
    if (title && title.length > 100) {
      warnings.push("Facebook title may be too long.");
    }
  }

  if (platform === "ebay") {
    if (title && title.length > 80) {
      errors.push("eBay title must be 80 characters or less.");
    }
    if (
      typeof item.floor_price !== "number" ||
      Number.isNaN(item.floor_price) ||
      item.floor_price < 0
    ) {
      errors.push("Floor price is missing.");
    }
  }

  return {
    ready: errors.length === 0,
    errors,
    warnings,
  };
};

export const getPostingReadinessMessage = (
  item: InventoryItem,
  platform: PostingPlatform,
) => {
  const readiness = getPostingReadiness(item, platform);
  if (readiness.ready && readiness.warnings.length === 0) {
    return "Ready to post";
  }

  if (!readiness.ready) {
    return readiness.errors.join("\n");
  }

  return readiness.warnings.join("\n");
};
