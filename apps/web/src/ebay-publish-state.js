// PF-SCOPE-029: the persisted eBay publish-state transitions for a web
// item, in one place so the failure transition is directly testable.
//
// Before this scope, a failed web publish was transient-only:
// publishEbay saved ebayStatus "posting", the publish call failed, and
// the catch set only component-local error text — the persisted item
// kept "posting" with no ebayLastError, so after a refresh the
// Marketplace panel looked exactly as before the attempt and the item
// never appeared in Review → Publishing issues (PF-SCOPE-004 Drill 1,
// 2026-11-21: eBay rejected a $0.01 publish because the auto-decline
// amount was not below the Buy It Now price, and nothing about the
// rejection survived on the item).
//
// The transitions, each persisted through the same onSave path as
// every other item update (so they survive a refresh in both the
// local and cloud repositories):
// - started: ebayStatus "posting", any previous error cleared.
// - failure: ebayStatus "error" + ebayLastError holding the exact
//   message the publish call returned. This is what the Review →
//   Publishing issues filter keys off (ebayStatus === "error"), what
//   the Marketplace panel renders, and what the Publishing issues
//   queue row shows via getPersistedPublishError below.
// - success: ebayStatus "active" with the listing identifiers and the
//   error cleared — fixing the cause and re-publishing removes the
//   item from Publishing issues.

export const ebayPublishStartedUpdate = (item, now = Date.now()) => ({
  ...item,
  ebayStatus: "posting",
  ebayLastError: null,
  ebayUpdatedAt: now,
});

export const ebayPublishFailureUpdate = (item, message, now = Date.now()) => ({
  ...item,
  ebayStatus: "error",
  ebayLastError: message,
  ebayUpdatedAt: now,
});

export const ebayPublishSuccessUpdate = (item, result, now = Date.now()) => ({
  ...item,
  ebayStatus: "active",
  ebayOfferId: result.offerId,
  ebayListingId: result.listingId,
  ebayListingUrl: result.listingUrl,
  ebayLastError: null,
  ebayUpdatedAt: now,
  listedPlatforms: [...new Set([...(item.listedPlatforms ?? []), "ebay"])],
});

// The stored publish error to show for an item in Review → Publishing
// issues: the eBay message when the eBay publish is the failed one,
// else the Facebook one. Null when neither platform carries a
// persisted error.
export const getPersistedPublishError = (item) => {
  if (item.ebayStatus === "error" && item.ebayLastError) return item.ebayLastError;
  if (item.facebookStatus === "error" && item.facebookLastError) return item.facebookLastError;
  return null;
};

// PF-SCOPE-030: an item has a live eBay listing when it carries the
// offer id the backend's POST /ebay/listings/end withdraws — the same
// guard the mobile app's endItemEbayListing uses. This drives both
// the Marketplace panel's "End listing" action and the archive
// confirmation's stays-live warning.
export const hasLiveEbayListing = (item) => Boolean(item?.ebayOfferId);

// The persisted state after a listing is ended on eBay, mirroring the
// mobile app's markInventoryItemEbayEnded: back to "idle", the
// listing identifiers and any publish error cleared, "ebay" removed
// from listedPlatforms (other platforms untouched). ebaySku and the
// category stay, as on mobile — they describe the item, not the ended
// listing, and a later re-publish reuses them.
export const ebayListingEndedUpdate = (item, now = Date.now()) => ({
  ...item,
  ebayStatus: "idle",
  ebayListingId: null,
  ebayListingUrl: null,
  ebayOfferId: null,
  ebayProgress: null,
  ebayLastError: null,
  ebayUpdatedAt: now,
  listedPlatforms: (item.listedPlatforms ?? []).filter((platform) => platform !== "ebay"),
});
