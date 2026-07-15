import type { InventoryItem, MarketplacePlatform } from "./domain";

export type ListingFilter =
  | "all"
  | "needs-facebook"
  | "facebook-drafts"
  | "missing-facebook-url"
  | "no-photos"
  | "needs-ebay"
  | "listed";

export type InventorySortMode = "date" | "high-desc" | "low-asc";

export type InventoryFilterOptions = {
  selectedPalletId: string;
  searchQuery: string;
  listingFilter: ListingFilter;
  sortMode: InventorySortMode;
};

export const getListingFilterLabel = (listingFilter: ListingFilter) => {
  switch (listingFilter) {
    case "needs-facebook":
      return "Needs Facebook";
    case "facebook-drafts":
      return "Facebook Drafts";
    case "missing-facebook-url":
      return "Missing Facebook URL";
    case "no-photos":
      return "No Photos";
    case "needs-ebay":
      return "Needs eBay";
    case "listed":
      return "Listed";
    default:
      return "All Statuses";
  }
};

export const getItemPhotos = (item: InventoryItem) =>
  item.photos?.length ? item.photos : item.photo ? [item.photo] : [];

export const hasListingPhoto = (item: InventoryItem) =>
  getItemPhotos(item).length > 0;

export const isMissingPlatformListing = (
  item: InventoryItem,
  platform: MarketplacePlatform,
) => !item.listedPlatforms.includes(platform);

export const isFacebookDraftOpen = (item: InventoryItem) =>
  item.facebookStatus === "opened" &&
  isMissingPlatformListing(item, "facebook");

export const isMissingFacebookListingUrl = (item: InventoryItem) =>
  item.listedPlatforms.includes("facebook") && !item.facebookListingUrl;

export const isListedAnywhere = (item: InventoryItem) =>
  item.listedPlatforms.length > 0;

export const matchesListingFilter = (
  item: InventoryItem,
  listingFilter: ListingFilter,
) => {
  switch (listingFilter) {
    case "needs-facebook":
      return isMissingPlatformListing(item, "facebook");
    case "facebook-drafts":
      return isFacebookDraftOpen(item);
    case "missing-facebook-url":
      return isMissingFacebookListingUrl(item);
    case "no-photos":
      return !hasListingPhoto(item);
    case "needs-ebay":
      return isMissingPlatformListing(item, "ebay");
    case "listed":
      return isListedAnywhere(item);
    default:
      return true;
  }
};

export const filterInventoryItems = (
  items: InventoryItem[],
  options: InventoryFilterOptions,
) => {
  const normalizedQuery = options.searchQuery.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (
      options.selectedPalletId !== "all" &&
      item.palletId !== options.selectedPalletId
    ) {
      return false;
    }

    if (
      normalizedQuery &&
      !item.name.toLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }

    return matchesListingFilter(item, options.listingFilter);
  });

  return sortInventoryItems(filteredItems, options.sortMode);
};

export const sortInventoryItems = (
  items: InventoryItem[],
  sortMode: InventorySortMode,
) => {
  const sortedItems = [...items];

  if (sortMode === "high-desc") {
    sortedItems.sort((a, b) => b.high_price - a.high_price);
    return sortedItems;
  }

  if (sortMode === "low-asc") {
    sortedItems.sort((a, b) => a.low_price - b.low_price);
    return sortedItems;
  }

  sortedItems.sort((a, b) => b.id - a.id);
  return sortedItems;
};

export const getItemsMissingPlatformListing = (
  items: InventoryItem[],
  platform: MarketplacePlatform,
) => items.filter((item) => isMissingPlatformListing(item, platform));

export const getFacebookDraftItems = (items: InventoryItem[]) =>
  items.filter(isFacebookDraftOpen);

export const getFacebookMissingUrlItems = (items: InventoryItem[]) =>
  items.filter(isMissingFacebookListingUrl);

export const getItemsWithoutPhotos = (items: InventoryItem[]) =>
  items.filter((item) => !hasListingPhoto(item));

export const hasActiveInventoryFilters = (options: InventoryFilterOptions) =>
  options.selectedPalletId !== "all" ||
  options.searchQuery.trim().length > 0 ||
  options.sortMode !== "date" ||
  options.listingFilter !== "all";
