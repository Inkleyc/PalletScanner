import assert from "node:assert/strict";
import test from "node:test";

import {
  createBarcodeFallbackDraft,
  createPhotoFallbackDraft,
} from "../lib/offline-drafts.ts";
import { mergeBarcodeAnalysisDraft } from "../lib/barcode-draft-merge.ts";
import { buildInventoryItemDraft } from "../lib/inventory-item-drafts.ts";
import {
  BARCODE_LOOKUP_TIMEOUT_MS,
  withTimeout,
} from "../lib/timeout.ts";
import { createListingDrafts } from "../../../packages/core/src/listing-drafts.ts";
import {
  parseMoneyAmount,
  parsePositiveInteger,
  parsePriceRange,
} from "../../../packages/core/src/parsing.ts";

// These tests cover the draft/fallback/timeout logic that is provable
// without a device. They do not prove native camera/scanner behaviour —
// that needs the 9-step real-device checklist in
// docs/mobile-working-code-reconciliation.md.

test("photo fallback draft is a complete saveable draft", () => {
  const draft = createPhotoFallbackDraft();

  assert.equal(draft.name, "Unidentified pallet item");
  assert.ok(draft.description.length > 0);
  assert.ok(draft.condition.length > 0);
  assert.equal(draft.low_price, 10);
  assert.equal(draft.high_price, 30);
  assert.equal(draft.floor_price, 8);
  assert.ok(draft.floor_price <= draft.high_price);
  assert.equal(draft.best_platform, "Facebook");
  assert.ok(draft.listing_title.length > 0);
  assert.ok(draft.listing_description.length > 0);
  assert.equal(draft.sellability_score, 5);
  assert.ok(draft.photo_tips.length > 0);
  assert.ok(draft.photo_example_queries.length > 0);
});

test("barcode fallback draft carries the scanned identity", () => {
  const withProduct = createBarcodeFallbackDraft("012345678905", {
    title: "Acme Widget",
    brand: "Acme",
    category: "Tools",
  });
  assert.equal(withProduct.name, "Acme Widget");
  assert.equal(withProduct.low_price, 10);
  assert.equal(withProduct.high_price, 30);

  const withoutProduct = createBarcodeFallbackDraft("012345678905", null);
  assert.equal(withoutProduct.name, "Barcode item 012345678905");
});

test("barcode merge keeps the fallback identity when analysis is vague", () => {
  const base = createBarcodeFallbackDraft("012345678905", null);
  const merged = mergeBarcodeAnalysisDraft(base, {
    name: "   ",
    description: "",
    low_price: 40,
    high_price: 20,
    floor_price: 99,
  });

  assert.equal(merged.name, base.name);
  assert.equal(merged.low_price, 40);
  assert.equal(merged.high_price, 40);
  assert.ok(merged.floor_price <= merged.high_price);
  assert.ok(merged.listing_title.length > 0);
});

test("barcode merge uses a confident analysis over the fallback", () => {
  const base = createBarcodeFallbackDraft("012345678905", null);
  const merged = mergeBarcodeAnalysisDraft(base, {
    name: "DeWalt Drill",
    low_price: 45,
    high_price: 65,
    floor_price: 40,
  });

  assert.equal(merged.name, "DeWalt Drill");
  assert.equal(merged.low_price, 45);
  assert.equal(merged.high_price, 65);
  assert.equal(merged.floor_price, 40);
});

test("fallback draft builds a saveable inventory item", () => {
  const draft = createPhotoFallbackDraft();
  const images = Array.from({ length: 6 }, (_, index) => ({
    uri: `file:///photo-${index}.jpg`,
  }));
  const item = buildInventoryItemDraft({
    currentItemId: null,
    palletId: "pallet-1",
    analysis: draft,
    listingDrafts: createListingDrafts(draft),
    images,
    productImageUri: null,
    priceRange: { low: draft.low_price, high: draft.high_price },
    floorPrice: draft.floor_price ?? draft.low_price,
    quantity: 2,
    barcode: "012345678905",
  });

  assert.equal(item.name, draft.name);
  assert.equal(item.low_price, 10);
  assert.equal(item.high_price, 30);
  assert.equal(item.floor_price, 8);
  assert.equal(item.listing_price, 30);
  assert.equal(item.quantity, 2);
  assert.equal(item.palletId, "pallet-1");
  assert.equal(item.barcode, "012345678905");
  assert.equal(item.photos.length, 5);
  assert.ok(item.listing_title.length > 0);
  assert.ok(item.listing_description.length > 0);
  assert.ok(item.listing_title_facebook.length > 0);
  assert.ok(item.listing_title_ebay.length > 0);
});

test("listing drafts carry the fallback copy per platform", () => {
  const fallback = createPhotoFallbackDraft();
  const drafts = createListingDrafts(fallback);

  assert.equal(drafts.general.title, fallback.listing_title);
  assert.equal(drafts.general.description, fallback.listing_description);
  assert.equal(drafts.facebook.title, fallback.listing_title_facebook);
  assert.equal(drafts.facebook.description, fallback.listing_description_facebook);
  assert.equal(drafts.ebay.title, fallback.listing_title_ebay);
  assert.equal(drafts.ebay.description, fallback.listing_description_ebay);
});

test("listing drafts fall back to the general copy when a platform copy is missing", () => {
  const drafts = createListingDrafts({
    listing_title: "General title",
    listing_description: "General description",
  });

  assert.equal(drafts.facebook.title, "General title");
  assert.equal(drafts.ebay.description, "General description");
});

test("save-validation parsing accepts the fallback price shapes", () => {
  assert.deepEqual(parsePriceRange("10-30"), { low: 10, high: 30 });
  assert.deepEqual(parsePriceRange("30-10"), { low: 10, high: 30 });
  assert.equal(parseMoneyAmount("$12.50"), 12.5);
  assert.equal(parsePositiveInteger("3"), 3);
  assert.equal(parsePositiveInteger("0"), null);
});

test("withTimeout resolves a promise that settles in time", async () => {
  const value = await withTimeout(Promise.resolve("draft"), 100, "too slow");
  assert.equal(value, "draft");
});

test("withTimeout rejects with the given message after the deadline", async () => {
  const slow = new Promise((resolve) => {
    setTimeout(() => resolve("late"), 100);
  });
  await assert.rejects(
    withTimeout(slow, 10, "Barcode lookup timed out."),
    /Barcode lookup timed out\./,
  );
});

test("barcode lookup timeout budget is bounded", () => {
  assert.ok(BARCODE_LOOKUP_TIMEOUT_MS >= 5_000);
  assert.ok(BARCODE_LOOKUP_TIMEOUT_MS <= 30_000);
});
