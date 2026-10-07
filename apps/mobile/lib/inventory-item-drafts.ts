import type { ListingDraftMap } from "@/lib/listing-drafts";
import type { CaptureAnalysisResult, InventoryItem } from "@palletscanner/core";

export type ImageAssetLike = {
  base64?: string | null;
  mimeType?: string | null;
  uri?: string | null;
};

type BuildInventoryItemDraftInput = {
  currentItemId: number | null;
  palletId: string;
  analysis: Pick<CaptureAnalysisResult, "name" | "condition" | "best_platform" | "ebay_item_specifics">;
  listingDrafts: ListingDraftMap;
  images: ImageAssetLike[];
  productImageUri: string | null;
  priceRange: {
    low: number;
    high: number;
  };
  floorPrice: number;
};

export const buildInventoryItemDraft = ({
  currentItemId,
  palletId,
  analysis,
  listingDrafts,
  images,
  productImageUri,
  priceRange,
  floorPrice,
}: BuildInventoryItemDraftInput): InventoryItem => {
  const imageUris = images
    .map((image) => image.uri)
    .filter((uri): uri is string => Boolean(uri))
    .slice(0, 5);
  const photos =
    imageUris.length > 0 ? imageUris : productImageUri ? [productImageUri] : [];

  return {
    id: currentItemId ?? Date.now(),
    photo: photos[0] ?? null,
    photos,
    name: analysis.name?.trim() || "Untitled item",
    condition: analysis.condition?.trim() || "Unknown",
    quantity: 1,
    low_price: priceRange.low,
    high_price: priceRange.high,
    floor_price: Math.min(floorPrice, priceRange.high),
    listing_price: priceRange.high,
    best_platform: analysis.best_platform?.trim() || "Review",
    listing_title: listingDrafts.general.title,
    listing_description: listingDrafts.general.description,
    listing_title_facebook: listingDrafts.facebook.title,
    listing_description_facebook: listingDrafts.facebook.description,
    listing_title_ebay: listingDrafts.ebay.title,
    listing_description_ebay: listingDrafts.ebay.description,
    ebayItemSpecifics: analysis.ebay_item_specifics,
    listedPlatforms: [],
    palletId,
    soldPrice: null,
  };
};

export const duplicateInventoryItemDraft = (
  item: InventoryItem,
  quantity: number,
) =>
  Array.from({ length: quantity }, (_, index) => ({
    ...item,
    id: item.id + index,
  }));
