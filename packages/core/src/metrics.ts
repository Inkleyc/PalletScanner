import type { InventoryItem, PalletSession } from "./domain";

export type InventoryTotals = {
  itemCount: number;
  soldCount: number;
  unsoldCount: number;
  soldRevenue: number;
  estimatedRemainingLow: number;
  estimatedRemainingHigh: number;
  totalCost: number;
  grossProfit: number;
  sellThrough: number;
};

export type PalletMetrics = {
  pallet: PalletSession;
  itemCount: number;
  soldCount: number;
  unsoldCount: number;
  totalLow: number;
  totalHigh: number;
  totalFloor: number;
  soldRevenue: number;
  remainingLow: number;
  remainingHigh: number;
  grossProfit: number;
  roi: number;
  averageSoldPrice: number;
  sellThrough: number;
};

const itemQuantity = (item: InventoryItem) =>
  typeof item.quantity === "number" && item.quantity > 0
    ? Math.floor(item.quantity)
    : 1;

export const calculateInventoryTotals = (
  items: InventoryItem[],
  pallets: PalletSession[],
): InventoryTotals => {
  const soldItems = items.filter((item) => item.soldPrice !== null);
  const unsoldItems = items.filter((item) => item.soldPrice === null);
  const soldRevenue = soldItems.reduce(
    (sum, item) => sum + (item.soldPrice ?? 0),
    0,
  );
  const estimatedRemainingLow = unsoldItems.reduce(
    (sum, item) => sum + item.low_price * itemQuantity(item),
    0,
  );
  const estimatedRemainingHigh = unsoldItems.reduce(
    (sum, item) => sum + item.high_price * itemQuantity(item),
    0,
  );
  const totalCost = pallets.reduce(
    (sum, pallet) => sum + (pallet.palletCost ?? 0),
    0,
  );

  return {
    itemCount: items.length,
    soldCount: soldItems.length,
    unsoldCount: unsoldItems.length,
    soldRevenue,
    estimatedRemainingLow,
    estimatedRemainingHigh,
    totalCost,
    grossProfit: soldRevenue - totalCost,
    sellThrough: items.length > 0 ? (soldItems.length / items.length) * 100 : 0,
  };
};

export const calculatePalletMetrics = (
  items: InventoryItem[],
  pallets: PalletSession[],
): PalletMetrics[] =>
  pallets.map((pallet) => {
    const palletItems = items.filter((item) => item.palletId === pallet.id);
    const soldItems = palletItems.filter((item) => item.soldPrice !== null);
    const unsoldItems = palletItems.filter((item) => item.soldPrice === null);
    const totalLow = palletItems.reduce(
      (sum, item) => sum + item.low_price * itemQuantity(item),
      0,
    );
    const totalHigh = palletItems.reduce(
      (sum, item) => sum + item.high_price * itemQuantity(item),
      0,
    );
    const totalFloor = palletItems.reduce(
      (sum, item) => sum + item.floor_price * itemQuantity(item),
      0,
    );
    const soldRevenue = soldItems.reduce(
      (sum, item) => sum + (item.soldPrice ?? 0),
      0,
    );
    const remainingLow = unsoldItems.reduce(
      (sum, item) => sum + item.low_price * itemQuantity(item),
      0,
    );
    const remainingHigh = unsoldItems.reduce(
      (sum, item) => sum + item.high_price * itemQuantity(item),
      0,
    );
    const palletCost = pallet.palletCost ?? 0;

    return {
      pallet,
      itemCount: palletItems.length,
      soldCount: soldItems.length,
      unsoldCount: unsoldItems.length,
      totalLow,
      totalHigh,
      totalFloor,
      soldRevenue,
      remainingLow,
      remainingHigh,
      grossProfit: soldRevenue - palletCost,
      roi: palletCost > 0 ? ((soldRevenue - palletCost) / palletCost) * 100 : 0,
      averageSoldPrice: soldItems.length > 0 ? soldRevenue / soldItems.length : 0,
      sellThrough:
        palletItems.length > 0 ? (soldItems.length / palletItems.length) * 100 : 0,
    };
  });

