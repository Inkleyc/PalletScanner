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
};

type InventoryListener = () => void;

const inventoryListeners = new Set<InventoryListener>();

const getGlobalInventory = (): InventoryItem[] => {
  const globalInventory = (globalThis as { inventory?: InventoryItem[] }).inventory;
  return Array.isArray(globalInventory) ? globalInventory : [];
};

let inventoryState: InventoryItem[] = getGlobalInventory();

const notifyInventoryListeners = () => {
  inventoryListeners.forEach((listener) => listener());
};

export const getInventory = () => inventoryState;

export const setInventory = (items: InventoryItem[]) => {
  inventoryState = items;
  (globalThis as { inventory?: InventoryItem[] }).inventory = items;
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

  if (existingIndex === -1) {
    setInventory([...inventoryState, item]);
    return;
  }

  const updatedItems = [...inventoryState];
  updatedItems[existingIndex] = item;
  setInventory(updatedItems);
};

export const removeInventoryItem = (id: number) => {
  setInventory(inventoryState.filter((item) => item.id !== id));
};

export type { InventoryItem };
