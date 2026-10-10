import {
  ANTHROPIC_MODEL,
  getAnalysisImageMediaType,
  parseAnthropicJsonObject,
  requestAnthropicMessage,
} from "@/lib/anthropic";
import type { ImageAssetLike } from "@/lib/inventory-item-drafts";
import type { CaptureAnalysisResult } from "@palletscanner/core";

const resultShape = `{
  "name": "item name",
  "description": "1-2 sentence description",
  "condition": "New / Like New / Good / Fair",
  "low_price": 10,
  "high_price": 30,
  "floor_price": 12,
  "best_platform": "eBay",
  "platform_reason": "one sentence why",
  "listing_title": "SEO title under 80 chars",
  "listing_description": "3-4 sentence listing description",
  "listing_title_ebay": "SEO title under 80 chars for eBay",
  "listing_description_ebay": "3-4 sentence eBay description",
  "listing_title_facebook": "Facebook Marketplace title",
  "listing_description_facebook": "3-4 sentence Facebook description",
  "photo_tips": "short practical photo advice",
  "photo_example_queries": ["query one", "query two"],
  "photo_shot_list": ["Full front view", "Model label", "Visible wear or damage"],
  "sellability_score": 7,
  "sellability_reason": "one sentence why",
  "ebay_item_specifics": { "Brand": "visible brand", "Model": "visible model" }
}`;

const buildPhotoPrompt = (count: number, existingDraftContext?: string) => `You are a resale expert. I am showing you ${count} photo(s) of the same item.

${existingDraftContext ?? "Analyze it like a reseller preparing to list it online."}

If a barcode draft exists, use it as product identity context and use the photos to improve condition, completeness, accessories, damage notes, pricing confidence, sellability, and listing copy. Do not replace a specific product name with a vague one unless the photos clearly contradict the barcode draft. Read labels, model numbers, packaging, and visible specifications carefully. Estimate a realistic low_price and high_price using identical or similar current eBay and Facebook Marketplace listings when market context is available. Favor recent sold or active comparables and adjust for condition, brand, completeness, and visible wear. Provide a floor_price representing the lowest reasonable negotiation price. Include practical photo tips and a product-specific photo_shot_list with 3-6 concise views prioritizing identity, condition, included parts, and flaws. Provide a sellability score based on condition, estimated demand, and effort versus return. Write platform-specific listing copy for Facebook Marketplace and eBay. Include ebay_item_specifics only when supported by barcode data or visible evidence. Normalize measurements with units and do not guess. eBay titles should be keyword-heavy and concise; Facebook copy should be casual and local-buyer friendly. Respond ONLY with raw JSON, no markdown:
${resultShape}`;

export const analyzeResalePhotos = async (
  images: ImageAssetLike[],
  existingDraftContext?: string,
) => {
  const imagesWithBase64 = images.filter(
    (image): image is ImageAssetLike & { base64: string } =>
      typeof image.base64 === "string" && image.base64.trim().length > 0,
  );
  if (imagesWithBase64.length === 0) {
    throw new Error(
      "The selected photo did not include image data for analysis. Take the photo again or upload it from the library.",
    );
  }

  const imageContent = imagesWithBase64.map((image) => {
    const mediaType = getAnalysisImageMediaType(image.base64, image.mimeType);
    if (!mediaType) {
      throw new Error(
        "One of these photos is in HEIC or another unsupported format. Choose a JPEG, PNG, GIF, or WebP copy of that photo.",
      );
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: image.base64,
      },
    };
  });

  const text = await requestAnthropicMessage({
    model: ANTHROPIC_MODEL,
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: [
        ...imageContent,
        { type: "text", text: buildPhotoPrompt(images.length, existingDraftContext) },
      ],
    }],
  });

  return parseAnthropicJsonObject<CaptureAnalysisResult>(text);
};
