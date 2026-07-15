import type { InventoryItem } from "./domain";
import { hasListingPhoto } from "./inventory-query";

export type InventoryWorkflowStatus =
  | "captured"
  | "needs_photos"
  | "needs_review"
  | "ready_to_list"
  | "listing_in_progress"
  | "listed"
  | "sold";

export type InventoryWorkflowStatusMeta = {
  status: InventoryWorkflowStatus;
  label: string;
  priority: number;
};

const hasUsableListingCopy = (item: InventoryItem) =>
  item.listing_title.trim().length > 0 &&
  item.listing_description.trim().length > 0;

export const getInventoryWorkflowStatus = (
  item: InventoryItem,
): InventoryWorkflowStatusMeta => {
  if (item.soldPrice !== null) {
    return { status: "sold", label: "Sold", priority: 70 };
  }

  if (item.listedPlatforms.length > 0 || item.ebayStatus === "active") {
    return { status: "listed", label: "Listed", priority: 60 };
  }

  if (item.facebookStatus === "opened" || item.ebayStatus === "posting") {
    return {
      status: "listing_in_progress",
      label: "Listing Started",
      priority: 50,
    };
  }

  if (!hasListingPhoto(item)) {
    return { status: "needs_photos", label: "Needs Photos", priority: 20 };
  }

  if (!hasUsableListingCopy(item) || item.low_price <= 0 || item.high_price <= 0) {
    return { status: "needs_review", label: "Needs Review", priority: 30 };
  }

  if (item.best_platform.trim().length === 0) {
    return { status: "captured", label: "Captured", priority: 10 };
  }

  return { status: "ready_to_list", label: "Ready", priority: 40 };
};
