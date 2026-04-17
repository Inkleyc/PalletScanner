type InventoryItem = {
  id: number;
  photo: string | null;
  name: string;
  condition: string;
  low_price: number;
  high_price: number;
  best_platform: string;
  listing_title: string;
  listing_description: string;
  listedPlatforms: Array<"facebook" | "ebay">;
};

type InventoryListener = () => void;

const inventoryListeners = new Set<InventoryListener>();

const normalizeInventoryItem = (item: InventoryItem): InventoryItem => ({
  ...item,
  listedPlatforms: Array.isArray(item.listedPlatforms) ? item.listedPlatforms : [],
});

const getGlobalInventory = (): InventoryItem[] => {
  const globalInventory = (globalThis as { inventory?: InventoryItem[] }).inventory;
  return Array.isArray(globalInventory)
    ? globalInventory.map((item) => normalizeInventoryItem(item as InventoryItem))
    : [];
};

let inventoryState: InventoryItem[] = getGlobalInventory();

const notifyInventoryListeners = () => {
  inventoryListeners.forEach((listener) => listener());
};

export const getInventory = () => inventoryState;

export const setInventory = (items: InventoryItem[]) => {
  inventoryState = items.map(normalizeInventoryItem);
  (globalThis as { inventory?: InventoryItem[] }).inventory = inventoryState;
  notifyInventoryListeners();
};

export const subscribeInventory = (listener: InventoryListener) => {
  inventoryListeners.add(listener);
  return () => {
    inventoryListeners.delete(listener);
  };
};

export const saveInventoryItem = (item: InventoryItem) => {
  const existingIndex = inventoryState.findIndex(
    (existingItem) => existingItem.id === item.id,
  );
  const normalizedItem = normalizeInventoryItem(item);

  if (existingIndex === -1) {
    setInventory([...inventoryState, normalizedItem]);
    return;
  }

  const updatedItems = [...inventoryState];
  updatedItems[existingIndex] = {
    ...updatedItems[existingIndex],
    ...normalizedItem,
    listedPlatforms:
      normalizedItem.listedPlatforms.length > 0
        ? normalizedItem.listedPlatforms
        : updatedItems[existingIndex].listedPlatforms,
  };
  setInventory(updatedItems);
};

export const removeInventoryItem = (id: number) => {
  setInventory(inventoryState.filter((item) => item.id !== id));
};

export const markInventoryItemListed = (
  id: number,
  platform: "facebook" | "ebay",
) => {
  setInventory(
    inventoryState.map((item) =>
      item.id === id && !item.listedPlatforms.includes(platform)
        ? {
            ...item,
            listedPlatforms: [...item.listedPlatforms, platform],
          }
        : item,
    ),
  );
};

export const unmarkInventoryItemListed = (
  id: number,
  platform: "facebook" | "ebay",
) => {
  setInventory(
    inventoryState.map((item) =>
      item.id === id
        ? {
            ...item,
            listedPlatforms: item.listedPlatforms.filter(
              (listedPlatform) => listedPlatform !== platform,
            ),
          }
        : item,
    ),
  );
};

export type { InventoryItem };
