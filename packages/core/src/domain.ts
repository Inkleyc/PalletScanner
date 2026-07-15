export type MarketplacePlatform = "facebook" | "ebay";

export type EbayListingStatus = "idle" | "posting" | "active" | "error";

export type FacebookListingStatus = "idle" | "opened" | "listed" | "error";

export type InventoryItem = {
  id: number;
  photo: string | null;
  photos?: string[];
  name: string;
  condition: string;
  quantity: number;
  low_price: number;
  high_price: number;
  floor_price: number;
  best_platform: string;
  listing_title: string;
  listing_description: string;
  listing_title_facebook?: string;
  listing_description_facebook?: string;
  listing_title_ebay?: string;
  listing_description_ebay?: string;
  listedPlatforms: MarketplacePlatform[];
  palletId: string;
  soldPrice: number | null;
  ebayListingId?: string;
  ebayListingUrl?: string;
  ebaySku?: string;
  ebayOfferId?: string;
  ebayCategoryId?: string;
  ebayCategoryName?: string;
  ebayStatus?: EbayListingStatus;
  ebayProgress?: string;
  ebayLastError?: string;
  ebayUpdatedAt?: number;
  facebookStatus?: FacebookListingStatus;
  facebookListingUrl?: string;
  facebookLastError?: string;
  facebookUpdatedAt?: number;
};

export type PalletSession = {
  id: string;
  name: string;
  createdAt: number;
  palletCost: number | null;
};

