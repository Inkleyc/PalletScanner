export type MarketplacePlatform = "facebook" | "ebay";

export type EbayListingStatus = "idle" | "posting" | "active" | "error";

export type FacebookListingStatus = "idle" | "opened" | "listed" | "error";

export type CaptureAnalysisResult = {
  name: string;
  category?: string;
  description: string;
  condition: string;
  low_price: number;
  high_price: number;
  floor_price?: number | null;
  best_platform: string;
  platform_reason?: string;
  listing_title?: string;
  listing_description?: string;
  listing_title_facebook?: string;
  listing_description_facebook?: string;
  listing_title_ebay?: string;
  listing_description_ebay?: string;
  photo_tips?: string;
  photo_example_queries?: string[];
  photo_shot_list?: string[];
  sellability_score?: number;
  sellability_reason?: string;
  ebay_item_specifics?: Record<string, string>;
};

export type InventoryItem = {
  id: number;
  photo: string | null;
  photos?: string[];
  name: string;
  barcode?: string;
  category?: string;
  condition: string;
  quantity: number;
  onHand?: number;
  reserved?: number;
  available?: number;
  shortage?: number;
  low_price: number;
  high_price: number;
  floor_price: number;
  listing_price?: number;
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
  ebayItemSpecifics?: Record<string, string>;
  facebookStatus?: FacebookListingStatus;
  facebookListingUrl?: string;
  facebookLastError?: string;
  facebookUpdatedAt?: number;
  capturedAt?: string;
};

export type PalletSession = {
  id: string;
  name: string;
  createdAt: number;
  palletCost: number | null;
  isSystem?: boolean;
  acquisitionType?: "pallet" | "loose_system";
};

export const LOOSE_ITEMS_PALLET_ID = "loose-items";

export type ItemPhoto = {
  id: string;
  itemId: number;
  uri: string;
  createdAt: number;
};

export type Sale = {
  id: string;
  itemId: number;
  marketplace: MarketplacePlatform | "other";
  quantity: number;
  soldPrice: number;
  fees: number;
  shippingCost: number;
  soldAt: number;
};

export type ActivityEventType =
  | "pallet.created"
  | "pallet.updated"
  | "pallet.deleted"
  | "item.created"
  | "item.updated"
  | "item.deleted"
  | "listing.updated"
  | "sale.recorded"
  | "data.restored";

export type ActivityEvent = {
  id: string;
  type: ActivityEventType;
  entityId: string;
  occurredAt: number;
  actorId?: string;
  details?: Record<string, string | number | boolean | null>;
};
