import type { InventoryItem, PalletSession } from "./domain";

export type InventoryValueSummary = {
  totalLow: number;
  totalHigh: number;
  totalPalletCost: number;
  projectedProfitLow: number;
  projectedProfitHigh: number;
};

const itemQuantity = (item: InventoryItem) =>
  typeof item.quantity === "number" && item.quantity > 0
    ? Math.floor(item.quantity)
    : 1;

const getPalletCost = (pallets: PalletSession[], palletId: string) =>
  pallets.find((pallet) => pallet.id === palletId)?.palletCost ?? 0;

const csvCell = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

export const calculateInventoryValueSummary = (
  items: InventoryItem[],
  pallets: PalletSession[],
  selectedPallet?: PalletSession | null,
): InventoryValueSummary => {
  const totalLow = items.reduce(
    (sum, item) => sum + item.low_price * itemQuantity(item),
    0,
  );
  const totalHigh = items.reduce(
    (sum, item) => sum + item.high_price * itemQuantity(item),
    0,
  );
  const totalPalletCost = selectedPallet
    ? selectedPallet.palletCost ?? 0
    : pallets.reduce((sum, pallet) => sum + (pallet.palletCost ?? 0), 0);

  return {
    totalLow,
    totalHigh,
    totalPalletCost,
    projectedProfitLow: totalLow - totalPalletCost,
    projectedProfitHigh: totalHigh - totalPalletCost,
  };
};

export const buildInventoryCsv = (
  items: InventoryItem[],
  pallets: PalletSession[],
) => {
  const header = [
    "Pallet",
    "Name",
    "Qty",
    "Condition",
    "Pallet Cost",
    "Low Price",
    "High Price",
    "Floor Price",
    "Projected Profit Low",
    "Projected Profit High",
    "Sold Price",
    "Platform",
    "Listing Title",
    "Listing Description",
  ].join(",");

  const rows = items.map((item) => {
    const quantity = itemQuantity(item);
    const palletCost = getPalletCost(pallets, item.palletId);
    const palletName =
      pallets.find((pallet) => pallet.id === item.palletId)?.name ??
      "Unknown pallet";

    return [
      palletName,
      item.name,
      quantity,
      item.condition,
      palletCost || "",
      item.low_price * quantity,
      item.high_price * quantity,
      item.floor_price,
      item.low_price * quantity - palletCost,
      item.high_price * quantity - palletCost,
      item.soldPrice ?? "",
      item.best_platform,
      item.listing_title,
      item.listing_description,
    ]
      .map(csvCell)
      .join(",");
  });

  return [header, ...rows].join("\n");
};

export const createInventoryExportBasename = (
  selectedPallet?: PalletSession | null,
) => {
  const suffix =
    selectedPallet?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "all";
  return `pallet-inventory-${suffix}.csv`;
};
