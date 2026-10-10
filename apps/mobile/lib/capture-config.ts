import type { ImageAssetLike } from "@/lib/inventory-item-drafts";

export const CAPTURE_LOADING_MESSAGES = [
  "Identifying item...",
  "Checking market prices...",
  "Writing your listing...",
];

export const MAX_LISTING_PHOTOS = 5;
export const RECOMMENDED_LISTING_PHOTOS = 3;

export const getImageUri = (image: ImageAssetLike) =>
  typeof image.uri === "string" && image.uri.trim().length > 0
    ? image.uri
    : null;
