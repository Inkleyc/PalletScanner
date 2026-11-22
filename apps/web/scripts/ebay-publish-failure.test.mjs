import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ebayPublishFailureUpdate,
  ebayPublishStartedUpdate,
  ebayPublishSuccessUpdate,
  getPersistedPublishError,
} from "../src/ebay-publish-state.js";

// PF-SCOPE-029: a failed web publish was transient-only — publishEbay
// saved ebayStatus "posting", the publish call failed, and the catch
// set only component-local error text, so the persisted item kept
// "posting" with no ebayLastError and never appeared in Review →
// Publishing issues (PF-SCOPE-004 Drill 1, 2026-11-21).
//
// These tests drive the persisted publish-state transitions the
// ListingReview publish flow now saves. The publish flow itself is a
// React component closure (not importable here), so the queue test
// mirrors matchesWorkFilter's "failed" branch exactly, and the last
// test asserts the wiring in App.jsx source.

const DRILL_1_MESSAGE = "The Auto decline amount cannot be greater than or equal to the Buy It Now price. value is invalid.";

const baseItem = () => ({
  id: 42,
  name: "Drill 1 item",
  quantity: 1,
  soldPrice: null,
  listedPlatforms: [],
  ebayStatus: "idle",
  ebayLastError: null,
});

test("the failure update persists the error state with the exact eBay message", () => {
  const updated = ebayPublishFailureUpdate(baseItem(), DRILL_1_MESSAGE, 1_700_000_000_000);
  assert.equal(updated.ebayStatus, "error");
  assert.equal(updated.ebayLastError, DRILL_1_MESSAGE);
  assert.equal(updated.ebayUpdatedAt, 1_700_000_000_000);
  // The rest of the item is untouched by the transition.
  assert.equal(updated.id, 42);
  assert.equal(updated.name, "Drill 1 item");
  assert.equal(updated.quantity, 1);
});

test("a second failure replaces the stored message", () => {
  const first = ebayPublishFailureUpdate(baseItem(), "first failure", 1);
  const second = ebayPublishFailureUpdate(first, "second failure", 2);
  assert.equal(second.ebayStatus, "error");
  assert.equal(second.ebayLastError, "second failure");
  assert.equal(second.ebayUpdatedAt, 2);
});

test("starting a re-publish clears the previous persisted error", () => {
  const failed = ebayPublishFailureUpdate(baseItem(), DRILL_1_MESSAGE, 1);
  const restarted = ebayPublishStartedUpdate(failed, 2);
  assert.equal(restarted.ebayStatus, "posting");
  assert.equal(restarted.ebayLastError, null);
});

test("success after a failure clears the error and records the listing", () => {
  const failed = ebayPublishFailureUpdate(baseItem(), DRILL_1_MESSAGE, 1);
  const published = ebayPublishSuccessUpdate(failed, {
    offerId: "offer-1",
    listingId: "110591567038",
    listingUrl: "https://www.sandbox.ebay.com/itm/110591567038",
  }, 2);
  assert.equal(published.ebayStatus, "active");
  assert.equal(published.ebayLastError, null);
  assert.equal(published.ebayOfferId, "offer-1");
  assert.equal(published.ebayListingId, "110591567038");
  assert.equal(published.ebayListingUrl, "https://www.sandbox.ebay.com/itm/110591567038");
  assert.deepEqual(published.listedPlatforms, ["ebay"]);
});

test("success does not duplicate the ebay entry in listedPlatforms", () => {
  const item = { ...baseItem(), listedPlatforms: ["ebay", "facebook"] };
  const published = ebayPublishSuccessUpdate(item, { offerId: "o", listingId: "l", listingUrl: "u" }, 3);
  assert.deepEqual(published.listedPlatforms, ["ebay", "facebook"]);
});

// Mirror of matchesWorkFilter's "failed" branch in App.jsx — the
// predicate that drives Review → Publishing issues. matchesWorkFilter
// lives in the component file and is not importable here.
const matchesPublishingIssues = (item) => item.ebayStatus === "error" || item.facebookStatus === "error";

test("the failure state lands the item in Publishing issues; success removes it", () => {
  const item = baseItem();
  assert.equal(matchesPublishingIssues(item), false);
  const failed = ebayPublishFailureUpdate(item, DRILL_1_MESSAGE, 1);
  assert.equal(matchesPublishingIssues(failed), true);
  const published = ebayPublishSuccessUpdate(failed, { offerId: "o", listingId: "l", listingUrl: "u" }, 2);
  assert.equal(matchesPublishingIssues(published), false);
});

test("getPersistedPublishError returns the stored message for the queue row", () => {
  assert.equal(getPersistedPublishError(ebayPublishFailureUpdate(baseItem(), DRILL_1_MESSAGE, 1)), DRILL_1_MESSAGE);
  assert.equal(getPersistedPublishError({ ...baseItem(), facebookStatus: "error", facebookLastError: "Facebook draft failed" }), "Facebook draft failed");
  assert.equal(getPersistedPublishError(baseItem()), null);
  assert.equal(getPersistedPublishError(ebayPublishStartedUpdate(baseItem(), 1)), null);
  assert.equal(getPersistedPublishError({ ...baseItem(), ebayStatus: "error", ebayLastError: null }), null);
});

test("the persisted failure survives a storage round-trip through the local repository", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const { repository } = await import("../src/inventory-repository.js");
  const seed = repository.getSnapshot().items[0];
  await repository.saveItem(ebayPublishFailureUpdate(seed, DRILL_1_MESSAGE, 1_700_000_000_000));
  // A page refresh re-reads exactly these persisted bytes.
  const persisted = JSON.parse(store.get("palletscanner.inventoryRepository.v1"));
  const reloaded = persisted.items.find((entry) => entry.id === seed.id);
  assert.equal(reloaded.ebayStatus, "error");
  assert.equal(reloaded.ebayLastError, DRILL_1_MESSAGE);
});

test("the publish flow and the Publishing issues queue are wired to the persisted state", async () => {
  const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /from "\.\/ebay-publish-state\.js";/);
  // Both publish catches persist the failure (direct publish + the
  // requirements-answers resubmit).
  assert.match(appSource, /const persistPublishFailure = async \(baseItem, message\)/);
  assert.equal(appSource.match(/await persistPublishFailure\(/g)?.length, 2);
  // The started/success saves go through the same transition helpers.
  assert.match(appSource, /await onSave\(ebayPublishStartedUpdate\(item\)\)/);
  assert.match(appSource, /await onSave\(ebayPublishSuccessUpdate\(candidate, result\)\)/);
  // The Review queue row shows the stored message.
  assert.match(appSource, /getPersistedPublishError\(item\) && <span className="publish-error">/);
});
