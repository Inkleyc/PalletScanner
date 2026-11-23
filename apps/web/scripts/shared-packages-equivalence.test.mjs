import test from "node:test";
import assert from "node:assert/strict";

// Equivalence evidence for PF-SCOPE-006 (web adopts @palletscanner/core),
// extended by PF-SCOPE-008.
//
// This suite imports `@palletscanner/core` — the shipped package entry.
// PF-SCOPE-006 originally reached the identical module file directly,
// because the entry was not Node-ESM-resolvable (the package root
// re-exported `./src` with extensionless specifiers, which Node rejects
// as a directory import). PF-SCOPE-008 fixed the entry (Option A:
// explicit `.ts` extensions across the core import chain), so the suite
// now imports through the entry itself — which is what proves the fix.
// The functions under test are the same ones Vite bundles into the web
// app and Metro bundles into the mobile app.
import {
  getItemPhotos,
  hasListingPhoto,
  isMissingPlatformListing,
} from "@palletscanner/core";

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

// PF-SCOPE-006 recorded this equivalence for a follow-up; PF-SCOPE-008
// adopted the helper at those sites (dashboard-model.js,
// inventory-repository.js, supabase-inventory-repository.js) once the
// entry became Node-resolvable. These assertions remain as the
// regression proof that the adopted helper is behaviour-identical to
// the legacy expressions it replaced. Note the proven domain is
// facebook/ebay only: core filters listedPlatforms to those two before
// checking, which matches every migrated site.
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
