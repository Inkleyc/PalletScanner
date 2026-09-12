import type {
  ActivityEvent,
  InventoryItem,
  ItemPhoto,
  PalletSession,
  Sale,
} from "./domain";

export type InventorySnapshot = {
  items: InventoryItem[];
  pallets: PalletSession[];
  activePalletId: string | null;
};

export type InventoryRepositoryListener = (snapshot: InventorySnapshot) => void;

/**
 * Storage-independent operations shared by the warehouse and business apps.
 * Implementations may be local-first today and remote-backed later.
 */
export interface InventoryRepository {
  getSnapshot(): InventorySnapshot;
  hydrate(): Promise<InventorySnapshot>;
  subscribe(listener: InventoryRepositoryListener): () => void;

  saveItem(item: InventoryItem): Promise<void>;
  removeItem(itemId: number): Promise<void>;

  createPallet(name?: string): Promise<PalletSession>;
  updatePallet(
    palletId: string,
    update: Partial<Pick<PalletSession, "name" | "palletCost">>,
  ): Promise<void>;
  removePallet(palletId: string): Promise<boolean>;
  setActivePallet(palletId: string): Promise<void>;

  listPhotos(itemId: number): Promise<ItemPhoto[]>;
  listSales(itemId?: number): Promise<Sale[]>;
  listActivity(entityId?: string): Promise<ActivityEvent[]>;
}
