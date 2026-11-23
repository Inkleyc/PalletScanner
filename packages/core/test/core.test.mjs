// Direct unit tests for @palletscanner/core (PF-SCOPE-008 rider).
//
// packages/core previously had zero direct tests — it was covered only
// indirectly via the web equivalence suite and typecheck. These tests
// pin the behaviour of the inventory-query and item-status helpers (the
// audit's named target), plus the posting-readiness photo check that
// PF-SCOPE-008 de-duplicated onto the canonical hasListingPhoto.
//
// They import the package by name, which resolves through the package's
// own `exports` (self-reference) to the shipped entry — the same entry
// Node could not resolve at all before PF-SCOPE-008's Option A fix
// (explicit `.ts` extensions). If the entry regresses, this suite fails
// at import time, loudly.
import test from "node:test";
import assert from "node:assert/strict";

import * as core from "@palletscanner/core";
import {
  filterInventoryItems,
  getFacebookDraftItems,
  getFacebookMissingUrlItems,
  getInventoryWorkflowStatus,
  getItemPhotos,
  getItemsMissingPlatformListing,
  getItemsWithoutPhotos,
  getListingFilterLabel,
  getPostingReadiness,
  hasActiveInventoryFilters,
  hasListingPhoto,
  isFacebookDraftOpen,
  isListedAnywhere,
  isMissingFacebookListingUrl,
  isMissingPlatformListing,
  matchesListingFilter,
  sortInventoryItems,
} from "@palletscanner/core";

const baseItem = {
  id: 1,
  photo: null,
  photos: ["a.jpg"],
  name: "Widget",
  condition: "Used",
  quantity: 2,
  low_price: 5,
  high_price: 10,
  floor_price: 4,
  best_platform: "ebay",
  listing_title: "Widget title",
  listing_description: "Widget description",
  listedPlatforms: [],
  palletId: "pallet-1",
  soldPrice: null,
};

const item = (overrides = {}) => ({ ...baseItem, ...overrides });

// ---------------------------------------------------------------- entry

test("the entry exports exactly the recorded surface (no helper added, removed, or renamed)", () => {
  assert.deepEqual(Object.keys(core).sort(), [
    "LOOSE_ITEMS_PALLET_ID",
    "buildInventoryCsv",
    "calculateInventoryBalance",
    "calculateInventoryTotals",
    "calculateInventoryValueSummary",
    "calculatePalletMetrics",
    "createEmptyListingDrafts",
    "createInventoryExportBasename",
    "createListingDrafts",
    "filterInventoryItems",
    "findLedgerDiscrepancy",
    "getFacebookDraftItems",
    "getFacebookMissingUrlItems",
    "getInventoryWorkflowStatus",
    "getItemPhotos",
    "getItemsMissingPlatformListing",
    "getItemsWithoutPhotos",
    "getListingDraftPlatformLabel",
    "getListingFilterLabel",
    "getPlatformListingContent",
    "getPostingReadiness",
    "getPostingReadinessMessage",
    "hasActiveInventoryFilters",
    "hasListingPhoto",
    "isFacebookDraftOpen",
    "isListedAnywhere",
    "isMissingFacebookListingUrl",
    "isMissingPlatformListing",
    "matchesListingFilter",
    "parseMoneyAmount",
    "parsePositiveInteger",
    "parsePriceRange",
    "sanitizeBarcodeValue",
    "sortInventoryItems",
  ]);
});

// ------------------------------------------------------- inventory-query

test("getItemPhotos prefers the photos array, falls back to the single photo", () => {
  assert.deepEqual(getItemPhotos(item({ photos: ["a", "b"], photo: "c" })), ["a", "b"]);
  assert.deepEqual(getItemPhotos(item({ photos: [], photo: "c" })), ["c"]);
  assert.deepEqual(getItemPhotos(item({ photos: undefined, photo: "c" })), ["c"]);
  assert.deepEqual(getItemPhotos(item({ photos: [], photo: null })), []);
  assert.deepEqual(getItemPhotos(item({ photos: undefined, photo: null })), []);
});

test("hasListingPhoto is a pure length check over getItemPhotos", () => {
  assert.equal(hasListingPhoto(item({ photos: ["a"] })), true);
  assert.equal(hasListingPhoto(item({ photos: [""], photo: null })), true);
  assert.equal(hasListingPhoto(item({ photos: [], photo: "x" })), true);
  assert.equal(hasListingPhoto(item({ photos: [], photo: "" })), false);
  assert.equal(hasListingPhoto(item({ photos: [], photo: null })), false);
  assert.equal(hasListingPhoto(item({ photos: undefined, photo: undefined })), false);
});

test("isMissingPlatformListing only ever sees facebook/ebay (listedPlatforms is filtered first)", () => {
  assert.equal(isMissingPlatformListing(item({ listedPlatforms: ["facebook"] }), "facebook"), false);
  assert.equal(isMissingPlatformListing(item({ listedPlatforms: ["facebook"] }), "ebay"), true);
  assert.equal(isMissingPlatformListing(item({ listedPlatforms: ["facebook", "ebay"] }), "ebay"), false);
  // Precision note from PF-SCOPE-006/008: a non-facebook/ebay entry in
  // listedPlatforms is filtered out before the check, so it never counts
  // as listed anywhere.
  assert.equal(isMissingPlatformListing(item({ listedPlatforms: ["other"] }), "facebook"), true);
  assert.equal(isMissingPlatformListing(item({ listedPlatforms: ["facebook", "other"] }), "facebook"), false);
  assert.equal(isMissingPlatformListing(item({ listedPlatforms: undefined }), "ebay"), true);
  assert.equal(isMissingPlatformListing(item({ listedPlatforms: "facebook" }), "facebook"), true);
});

test("getListingFilterLabel covers every filter plus the default", () => {
  assert.equal(getListingFilterLabel("needs-facebook"), "Needs Facebook");
  assert.equal(getListingFilterLabel("facebook-drafts"), "Facebook Drafts");
  assert.equal(getListingFilterLabel("missing-facebook-url"), "Missing Facebook URL");
  assert.equal(getListingFilterLabel("no-photos"), "No Photos");
  assert.equal(getListingFilterLabel("needs-ebay"), "Needs eBay");
  assert.equal(getListingFilterLabel("listed"), "Listed");
  assert.equal(getListingFilterLabel("all"), "All Statuses");
});

test("matchesListingFilter routes each filter to its predicate", () => {
  assert.equal(matchesListingFilter(item({ listedPlatforms: [] }), "needs-facebook"), true);
  assert.equal(matchesListingFilter(item({ listedPlatforms: ["facebook"] }), "needs-facebook"), false);
  assert.equal(matchesListingFilter(item({ listedPlatforms: [] }), "needs-ebay"), true);
  assert.equal(matchesListingFilter(item({ listedPlatforms: ["ebay"] }), "needs-ebay"), false);
  assert.equal(matchesListingFilter(item({ photos: [], photo: null }), "no-photos"), true);
  assert.equal(matchesListingFilter(item({ photos: ["a"] }), "no-photos"), false);
  assert.equal(matchesListingFilter(item({ listedPlatforms: ["ebay"] }), "listed"), true);
  assert.equal(matchesListingFilter(item({ listedPlatforms: [] }), "listed"), false);
  assert.equal(matchesListingFilter(item({}), "all"), true);
});

test("isFacebookDraftOpen requires an opened draft that is not yet listed", () => {
  assert.equal(isFacebookDraftOpen(item({ facebookStatus: "opened", listedPlatforms: [] })), true);
  assert.equal(isFacebookDraftOpen(item({ facebookStatus: "opened", listedPlatforms: ["facebook"] })), false);
  assert.equal(isFacebookDraftOpen(item({ facebookStatus: "listed", listedPlatforms: [] })), false);
  assert.equal(isFacebookDraftOpen(item({ facebookStatus: undefined, listedPlatforms: [] })), false);
});

test("isMissingFacebookListingUrl requires a facebook listing without a URL", () => {
  assert.equal(isMissingFacebookListingUrl(item({ listedPlatforms: ["facebook"], facebookListingUrl: undefined })), true);
  assert.equal(isMissingFacebookListingUrl(item({ listedPlatforms: ["facebook"], facebookListingUrl: "" })), true);
  assert.equal(isMissingFacebookListingUrl(item({ listedPlatforms: ["facebook"], facebookListingUrl: "https://example.com" })), false);
  assert.equal(isMissingFacebookListingUrl(item({ listedPlatforms: [], facebookListingUrl: undefined })), false);
});

test("isListedAnywhere reflects the filtered platform list", () => {
  assert.equal(isListedAnywhere(item({ listedPlatforms: ["ebay"] })), true);
  assert.equal(isListedAnywhere(item({ listedPlatforms: ["other"] })), false);
  assert.equal(isListedAnywhere(item({ listedPlatforms: [] })), false);
});

test("sortInventoryItems sorts by mode and does not mutate its input", () => {
  const items = [
    item({ id: 1, low_price: 30, high_price: 30 }),
    item({ id: 3, low_price: 10, high_price: 50 }),
    item({ id: 2, low_price: 20, high_price: 20 }),
  ];
  assert.deepEqual(sortInventoryItems(items, "date").map((entry) => entry.id), [3, 2, 1]);
  assert.deepEqual(sortInventoryItems(items, "high-desc").map((entry) => entry.id), [3, 1, 2]);
  assert.deepEqual(sortInventoryItems(items, "low-asc").map((entry) => entry.id), [3, 2, 1]);
  assert.deepEqual(items.map((entry) => entry.id), [1, 3, 2]);
});

test("filterInventoryItems composes pallet, search, listing filter, and sort", () => {
  const items = [
    item({ id: 1, name: "Red Widget", palletId: "p1", listedPlatforms: [] }),
    item({ id: 2, name: "Blue Widget", palletId: "p2", listedPlatforms: ["ebay"] }),
    item({ id: 3, name: "red gadget", palletId: "p1", listedPlatforms: ["facebook"] }),
  ];
  const base = { selectedPalletId: "all", searchQuery: "", listingFilter: "all", sortMode: "date" };
  assert.deepEqual(filterInventoryItems(items, base).map((entry) => entry.id), [3, 2, 1]);
  assert.deepEqual(
    filterInventoryItems(items, { ...base, selectedPalletId: "p1" }).map((entry) => entry.id),
    [3, 1],
  );
  assert.deepEqual(
    filterInventoryItems(items, { ...base, searchQuery: "  RED " }).map((entry) => entry.id),
    [3, 1],
  );
  assert.deepEqual(
    filterInventoryItems(items, { ...base, listingFilter: "needs-ebay" }).map((entry) => entry.id),
    [3, 1],
  );
  // A non-string name is treated as "" and never matches a query.
  assert.deepEqual(
    filterInventoryItems([item({ id: 9, name: undefined })], { ...base, searchQuery: "widget" }),
    [],
  );
});

test("collection selectors filter with the same predicates", () => {
  const items = [
    item({ id: 1, listedPlatforms: [], facebookStatus: "opened" }),
    item({ id: 2, listedPlatforms: ["facebook"], facebookListingUrl: undefined }),
    item({ id: 3, listedPlatforms: ["facebook", "ebay"], facebookListingUrl: "https://example.com/3", photos: [], photo: null }),
  ];
  assert.deepEqual(getItemsMissingPlatformListing(items, "ebay").map((entry) => entry.id), [1, 2]);
  assert.deepEqual(getItemsMissingPlatformListing(items, "facebook").map((entry) => entry.id), [1]);
  assert.deepEqual(getFacebookDraftItems(items).map((entry) => entry.id), [1]);
  assert.deepEqual(getFacebookMissingUrlItems(items).map((entry) => entry.id), [2]);
  assert.deepEqual(getItemsWithoutPhotos(items).map((entry) => entry.id), [3]);
});

test("hasActiveInventoryFilters detects each dimension independently", () => {
  const base = { selectedPalletId: "all", searchQuery: "", listingFilter: "all", sortMode: "date" };
  assert.equal(hasActiveInventoryFilters(base), false);
  assert.equal(hasActiveInventoryFilters({ ...base, selectedPalletId: "p1" }), true);
  assert.equal(hasActiveInventoryFilters({ ...base, searchQuery: " x " }), true);
  assert.equal(hasActiveInventoryFilters({ ...base, searchQuery: "   " }), false);
  assert.equal(hasActiveInventoryFilters({ ...base, listingFilter: "listed" }), true);
  assert.equal(hasActiveInventoryFilters({ ...base, sortMode: "low-asc" }), true);
});

// ------------------------------------------------------------ item-status

test("getInventoryWorkflowStatus: a fully ready item is ready_to_list", () => {
  assert.deepEqual(getInventoryWorkflowStatus(item({})), {
    status: "ready_to_list",
    label: "Ready",
    priority: 40,
  });
});

test("getInventoryWorkflowStatus: sold wins over every other state", () => {
  assert.deepEqual(
    getInventoryWorkflowStatus(item({ soldPrice: 25, listedPlatforms: ["ebay"], photos: [], photo: null })),
    { status: "sold", label: "Sold", priority: 70 },
  );
  // NaN is not a sale.
  assert.equal(getInventoryWorkflowStatus(item({ soldPrice: Number.NaN })).status, "ready_to_list");
});

test("getInventoryWorkflowStatus: listed via platforms or an active eBay status", () => {
  assert.deepEqual(getInventoryWorkflowStatus(item({ listedPlatforms: ["facebook"] })), {
    status: "listed",
    label: "Listed",
    priority: 60,
  });
  assert.equal(getInventoryWorkflowStatus(item({ ebayStatus: "active" })).status, "listed");
  // Listed beats listing-in-progress when both signals are present.
  assert.equal(
    getInventoryWorkflowStatus(item({ facebookStatus: "opened", listedPlatforms: ["facebook"] })).status,
    "listed",
  );
});

test("getInventoryWorkflowStatus: listing in progress via opened facebook draft or posting eBay", () => {
  assert.deepEqual(getInventoryWorkflowStatus(item({ facebookStatus: "opened" })), {
    status: "listing_in_progress",
    label: "Listing Started",
    priority: 50,
  });
  assert.equal(getInventoryWorkflowStatus(item({ ebayStatus: "posting" })).status, "listing_in_progress");
});

test("getInventoryWorkflowStatus: missing photos is checked before review completeness", () => {
  assert.deepEqual(
    getInventoryWorkflowStatus(item({ photos: [], photo: null, listing_title: "", low_price: 0 })),
    { status: "needs_photos", label: "Needs Photos", priority: 20 },
  );
  // The canonical hasListingPhoto is length-based: a one-element photos
  // array counts as having a photo even when the entry is an empty string.
  assert.equal(
    getInventoryWorkflowStatus(item({ photos: [""], photo: null })).status,
    "ready_to_list",
  );
});

test("getInventoryWorkflowStatus: incomplete copy or prices need review", () => {
  assert.deepEqual(getInventoryWorkflowStatus(item({ listing_title: "  " })), {
    status: "needs_review",
    label: "Needs Review",
    priority: 30,
  });
  assert.equal(getInventoryWorkflowStatus(item({ listing_description: "" })).status, "needs_review");
  assert.equal(getInventoryWorkflowStatus(item({ low_price: 0 })).status, "needs_review");
  assert.equal(getInventoryWorkflowStatus(item({ high_price: -1 })).status, "needs_review");
});

test("getInventoryWorkflowStatus: no best platform yet means still captured", () => {
  assert.deepEqual(getInventoryWorkflowStatus(item({ best_platform: "" })), {
    status: "captured",
    label: "Captured",
    priority: 10,
  });
  assert.equal(getInventoryWorkflowStatus(item({ best_platform: undefined })).status, "captured");
});

// --------------------------------------- posting-readiness (rider proof)

test("getPostingReadiness photo error comes from the canonical hasListingPhoto", () => {
  const ready = { listing_title: "T", listing_description: "D", condition: "Used", high_price: 10, quantity: 1, floor_price: 1 };
  const photoError = "At least one listing photo is required.";
  assert.equal(getPostingReadiness(item({ ...ready, photos: ["a"], photo: null }), "ebay").errors.includes(photoError), false);
  assert.equal(getPostingReadiness(item({ ...ready, photos: [], photo: "x" }), "ebay").errors.includes(photoError), false);
  assert.equal(getPostingReadiness(item({ ...ready, photos: [""], photo: null }), "ebay").errors.includes(photoError), false);
  assert.equal(getPostingReadiness(item({ ...ready, photos: [], photo: null }), "ebay").errors.includes(photoError), true);
  assert.equal(getPostingReadiness(item({ ...ready, photos: undefined, photo: undefined }), "ebay").errors.includes(photoError), true);
});
