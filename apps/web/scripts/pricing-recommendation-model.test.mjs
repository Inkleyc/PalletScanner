import test from "node:test";
import assert from "node:assert/strict";
import { buildPricingRecommendations } from "../src/pricing-recommendation-model.js";

const settings = { pricing_recommendations_enabled: true, pricing_review_after_days: 30, pricing_markdown_percent: 10 };

test("recommends a floor-protected markdown only for stale active listings", () => {
  const rows = buildPricingRecommendations({
    settings,
    now: Date.parse("2026-10-10T00:00:00Z"),
    listings: [
      { id: "old", status: "active", created_at: "2026-08-01T00:00:00Z", inventory_items: { name: "Old", listing_price: 100, floor_price: 95 } },
      { id: "new", status: "active", created_at: "2026-10-01T00:00:00Z", inventory_items: { name: "New", listing_price: 100, floor_price: 50 } },
      { id: "ended", status: "ended", created_at: "2026-08-01T00:00:00Z", inventory_items: { name: "Ended", listing_price: 100, floor_price: 50 } },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].listingId, "old");
  assert.equal(rows[0].suggestedPrice, 95);
});

test("returns no recommendations when the setting is disabled", () => {
  assert.deepEqual(buildPricingRecommendations({ settings: { ...settings, pricing_recommendations_enabled: false }, listings: [{ status: "active", created_at: "2020-01-01", inventory_items: { listing_price: 100 } }] }), []);
});

test("hides only a current unexpired dismissal", () => {
  const base = { id: "old", status: "active", created_at: "2026-08-01T00:00:00Z", inventory_items: { listing_price: 100, floor_price: 50 } };
  const current = { decision: "dismissed", approved_price: 100, suggested_price: 90, decided_at: "2026-10-01T00:00:00Z", revisit_after: "2026-11-01T00:00:00Z" };
  const now = Date.parse("2026-10-10T00:00:00Z");
  assert.equal(buildPricingRecommendations({ settings, now, listings: [{ ...base, pricing_recommendation_decisions: [current] }] }).length, 0);
  assert.equal(buildPricingRecommendations({ settings, now, listings: [{ ...base, inventory_items: { listing_price: 110, floor_price: 50 }, pricing_recommendation_decisions: [current] }] }).length, 1);
  assert.equal(buildPricingRecommendations({ settings, now: Date.parse("2026-11-02T00:00:00Z"), listings: [{ ...base, pricing_recommendation_decisions: [current] }] }).length, 1);
});
