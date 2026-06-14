import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { authenticateRequest, getAuthMode } from "./auth.mjs";
import { createEbayTokenStore } from "./ebay-token-store.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const dataDirectory = path.join(projectRoot, "server-data");
const tokenFile = path.join(dataDirectory, "ebay-user-token.json");
const tokenStore = createEbayTokenStore({
  dataDirectory,
  legacyTokenFile: tokenFile,
});

const loadEnvFile = async (filename) => {
  try {
    const contents = await readFile(filename, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Missing local env files are fine.
  }
};

await loadEnvFile(path.join(projectRoot, ".env"));
await loadEnvFile(path.join(__dirname, ".env"));

const EBAY_ENVIRONMENT = process.env.EBAY_ENVIRONMENT ?? "production";
const isSandbox = EBAY_ENVIRONMENT === "sandbox";
const authBaseUrl = isSandbox
  ? "https://auth.sandbox.ebay.com"
  : "https://auth.ebay.com";
const apiBaseUrl = isSandbox
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";
const mediaApiBaseUrl = isSandbox
  ? "https://apim.sandbox.ebay.com"
  : "https://apim.ebay.com";
const serverPort = Number(
  process.env.EBAY_SERVER_PORT ?? process.env.PORT ?? 8787,
);
const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";
const currency = process.env.EBAY_CURRENCY ?? "USD";
const locale = process.env.EBAY_LOCALE ?? "en-US";
const fallbackCategoryId = process.env.EBAY_CATEGORY_ID ?? "";
const allowedOrigin = process.env.PALLETSCANNER_ALLOWED_ORIGIN ?? "*";
const listingRateLimit = Number(
  process.env.PALLETSCANNER_LISTING_RATE_LIMIT_PER_MINUTE ?? 20,
);

const ebayScopes =
  process.env.EBAY_SCOPE ??
  [
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
  ].join(" ");

const oauthStates = new Map();
let appTokenCache = null;
let categoryTreeCache = null;
const categoryMetadataCache = new Map();
const listingRateLimits = new Map();

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const validateProductionConfiguration = () => {
  if (!isSandbox) {
    requireEnv("PALLETSCANNER_JWT_SECRET");
    requireEnv("EBAY_TOKEN_ENCRYPTION_KEY");
    if (getAuthMode() !== "jwt") {
      throw new Error("Production requires PALLETSCANNER_AUTH_MODE=jwt.");
    }
    if (allowedOrigin === "*") {
      throw new Error(
        "Production requires a specific PALLETSCANNER_ALLOWED_ORIGIN.",
      );
    }
    if (
      process.env.EBAY_CLIENT_ID?.includes("-SBX-") ||
      process.env.EBAY_CLIENT_SECRET?.startsWith("SBX-")
    ) {
      throw new Error("Sandbox eBay credentials cannot be used in production.");
    }
  }
};

validateProductionConfiguration();

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 30_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const getCorsOrigin = (req) => {
  if (allowedOrigin === "*") {
    return "*";
  }
  return req.headers.origin === allowedOrigin ? allowedOrigin : "null";
};

const sendJson = (req, res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": getCorsOrigin(req),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
};

const sendHtml = (req, res, statusCode, html) => {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": getCorsOrigin(req),
  });
  res.end(html);
};

const buildBasicAuthorization = () => {
  const clientId = requireEnv("EBAY_CLIENT_ID");
  const clientSecret = requireEnv("EBAY_CLIENT_SECRET");
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
};

const getAuthorizationUrl = (userId) => {
  const clientId = requireEnv("EBAY_CLIENT_ID");
  const ruName = requireEnv("EBAY_RUNAME");
  const state = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
  oauthStates.set(state, {
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const url = new URL(`${authBaseUrl}/oauth2/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ebayScopes);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "login");
  url.searchParams.set("locale", locale);
  return url.toString();
};

const requestToken = async (params) => {
  const response = await fetch(`${apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${buildBasicAuthorization()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      text || `OAuth request failed with status ${response.status}`,
    );
  }

  return response.json();
};

const exchangeAuthorizationCode = async (userId, code) => {
  const tokenResponse = await requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: requireEnv("EBAY_RUNAME"),
  });

  const stored = {
    ...tokenResponse,
    expiresAt: Date.now() + Number(tokenResponse.expires_in ?? 7200) * 1000,
    refreshedAt: Date.now(),
  };
  await tokenStore.save(userId, stored);
  return stored;
};

const getUserAccessToken = async (userId) => {
  const stored = await tokenStore.load(userId);
  if (!stored?.refresh_token) {
    throw new Error(
      "No eBay user token found. Connect your eBay account first.",
    );
  }

  if (stored.expiresAt && stored.expiresAt > Date.now() + 60_000) {
    return stored.access_token;
  }

  const refreshed = await requestToken({
    grant_type: "refresh_token",
    refresh_token: stored.refresh_token,
    scope: ebayScopes,
  });

  const updated = {
    ...stored,
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? stored.refresh_token,
    expiresAt: Date.now() + Number(refreshed.expires_in ?? 7200) * 1000,
    refreshedAt: Date.now(),
  };
  await tokenStore.save(userId, updated);
  return updated.access_token;
};

const enforceListingRateLimit = (userId) => {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (listingRateLimits.get(userId) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );
  if (recent.length >= listingRateLimit) {
    const error = new Error(
      "Too many listing attempts. Wait a minute and try again.",
    );
    error.statusCode = 429;
    throw error;
  }
  recent.push(now);
  listingRateLimits.set(userId, recent);
};

const getAppAccessToken = async () => {
  if (appTokenCache?.expiresAt > Date.now() + 60_000) {
    return appTokenCache.accessToken;
  }

  const tokenResponse = await requestToken({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });

  appTokenCache = {
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + Number(tokenResponse.expires_in ?? 7200) * 1000,
  };
  return appTokenCache.accessToken;
};

const ebayFetch = async (pathname, options) => {
  console.log(`eBay ${options?.method ?? "GET"} ${pathname}`);
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(30_000),
    headers: {
      "Accept-Language": locale,
      ...(options?.headers ?? {}),
    },
  });
  console.log(
    `eBay ${options?.method ?? "GET"} ${pathname} -> ${response.status}`,
  );

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(
      text || `eBay request failed with status ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

const getCategoryTreeId = async () => {
  if (categoryTreeCache) {
    return categoryTreeCache;
  }
  const appToken = await getAppAccessToken();
  const tree = await ebayFetch(
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(
      marketplaceId,
    )}`,
    {
      headers: {
        Authorization: `Bearer ${appToken}`,
      },
    },
  );
  categoryTreeCache = tree.categoryTreeId;
  return categoryTreeCache;
};

const getCategory = async (title) => {
  if (fallbackCategoryId) {
    return {
      categoryId: fallbackCategoryId,
      categoryName: null,
      source: "override",
    };
  }

  const appToken = await getAppAccessToken();
  const categoryTreeId = await getCategoryTreeId();
  const suggestions = await ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(
      categoryTreeId,
    )}/get_category_suggestions?q=${encodeURIComponent(title)}`,
    {
      headers: {
        Authorization: `Bearer ${appToken}`,
      },
    },
  );

  const category = suggestions?.categorySuggestions?.[0]?.category;
  if (!category?.categoryId) {
    throw new Error(
      "No eBay category suggestion was found. Set EBAY_CATEGORY_ID to override.",
    );
  }

  return {
    categoryId: category.categoryId,
    categoryName: category.categoryName ?? null,
    source: "taxonomy",
  };
};

const conditionEnumById = {
  1000: "NEW",
  1500: "NEW_OTHER",
  1750: "NEW_WITH_DEFECTS",
  2000: "CERTIFIED_REFURBISHED",
  2010: "EXCELLENT_REFURBISHED",
  2020: "VERY_GOOD_REFURBISHED",
  2030: "GOOD_REFURBISHED",
  2500: "SELLER_REFURBISHED",
  2750: "LIKE_NEW",
  2990: "PRE_OWNED_EXCELLENT",
  3000: "USED_EXCELLENT",
  3010: "PRE_OWNED_FAIR",
  4000: "USED_VERY_GOOD",
  5000: "USED_GOOD",
  6000: "USED_ACCEPTABLE",
  7000: "FOR_PARTS_OR_NOT_WORKING",
};

const conditionPreferences = {
  new: [1000, 1500, 1750],
  "like new": [2750, 1500, 2990, 3000, 4000, 1000],
  good: [5000, 3000, 4000, 2990, 6000],
  fair: [6000, 3010, 5000, 7000, 3000],
};

const getCategoryMetadata = async (categoryId) => {
  if (categoryMetadataCache.has(categoryId)) {
    return categoryMetadataCache.get(categoryId);
  }

  const appToken = await getAppAccessToken();
  const categoryTreeId = await getCategoryTreeId();
  const [conditionPolicies, aspectPayload] = await Promise.all([
    ebayFetch(
      `/sell/metadata/v1/marketplace/${encodeURIComponent(
        marketplaceId,
      )}/get_item_condition_policies?filter=${encodeURIComponent(
        `categoryIds:{${categoryId}}`,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
        },
      },
    ),
    ebayFetch(
      `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(
        categoryTreeId,
      )}/get_item_aspects_for_category?category_id=${encodeURIComponent(
        categoryId,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
        },
      },
    ),
  ]);

  const metadata = {
    conditions:
      conditionPolicies?.itemConditionPolicies?.[0]?.itemConditions ?? [],
    aspects: aspectPayload?.aspects ?? [],
  };
  categoryMetadataCache.set(categoryId, metadata);
  return metadata;
};

const selectCondition = (condition, availableConditions) => {
  const normalizedCondition = String(condition ?? "good").toLowerCase();
  const preferences =
    conditionPreferences[normalizedCondition] ?? conditionPreferences.good;
  const availableIds = new Set(
    availableConditions.map((entry) => Number(entry.conditionId)),
  );
  const selectedId =
    preferences.find((conditionId) => availableIds.has(conditionId)) ??
    Number(availableConditions[0]?.conditionId);
  const selectedEnum = conditionEnumById[selectedId];
  if (!selectedEnum) {
    throw new Error(
      `No supported eBay condition was found for category. Available IDs: ${
        [...availableIds].join(", ") || "none"
      }`,
    );
  }
  return selectedEnum;
};

const normalizeSearchText = (payload) =>
  `${payload.title ?? ""} ${payload.description ?? ""} ${
    payload.product?.name ?? ""
  }`.toLowerCase();

const findMatchingAspectValue = (values, searchableText) => {
  const matches = values
    .map((entry) => entry.localizedValue)
    .filter(Boolean)
    .filter((value) => searchableText.includes(value.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
};

const fallbackAspectValue = (aspect, searchableText, payload) => {
  const name = aspect.localizedAspectName;
  const normalizedName = name.toLowerCase();
  const values = aspect.aspectValues ?? [];
  const localizedValues = values.map((entry) => entry.localizedValue);
  const matchingValue = findMatchingAspectValue(values, searchableText);
  if (matchingValue) {
    return matchingValue;
  }

  const findPreferred = (...candidates) =>
    candidates.find((candidate) => localizedValues.includes(candidate)) ?? null;
  const productName = payload.product?.name || payload.title || "Does not apply";

  if (normalizedName.includes("brand")) {
    return findPreferred(
      "Apple",
      "Samsung",
      "Sony",
      "Microsoft",
      "Nintendo",
      "LEGO",
      "Nike",
      "Adidas",
      "Unbranded",
      "Does not apply",
      "Other",
    );
  }
  if (normalizedName === "model") {
    return productName.slice(0, 65);
  }
  if (normalizedName.includes("color") || normalizedName.includes("colour")) {
    return findPreferred(
      "White",
      "Black",
      "Multicolor",
      "Multi-Color",
      "Does not apply",
      "Other",
    );
  }
  if (normalizedName.includes("connectivity")) {
    if (searchableText.includes("wireless") || searchableText.includes("bluetooth")) {
      return findPreferred("Bluetooth", "Wireless", "Bluetooth/Wireless");
    }
    return findPreferred("USB-C", "USB", "Not Applicable", "Does not apply");
  }
  if (normalizedName === "type") {
    if (searchableText.includes("pencil") || searchableText.includes("stylus")) {
      return findPreferred("Stylus", "Active Stylus", "Digital Pen", "Other");
    }
    if (searchableText.includes("earbud") || searchableText.includes("airpods")) {
      return findPreferred("Earbud (In Ear)", "Canal Earbud (In Ear Canal)");
    }
  }
  if (normalizedName.includes("department")) {
    return findPreferred(
      "Unisex Adults",
      "Men",
      "Women",
      "Unisex",
      "Does not apply",
    );
  }
  if (
    normalizedName.includes("mpn") ||
    normalizedName.includes("upc") ||
    normalizedName.includes("manufacturer part number")
  ) {
    return findPreferred("Does Not Apply", "Does not apply", "N/A", "Unknown");
  }
  if (normalizedName.includes("size")) {
    return findPreferred("One Size", "Regular", "Does not apply", "Other");
  }

  const isFreeText =
    aspect.aspectConstraint?.aspectMode === "FREE_TEXT" ||
    localizedValues.length === 0;
  if (isFreeText) {
    return normalizedName.includes("model")
      ? productName.slice(0, 65)
      : "Does not apply";
  }

  return findPreferred(
    "Does not apply",
    "Not Applicable",
    "Unbranded",
    "Other",
    "Unknown",
  );
};

const getProductAspects = (payload, aspects) => {
  const searchableText = normalizeSearchText(payload);
  const requiredAspects = aspects.filter(
    (aspect) => aspect.aspectConstraint?.aspectRequired,
  );
  const resolvedAspects = {};

  for (const aspect of requiredAspects) {
    const value = fallbackAspectValue(aspect, searchableText, payload);
    if (value) {
      resolvedAspects[aspect.localizedAspectName] = [value];
    }
  }

  return Object.keys(resolvedAspects).length > 0
    ? resolvedAspects
    : undefined;
};

const getListingMetadata = async (payload) => {
  const category = await getCategory(payload.title);
  const metadata = await getCategoryMetadata(category.categoryId);
  return {
    ...category,
    condition: selectCondition(payload.condition, metadata.conditions),
    aspects: getProductAspects(payload, metadata.aspects),
  };
};

const getLegacyProductAspects = (payload, categoryId) => {
  if (categoryId !== "80077") {
    return undefined;
  }

  const searchableText = `${payload.title ?? ""} ${payload.product?.name ?? ""}`;
  const normalizedText = searchableText.toLowerCase();
  const model = payload.product?.name || payload.title || "Headset";

  return {
    Brand: [normalizedText.includes("apple") ? "Apple" : "Unbranded"],
    Color: [
      normalizedText.includes("black")
        ? "Black"
        : normalizedText.includes("blue")
          ? "Blue"
          : "White",
    ],
    Connectivity: [
      normalizedText.includes("bluetooth") ||
      normalizedText.includes("wireless") ||
      normalizedText.includes("airpods")
        ? "Bluetooth"
        : "USB-C",
    ],
    Model: [model.slice(0, 65)],
    Type: [
      normalizedText.includes("earbud") || normalizedText.includes("airpods")
        ? "Earbud (In Ear)"
        : "Ear-Cup (Over the Ear)",
    ],
  };
};

const uploadImageToEbay = async (accessToken, photo, index) => {
  if (photo?.url && /^https:\/\//i.test(photo.url)) {
    return photo.url;
  }

  if (!photo?.base64) {
    return null;
  }

  const bytes = Buffer.from(photo.base64, "base64");
  const form = new FormData();
  form.append(
    "image",
    new Blob([bytes], { type: photo.mimeType || "image/jpeg" }),
    photo.filename || `pallet-image-${index + 1}.jpg`,
  );

  const response = await fetch(
    `${mediaApiBaseUrl}/commerce/media/v1_beta/image/create_image_from_file`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Language": locale,
      },
      body: form,
      signal: AbortSignal.timeout(60_000),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      text || `eBay image upload failed with status ${response.status}`,
    );
  }

  const result = text ? JSON.parse(text) : {};
  return result.imageUrl ?? result.maxDimensionImageUrl ?? null;
};

const getDuplicateListingId = (error) => {
  if (!(error instanceof Error)) {
    return null;
  }

  try {
    const payload = JSON.parse(error.message);
    const duplicateError = payload?.errors?.find(
      (entry) =>
        entry?.errorId === 25002 &&
        entry?.message?.includes("already have on eBay"),
    );
    const listingId = duplicateError?.message?.match(/\((\d{9,})\)/)?.[1];
    return listingId ?? null;
  } catch {
    return null;
  }
};

const createListing = async (userId, payload) => {
  enforceListingRateLimit(userId);
  const accessToken = await getUserAccessToken(userId);
  const itemId = String(payload.itemId ?? Date.now()).replace(
    /[^a-zA-Z0-9_-]/g,
    "-",
  );
  const sku = `pallet-${itemId}`.slice(0, 50);
  const listingMetadata = await getListingMetadata(payload);
  const { categoryId } = listingMetadata;
  const uploadedImageUrls = (
    await Promise.all(
      (Array.isArray(payload.photos) ? payload.photos : [])
        .slice(0, 5)
        .map((photo, index) => uploadImageToEbay(accessToken, photo, index)),
    )
  ).filter(Boolean);
  console.log(`Creating eBay listing with category ${categoryId}`);

  await ebayFetch(
    `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": locale,
      },
      body: JSON.stringify({
        availability: {
          shipToLocationAvailability: {
            quantity: payload.quantity ?? 1,
          },
        },
        condition: listingMetadata.condition,
        conditionDescription: payload.condition
          ? `Item condition: ${payload.condition}.`
          : undefined,
        product: {
          title: payload.title,
          description: payload.description,
          imageUrls:
            uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
          aspects:
            listingMetadata.aspects ??
            getLegacyProductAspects(payload, categoryId),
        },
      }),
    },
  );

  const offerBody = {
    sku,
    marketplaceId,
    format: "FIXED_PRICE",
    availableQuantity: payload.quantity ?? 1,
    categoryId,
    merchantLocationKey: requireEnv("EBAY_MERCHANT_LOCATION_KEY"),
    listingDescription: payload.description,
    pricingSummary: {
      price: {
        currency,
        value: String(payload.price),
      },
    },
    listingPolicies: {
      paymentPolicyId: requireEnv("EBAY_PAYMENT_POLICY_ID"),
      returnPolicyId: requireEnv("EBAY_RETURN_POLICY_ID"),
      fulfillmentPolicyId: requireEnv("EBAY_FULFILLMENT_POLICY_ID"),
      bestOfferTerms: {
        bestOfferEnabled: true,
        autoDeclinePrice: {
          currency,
          value: String(payload.floorPrice),
        },
      },
    },
  };

  let existingOffers = null;
  try {
    existingOffers = await ebayFetch(
      `/sell/inventory/v1/offer?sku=${encodeURIComponent(
        sku,
      )}&marketplace_id=${encodeURIComponent(
        marketplaceId,
      )}&format=FIXED_PRICE`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }
  }
  const existingOffer =
    existingOffers?.offers?.find(
      (candidate) =>
        payload.offerId && candidate.offerId === String(payload.offerId),
    ) ?? existingOffers?.offers?.[0];
  const isUpdate = Boolean(existingOffer);
  let offer;

  if (existingOffer) {
    await ebayFetch(
      `/sell/inventory/v1/offer/${encodeURIComponent(existingOffer.offerId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Content-Language": locale,
        },
        body: JSON.stringify(offerBody),
      },
    );
    offer = existingOffer;
  } else {
    offer = await ebayFetch(`/sell/inventory/v1/offer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": locale,
      },
      body: JSON.stringify(offerBody),
    });
  }

  const itemBaseUrl = isSandbox
    ? "https://www.sandbox.ebay.com/itm"
    : "https://www.ebay.com/itm";
  const existingListingId =
    existingOffer?.listing?.listingId ?? payload.listingId ?? null;

  if (existingListingId) {
    return {
      sku,
      offerId: offer.offerId,
      listingId: existingListingId,
      listingUrl: `${itemBaseUrl}/${existingListingId}`,
      updated: true,
      categoryId,
      categoryName: listingMetadata.categoryName,
    };
  }

  let published;
  try {
    published = await ebayFetch(
      `/sell/inventory/v1/offer/${encodeURIComponent(offer.offerId)}/publish`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const duplicateListingId = getDuplicateListingId(error);
    if (!duplicateListingId) {
      throw error;
    }

    return {
      sku,
      offerId: offer.offerId,
      listingId: duplicateListingId,
      listingUrl: `${itemBaseUrl}/${duplicateListingId}`,
      duplicateRecovered: true,
      categoryId,
      categoryName: listingMetadata.categoryName,
      updated: isUpdate,
    };
  }

  const listingId = published?.listingId ?? published?.listingIdStr ?? null;

  return {
    sku,
    offerId: offer.offerId,
    listingId,
    listingUrl: listingId ? `${itemBaseUrl}/${listingId}` : undefined,
    categoryId,
    categoryName: listingMetadata.categoryName,
    updated: isUpdate,
  };
};

const endListing = async (userId, payload) => {
  const offerId = String(payload.offerId ?? "").trim();
  if (!offerId) {
    const error = new Error("offerId is required to end an eBay listing.");
    error.statusCode = 400;
    throw error;
  }

  const accessToken = await getUserAccessToken(userId);
  await ebayFetch(
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
  return { ended: true, offerId };
};

const serverStartTime = Date.now();
const serverProcessId = process.pid;

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(req, res, 400, { error: "Missing request URL." });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": getCorsOrigin(req),
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/ebay/status") {
      const { userId } = authenticateRequest(req);
      const stored = await tokenStore.load(userId);
      sendJson(req, res, 200, {
        configured: Boolean(
          process.env.EBAY_CLIENT_ID &&
          process.env.EBAY_CLIENT_SECRET &&
          process.env.EBAY_RUNAME,
        ),
        connected: Boolean(stored?.refresh_token),
        environment: EBAY_ENVIRONMENT,
        marketplaceId,
        locale,
        categoryId: fallbackCategoryId || null,
        merchantLocationKey: process.env.EBAY_MERCHANT_LOCATION_KEY || null,
        paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID || null,
        returnPolicyId: process.env.EBAY_RETURN_POLICY_ID || null,
        fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID || null,
        serverProcessId,
        serverStartTime,
        authMode: getAuthMode(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/ebay/connect-url") {
      const { userId } = authenticateRequest(req);
      sendJson(req, res, 200, {
        authorizationUrl: getAuthorizationUrl(userId),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/ebay/connect") {
      if (getAuthMode() !== "local") {
        sendJson(req, res, 401, {
          error:
            "Use authenticated GET /ebay/connect-url before opening eBay OAuth.",
        });
        return;
      }
      res.writeHead(302, { Location: getAuthorizationUrl("local") });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/ebay/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        sendHtml(
          req,
          res,
          400,
          `<h1>eBay connection failed</h1><p>${error}</p>`,
        );
        return;
      }

      if (!code) {
        sendHtml(
          req,
          res,
          400,
          "<h1>Missing code</h1><p>eBay did not return an authorization code.</p>",
        );
        return;
      }

      const oauthState = state ? oauthStates.get(state) : null;
      if (!oauthState || oauthState.expiresAt <= Date.now()) {
        sendHtml(
          req,
          res,
          400,
          "<h1>Invalid state</h1><p>The OAuth state token did not match.</p>",
        );
        return;
      }

      oauthStates.delete(state);
      await exchangeAuthorizationCode(oauthState.userId, code);
      sendHtml(
        req,
        res,
        200,
        "<h1>eBay connected</h1><p>You can close this page and return to the app.</p>",
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/ebay/listings") {
      const { userId } = authenticateRequest(req);
      const rawBody = await readRequestBody(req);
      const payload = JSON.parse(rawBody);
      const result = await createListing(userId, payload);
      sendJson(req, res, 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/ebay/listings/end") {
      const { userId } = authenticateRequest(req);
      const rawBody = await readRequestBody(req);
      const payload = JSON.parse(rawBody);
      const result = await endListing(userId, payload);
      sendJson(req, res, 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/ebay/disconnect") {
      const { userId } = authenticateRequest(req);
      await tokenStore.remove(userId);
      sendJson(req, res, 200, { disconnected: true });
      return;
    }

    sendJson(req, res, 404, { error: "Not found." });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    const statusCode =
      error?.statusCode ??
      (message.includes("Authentication") ||
      message.includes("authentication token")
        ? 401
        : 500);
    sendJson(req, res, statusCode, {
      error: message,
    });
  }
});

server.listen(serverPort, () => {
  console.log(`eBay server listening on http://localhost:${serverPort}`);
  console.log(
    `eBay backend process ${serverProcessId} started in ${EBAY_ENVIRONMENT} mode`,
  );
  console.log(
    `Config: marketplaceId=${marketplaceId}, locale=${locale}, categoryId=${fallbackCategoryId || "(none)"}`,
  );
});
