import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ebayListingEndedUpdate,
  ebayPublishSuccessUpdate,
  hasLiveEbayListing,
} from "../src/ebay-publish-state.js";

// PF-SCOPE-030: the web app had no "End listing" action at all — the
// backend's POST /ebay/listings/end and the mobile app's end action
// already existed, so an item archived from web kept its eBay listing
// live (PF-SCOPE-004 runbook gap 22; the PF-SCOPE-029 acceptance item
// was archived while sandbox listing 110591620696 stayed live).
//
// These tests drive the persisted ended-state transition the
// ListingReview end flow now saves, plus the live-listing predicate
// that gates both the panel button and the archive warning. The end
// flow itself is a React component closure (not importable here), so
// the last test asserts the wiring in App.jsx / web-services.js
// source, matching the PF-SCOPE-029 test pattern.

const listedItem = () => ({
  id: 42,
  name: "029 acceptance test",
  quantity: 1,
  soldPrice: null,
  listedPlatforms: ["ebay", "facebook"],
  ebayStatus: "active",
  ebayOfferId: "offer-110591620696",
  ebayListingId: "110591620696",
  ebayListingUrl: "https://www.sandbox.ebay.com/itm/110591620696",
  ebaySku: "PF-1795315780804",
  ebayCategoryId: "11700",
  ebayCategoryName: "Test category",
  ebayProgress: null,
  ebayLastError: null,
});

test("hasLiveEbayListing keys off the offer id, like the mobile guard", () => {
  assert.equal(hasLiveEbayListing(listedItem()), true);
  assert.equal(hasLiveEbayListing({ ...listedItem(), ebayOfferId: null }), false);
  assert.equal(hasLiveEbayListing({ ...listedItem(), ebayOfferId: "" }), false);
  assert.equal(hasLiveEbayListing({ id: 1, name: "never listed" }), false);
  assert.equal(hasLiveEbayListing(null), false);
  assert.equal(hasLiveEbayListing(undefined), false);
});

test("the ended update mirrors mobile's markInventoryItemEbayEnded", () => {
  const item = listedItem();
  const ended = ebayListingEndedUpdate(item, 1_700_000_000_000);
  assert.equal(ended.ebayStatus, "idle");
  assert.equal(ended.ebayListingId, null);
  assert.equal(ended.ebayListingUrl, null);
  assert.equal(ended.ebayOfferId, null);
  assert.equal(ended.ebayProgress, null);
  assert.equal(ended.ebayLastError, null);
  assert.equal(ended.ebayUpdatedAt, 1_700_000_000_000);
  // "ebay" leaves listedPlatforms; the Facebook mark is untouched.
  assert.deepEqual(ended.listedPlatforms, ["facebook"]);
  // The item's own eBay descriptors stay, as on mobile — a later
  // re-publish reuses them.
  assert.equal(ended.ebaySku, "PF-1795315780804");
  assert.equal(ended.ebayCategoryId, "11700");
  assert.equal(ended.ebayCategoryName, "Test category");
  // The rest of the item is untouched, and the input is not mutated.
  assert.equal(ended.id, 42);
  assert.equal(ended.quantity, 1);
  assert.equal(item.ebayStatus, "active");
  assert.deepEqual(item.listedPlatforms, ["ebay", "facebook"]);
});

test("an ended item is no longer live and can be published again", () => {
  const ended = ebayListingEndedUpdate(listedItem(), 1);
  assert.equal(hasLiveEbayListing(ended), false);
  const republished = ebayPublishSuccessUpdate(ended, {
    offerId: "offer-2",
    listingId: "110591620700",
    listingUrl: "https://www.sandbox.ebay.com/itm/110591620700",
  }, 2);
  assert.equal(republished.ebayStatus, "active");
  assert.equal(hasLiveEbayListing(republished), true);
  assert.deepEqual(republished.listedPlatforms, ["facebook", "ebay"]);
});

test("the ended state survives a storage round-trip through the local repository", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const { repository } = await import("../src/inventory-repository.js");
  const seed = repository.getSnapshot().items[0];
  const listed = ebayPublishSuccessUpdate(seed, {
    offerId: "offer-seed",
    listingId: "110591620696",
    listingUrl: "https://www.sandbox.ebay.com/itm/110591620696",
  }, 1);
  await repository.saveItem(listed);
  await repository.saveItem(ebayListingEndedUpdate(listed, 2));
  // A page refresh re-reads exactly these persisted bytes.
  const persisted = JSON.parse(store.get("palletscanner.inventoryRepository.v1"));
  const reloaded = persisted.items.find((entry) => entry.id === seed.id);
  assert.equal(reloaded.ebayStatus, "idle");
  assert.equal(reloaded.ebayOfferId ?? null, null);
  assert.equal(reloaded.ebayListingId ?? null, null);
  assert.equal(reloaded.listedPlatforms.includes("ebay"), false);
});

test("the end flow, panel button, and archive warning are wired", async () => {
  const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const servicesSource = await readFile(new URL("../src/web-services.js", import.meta.url), "utf8");
  // The service call hits the existing backend endpoint with the
  // mobile contract: POST { offerId }.
  assert.match(servicesSource, /export const endEbayListing = \(offerId\)/);
  assert.match(servicesSource, /backendRequest\("\/ebay\/listings\/end"/);
  assert.match(servicesSource, /body: JSON\.stringify\(\{ offerId \}\)/);
  // The panel flow confirms in-app, calls with the item's offer id,
  // and persists the ended transition through onSave.
  assert.match(appSource, /const endListing = async \(\) =>/);
  assert.match(appSource, /confirmDialog\(`End the eBay listing for \$\{item\.name\}\?/);
  assert.match(appSource, /await endEbayListing\(item\.ebayOfferId\);/);
  assert.match(appSource, /await onSave\(ebayListingEndedUpdate\(item\)\);/);
  // The button renders only for a live listing.
  assert.match(appSource, /hasLiveEbayListing\(item\) && <button className="danger-button" disabled=\{savingPlatform !== null\} onClick=\{endListing\}/);
  // The archive confirmation warns when a live listing exists.
  assert.match(appSource, /Its eBay listing stays live unless you end it first — archiving will not end it\./);
  // No native dialogs anywhere in the flow (check.mjs also enforces).
  assert.equal(appSource.includes("window.confirm"), false);
});
