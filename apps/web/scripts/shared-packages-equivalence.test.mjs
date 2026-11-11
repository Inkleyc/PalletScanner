import test from "node:test";
import assert from "node:assert/strict";

// Equivalence evidence for PF-SCOPE-006 (web adopts @palletscanner/core).
//
// The shipped web code imports `@palletscanner/core` (the package entry),
// which Vite resolves. Node's ESM loader cannot resolve that entry: the
// package root re-exports `./src` with extensionless specifiers, which
// Node rejects as a directory import. This test therefore reaches the
// identical module file directly. The functions under test are the same
// ones Vite bundles into the web app; only the specifier differs, and the
// difference is the Node/Vite resolution boundary documented in the
// PF-SCOPE-006 scope document — not a second implementation.
import {
  getItemPhotos,
  hasListingPhoto,
  isMissingPlatformListing,
} from "../../../packages/core/src/inventory-query.ts";

// Legacy web expressions, copied from the code PF-SCOPE-006 replaces
// (App.jsx PhotoReview, web-services.js getEbayListingPayload,
// dashboard-components.jsx ItemThumbnail, dashboard-model.js photo check).
// Each assertion below proves the core helper returns exactly what the
// legacy expression returned, over the same inputs — so adopting core
// cannot change behaviour for these call sites.
const legacyPhotos = (item) =>
  item.photos?.length ? item.photos : item.photo ? [item.photo] : [];
const legacyHasPhoto = (item) =>
  !(!item.photos?.length && !item.photo);
const legacyThumbnailUri = (item) => item.photos?.[0] ?? item.photo;
const legacyMissingPlatform = (item, platform) =>
  !item.listedPlatforms?.includes(platform);

const photoFixtures = [
  {},
  { photo: null },
  { photo: "" },
  { photo: "x.jpg" },
  { photos: [] },
  { photos: [], photo: "x.jpg" },
  { photos: [], photo: "" },
  { photos: ["a.jpg"] },
  { photos: ["a.jpg"], photo: "b.jpg" },
  { photos: ["a.jpg", "b.jpg"] },
  { photos: [""], photo: "b.jpg" },
];

for (const item of photoFixtures) {
  test(`getItemPhotos matches the legacy photo list for ${JSON.stringify(item)}`, () => {
    assert.deepEqual(getItemPhotos(item), legacyPhotos(item));
  });
  test(`hasListingPhoto matches the legacy photo check for ${JSON.stringify(item)}`, () => {
    assert.equal(hasListingPhoto(item), legacyHasPhoto(item));
  });
  // The thumbnail renders a placeholder for any falsy URI, so equivalence
  // is on the rendered outcome: a truthy URI must be identical, and both
  // falsy forms ("", undefined) must render the placeholder. The legacy
  // expression can yield "" where core yields undefined (empty-string
  // photo); both are falsy and render identically.
  test(`first core photo matches the legacy thumbnail outcome for ${JSON.stringify(item)}`, () => {
    assert.equal(getItemPhotos(item)[0] || null, legacyThumbnailUri(item) || null);
  });
}

const platformFixtures = [
  {},
  { listedPlatforms: undefined },
  { listedPlatforms: [] },
  { listedPlatforms: ["facebook"] },
  { listedPlatforms: ["ebay"] },
  { listedPlatforms: ["facebook", "ebay"] },
  { listedPlatforms: ["other"] },
  { listedPlatforms: ["facebook", "other"] },
];

// Recorded equivalence for a follow-up, not a migrated call site: the web
// sites that check platform listing live in Node-imported modules
// (dashboard-model.js, supabase-inventory-repository.js), which cannot
// import the core package entry under Node. These assertions prove the
// core helper is behaviour-identical there too, so a later scope that
// fixes the entry resolution can adopt it without re-proving equivalence.
for (const item of platformFixtures) {
  for (const platform of ["facebook", "ebay"]) {
    test(`isMissingPlatformListing matches the legacy check for ${JSON.stringify(item)} / ${platform}`, () => {
      assert.equal(
        isMissingPlatformListing(item, platform),
        legacyMissingPlatform(item, platform),
      );
    });
  }
}
