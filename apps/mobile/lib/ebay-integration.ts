import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
  createEbayApiClient,
  type CreateEbayListingResponse,
  type EbayConnectionStatus,
  type EbayListingRequirements,
} from "@palletscanner/api-client";

import type { InventoryItem } from "@/lib/inventory-store";
import { getRuntimeBearerToken } from "@/lib/app-auth";
import { browserUriToDataUri } from "@/lib/web-storage";

export type { EbayConnectionStatus } from "@palletscanner/api-client";

const EBAY_API_BASE_URL =
  process.env.EXPO_PUBLIC_AI_API_BASE_URL ??
  process.env.EXPO_PUBLIC_EBAY_API_BASE_URL ??
  "";
const APP_AUTH_TOKEN = process.env.EXPO_PUBLIC_PALLETSCANNER_AUTH_TOKEN ?? "";

const getEbayAuthToken = async () => {
  const runtimeToken = await getRuntimeBearerToken();
  return runtimeToken || APP_AUTH_TOKEN.trim();
};

const ebayApi = createEbayApiClient({
  baseUrl: EBAY_API_BASE_URL,
  getAuthToken: getEbayAuthToken,
});

export const isEbayApiConfigured = () => ebayApi.isConfigured();

export const getEbayApiBaseUrl = () => ebayApi.getBaseUrl();

export const getEbayConnectUrl = () => ebayApi.getConnectUrl();

export const disconnectEbayAccount = () => ebayApi.disconnectAccount();

export const endEbayListing = async (offerId: string) => {
  if (!isEbayApiConfigured()) {
    throw new Error("eBay API backend is not configured.");
  }

  await ebayApi.endListing(offerId);
};

export const getEbayConnectionStatus = (): Promise<EbayConnectionStatus> =>
  ebayApi.getConnectionStatus();

const buildEbayListingPayload = async (
  item: InventoryItem,
  onProgress?: (message: string) => void,
) => {
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
      if (/^https?:\/\//i.test(uri)) {
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

  return {
    itemId: item.id,
    offerId: item.ebayOfferId,
    listingId: item.ebayListingId,
    title,
    description,
    price: item.listing_price ?? item.high_price,
    floorPrice: item.floor_price,
    condition: item.condition,
    category: item.category,
    quantity: 1,
    itemSpecifics: item.ebayItemSpecifics,
    photos,
    product: {
      name: item.name,
    },
  };
};

export const getEbayListingRequirements = async (
  item: InventoryItem,
): Promise<EbayListingRequirements> => {
  if (!isEbayApiConfigured()) {
    throw new Error("eBay API backend is not configured.");
  }
  return ebayApi.getListingRequirements(await buildEbayListingPayload(item));
};

export const createEbayListing = async (
  item: InventoryItem,
  onProgress?: (message: string) => void,
) => {
  if (!isEbayApiConfigured()) {
    throw new Error("eBay API backend is not configured.");
  }

  const listingPayload = await buildEbayListingPayload(item, onProgress);

  onProgress?.("Publishing listing");
  return (await ebayApi.createListing(
    listingPayload,
  )) as CreateEbayListingResponse;
};

export const getEbayIntegrationStatusLabel = () =>
  isEbayApiConfigured() ? "Connected to backend" : "Using browser fallback";
