import type { InventoryItem } from "@/lib/inventory-store";
import {
  getPostingReadiness as getCorePostingReadiness,
  getPostingReadinessMessage as getCorePostingReadinessMessage,
  type PostingReadiness,
} from "@palletscanner/core";

export type PostingPlatform = "facebook" | "ebay";
export type { PostingReadiness };

export const getPostingReadiness = (
  item: InventoryItem,
  platform: PostingPlatform,
) => getCorePostingReadiness(item, platform);

export const getPostingReadinessMessage = (
  item: InventoryItem,
  platform: PostingPlatform,
) => getCorePostingReadinessMessage(item, platform);
