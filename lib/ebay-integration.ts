import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import type { InventoryItem } from "@/lib/inventory-store";
import { browserUriToDataUri } from "@/lib/web-storage";

const EBAY_API_BASE_URL = process.env.EXPO_PUBLIC_EBAY_API_BASE_URL ?? "";
const APP_AUTH_TOKEN = process.env.EXPO_PUBLIC_PALLETSCANNER_AUTH_TOKEN ?? "";

type CreateEbayListingResponse = {
  listingId?: string;
  listingUrl?: string;
  sku?: string;
  offerId?: string;
  categoryId?: string;
  categoryName?: string;
  duplicateRecovered?: boolean;
  updated?: boolean;
};

export type EbayConnectionStatus = {
  configured: boolean;
  connected: boolean;
  environment: string;
  marketplaceId: string;
  authMode: string;
};

export const isEbayApiConfigured = () => Boolean(EBAY_API_BASE_URL.trim());

export const getEbayApiBaseUrl = () => EBAY_API_BASE_URL.trim().replace(/\/$/, "");

const getEbayRequestHeaders = () => ({
  ...(APP_AUTH_TOKEN.trim()
    ? { Authorization: `Bearer ${APP_AUTH_TOKEN.trim()}` }
    : {}),
});

export const getEbayConnectUrl = async () => {
  const response = await fetch(`${getEbayApiBaseUrl()}/ebay/connect-url`, {
    headers: getEbayRequestHeaders(),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = (await response.json()) as { authorizationUrl: string };
  return payload.authorizationUrl;
};

export const disconnectEbayAccount = async () => {
  const response = await fetch(`${getEbayApiBaseUrl()}/ebay/disconnect`, {
    method: "POST",
    headers: getEbayRequestHeaders(),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
};

export const endEbayListing = async (offerId: string) => {
  if (!isEbayApiConfigured()) {
    throw new Error("eBay API backend is not configured.");
  }

  const response = await fetch(`${getEbayApiBaseUrl()}/ebay/listings/end`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getEbayRequestHeaders(),
    },
    body: JSON.stringify({ offerId }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || "Unable to end eBay listing.");
  }
};

export const getEbayConnectionStatus = async () => {
  const response = await fetch(`${getEbayApiBaseUrl()}/ebay/status`, {
    headers: getEbayRequestHeaders(),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as EbayConnectionStatus;
};

export const createEbayListing = async (
  item: InventoryItem,
  onProgress?: (message: string) => void,
) => {
  if (!isEbayApiConfigured()) {
    throw new Error("eBay API backend is not configured.");
  }

  const title = item.listing_title_ebay || item.listing_title;
  const description = item.listing_description_ebay || item.listing_description;
  const photoUris =
    item.photos && item.photos.length > 0
      ? item.photos.slice(0, 5)
      : item.photo
        ? [item.photo]
        : [];
  const photos = await Promise.all(
    photoUris.map(async (uri, index) => {
      onProgress?.(
        `Preparing photo ${index + 1} of ${photoUris.length}`,
      );
      if (/^https:\/\//i.test(uri)) {
        return { url: uri };
      }

      const dataUri =
        Platform.OS === "web" ? await browserUriToDataUri(uri) : null;
      const base64 =
        dataUri?.split(",")[1] ??
        (await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        }));
      const extension = uri.split("?")[0]?.split(".").pop()?.toLowerCase();
      const dataMimeType = dataUri?.match(/^data:([^;]+);base64,/)?.[1];
      const mimeType = dataMimeType
        ? dataMimeType
        : extension === "png"
          ? "image/png"
          : extension === "heic" || extension === "heif"
            ? "image/heic"
            : "image/jpeg";
      return {
        base64,
        mimeType,
        filename: `item-${item.id}-${index + 1}.${extension || "jpg"}`,
      };
    }),
  );
  onProgress?.(
    photos.length > 0 ? "Uploading photos to eBay" : "Creating eBay listing",
  );

  const response = await fetch(`${getEbayApiBaseUrl()}/ebay/listings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getEbayRequestHeaders(),
    },
    body: JSON.stringify({
      itemId: item.id,
      offerId: item.ebayOfferId,
      listingId: item.ebayListingId,
      title,
      description,
      price: item.high_price,
      floorPrice: item.floor_price,
      condition: item.condition,
      quantity: 1,
      photos,
      product: {
        name: item.name,
      },
    }),
  });

  if (!response.ok) {
    const rawMessage = await response.text();
    let message = rawMessage;
    try {
      const outer = JSON.parse(rawMessage);
      const inner =
        typeof outer.error === "string" ? JSON.parse(outer.error) : outer;
      message =
        inner?.errors?.[0]?.longMessage ||
        inner?.errors?.[0]?.message ||
        outer.error ||
        rawMessage;
    } catch {
      // Keep the raw response when eBay did not return structured JSON.
    }
    throw new Error(
      message || `eBay listing failed with status ${response.status}`,
    );
  }

  onProgress?.("Publishing listing");
  return (await response.json()) as CreateEbayListingResponse;
};

export const getEbayIntegrationStatusLabel = () =>
  isEbayApiConfigured() ? "Connected to backend" : "Using browser fallback";
