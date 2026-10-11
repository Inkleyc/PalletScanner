const money = (value) => Math.round(Number(value || 0) * 100) / 100;

export const buildPricingRecommendations = ({ listings = [], settings, now = Date.now() }) => {
  if (!settings?.pricing_recommendations_enabled) return [];
  const reviewDays = Number(settings.pricing_review_after_days || 30);
  const markdownPercent = Number(settings.pricing_markdown_percent || 5);
  return listings.flatMap((listing) => {
    const item = listing.inventory_items;
    const approvedPrice = Number(item?.listing_price);
    const floorPrice = Number(item?.floor_price || 0);
    const ageDays = Math.floor((now - Date.parse(listing.created_at)) / 86400000);
    if (listing.status !== "active" || !Number.isFinite(approvedPrice) || approvedPrice <= 0 || !Number.isFinite(ageDays) || ageDays < reviewDays) return [];
    const appliedAt = Date.parse(listing.pricing_recommendation_applied_at);
    if (Number.isFinite(appliedAt) && appliedAt + reviewDays * 86400000 > now) return [];
    const suggestedPrice = money(Math.max(floorPrice, approvedPrice * (1 - markdownPercent / 100)));
    if (suggestedPrice >= approvedPrice) return [];
    const latestDecision = [...(listing.pricing_recommendation_decisions ?? [])].sort((left, right) => Date.parse(right.decided_at) - Date.parse(left.decided_at))[0];
    const currentDismissal = latestDecision?.decision === "dismissed" && Number(latestDecision.approved_price) === approvedPrice && Number(latestDecision.suggested_price) === suggestedPrice && Date.parse(latestDecision.revisit_after) > now;
    if (currentDismissal) return [];
    return [{ listingId: listing.id, sku: item?.seller_sku || listing.sku || "No SKU", name: item?.name || "Unknown item", ageDays, approvedPrice, floorPrice, suggestedPrice, markdownPercent }];
  }).sort((left, right) => right.ageDays - left.ageDays);
};
