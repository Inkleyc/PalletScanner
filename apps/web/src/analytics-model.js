const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalized = (value, fallback) => String(value ?? "").trim() || fallback;

const saleForItem = (sales, itemId) => sales.find((sale) => sale.itemId === itemId);

const summarizeGroup = (label, groupedItems, sales) => {
  const itemIds = new Set(groupedItems.map((item) => item.id));
  const groupSales = sales.filter((sale) => itemIds.has(sale.itemId));
  const gross = groupSales.reduce((sum, sale) => sum + sale.soldPrice, 0);
  const expenses = groupSales.reduce((sum, sale) => sum + sale.fees + sale.shippingCost, 0);
  const days = groupSales.flatMap((sale) => {
    const item = groupedItems.find((entry) => entry.id === sale.itemId);
    const captured = item?.capturedAt ? Date.parse(item.capturedAt) : item?.id;
    return Number.isFinite(captured) && sale.soldAt >= captured ? [(sale.soldAt - captured) / 86400000] : [];
  });
  return {
    label,
    inventory: groupedItems.length,
    sold: new Set(groupSales.map((sale) => sale.itemId)).size,
    sellThrough: groupedItems.length ? round(new Set(groupSales.map((sale) => sale.itemId)).size / groupedItems.length * 100) : 0,
    gross: round(gross),
    net: round(gross - expenses),
    averageSale: groupSales.length ? round(gross / groupSales.length) : 0,
    averageDays: days.length ? round(days.reduce((sum, value) => sum + value, 0) / days.length) : null,
  };
};

const groupItems = (items, sales, selector) => {
  const groups = new Map();
  for (const item of items) {
    const label = normalized(selector(item), "Unknown");
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()].map(([label, grouped]) => summarizeGroup(label, grouped, sales))
    .sort((first, second) => second.net - first.net || second.sellThrough - first.sellThrough || first.label.localeCompare(second.label));
};

export const buildAnalytics = (items, pallets, sales) => {
  const grossRevenue = sales.reduce((sum, sale) => sum + sale.soldPrice, 0);
  const expenses = sales.reduce((sum, sale) => sum + sale.fees + sale.shippingCost, 0);
  const soldItemIds = new Set(sales.map((sale) => sale.itemId));
  const byPlatform = ["facebook", "ebay", "other"].map((platform) => {
    const platformSales = sales.filter((sale) => sale.marketplace === platform);
    const gross = platformSales.reduce((sum, sale) => sum + sale.soldPrice, 0);
    const costs = platformSales.reduce((sum, sale) => sum + sale.fees + sale.shippingCost, 0);
    return { label: platform === "ebay" ? "eBay" : platform === "facebook" ? "Facebook" : "Other", sales: platformSales.length, gross: round(gross), net: round(gross - costs), averageSale: platformSales.length ? round(gross / platformSales.length) : 0, costs: round(costs) };
  }).filter((row) => row.sales > 0).sort((first, second) => second.net - first.net);
  const byPallet = pallets.map((pallet) => {
    const palletItems = items.filter((item) => item.palletId === pallet.id);
    const result = summarizeGroup(pallet.name, palletItems, sales);
    const cost = pallet.palletCost ?? pallet.cost ?? 0;
    return { ...result, cost, profit: round(result.net - cost) };
  }).sort((first, second) => second.profit - first.profit);
  const categorizedCount = items.filter((item) => normalized(item.category, "Uncategorized") !== "Uncategorized").length;
  return {
    summary: { soldItems: soldItemIds.size, sales: sales.length, grossRevenue: round(grossRevenue), expenses: round(expenses), netProceeds: round(grossRevenue - expenses), sellThrough: items.length ? round(soldItemIds.size / items.length * 100) : 0 },
    byCategory: groupItems(items, sales, (item) => item.category ?? "Uncategorized"),
    byCondition: groupItems(items, sales, (item) => item.condition),
    byPlatform,
    byPallet,
    categorizedCount,
    uncategorizedCount: items.length - categorizedCount,
    hasRecordedSales: sales.length > 0,
  };
};

export const getSaleForItem = saleForItem;
