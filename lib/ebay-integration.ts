import type { InventoryItem } from "@/lib/inventory-store";

const EBAY_API_BASE_URL = process.env.EXPO_PUBLIC_EBAY_API_BASE_URL ?? "";

type CreateEbayListingResponse = {
  listingId?: string;
  listingUrl?: string;
};

export const isEbayApiConfigured = () => Boolean(EBAY_API_BASE_URL.trim());

export const getEbayApiBaseUrl = () => EBAY_API_BASE_URL.trim().replace(/\/$/, "");

export const createEbayListing = async (item: InventoryItem) => {
  if (!isEbayApiConfigured()) {
    throw new Error("eBay API backend is not configured.");
  }

  const response = await fetch(`${getEbayApiBaseUrl()}/ebay/listings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: item.listing_title,
      description: item.listing_description,
      price: item.high_price,
      floorPrice: item.floor_price,
      condition: item.condition,
      quantity: 1,
      photoUrl: item.photo,
      product: {
        name: item.name,
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `eBay listing failed with status ${response.status}`);
  }

  return (await response.json()) as CreateEbayListingResponse;
};

export const getEbayIntegrationStatusLabel = () =>
  isEbayApiConfigured() ? "Connected to backend" : "Using browser fallback";
