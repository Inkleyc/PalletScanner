export const currency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export const statusLabel = {
  captured: "Captured",
  needs_photos: "Needs Photos",
  needs_research: "Needs Research",
  ready: "Ready",
  sold: "Sold",
};

export const statusClass = {
  captured: "neutral",
  needs_photos: "warning",
  needs_research: "warning",
  ready: "success",
  sold: "primary",
};

const workflowStatusByItemState = (item) => {
  if (item.soldPrice !== null) {
    return "sold";
  }

  if (item.listedPlatforms?.length > 0 || item.ebayStatus === "active") {
    return "ready";
  }

  if (!item.photos?.length && !item.photo) {
    return "needs_photos";
  }

  if (
    !item.listing_title?.trim() ||
    !item.listing_description?.trim() ||
    item.low <= 0 ||
    item.high <= 0
  ) {
    return "needs_research";
  }

  return "ready";
};

export const getDisplayStatus = (item) =>
  item.status ?? workflowStatusByItemState(item);

export const getDisplayPlatform = (item) =>
  item.platform ?? item.best_platform ?? "Review";

export const getDisplayIssue = (item) => {
  if (item.issue) {
    return item.issue;
  }

  const status = getDisplayStatus(item);
  if (status === "needs_photos") {
    return "Missing photos";
  }
  if (status === "needs_research") {
    return "Needs listing review";
  }
  return null;
};

export const getMarketplaceQueueItems = (items) =>
  items.filter(
    (item) =>
      !item.listedPlatforms?.includes("facebook") ||
      !item.listedPlatforms?.includes("ebay"),
  );

export const getQuantity = (item) =>
  typeof item.quantity === "number" && item.quantity > 0
    ? Math.floor(item.quantity)
    : 1;

export const getPalletCost = (pallet) =>
  typeof pallet.cost === "number" && pallet.cost > 0 ? pallet.cost : 0;

export const summarizeInventory = (items, pallets) => {
  const soldItems = items.filter((item) => item.soldPrice !== null);
  const unsoldItems = items.filter((item) => item.soldPrice === null);
  const needsFacebook = items.filter(
    (item) => !item.listedPlatforms?.includes("facebook"),
  ).length;
  const needsEbay = items.filter(
    (item) => !item.listedPlatforms?.includes("ebay"),
  ).length;
  const soldRevenue = soldItems.reduce((sum, item) => sum + item.soldPrice, 0);
  const remainingLow = unsoldItems.reduce(
    (sum, item) => sum + item.low * getQuantity(item),
    0,
  );
  const remainingHigh = unsoldItems.reduce(
    (sum, item) => sum + item.high * getQuantity(item),
    0,
  );
  const totalCost = pallets.reduce(
    (sum, pallet) => sum + getPalletCost(pallet),
    0,
  );

  return {
    totalItems: items.length,
    soldCount: soldItems.length,
    soldRevenue,
    remainingLow,
    remainingHigh,
    totalCost,
    grossProfit: soldRevenue - totalCost,
    sellThrough: items.length > 0 ? (soldItems.length / items.length) * 100 : 0,
    needsFacebook,
    needsEbay,
  };
};

export const summarizePallet = (items, pallet) => {
  const palletItems = items.filter((item) => item.palletId === pallet.id);
  const soldRevenue = palletItems.reduce(
    (sum, item) => sum + (item.soldPrice ?? 0),
    0,
  );
  const estimatedLow = palletItems.reduce(
    (sum, item) => sum + item.low * getQuantity(item),
    0,
  );
  const estimatedHigh = palletItems.reduce(
    (sum, item) => sum + item.high * getQuantity(item),
    0,
  );
  const unresolved = palletItems.filter((item) => getDisplayIssue(item)).length;
  const cost = getPalletCost(pallet);

  return {
    ...pallet,
    cost,
    itemCount: palletItems.length,
    soldRevenue,
    estimatedLow,
    estimatedHigh,
    unresolved,
    margin: soldRevenue - cost,
  };
};
