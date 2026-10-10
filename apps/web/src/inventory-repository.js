import { items as seedItems, pallets as seedPallets } from "./mock-data.js";

const storageKey = "palletscanner.inventoryRepository.v1";
const looseItemsPallet = {
  id: "loose-items",
  name: "Loose Items",
  createdAt: 0,
  palletCost: null,
  cost: 0,
  isSystem: true,
  acquisitionType: "loose_system",
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizeItem = (item) => ({
  ...item,
  low_price: Number.isFinite(item.low_price) ? item.low_price : item.low ?? 0,
  high_price: Number.isFinite(item.high_price) ? item.high_price : item.high ?? 0,
  listing_price: Number.isFinite(item.listing_price) ? item.listing_price : (item.high_price ?? item.high ?? 0),
  floor_price: Number.isFinite(item.floor_price) ? item.floor_price : item.floor ?? 0,
  low: Number.isFinite(item.low) ? item.low : item.low_price ?? 0,
  high: Number.isFinite(item.high) ? item.high : item.high_price ?? 0,
  floor: Number.isFinite(item.floor) ? item.floor : item.floor_price ?? 0,
  listedPlatforms: Array.isArray(item.listedPlatforms) ? item.listedPlatforms : [],
  category: item.category?.trim() || "Uncategorized",
  onHand: Number.isInteger(item.onHand) ? item.onHand : item.quantity,
  reserved: Number.isInteger(item.reserved) ? item.reserved : 0,
  available: Number.isInteger(item.available) ? item.available : item.quantity,
  shortage: Number.isInteger(item.shortage) ? item.shortage : 0,
});
const normalizePallet = (pallet) => ({
  ...pallet,
  palletCost: Number.isFinite(pallet.palletCost) ? pallet.palletCost : pallet.cost ?? null,
  cost: Number.isFinite(pallet.cost) ? pallet.cost : pallet.palletCost ?? 0,
});
const ensureLooseItems = (pallets) => [
  normalizePallet(looseItemsPallet),
  ...pallets.filter((pallet) => pallet.id !== looseItemsPallet.id).map(normalizePallet),
];

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (saved && Array.isArray(saved.items) && Array.isArray(saved.pallets)) {
      return {
        ...saved,
        items: saved.items.map(normalizeItem),
        pallets: ensureLooseItems(saved.pallets),
        activity: Array.isArray(saved.activity) ? saved.activity : [],
        sales: Array.isArray(saved.sales) ? saved.sales : [],
      };
    }
  } catch {
    // Invalid preview data falls back to the checked-in fixture.
  }
  return {
    items: clone(seedItems).map(normalizeItem),
    pallets: ensureLooseItems(clone(seedPallets)),
    activePalletId: looseItemsPallet.id,
    activity: [],
    sales: [],
  };
};

const state = load();
export const items = state.items;
export const pallets = state.pallets;
const listeners = new Set();
const recordActivity = (type, entityId, details = {}) => {
  state.activity.push({
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    entityId: String(entityId),
    occurredAt: Date.now(),
    details,
  });
};

const persist = () => {
  localStorage.setItem(storageKey, JSON.stringify(state));
  listeners.forEach((listener) => listener(repository.getSnapshot()));
};

export const repository = {
  getSnapshot: () => clone(state),
  hydrate: async () => clone(state),
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async saveItem(item) {
    const previousItem = items.find((entry) => entry.id === item.id);
    const normalizedItem = normalizeItem(clone(item));
    const index = items.findIndex((entry) => entry.id === item.id);
    if (previousItem && normalizedItem.quantity !== previousItem.quantity) {
      const quantityDelta = normalizedItem.quantity - previousItem.quantity;
      normalizedItem.onHand = Math.max((previousItem.onHand ?? previousItem.quantity) + quantityDelta, 0);
      normalizedItem.available = Math.max((previousItem.available ?? previousItem.quantity) + quantityDelta, 0);
    }
    if (index < 0) items.push(normalizedItem);
    else items[index] = { ...items[index], ...normalizedItem };
    recordActivity(index < 0 ? "item.created" : "item.updated", item.id, { name: normalizedItem.name });
    persist();
  },
  async removeItem(itemId) {
    const index = items.findIndex((entry) => entry.id === itemId);
    if (index >= 0) {
      const [removed] = items.splice(index, 1);
      recordActivity("item.deleted", itemId, { name: removed.name });
    }
    persist();
  },
  async createPallet(name) {
    const createdAt = Date.now();
    const pallet = {
      id: `pallet-${createdAt}`,
      name: name?.trim() || `Pallet ${pallets.length + 1}`,
      createdAt,
      palletCost: null,
    };
    pallets.push(pallet);
    state.activePalletId = pallet.id;
    recordActivity("pallet.created", pallet.id, { name: pallet.name });
    persist();
    return clone(pallet);
  },
  async updatePallet(palletId, update) {
    if (palletId === looseItemsPallet.id) return;
    const pallet = pallets.find((entry) => entry.id === palletId);
    if (pallet) {
      Object.assign(pallet, update);
      if (update.palletCost !== undefined) pallet.cost = update.palletCost ?? 0;
      recordActivity("pallet.updated", palletId, { name: pallet.name });
    }
    persist();
  },
  async removePallet(palletId) {
    if (palletId === looseItemsPallet.id) return false;
    const index = pallets.findIndex((entry) => entry.id === palletId);
    if (index < 0) return false;
    const [removedPallet] = pallets.splice(index, 1);
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      if (items[itemIndex].palletId === palletId) items.splice(itemIndex, 1);
    }
    if (state.activePalletId === palletId) state.activePalletId = pallets[0]?.id ?? null;
    recordActivity("pallet.deleted", palletId, { name: removedPallet.name });
    persist();
    return true;
  },
  async setActivePallet(palletId) {
    if (pallets.some((entry) => entry.id === palletId)) {
      state.activePalletId = palletId;
      persist();
    }
  },
  async listPhotos(itemId) {
    const item = items.find((entry) => entry.id === itemId);
    const photos = item?.photos?.length ? item.photos : item?.photo ? [item.photo] : [];
    return photos.map((uri, index) => ({ id: `${itemId}-${index}`, itemId, uri, createdAt: itemId }));
  },
  async listSales(itemId) {
    const recordedItemIds = new Set(state.sales.map((sale) => sale.itemId));
    const legacySales = items
      .filter((item) => item.soldPrice != null && !recordedItemIds.has(item.id) && (itemId === undefined || item.id === itemId))
      .map((item) => ({
        id: `preview-sale-${item.id}`,
        itemId: item.id,
        marketplace: item.listedPlatforms?.[0] ?? "other",
        quantity: item.quantity,
        soldPrice: item.soldPrice,
        fees: 0,
        shippingCost: 0,
        soldAt: item.id,
      }));
    return [...state.sales.filter((sale) => itemId === undefined || sale.itemId === itemId), ...legacySales]
      .sort((first, second) => second.soldAt - first.soldAt);
  },
  async recordSale(sale) {
    const item = items.find((entry) => entry.id === sale.itemId);
    if (!item) throw new Error("The item could not be found.");
    const available = Number.isInteger(item.available) ? item.available : item.quantity;
    if (!Number.isInteger(sale.quantity) || sale.quantity < 1 || sale.quantity > available) {
      throw new Error(`Sale quantity must be between 1 and ${available}.`);
    }
    const recorded = { ...clone(sale), id: sale.id ?? `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    state.sales.push(recorded);
    item.available = available - recorded.quantity;
    item.onHand = Math.max((item.onHand ?? item.quantity) - recorded.quantity, 0);
    if (item.available === 0) {
      item.soldPrice = recorded.soldPrice;
      item.status = "sold";
    }
    recordActivity("sale.recorded", item.id, { name: item.name, marketplace: recorded.marketplace, quantity: recorded.quantity, soldPrice: recorded.soldPrice });
    persist();
    return clone(recorded);
  },
  async listActivity(entityId) {
    return clone(state.activity)
      .filter((event) => entityId === undefined || event.entityId === String(entityId))
      .sort((first, second) => second.occurredAt - first.occurredAt);
  },
  async replaceSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.pallets)) {
      throw new Error("Backup must contain items and pallets arrays.");
    }
    const restoredPallets = ensureLooseItems(snapshot.pallets);
    const palletIds = new Set(restoredPallets.map((pallet) => pallet.id));
    if (restoredPallets.some((pallet) => typeof pallet.id !== "string" || !pallet.id.trim() || typeof pallet.name !== "string" || !pallet.name.trim())) {
      throw new Error("Every restored pallet must have a valid ID and name.");
    }
    const restoredItems = snapshot.items.map(normalizeItem);
    if (restoredItems.some((item) => !Number.isFinite(item.id) || !item.name?.trim() || !palletIds.has(item.palletId))) {
      throw new Error("Every restored item must have a valid ID, name, and pallet assignment.");
    }
    items.splice(0, items.length, ...restoredItems);
    pallets.splice(0, pallets.length, ...restoredPallets);
    state.activePalletId = palletIds.has(snapshot.activePalletId) ? snapshot.activePalletId : restoredPallets[0]?.id ?? null;
    state.activity = Array.isArray(snapshot.activity) ? clone(snapshot.activity) : [];
    state.sales = Array.isArray(snapshot.sales) ? clone(snapshot.sales) : [];
    recordActivity("data.restored", "repository", { itemCount: items.length, palletCount: pallets.length });
    persist();
  },
};

export const resetPreviewRepository = () => {
  localStorage.removeItem(storageKey);
};
