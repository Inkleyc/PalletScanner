import { getRuntimeBearerToken } from "@/lib/app-auth";

type BarcodeLookupItem = {
  title?: string;
  description?: string;
  brand?: string;
  category?: string;
  images?: string[];
};

const UPCITEMDB_LOOKUP_URL = "https://api.upcitemdb.com/prod/trial/lookup";
const OPEN_FOOD_FACTS_LOOKUP_URL = "https://world.openfoodfacts.org/api/v0/product";
const OPEN_FACTS_ALL_LOOKUP_URL =
  "https://world.openfoodfacts.org/api/v3/product";
const GTINHUB_LOOKUP_URL = "https://gtinhub.com/api/v1/product";
const BARCODE_API_BASE_URL = (
  process.env.EXPO_PUBLIC_AI_API_BASE_URL ??
  process.env.EXPO_PUBLIC_EBAY_API_BASE_URL ??
  ""
).replace(/\/$/, "");

const normalizeBarcode = (barcode: string) => barcode.trim().replace(/[^0-9A-Za-z]/g, "");

const appendUpcACheckDigit = (barcode: string) => {
  if (!/^\d{11}$/.test(barcode)) return barcode;
  const sum = [...barcode].reduce((total, digit, index) => {
    const value = Number(digit);
    return total + value * (index % 2 === 0 ? 3 : 1);
  }, 0);
  return `${barcode}${(10 - (sum % 10)) % 10}`;
};

export const normalizeLookupBarcode = (barcode: string) =>
  appendUpcACheckDigit(normalizeBarcode(barcode));

const buildBarcodeCandidates = (barcode: string) => {
  const normalized = normalizeBarcode(barcode);
  const completedUpc = normalizeLookupBarcode(normalized);
  const candidates = [completedUpc, normalized];

  if (/^\d{13}$/.test(normalized) && normalized.startsWith("0")) {
    candidates.push(normalized.slice(1));
  }

  if (/^\d{12}$/.test(normalized)) {
    candidates.push(`0${normalized}`);
  }

  return [...new Set(candidates.filter(Boolean))];
};

const lookupCandidate = async (barcode: string) => {
  const response = await fetch(
    `${UPCITEMDB_LOOKUP_URL}?upc=${encodeURIComponent(barcode)}`,
  );

  if (response.status === 429) {
    throw new Error("Barcode lookup is temporarily rate-limited. Please try again in a moment.");
  }

  if (!response.ok) {
    throw new Error(`Lookup failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    message?: string;
    items?: BarcodeLookupItem[];
  };

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error(payload.message ?? "No product found for that barcode.");
  }

  return payload.items[0];
};

const firstText = (...values: Array<unknown>) =>
  values.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  )?.trim();

const normalizeOpenFactsProduct = (product: {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  generic_name_en?: string;
  brands?: string;
  categories?: string;
  categories_old?: string;
  image_front_url?: string;
  image_url?: string;
}) => {
  const title = firstText(product.product_name, product.product_name_en);
  if (!title) {
    throw new Error("No product found for that barcode.");
  }

  return {
    title,
    description: firstText(product.generic_name, product.generic_name_en),
    brand: firstText(product.brands),
    category: firstText(product.categories, product.categories_old),
    images: [product.image_front_url, product.image_url].filter(
      (value): value is string => Boolean(value),
    ),
  } satisfies BarcodeLookupItem;
};

const lookupOpenFactsAllCandidate = async (barcode: string) => {
  const response = await fetch(
    `${OPEN_FACTS_ALL_LOOKUP_URL}/${encodeURIComponent(
      barcode,
    )}?product_type=all&fields=product_name,product_name_en,generic_name,generic_name_en,brands,categories,categories_old,image_front_url,image_url`,
  );

  if (!response.ok) {
    throw new Error(`Fallback lookup failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    status?: string | number;
    product?: Parameters<typeof normalizeOpenFactsProduct>[0];
  };

  if (!payload.product) {
    throw new Error("No product found for that barcode.");
  }

  return normalizeOpenFactsProduct(payload.product);
};

const lookupOpenFoodFactsCandidate = async (barcode: string) => {
  const response = await fetch(
    `${OPEN_FOOD_FACTS_LOOKUP_URL}/${encodeURIComponent(barcode)}.json`,
  );

  if (!response.ok) {
    throw new Error(`Fallback lookup failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      generic_name?: string;
      brands?: string;
      categories?: string;
      image_front_url?: string;
      image_url?: string;
    };
  };

  if (payload.status !== 1 || !payload.product) {
    throw new Error("No product found for that barcode.");
  }

  return normalizeOpenFactsProduct(payload.product);
};

const lookupGtinHubCandidate = async (barcode: string) => {
  const response = await fetch(
    `${GTINHUB_LOOKUP_URL}/${encodeURIComponent(barcode)}`,
  );

  if (!response.ok) {
    throw new Error(`Fallback lookup failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    found?: boolean;
    message?: string | null;
    product?: {
      name?: string;
      brand?: string;
      description?: string;
      category?: string;
      image_url?: string;
    };
  };

  if (!payload.found || !payload.product?.name) {
    throw new Error(payload.message ?? "No product found for that barcode.");
  }

  return {
    title: payload.product.name,
    description: firstText(payload.product.description),
    brand: firstText(payload.product.brand),
    category: firstText(payload.product.category),
    images: [payload.product.image_url].filter(
      (value): value is string => Boolean(value),
    ),
  } satisfies BarcodeLookupItem;
};

export const lookupBarcodeProduct = async (barcode: string) => {
  const candidates = buildBarcodeCandidates(barcode);
  if (BARCODE_API_BASE_URL) {
    const token = await getRuntimeBearerToken();
    const response = await fetch(
      `${BARCODE_API_BASE_URL}/barcode/lookup?barcode=${encodeURIComponent(candidates[0] ?? barcode)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    const body = await response.text();
    if (!response.ok) {
      let message = `Barcode lookup failed (${response.status}).`;
      try {
        const payload = JSON.parse(body) as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // Keep the status-based message when the gateway did not return JSON.
      }
      throw new Error(message);
    }
    return JSON.parse(body) as BarcodeLookupItem;
  }

  let lastError: Error | null = null;
  let sawRateLimit = false;

  for (const candidate of candidates) {
    try {
      return await lookupCandidate(candidate);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.includes("rate-limited")) {
        sawRateLimit = true;
      }

      try {
        return await lookupOpenFactsAllCandidate(candidate);
      } catch (fallbackError) {
        lastError =
          fallbackError instanceof Error
            ? fallbackError
            : new Error(String(fallbackError));
      }

      try {
        return await lookupOpenFoodFactsCandidate(candidate);
      } catch (fallbackError) {
        lastError =
          fallbackError instanceof Error
            ? fallbackError
            : new Error(String(fallbackError));
      }

      try {
        return await lookupGtinHubCandidate(candidate);
      } catch (fallbackError) {
        lastError =
          fallbackError instanceof Error
            ? fallbackError
            : new Error(String(fallbackError));
      }
    }
  }

  if (sawRateLimit) {
    throw new Error(
      "The primary barcode service is rate-limited right now, and no fallback match was found.",
    );
  }

  throw lastError ?? new Error("No product found for that barcode.");
};

export type { BarcodeLookupItem };
