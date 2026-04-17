import * as FileSystem from "expo-file-system/legacy";

type InventoryItem = {
  id: number;
  photo: string | null;
  name: string;
  condition: string;
  low_price: number;
  high_price: number;
  floor_price: number;
  best_platform: string;
  listing_title: string;
  listing_description: string;
  listedPlatforms: Array<"facebook" | "ebay">;
};

type InventoryListener = () => void;

const inventoryListeners = new Set<InventoryListener>();
const inventoryFile = `${FileSystem.documentDirectory}inventory.json`;

const normalizeInventoryItem = (item: InventoryItem): InventoryItem => ({
  ...item,
  floor_price:
    typeof item.floor_price === "number" && !Number.isNaN(item.floor_price)
      ? item.floor_price
      : item.low_price,
  listedPlatforms: Array.isArray(item.listedPlatforms) ? item.listedPlatforms : [],
});

const getGlobalInventory = (): InventoryItem[] => {
  const globalInventory = (globalThis as { inventory?: InventoryItem[] }).inventory;
  return Array.isArray(globalInventory)
    ? globalInventory.map((item) => normalizeInventoryItem(item as InventoryItem))
    : [];
};

let inventoryState: InventoryItem[] = getGlobalInventory();
let hydratePromise: Promise<void> | null = null;

const notifyInventoryListeners = () => {
  inventoryListeners.forEach((listener) => listener());
};

const persistInventory = async () => {
  try {
    await FileSystem.writeAsStringAsync(
      inventoryFile,
      JSON.stringify(inventoryState),
      { encoding: "utf8" },
    );
  } catch {
    // Best-effort persistence; keep working in memory if writing fails.
  }
};

export const getInventory = () => inventoryState;

export const setInventory = (items: InventoryItem[]) => {
  inventoryState = items.map(normalizeInventoryItem);
  (globalThis as { inventory?: InventoryItem[] }).inventory = inventoryState;
  notifyInventoryListeners();
  void persistInventory();
};

export const hydrateInventory = async () => {
  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(inventoryFile);
      if (!fileInfo.exists) {
        return;
      }

      const raw = await FileSystem.readAsStringAsync(inventoryFile, {
        encoding: "utf8",
      });
      const parsed = JSON.parse(raw) as InventoryItem[];
      inventoryState = Array.isArray(parsed)
        ? parsed.map((item) => normalizeInventoryItem(item))
        : inventoryState;
      (globalThis as { inventory?: InventoryItem[] }).inventory = inventoryState;
      notifyInventoryListeners();
    } catch {
      // Ignore invalid or missing persisted inventory.
    }
  })();

  await hydratePromise;
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

void hydrateInventory();
