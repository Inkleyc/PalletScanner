export type ApiClientConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  ebayApiBaseUrl?: string;
};

export type ApiClient = {
  config: ApiClientConfig;
};

export const createApiClient = (config: ApiClientConfig): ApiClient => ({
  config,
});

export type EbayConnectionStatus = {
  configured: boolean;
  connected: boolean;
  readyToList?: boolean;
  readinessChecks?: {
    key: string;
    label: string;
    ok: boolean;
  }[];
  missingRequirements?: string[];
  environment: string;
  marketplaceId: string;
  authMode: string;
  locale?: string;
  scopes?: string[];
  callbackPath?: string;
  categoryId?: string | null;
  merchantLocationKey?: string | null;
  paymentPolicyId?: string | null;
  returnPolicyId?: string | null;
  fulfillmentPolicyId?: string | null;
};

export type EbayListingPhotoPayload =
  | {
      url: string;
    }
  | {
      base64: string;
      mimeType: string;
      filename: string;
    };

export type CreateEbayListingPayload = {
  itemId: number;
  offerId?: string;
  listingId?: string;
  title: string;
  description: string;
  price: number;
  floorPrice: number;
  condition: string;
  quantity: number;
  photos: EbayListingPhotoPayload[];
  product: {
    name: string;
  };
};

export type CreateEbayListingResponse = {
  listingId?: string;
  listingUrl?: string;
  sku?: string;
  offerId?: string;
  categoryId?: string;
  categoryName?: string;
  duplicateRecovered?: boolean;
  updated?: boolean;
};

type FetchLike = typeof fetch;

type EbayApiClientConfig = {
  baseUrl?: string;
  getAuthToken?: () => Promise<string | null | undefined>;
  fetchImpl?: FetchLike;
};

const normalizeBaseUrl = (baseUrl?: string) => baseUrl?.trim().replace(/\/$/, "") ?? "";

const parseEbayErrorMessage = async (response: Response, fallback: string) => {
  const rawMessage = await response.text();
  if (!rawMessage) {
    return fallback;
  }

  try {
    const outer = JSON.parse(rawMessage);
    const inner =
      typeof outer.error === "string" ? JSON.parse(outer.error) : outer;
    return (
      inner?.errors?.[0]?.longMessage ||
      inner?.errors?.[0]?.message ||
      outer.error ||
      rawMessage
    );
  } catch {
    return rawMessage;
  }
};

export const createEbayApiClient = ({
  baseUrl,
  getAuthToken,
  fetchImpl = fetch,
}: EbayApiClientConfig) => {
  const getBaseUrl = () => normalizeBaseUrl(baseUrl);
  const isConfigured = () => Boolean(getBaseUrl());

  const getHeaders = async (json = false): Promise<Record<string, string>> => {
    const token = (await getAuthToken?.())?.trim();
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const request = async (path: string, init: RequestInit = {}) => {
    const normalizedBaseUrl = getBaseUrl();
    if (!normalizedBaseUrl) {
      throw new Error("eBay API backend URL is not configured.");
    }

    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(
        await parseEbayErrorMessage(
          response,
          `eBay backend request failed with status ${response.status}`,
        ),
      );
    }

    return response;
  };

  return {
    isConfigured,
    getBaseUrl,
    getConnectUrl: async () => {
      const response = await request("/ebay/connect-url", {
        headers: await getHeaders(),
      });
      const payload = (await response.json()) as { authorizationUrl: string };
      return payload.authorizationUrl;
    },
    disconnectAccount: async () => {
      await request("/ebay/disconnect", {
        method: "POST",
        headers: await getHeaders(),
      });
    },
    endListing: async (offerId: string) => {
      await request("/ebay/listings/end", {
        method: "POST",
        headers: await getHeaders(true),
        body: JSON.stringify({ offerId }),
      });
    },
    getConnectionStatus: async () => {
      const response = await request("/ebay/status", {
        headers: await getHeaders(),
      });
      return (await response.json()) as EbayConnectionStatus;
    },
    createListing: async (payload: CreateEbayListingPayload) => {
      const response = await request("/ebay/listings", {
        method: "POST",
        headers: await getHeaders(true),
        body: JSON.stringify(payload),
      });
      return (await response.json()) as CreateEbayListingResponse;
    },
  };
};
