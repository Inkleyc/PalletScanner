import { getItemPhotos } from "@palletscanner/core";
import { getQuantity } from "./dashboard-model.js";

export const MAX_ITEM_PHOTOS = 5;

export const readPreference = (key, fallback) =>
  localStorage.getItem(key) ?? fallback;

export const preferredListingPrice = (low, high) => {
  const rule = readPreference("palletscanner.listingPriceRule", "high");
  if (rule === "low") return low;
  if (rule === "midpoint") return Math.round(((low + high) / 2) * 100) / 100;
  return high;
};

export const preferredMarketplace = (recommendation) => {
  const preference = readPreference("palletscanner.defaultMarketplace", "ai");
  return preference === "ai" ? recommendation : preference;
};

const getBackendBaseUrl = () => (
  import.meta.env.VITE_AI_API_BASE_URL ||
  readPreference("palletscanner.ebayApiBaseUrl", "") ||
  (typeof window !== "undefined" ? window.location.origin : "")
).trim().replace(/\/$/, "");

export const resizePhoto = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error(`${file.name} is not a supported image.`));
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

const parseAiJson = (text) => {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI did not return an item draft.");
  return JSON.parse(cleaned.slice(start, end + 1));
};

const backendRequest = async (path, init = {}) => {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) throw new Error("Configure the PalletFlip backend in Settings first.");
  const token = sessionStorage.getItem("palletscanner.authToken")?.trim();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    try {
      const outer = JSON.parse(body);
      const detail = typeof outer.error === "string" && outer.error.trim().startsWith("{")
        ? JSON.parse(outer.error)
        : outer;
      const ebayError = detail.errors?.[0];
      throw new Error(ebayError?.longMessage || ebayError?.message || outer.error || body);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(body || `Backend request failed (${response.status}).`);
      }
      throw error;
    }
  }
  return body ? JSON.parse(body) : null;
};

export const analyzeItemPhotos = async (item, photos) => {
  const imageContent = photos
    .filter((uri) => uri.startsWith("data:"))
    .map((uri) => {
      const match = uri.match(/^data:([^;]+);base64,(.+)$/);
      return match
        ? { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } }
        : null;
    })
    .filter(Boolean);
  if (imageContent.length === 0) {
    throw new Error("Add at least one uploaded photo before running AI analysis.");
  }
  const payload = await backendRequest("/ai/messages", {
    method: "POST",
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: [
        ...imageContent,
        { type: "text", text: `Analyze these photos as a resale inventory expert. Read labels, model numbers, packaging, and visible specifications carefully. Use the existing item details only as context and correct them when the photos provide better evidence. Return ONLY raw JSON with: name, category, condition, low_price, high_price, floor_price, best_platform, listing_title, listing_description, listing_title_ebay, listing_description_ebay, listing_title_facebook, listing_description_facebook, ebay_item_specifics. ebay_item_specifics must be an object containing only marketplace attributes directly supported by visible evidence, such as Brand, Model, Screen Size, Storage Capacity, Color, Size, Type, or MPN. Normalize measurements with units. Do not guess an attribute that cannot be seen or reliably derived. Existing item: ${JSON.stringify({ name: item.name, category: item.category, condition: item.condition, listing_title: item.listing_title })}` },
      ] }],
    }),
  });
  const text = payload.content?.map((block) => block.text || "").join("\n").trim();
  return parseAiJson(text || "");
};

const itemPrice = (item, field) =>
  item[field] ?? item[`${field}_price`] ?? 0;

const getEbayListingPayload = (item) => {
  const photoUris = getItemPhotos(item);
  const photos = photoUris
    .filter((uri) => !uri.startsWith("mock://"))
    .map((uri, index) => {
      const data = uri.match(/^data:([^;]+);base64,(.+)$/);
      return data
        ? { base64: data[2], mimeType: data[1], filename: `item-${item.id}-${index + 1}.jpg` }
        : { url: uri };
    });
  return {
    itemId: item.id,
    offerId: item.ebayOfferId,
    listingId: item.ebayListingId,
    title: item.listing_title_ebay || item.listing_title || item.name,
    description: item.listing_description_ebay || item.listing_description || item.description || item.name,
    price: Number.isFinite(item.listing_price) ? item.listing_price : itemPrice(item, "high"),
    floorPrice: itemPrice(item, "floor"),
    condition: item.condition,
    category: item.category,
    quantity: getQuantity(item),
    itemSpecifics: item.ebayItemSpecifics ?? {},
    photos,
    product: { name: item.name },
  };
};

export const getEbayListingRequirements = (item) =>
  backendRequest("/ebay/listing-requirements", {
    method: "POST",
    body: JSON.stringify(getEbayListingPayload(item)),
  });

export const postItemToEbay = (item) =>
  backendRequest("/ebay/listings", {
    method: "POST",
    body: JSON.stringify(getEbayListingPayload(item)),
  });
