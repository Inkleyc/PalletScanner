type BarcodeLookupItem = {
  title?: string;
  description?: string;
  brand?: string;
  category?: string;
  images?: string[];
};

const UPCITEMDB_LOOKUP_URL = "https://api.upcitemdb.com/prod/trial/lookup";
const OPEN_FOOD_FACTS_LOOKUP_URL = "https://world.openfoodfacts.org/api/v0/product";

const normalizeBarcode = (barcode: string) => barcode.trim().replace(/[^0-9A-Za-z]/g, "");

const buildBarcodeCandidates = (barcode: string) => {
  const normalized = normalizeBarcode(barcode);
  const candidates = [normalized];

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

  if (payload.status !== 1 || !payload.product?.product_name) {
    throw new Error("No product found for that barcode.");
  }

  return {
    title: payload.product.product_name,
    description: payload.product.generic_name,
    brand: payload.product.brands,
    category: payload.product.categories,
    images: [payload.product.image_front_url, payload.product.image_url].filter(
      (value): value is string => Boolean(value),
    ),
  } satisfies BarcodeLookupItem;
};

export const lookupBarcodeProduct = async (barcode: string) => {
  const candidates = buildBarcodeCandidates(barcode);
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
        return await lookupOpenFoodFactsCandidate(candidate);
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
