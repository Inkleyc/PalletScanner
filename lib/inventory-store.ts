import * as FileSystem from "expo-file-system/legacy";

type InventoryItem = {
  id: number;
  photo: string | null;
  name: string;
  condition: string;
  quantity: number;
  low_price: number;
  high_price: number;
  floor_price: number;
  best_platform: string;
  listing_title: string;
  listing_description: string;
  listing_title_facebook?: string;
  listing_description_facebook?: string;
  listing_title_ebay?: string;
  listing_description_ebay?: string;
  listedPlatforms: Array<"facebook" | "ebay">;
  palletId: string;
  soldPrice: number | null;
};

type PalletSession = {
  id: string;
  name: string;
  createdAt: number;
  palletCost: number | null;
};

type ResetBackup = {
  items: InventoryItem[];
  pallets: PalletSession[];
  activePalletId: string | null;
  expiresAt: number;
};

type ResetBackupSummary = {
  itemCount: number;
  palletCount: number;
  expiresAt: number;
};

type InventoryPersistence = {
  items: InventoryItem[];
  pallets: PalletSession[];
  activePalletId: string | null;
  resetBackup?: ResetBackup | null;
};

type InventoryListener = () => void;

const inventoryListeners = new Set<InventoryListener>();
const inventoryFile = `${FileSystem.documentDirectory}inventory.json`;
const photosDirectory = `${FileSystem.documentDirectory}photos/`;
const legacyPalletId = "pallet-1";
const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

const formatPalletName = (createdAt: number, sequence: number) => {
  const date = new Date(createdAt);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const palletNumber = String(sequence).padStart(2, "0");
  return `P${palletNumber}-${month}/${year}`;
};

const normalizeInventoryItem = (item: InventoryItem): InventoryItem => ({
  ...item,
  quantity:
    typeof item.quantity === "number" && !Number.isNaN(item.quantity) && item.quantity > 0
      ? Math.floor(item.quantity)
      : 1,
  floor_price:
    typeof item.floor_price === "number" && !Number.isNaN(item.floor_price)
      ? item.floor_price
      : item.low_price,
  listedPlatforms: Array.isArray(item.listedPlatforms) ? item.listedPlatforms : [],
  palletId:
    typeof item.palletId === "string" && item.palletId.trim()
      ? item.palletId.trim()
      : legacyPalletId,
  soldPrice:
    typeof item.soldPrice === "number" && !Number.isNaN(item.soldPrice)
      ? item.soldPrice
      : null,
  listing_title_facebook:
    typeof item.listing_title_facebook === "string" &&
    item.listing_title_facebook.trim().length > 0
      ? item.listing_title_facebook.trim()
      : undefined,
  listing_description_facebook:
    typeof item.listing_description_facebook === "string" &&
    item.listing_description_facebook.trim().length > 0
      ? item.listing_description_facebook.trim()
      : undefined,
  listing_title_ebay:
    typeof item.listing_title_ebay === "string" &&
    item.listing_title_ebay.trim().length > 0
      ? item.listing_title_ebay.trim()
      : undefined,
  listing_description_ebay:
    typeof item.listing_description_ebay === "string" &&
    item.listing_description_ebay.trim().length > 0
      ? item.listing_description_ebay.trim()
      : undefined,
});

const normalizePalletSession = (
  pallet: PalletSession,
  index: number,
): PalletSession => {
  const normalizedCreatedAt =
    typeof pallet.createdAt === "number" && !Number.isNaN(pallet.createdAt)
      ? pallet.createdAt
      : Date.now() + index;

  return {
    id:
      typeof pallet.id === "string" && pallet.id.trim()
        ? pallet.id.trim()
        : `pallet-${index + 1}`,
    name:
      typeof pallet.name === "string" && pallet.name.trim()
        ? pallet.name.trim()
        : formatPalletName(normalizedCreatedAt, index + 1),
    createdAt: normalizedCreatedAt,
    palletCost:
      typeof pallet.palletCost === "number" && !Number.isNaN(pallet.palletCost)
        ? pallet.palletCost
        : null,
  };
};

const createMigrationPallet = () => {
  const createdAt = Date.now();
  return {
    id: legacyPalletId,
    name: formatPalletName(createdAt, 1),
    createdAt,
    palletCost: null,
  };
};

const normalizePalletState = (
  pallets: PalletSession[],
  nextActivePalletId?: string | null,
) => {
  const normalizedPallets = pallets.map(normalizePalletSession);
  const resolvedActivePalletId =
    normalizedPallets.length === 0
      ? null
      : normalizedPallets.some((pallet) => pallet.id === nextActivePalletId)
        ? (nextActivePalletId ?? null)
        : normalizedPallets[0].id;

  return {
    pallets: normalizedPallets,
    activePalletId: resolvedActivePalletId,
  };
};

const normalizeResetBackup = (backup: ResetBackup | null | undefined) => {
  if (!backup || typeof backup.expiresAt !== "number") {
    return null;
  }

  if (backup.expiresAt <= Date.now()) {
    return null;
  }

  const normalizedItems = Array.isArray(backup.items)
    ? backup.items.map((item) => normalizeInventoryItem(item))
    : [];
  const normalizedState = normalizePalletState(
    Array.isArray(backup.pallets) ? backup.pallets : [],
    backup.activePalletId,
  );

  return {
    items: normalizedItems,
    pallets: normalizedState.pallets,
    activePalletId: normalizedState.activePalletId,
    expiresAt: backup.expiresAt,
  };
};

const getGlobalInventory = (): InventoryItem[] => {
  const globalInventory = (globalThis as { inventory?: InventoryItem[] }).inventory;
  return Array.isArray(globalInventory)
    ? globalInventory.map((item) => normalizeInventoryItem(item as InventoryItem))
    : [];
};

let inventoryState: InventoryItem[] = getGlobalInventory();
let palletState: PalletSession[] = [];
let activePalletId: string | null = null;
let resetBackupState: ResetBackup | null = null;
let resetBackupSummaryState: ResetBackupSummary | null = null;
let hydratePromise: Promise<void> | null = null;
let ensurePhotosDirectoryPromise: Promise<void> | null = null;

const notifyInventoryListeners = () => {
  inventoryListeners.forEach((listener) => listener());
};

const persistInventory = async () => {
  try {
    const payload: InventoryPersistence = {
      items: inventoryState,
      pallets: palletState,
      activePalletId,
      resetBackup: resetBackupState,
    };
    await FileSystem.writeAsStringAsync(
      inventoryFile,
      JSON.stringify(payload),
      { encoding: "utf8" },
    );
  } catch {
    // Best-effort persistence; keep working in memory if writing fails.
  }
};

const ensurePhotosDirectory = async () => {
  if (!ensurePhotosDirectoryPromise) {
    ensurePhotosDirectoryPromise = FileSystem.makeDirectoryAsync(photosDirectory, {
      intermediates: true,
    }).catch(() => {
      ensurePhotosDirectoryPromise = null;
    }) as Promise<void>;
  }

  await ensurePhotosDirectoryPromise;
};

const isManagedPhotoPath = (uri: string | null | undefined) =>
  Boolean(uri && uri.startsWith(photosDirectory));

const deleteManagedPhoto = async (uri: string | null | undefined) => {
  if (!isManagedPhotoPath(uri)) {
    return;
  }

  try {
    const info = await FileSystem.getInfoAsync(uri as string);
    if (info.exists) {
      await FileSystem.deleteAsync(uri as string, { idempotent: true });
    }
  } catch {
    // Best effort cleanup.
  }
};

const getPhotoExtension = (uri: string) => {
  const sanitizedUri = uri.split("?")[0] ?? uri;
  const filename = sanitizedUri.split("/").pop() ?? "";
  const extension = filename.includes(".") ? filename.split(".").pop() : "";
  if (!extension || extension.length > 5) {
    return "jpg";
  }
  return extension.toLowerCase();
};

const persistPhotoUri = async (uri: string, itemId: number) => {
  if (isManagedPhotoPath(uri)) {
    return uri;
  }

  await ensurePhotosDirectory();
  const extension = getPhotoExtension(uri);
  const filename = `item-${itemId}-${Date.now()}.${extension}`;
  const destination = `${photosDirectory}${filename}`;

  try {
    await FileSystem.copyAsync({
      from: uri,
      to: destination,
    });
    return destination;
  } catch {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(destination, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return destination;
    } catch {
      // Last-resort fallback: keep the original URI so saving the item still works
      // even if this asset source cannot be copied into app storage on this device.
      return uri;
    }
  }
};

const setInventoryStateAndPersist = (items: InventoryItem[]) => {
  inventoryState = items.map(normalizeInventoryItem);
  (globalThis as { inventory?: InventoryItem[] }).inventory = inventoryState;
};

const commitState = (pallets: PalletSession[], nextActivePalletId?: string | null) => {
  const normalizedState = normalizePalletState(pallets, nextActivePalletId);
  palletState = normalizedState.pallets;
  activePalletId = normalizedState.activePalletId;
  notifyInventoryListeners();
  void persistInventory();
};

const clearExpiredResetBackup = () => {
  if (!resetBackupState || resetBackupState.expiresAt > Date.now()) {
    return;
  }

  resetBackupState = null;
  resetBackupSummaryState = null;
  notifyInventoryListeners();
  void persistInventory();
};

const setResetBackupState = (backup: ResetBackup | null) => {
  resetBackupState = normalizeResetBackup(backup);
  resetBackupSummaryState = resetBackupState
    ? {
        itemCount: resetBackupState.items.length,
        palletCount: resetBackupState.pallets.length,
        expiresAt: resetBackupState.expiresAt,
      }
    : null;
};

const getCurrentMonthPalletCount = (createdAt: number) => {
  const createdDate = new Date(createdAt);
  return palletState.filter((pallet) => {
    const palletDate = new Date(pallet.createdAt);
    return (
      palletDate.getMonth() === createdDate.getMonth() &&
      palletDate.getFullYear() === createdDate.getFullYear()
    );
  }).length;
};

const buildUniquePalletId = (createdAt: number) => {
  let candidateId = `pallet-${createdAt}`;
  let sequence = 1;

  while (palletState.some((pallet) => pallet.id === candidateId)) {
    candidateId = `pallet-${createdAt}-${sequence}`;
    sequence += 1;
  }

  return candidateId;
};

const ensureMigrationPallet = (items: InventoryItem[], pallets: PalletSession[]) => {
  if (pallets.length > 0 || items.length === 0) {
    return pallets;
  }

  return [createMigrationPallet()];
};

export const getInventory = () => inventoryState;
export const getPallets = () => palletState;
export const getActivePalletId = () => activePalletId;
export const getActivePallet = () =>
  palletState.find((pallet) => pallet.id === activePalletId) ?? null;
export const getResetBackupSummary = (): ResetBackupSummary | null => {
  return resetBackupSummaryState;
};

export const setInventory = (items: InventoryItem[]) => {
  setInventoryStateAndPersist(items);
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
      const parsed = JSON.parse(raw) as InventoryItem[] | InventoryPersistence;

      if (Array.isArray(parsed)) {
        const normalizedItems = parsed.map((item) => normalizeInventoryItem(item));
        const migratedPallets = ensureMigrationPallet(normalizedItems, []);
        setInventoryStateAndPersist(normalizedItems);
        const normalizedState = normalizePalletState(migratedPallets, legacyPalletId);
        palletState = normalizedState.pallets;
        activePalletId = normalizedState.activePalletId;
        setResetBackupState(null);
      } else {
        const normalizedItems = Array.isArray(parsed.items)
          ? parsed.items.map((item) => normalizeInventoryItem(item))
          : inventoryState;
        const nextPallets = ensureMigrationPallet(
          normalizedItems,
          Array.isArray(parsed.pallets) ? parsed.pallets : [],
        );
        const normalizedState = normalizePalletState(
          nextPallets,
          parsed.activePalletId,
        );

        setInventoryStateAndPersist(normalizedItems);
        palletState = normalizedState.pallets;
        activePalletId = normalizedState.activePalletId;
        setResetBackupState(parsed.resetBackup ?? null);
      }

      clearExpiredResetBackup();
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

export const saveInventoryItem = async (item: InventoryItem) => {
  const existingIndex = inventoryState.findIndex(
    (existingItem) => existingItem.id === item.id,
  );
  const normalizedItem = normalizeInventoryItem(item);
  const existingItem = existingIndex >= 0 ? inventoryState[existingIndex] : null;

  let persistedPhoto = normalizedItem.photo;
  if (persistedPhoto) {
    persistedPhoto = await persistPhotoUri(persistedPhoto, normalizedItem.id);
  }

  const itemToSave = {
    ...normalizedItem,
    photo: persistedPhoto,
  };

  if (existingIndex === -1) {
    setInventory([...inventoryState, itemToSave]);
    return;
  }

  const updatedItems = [...inventoryState];
  updatedItems[existingIndex] = {
    ...updatedItems[existingIndex],
    ...itemToSave,
    listedPlatforms:
      itemToSave.listedPlatforms.length > 0
        ? itemToSave.listedPlatforms
        : updatedItems[existingIndex].listedPlatforms,
  };
  setInventory(updatedItems);

  if (existingItem?.photo && existingItem.photo !== persistedPhoto) {
    void deleteManagedPhoto(existingItem.photo);
  }
};

export const removeInventoryItem = async (id: number) => {
  const existingItem = inventoryState.find((item) => item.id === id);
  setInventory(inventoryState.filter((item) => item.id !== id));
  await deleteManagedPhoto(existingItem?.photo);
};

export const updateInventoryItemSoldPrice = (
  id: number,
  soldPrice: number | null,
) => {
  setInventory(
    inventoryState.map((item) =>
      item.id === id
        ? {
            ...item,
            soldPrice,
          }
        : item,
    ),
  );
};

export const createPalletSession = (customName?: string) => {
  const createdAt = Date.now();
  const sameMonthCount = getCurrentMonthPalletCount(createdAt);
  const pallet: PalletSession = {
    id: buildUniquePalletId(createdAt),
    name:
      typeof customName === "string" && customName.trim()
        ? customName.trim()
        : formatPalletName(createdAt, sameMonthCount + 1),
    createdAt,
    palletCost: null,
  };
  commitState([...palletState, pallet], pallet.id);
  return pallet;
};

export const getNextDefaultPalletName = () => {
  const createdAt = Date.now();
  return formatPalletName(createdAt, getCurrentMonthPalletCount(createdAt) + 1);
};

export const setActivePalletSession = (palletId: string) => {
  if (!palletState.some((pallet) => pallet.id === palletId)) {
    return;
  }

  commitState(palletState, palletId);
};

export const deletePalletSession = (palletId: string) => {
  if (!palletState.some((pallet) => pallet.id === palletId)) {
    return false;
  }

  const remainingPallets = palletState.filter((pallet) => pallet.id !== palletId);
  const nextActivePalletId =
    activePalletId === palletId ? remainingPallets[0]?.id ?? null : activePalletId;

  const removedItems = inventoryState.filter((item) => item.palletId === palletId);
  setInventoryStateAndPersist(
    inventoryState.filter((item) => item.palletId !== palletId),
  );
  commitState(remainingPallets, nextActivePalletId);
  removedItems.forEach((item) => {
    void deleteManagedPhoto(item.photo);
  });
  return true;
};

export const resetAllPalletSessions = () => {
  setResetBackupState({
    items: inventoryState,
    pallets: palletState,
    activePalletId,
    expiresAt: Date.now() + threeDaysMs,
  });
  setInventoryStateAndPersist([]);
  commitState([], null);
};

export const restoreResetBackup = () => {
  clearExpiredResetBackup();
  if (!resetBackupState) {
    return false;
  }

  setInventoryStateAndPersist(resetBackupState.items);
  const palletsToRestore = ensureMigrationPallet(
    resetBackupState.items,
    resetBackupState.pallets,
  );
  const nextActivePalletId = resetBackupState.activePalletId;
  setResetBackupState(null);
  commitState(palletsToRestore, nextActivePalletId);
  return true;
};

export const renamePalletSession = (palletId: string, name: string) => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return;
  }

  commitState(
    palletState.map((pallet) =>
      pallet.id === palletId
        ? {
            ...pallet,
            name: trimmedName,
          }
        : pallet,
    ),
    activePalletId,
  );
};

export const updatePalletSessionCost = (
  palletId: string,
  palletCost: number | null,
) => {
  commitState(
    palletState.map((pallet) =>
      pallet.id === palletId
        ? {
            ...pallet,
            palletCost,
          }
        : pallet,
    ),
    activePalletId,
  );
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

export type { InventoryItem, PalletSession, ResetBackupSummary };

void hydrateInventory();
