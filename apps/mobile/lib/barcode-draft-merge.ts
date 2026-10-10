import type { CaptureAnalysisResult } from "@palletscanner/core";

const coerceText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;

const coerceNumber = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
};

export const mergeBarcodeAnalysisDraft = (
  base: CaptureAnalysisResult,
  analyzed: Partial<CaptureAnalysisResult>,
): CaptureAnalysisResult => {
  const lowPrice = coerceNumber(analyzed.low_price, base.low_price);
  const highPrice = Math.max(
    lowPrice,
    coerceNumber(analyzed.high_price, base.high_price),
  );

  return {
    ...base,
    ...analyzed,
    name: coerceText(analyzed.name, base.name),
    description: coerceText(analyzed.description, base.description),
    condition: coerceText(analyzed.condition, base.condition),
    low_price: lowPrice,
    high_price: highPrice,
    floor_price: Math.min(
      coerceNumber(analyzed.floor_price, base.floor_price ?? lowPrice),
      highPrice,
    ),
    best_platform: coerceText(analyzed.best_platform, base.best_platform),
    platform_reason: coerceText(analyzed.platform_reason, base.platform_reason ?? ""),
    listing_title: coerceText(analyzed.listing_title, base.listing_title ?? base.name),
    listing_description: coerceText(
      analyzed.listing_description,
      base.listing_description ?? base.description,
    ),
    listing_title_facebook: coerceText(
      analyzed.listing_title_facebook,
      base.listing_title_facebook ?? base.listing_title ?? base.name,
    ),
    listing_description_facebook: coerceText(
      analyzed.listing_description_facebook,
      base.listing_description_facebook ?? base.listing_description ?? base.description,
    ),
    listing_title_ebay: coerceText(
      analyzed.listing_title_ebay,
      base.listing_title_ebay ?? base.listing_title ?? base.name,
    ),
    listing_description_ebay: coerceText(
      analyzed.listing_description_ebay,
      base.listing_description_ebay ?? base.listing_description ?? base.description,
    ),
    photo_tips: coerceText(analyzed.photo_tips, base.photo_tips ?? ""),
    photo_example_queries: Array.isArray(analyzed.photo_example_queries)
      ? analyzed.photo_example_queries.filter(
          (query): query is string => typeof query === "string" && query.trim().length > 0,
        )
      : base.photo_example_queries,
    photo_shot_list: Array.isArray(analyzed.photo_shot_list)
      ? analyzed.photo_shot_list.filter(
          (query): query is string => typeof query === "string" && query.trim().length > 0,
        )
      : base.photo_shot_list,
    sellability_score: coerceNumber(analyzed.sellability_score, base.sellability_score ?? 5),
    sellability_reason: coerceText(analyzed.sellability_reason, base.sellability_reason ?? ""),
  };
};
