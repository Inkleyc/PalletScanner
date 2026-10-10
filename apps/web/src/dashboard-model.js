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
    (item.low ?? item.low_price) <= 0 ||
    (item.high ?? item.high_price) <= 0
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
  if ((item.shortage ?? 0) > 0) {
    return `Urgent inventory shortage: ${item.shortage} unit${item.shortage === 1 ? "" : "s"}`;
  }
  if ((item.available ?? item.quantity ?? 0) < 0 || (item.reserved ?? 0) < 0 || (item.onHand ?? item.quantity ?? 0) < 0) {
    return "Urgent inventory balance discrepancy";
  }
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
      item.soldPrice === null &&
      (!item.listedPlatforms?.includes("facebook") ||
      !item.listedPlatforms?.includes("ebay")),
  );

export const getItemAgeDays = (item, now = new Date()) => {
  const capturedAt = Date.parse(item.capturedAt ?? "");
  if (Number.isNaN(capturedAt)) {
    return 0;
  }

  const ageMs = now.getTime() - capturedAt;
  return Math.max(0, Math.floor(ageMs / 86_400_000));
};

export const getStaleInventoryItems = (items, now = new Date(), thresholdDays = 14) =>
  items
    .filter((item) => item.soldPrice === null)
    .map((item) => ({ item, ageDays: getItemAgeDays(item, now) }))
    .filter(({ ageDays }) => ageDays >= thresholdDays)
    .sort((first, second) => second.ageDays - first.ageDays)
    .map(({ item }) => item);

export const getQuantity = (item) =>
  typeof item.available === "number" && item.available >= 0
    ? Math.floor(item.available)
    : typeof item.quantity === "number" && item.quantity > 0
      ? Math.floor(item.quantity)
    : 1;

export const getPalletCost = (pallet) =>
  typeof (pallet.cost ?? pallet.palletCost) === "number" &&
  (pallet.cost ?? pallet.palletCost) > 0
    ? pallet.cost ?? pallet.palletCost
    : 0;

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
    (sum, item) => sum + (item.low ?? item.low_price ?? 0) * getQuantity(item),
    0,
  );
  const remainingHigh = unsoldItems.reduce(
    (sum, item) => sum + (item.high ?? item.high_price ?? 0) * getQuantity(item),
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
    (sum, item) => sum + (item.low ?? item.low_price ?? 0) * getQuantity(item),
    0,
  );
  const estimatedHigh = palletItems.reduce(
    (sum, item) => sum + (item.high ?? item.high_price ?? 0) * getQuantity(item),
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
