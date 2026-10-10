import type {
  ActivityEvent,
  InventoryRepository,
  InventorySnapshot,
  ItemPhoto,
  Sale,
} from "@palletscanner/core";

import {
  createPalletSession,
  deletePalletSession,
  getActivePalletId,
  getInventory,
  getPallets,
  hydrateInventory,
  removeInventoryItem,
  renamePalletSession,
  saveInventoryItem,
  setActivePalletSession,
  subscribeInventory,
  updatePalletSessionCost,
} from "@/lib/inventory-store";

const snapshot = (): InventorySnapshot => ({
  items: [...getInventory()],
  pallets: [...getPallets()],
  activePalletId: getActivePalletId(),
});

const photosFromSnapshot = (itemId: number): ItemPhoto[] => {
  const item = getInventory().find((entry) => entry.id === itemId);
  const photos = item?.photos?.length ? item.photos : item?.photo ? [item.photo] : [];
  return photos.map((uri, index) => ({
    id: `${itemId}-${index}`,
    itemId,
    uri,
    createdAt: itemId,
  }));
};

export const localInventoryRepository: InventoryRepository = {
  getSnapshot: snapshot,
  async hydrate() {
    await hydrateInventory();
    return snapshot();
  },
  subscribe(listener) {
    return subscribeInventory(() => listener(snapshot()));
  },
  saveItem: saveInventoryItem,
  removeItem: removeInventoryItem,
  async createPallet(name) {
    return createPalletSession(name);
  },
  async updatePallet(palletId, update) {
    if (update.name !== undefined) renamePalletSession(palletId, update.name);
    if (update.palletCost !== undefined) {
      updatePalletSessionCost(palletId, update.palletCost);
    }
  },
  async removePallet(palletId) {
    return deletePalletSession(palletId);
  },
  async setActivePallet(palletId) {
    setActivePalletSession(palletId);
  },
  async listPhotos(itemId) {
    return photosFromSnapshot(itemId);
  },
  async listSales(itemId) {
    const sales: Sale[] = getInventory()
      .filter((item) => item.soldPrice !== null && (itemId === undefined || item.id === itemId))
      .map((item) => ({
        id: `legacy-sale-${item.id}`,
        itemId: item.id,
        marketplace: item.listedPlatforms[0] ?? "other",
        quantity: item.quantity,
        soldPrice: item.soldPrice ?? 0,
        fees: 0,
        shippingCost: 0,
        soldAt: item.id,
      }));
    return sales;
  },
  async listActivity(_entityId) {
    const events: ActivityEvent[] = [];
    return events;
  },
};
