import type { CaptureAnalysisResult } from "@palletscanner/core";

import type { BarcodeLookupItem } from "@/lib/barcode-lookup";

const describeProduct = (product?: BarcodeLookupItem | null) =>
  [
    product?.brand ? `${product.brand}` : null,
    product?.title ? `${product.title}` : null,
    product?.category ? `Category: ${product.category}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

export const createPhotoFallbackDraft = (): CaptureAnalysisResult => ({
  name: "Unidentified pallet item",
  description:
    "Photo draft created without online analysis. Review the item name, condition, and price before listing.",
  condition: "Used - needs review",
  low_price: 10,
  high_price: 30,
  floor_price: 8,
  best_platform: "Facebook",
  platform_reason:
    "Use Facebook first until the item is identified and priced more precisely.",
  listing_title: "Unidentified Pallet Item - Review Needed",
  listing_description:
    "Item from pallet inventory. Please review photos, confirm condition, and update details before posting.",
  listing_title_facebook: "Pallet Item - Details Pending",
  listing_description_facebook:
    "Item from pallet inventory. Photos show the current condition. Message with questions.",
  listing_title_ebay: "Pallet Item Details Pending Review",
  listing_description_ebay:
    "Item from pallet inventory. Review photos carefully and confirm details before purchase.",
  photo_tips:
    "Add clear photos of the front, back, label/model number, accessories, and any damage.",
  photo_example_queries: ["similar item listing photos", "used item resale photos"],
  sellability_score: 5,
  sellability_reason:
    "This can be saved now, but it needs review before confident pricing or listing.",
});

export const createBarcodeFallbackDraft = (
  barcode: string,
  product?: BarcodeLookupItem | null,
): CaptureAnalysisResult => {
  const productLabel = product?.title?.trim() || `Barcode item ${barcode}`;
  const productDetails = describeProduct(product);

  return {
    name: productLabel,
    description:
      productDetails ||
      `Barcode ${barcode} did not return enough online detail. Review the item before listing.`,
    condition: "Used - needs review",
    low_price: 10,
    high_price: 30,
    floor_price: 8,
    best_platform: "Facebook",
    platform_reason:
      "Use Facebook first until pricing and condition are verified.",
    listing_title: productLabel.slice(0, 80),
    listing_description:
      productDetails ||
      `Item scanned from pallet inventory with barcode ${barcode}. Review photos and condition before posting.`,
    listing_title_facebook: productLabel.slice(0, 80),
    listing_description_facebook:
      productDetails ||
      `Pallet inventory item with barcode ${barcode}. Message with questions.`,
    listing_title_ebay: productLabel.slice(0, 80),
    listing_description_ebay:
      productDetails ||
      `Pallet inventory item with barcode ${barcode}. Review photos and details before buying.`,
    photo_tips:
      "Photograph the barcode, front, back, model label, accessories, and condition issues.",
    photo_example_queries: [
      `${productLabel} used listing`,
      `${productLabel} resale price`,
    ],
    sellability_score: 5,
    sellability_reason:
      "The barcode path produced a saveable draft, but pricing still needs review.",
  };
};
