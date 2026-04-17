type BarcodeLookupItem = {
  title?: string;
  description?: string;
  brand?: string;
  category?: string;
  images?: string[];
};

const UPCITEMDB_LOOKUP_URL = "https://api.upcitemdb.com/prod/trial/lookup";

export const lookupBarcodeProduct = async (barcode: string) => {
  const response = await fetch(
    `${UPCITEMDB_LOOKUP_URL}?upc=${encodeURIComponent(barcode)}`,
  );

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

export type { BarcodeLookupItem };
