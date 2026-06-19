import type { InventoryItem, PalletSession } from "@/lib/inventory-store";
import { getPostingReadiness } from "@/lib/posting-validation";

type WorkflowAction =
  | "create-pallet"
  | "capture-item"
  | "add-photos"
  | "fix-copy"
  | "post-ebay"
  | "post-facebook"
  | "save-facebook-url"
  | "mark-sold"
  | "clear";

type WorkflowSummary = {
  action: WorkflowAction;
  label: string;
  detail: string;
  tone: "danger" | "warning" | "info" | "success";
};

export type AppWorkflowStats = {
  totalItems: number;
  activeListings: number;
  readyForEbay: number;
  readyForFacebook: number;
  needsPhotos: number;
  needsCopyFixes: number;
  missingFacebookUrls: number;
  facebookDrafts: number;
  unpostedEbay: number;
  unpostedFacebook: number;
  soldItems: number;
};

const getPhotos = (item: InventoryItem) =>
  item.photos?.length ? item.photos : item.photo ? [item.photo] : [];

export const photoSlotLabels = [
  "Front",
  "Back",
  "Label or model",
  "Accessories",
  "Wear or damage",
] as const;

export const getPhotoSlots = (item: InventoryItem) => {
  const photos = getPhotos(item);
  return photoSlotLabels.map((label, index) => ({
    label,
    done: photos.length > index,
    photo: photos[index],
  }));
};

export const getItemPhotoScore = (item: InventoryItem) => {
  const count = getPhotos(item).length;
  if (count >= 4) {
    return {
      label: "Photo set strong",
      detail: `${count} photos`,
      tone: "success" as const,
    };
  }
  if (count >= 2) {
    return {
      label: "Add one more angle",
      detail: `${count} photos`,
      tone: "warning" as const,
    };
  }
  if (count === 1) {
    return {
      label: "Needs more photos",
      detail: "Add detail and back angles",
      tone: "warning" as const,
    };
  }
  return {
    label: "No photos yet",
    detail: "Add photos before posting",
    tone: "danger" as const,
  };
};

export const getListingConfidence = (item: InventoryItem) => {
  const facebookReadiness = getPostingReadiness(item, "facebook");
  const ebayReadiness = getPostingReadiness(item, "ebay");
  const photoScore = getItemPhotoScore(item);
  const warningCount =
    facebookReadiness.warnings.length +
    ebayReadiness.warnings.length +
    (photoScore.tone === "warning" ? 1 : 0);
  const errorCount =
    facebookReadiness.errors.length +
    ebayReadiness.errors.length +
    (photoScore.tone === "danger" ? 1 : 0);

  if (errorCount > 0) {
    return {
      label: "Needs cleanup",
      detail: `${errorCount} blocker${errorCount === 1 ? "" : "s"}`,
      tone: "danger" as const,
    };
  }

  if (warningCount > 0) {
    return {
      label: "Good, improve if time",
      detail: `${warningCount} suggestion${warningCount === 1 ? "" : "s"}`,
      tone: "warning" as const,
    };
  }

  return {
    label: "Strong listing",
    detail: "Ready for both platforms",
    tone: "success" as const,
  };
};

export const getItemNextAction = (item: InventoryItem): WorkflowSummary => {
  const photos = getPhotos(item);
  const facebookReady = getPostingReadiness(item, "facebook");
  const ebayReady = getPostingReadiness(item, "ebay");
  const listedFacebook = item.listedPlatforms.includes("facebook");
  const listedEbay = item.listedPlatforms.includes("ebay");

  if (photos.length === 0) {
    return {
      action: "add-photos",
      label: "Add photos",
      detail: "Listings need at least one photo before posting.",
      tone: "danger",
    };
  }

  if (!facebookReady.ready || !ebayReady.ready) {
    return {
      action: "fix-copy",
      label: "Fix posting checks",
      detail: "Required fields are missing or invalid.",
      tone: "warning",
    };
  }

  if (!listedEbay) {
    return {
      action: "post-ebay",
      label: "Post to eBay",
      detail: "Ready for API listing.",
      tone: "info",
    };
  }

  if (!listedFacebook) {
    return {
      action: "post-facebook",
      label:
        item.facebookStatus === "opened"
          ? "Finish Facebook draft"
          : "Post to Facebook",
      detail: "Use the guided queue for field-by-field posting.",
      tone: "info",
    };
  }

  if (listedFacebook && !item.facebookListingUrl) {
    return {
      action: "save-facebook-url",
      label: "Save Facebook URL",
      detail: "Paste the listing link so it is easy to reopen.",
      tone: "warning",
    };
  }

  if (item.soldPrice === null) {
    return {
      action: "mark-sold",
      label: "Watch for sale",
      detail: "Mark sold when the item leaves inventory.",
      tone: "success",
    };
  }

  return {
    action: "clear",
    label: "Complete",
    detail: "Listed and sold status is up to date.",
    tone: "success",
  };
};

export const getWorkflowStats = (items: InventoryItem[]): AppWorkflowStats => {
  const stats: AppWorkflowStats = {
    totalItems: items.length,
    activeListings: 0,
    readyForEbay: 0,
    readyForFacebook: 0,
    needsPhotos: 0,
    needsCopyFixes: 0,
    missingFacebookUrls: 0,
    facebookDrafts: 0,
    unpostedEbay: 0,
    unpostedFacebook: 0,
    soldItems: 0,
  };

  items.forEach((item) => {
    const facebookReady = getPostingReadiness(item, "facebook");
    const ebayReady = getPostingReadiness(item, "ebay");
    const listedFacebook = item.listedPlatforms.includes("facebook");
    const listedEbay = item.listedPlatforms.includes("ebay");

    if (item.listedPlatforms.length > 0) {
      stats.activeListings += 1;
    }
    if (ebayReady.ready && !listedEbay) {
      stats.readyForEbay += 1;
    }
    if (facebookReady.ready && !listedFacebook) {
      stats.readyForFacebook += 1;
    }
    if (getPhotos(item).length === 0) {
      stats.needsPhotos += 1;
    }
    if (!facebookReady.ready || !ebayReady.ready) {
      stats.needsCopyFixes += 1;
    }
    if (listedFacebook && !item.facebookListingUrl) {
      stats.missingFacebookUrls += 1;
    }
    if (item.facebookStatus === "opened" && !listedFacebook) {
      stats.facebookDrafts += 1;
    }
    if (!listedEbay) {
      stats.unpostedEbay += 1;
    }
    if (!listedFacebook) {
      stats.unpostedFacebook += 1;
    }
    if (item.soldPrice !== null) {
      stats.soldItems += 1;
    }
  });

  return stats;
};

export const getTodayWork = (
  items: InventoryItem[],
  pallets: PalletSession[],
): WorkflowSummary[] => {
  const stats = getWorkflowStats(items);

  if (pallets.length === 0) {
    return [
      {
        action: "create-pallet",
        label: "Create first pallet",
        detail: "Start a pallet so new scans have a home.",
        tone: "info",
      },
    ];
  }

  if (items.length === 0) {
    return [
      {
        action: "capture-item",
        label: "Capture first item",
        detail: "Take photos or scan a barcode to build inventory.",
        tone: "info",
      },
    ];
  }

  const work: WorkflowSummary[] = [];

  if (stats.needsPhotos > 0) {
    work.push({
      action: "add-photos",
      label: `${stats.needsPhotos} need photos`,
      detail: "Photos are the fastest way to improve buyer confidence.",
      tone: "danger",
    });
  }

  if (stats.needsCopyFixes > 0) {
    work.push({
      action: "fix-copy",
      label: `${stats.needsCopyFixes} need posting cleanup`,
      detail: "Fix required fields before sending items to eBay or Facebook.",
      tone: "warning",
    });
  }

  if (stats.readyForEbay > 0) {
    work.push({
      action: "post-ebay",
      label: `${stats.readyForEbay} ready for eBay`,
      detail: "These can go through the eBay API flow.",
      tone: "info",
    });
  }

  if (stats.readyForFacebook > 0) {
    work.push({
      action: "post-facebook",
      label: `${stats.readyForFacebook} ready for Facebook`,
      detail: "Use the queue to post them one at a time.",
      tone: "info",
    });
  }

  if (stats.missingFacebookUrls > 0) {
    work.push({
      action: "save-facebook-url",
      label: `${stats.missingFacebookUrls} missing Facebook URLs`,
      detail: "Save final links so listings are easy to revisit.",
      tone: "warning",
    });
  }

  if (work.length === 0) {
    work.push({
      action: "clear",
      label: "Work queue is clear",
      detail: "Listings look organized. Capture more items or track sales.",
      tone: "success",
    });
  }

  return work.slice(0, 4);
};
