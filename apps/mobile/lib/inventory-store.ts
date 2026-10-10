import {
  deleteStoredInventoryPhoto,
  storeInventoryPhoto,
} from "@/lib/inventory-photo-storage";
import {
  readActivePalletStorage,
  readInventoryStorage,
  writeActivePalletStorage,
  writeInventoryStorage,
} from "@/lib/inventory-persistence";
import {
  LOOSE_ITEMS_PALLET_ID,
  type InventoryItem,
  type PalletSession,
} from "@palletscanner/core";

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
const legacyPalletId = "pallet-1";
const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
const looseItemsPallet: PalletSession = {
  id: LOOSE_ITEMS_PALLET_ID,
  name: "Loose Items",
  createdAt: 0,
  palletCost: null,
  isSystem: true,
  acquisitionType: "loose_system",
};

const formatPalletName = (createdAt: number, sequence: number) => {
  const date = new Date(createdAt);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const palletNumber = String(sequence).padStart(2, "0");
  return `P${palletNumber}-${month}/${year}`;
};

const coerceText = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;

const coerceNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && !Number.isNaN(value) ? value : fallback;

const normalizeInventoryItem = (item: InventoryItem): InventoryItem => ({
  ...item,
  photo: typeof item.photo === "string" && item.photo.trim() ? item.photo.trim() : null,
  photos: Array.isArray(item.photos)
    ? item.photos.filter(
        (photo): photo is string =>
          typeof photo === "string" && photo.trim().length > 0,
      )
    : item.photo
      ? [item.photo]
      : [],
  quantity:
    typeof item.quantity === "number" && !Number.isNaN(item.quantity) && item.quantity > 0
      ? Math.floor(item.quantity)
      : 1,
  onHand: Number.isInteger(item.onHand) ? item.onHand : undefined,
  reserved: Number.isInteger(item.reserved) ? item.reserved : undefined,
  available: Number.isInteger(item.available) ? item.available : undefined,
  shortage: Number.isInteger(item.shortage) ? item.shortage : undefined,
  name: coerceText(item.name, "Unnamed item"),
  barcode:
    typeof item.barcode === "string" && item.barcode.trim()
      ? item.barcode.trim()
      : undefined,
  condition: coerceText(item.condition, "Unknown"),
  low_price: coerceNumber(item.low_price, 0),
  high_price: coerceNumber(item.high_price, coerceNumber(item.low_price, 0)),
  listing_price: coerceNumber(
    item.listing_price,
    coerceNumber(item.high_price, coerceNumber(item.low_price, 0)),
  ),
  floor_price:
    typeof item.floor_price === "number" && !Number.isNaN(item.floor_price)
      ? item.floor_price
      : coerceNumber(item.low_price, 0),
  best_platform: coerceText(item.best_platform, "Review needed"),
  listing_title: coerceText(item.listing_title, coerceText(item.name, "Unnamed item")),
  listing_description: coerceText(
    item.listing_description,
    "Review this saved inventory item before listing.",
  ),
  listedPlatforms: Array.isArray(item.listedPlatforms)
    ? item.listedPlatforms.filter(
        (platform): platform is "facebook" | "ebay" =>
          platform === "facebook" || platform === "ebay",
      )
    : [],
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
  ebayListingId:
    typeof item.ebayListingId === "string" && item.ebayListingId.trim()
      ? item.ebayListingId.trim()
      : undefined,
  ebayListingUrl:
    typeof item.ebayListingUrl === "string" && item.ebayListingUrl.trim()
      ? item.ebayListingUrl.trim()
      : undefined,
  ebaySku:
    typeof item.ebaySku === "string" && item.ebaySku.trim()
      ? item.ebaySku.trim()
      : undefined,
  ebayOfferId:
    typeof item.ebayOfferId === "string" && item.ebayOfferId.trim()
      ? item.ebayOfferId.trim()
      : undefined,
  ebayCategoryId:
    typeof item.ebayCategoryId === "string" && item.ebayCategoryId.trim()
      ? item.ebayCategoryId.trim()
      : undefined,
  ebayCategoryName:
    typeof item.ebayCategoryName === "string" && item.ebayCategoryName.trim()
      ? item.ebayCategoryName.trim()
      : undefined,
  ebayStatus:
    item.ebayStatus === "posting" ||
    item.ebayStatus === "active" ||
    item.ebayStatus === "error"
      ? item.ebayStatus
      : "idle",
  ebayLastError:
    typeof item.ebayLastError === "string" && item.ebayLastError.trim()
      ? item.ebayLastError.trim()
      : undefined,
  ebayProgress:
    typeof item.ebayProgress === "string" && item.ebayProgress.trim()
      ? item.ebayProgress.trim()
      : undefined,
  ebayUpdatedAt:
    typeof item.ebayUpdatedAt === "number" &&
    !Number.isNaN(item.ebayUpdatedAt)
      ? item.ebayUpdatedAt
      : undefined,
  facebookStatus:
    item.facebookStatus === "opened" ||
    item.facebookStatus === "listed" ||
    item.facebookStatus === "error"
      ? item.facebookStatus
      : item.listedPlatforms?.includes("facebook")
      ? "listed"
      : "idle",
  facebookListingUrl:
    typeof item.facebookListingUrl === "string" && item.facebookListingUrl.trim()
      ? item.facebookListingUrl.trim()
      : undefined,
  facebookLastError:
    typeof item.facebookLastError === "string" && item.facebookLastError.trim()
      ? item.facebookLastError.trim()
      : undefined,
  facebookUpdatedAt:
    typeof item.facebookUpdatedAt === "number" &&
    !Number.isNaN(item.facebookUpdatedAt)
      ? item.facebookUpdatedAt
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
    isSystem: pallet.id === LOOSE_ITEMS_PALLET_ID || pallet.isSystem === true,
    acquisitionType:
      pallet.id === LOOSE_ITEMS_PALLET_ID || pallet.acquisitionType === "loose_system"
        ? "loose_system"
        : "pallet",
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
  const normalizedPallets = [
    looseItemsPallet,
    ...pallets
      .filter((pallet) => pallet.id !== LOOSE_ITEMS_PALLET_ID)
      .map(normalizePalletSession),
  ];
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
let palletState: PalletSession[] = [looseItemsPallet];
let activePalletId: string | null = LOOSE_ITEMS_PALLET_ID;
let resetBackupState: ResetBackup | null = null;
let resetBackupSummaryState: ResetBackupSummary | null = null;
let hydratePromise: Promise<void> | null = null;

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
    await writeInventoryStorage(JSON.stringify(payload));
  } catch {
    // Best-effort persistence; keep working in memory if writing fails.
  }
};

const persistActivePalletId = async () => {
  try {
    const value = activePalletId ?? "";
    await writeActivePalletStorage(value);
  } catch {
    // Best-effort persistence; the full inventory file still has a fallback.
  }
};

const hydrateActivePalletId = async () => {
  try {
    const raw = await readActivePalletStorage();
    const persistedActivePalletId = raw?.trim() || null;
    if (
      persistedActivePalletId &&
      palletState.some((pallet) => pallet.id === persistedActivePalletId)
    ) {
      activePalletId = persistedActivePalletId;
    }
  } catch {
    // Fall back to the active pallet stored in the main inventory payload.
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
  void persistActivePalletId();
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
      const raw = await readInventoryStorage();
      if (!raw) return;
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
      await hydrateActivePalletId();
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

  const sourcePhotos =
    normalizedItem.photos && normalizedItem.photos.length > 0
      ? normalizedItem.photos
      : normalizedItem.photo
        ? [normalizedItem.photo]
        : [];
  const persistedPhotos = await Promise.all(
    sourcePhotos
      .slice(0, 5)
      .map((photo, index) => storeInventoryPhoto(photo, normalizedItem.id, index)),
  );
  const persistedPhoto = persistedPhotos[0] ?? null;

  const itemToSave = {
    ...normalizedItem,
    photo: persistedPhoto,
    photos: persistedPhotos,
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

  const existingPhotos = existingItem?.photos?.length
    ? existingItem.photos
    : existingItem?.photo
      ? [existingItem.photo]
      : [];
  for (const existingPhoto of existingPhotos) {
    if (!persistedPhotos.includes(existingPhoto)) {
      void deleteStoredInventoryPhoto(existingPhoto);
    }
  }
};

export const removeInventoryItem = async (id: number) => {
  const existingItem = inventoryState.find((item) => item.id === id);
  setInventory(inventoryState.filter((item) => item.id !== id));
  const existingPhotos = existingItem?.photos?.length
    ? existingItem.photos
    : existingItem?.photo
      ? [existingItem.photo]
      : [];
  await Promise.all(existingPhotos.map((photo) => deleteStoredInventoryPhoto(photo)));
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

  if (activePalletId === palletId) {
    return;
  }

  activePalletId = palletId;
  notifyInventoryListeners();
  void persistActivePalletId();
};

export const replaceInventorySnapshot = (
  items: InventoryItem[],
  pallets: PalletSession[],
  nextActivePalletId?: string | null,
) => {
  const normalizedItems = items.map(normalizeInventoryItem);
  const normalizedState = normalizePalletState(
    ensureMigrationPallet(normalizedItems, pallets),
    nextActivePalletId,
  );
  setInventoryStateAndPersist(normalizedItems);
  palletState = normalizedState.pallets;
  activePalletId = normalizedState.activePalletId;
  notifyInventoryListeners();
  void persistInventory();
  void persistActivePalletId();
};

export const deletePalletSession = (palletId: string) => {
  if (palletId === LOOSE_ITEMS_PALLET_ID) {
    return false;
  }
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
    const itemPhotos = item.photos?.length
      ? item.photos
      : item.photo
        ? [item.photo]
        : [];
    itemPhotos.forEach((photo) => {
      void deleteStoredInventoryPhoto(photo);
    });
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
  if (palletId === LOOSE_ITEMS_PALLET_ID) return;
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
  if (palletId === LOOSE_ITEMS_PALLET_ID) return;
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
            facebookStatus:
              platform === "facebook" ? "listed" : item.facebookStatus,
            facebookLastError:
              platform === "facebook" ? undefined : item.facebookLastError,
            facebookUpdatedAt:
              platform === "facebook" ? Date.now() : item.facebookUpdatedAt,
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
            facebookStatus:
              platform === "facebook" ? "idle" : item.facebookStatus,
            ebayStatus:
              platform === "ebay" ? "idle" : item.ebayStatus,
            ebayProgress:
              platform === "ebay" ? undefined : item.ebayProgress,
            ebayLastError:
              platform === "ebay" ? undefined : item.ebayLastError,
            ebayListingId:
              platform === "ebay" ? undefined : item.ebayListingId,
            ebayListingUrl:
              platform === "ebay" ? undefined : item.ebayListingUrl,
            ebayOfferId:
              platform === "ebay" ? undefined : item.ebayOfferId,
            ebayUpdatedAt:
              platform === "ebay" ? Date.now() : item.ebayUpdatedAt,
            facebookListingUrl:
              platform === "facebook" ? undefined : item.facebookListingUrl,
            facebookLastError:
              platform === "facebook" ? undefined : item.facebookLastError,
            facebookUpdatedAt:
              platform === "facebook" ? Date.now() : item.facebookUpdatedAt,
          }
        : item,
    ),
  );
};

export const updateInventoryItemFacebookStatus = (
  id: number,
  update: {
    status: "idle" | "opened" | "listed" | "error";
    error?: string;
  },
) => {
  setInventory(
    inventoryState.map((item) =>
      item.id === id
        ? {
            ...item,
            facebookStatus: update.status,
            facebookLastError:
              update.status === "error" ? update.error : undefined,
            facebookUpdatedAt: Date.now(),
            listedPlatforms:
              update.status === "listed" &&
              !item.listedPlatforms.includes("facebook")
                ? [...item.listedPlatforms, "facebook"]
                : update.status === "idle"
                  ? item.listedPlatforms.filter(
                      (platform) => platform !== "facebook",
                    )
                  : item.listedPlatforms,
          }
        : item,
    ),
  );
};

export const updateInventoryItemFacebookListingUrl = (
  id: number,
  listingUrl: string | undefined,
) => {
  const normalizedUrl = listingUrl?.trim();
  setInventory(
    inventoryState.map((item) =>
      item.id === id
        ? {
            ...item,
            facebookListingUrl: normalizedUrl || undefined,
            facebookStatus: normalizedUrl ? "listed" : item.facebookStatus,
            facebookLastError: undefined,
            facebookUpdatedAt: Date.now(),
            listedPlatforms:
              normalizedUrl && !item.listedPlatforms.includes("facebook")
                ? [...item.listedPlatforms, "facebook"]
                : item.listedPlatforms,
          }
        : item,
    ),
  );
};

export const updateInventoryItemEbayStatus = (
  id: number,
  update: {
    status: "idle" | "posting" | "active" | "error";
    listingId?: string;
    listingUrl?: string;
    sku?: string;
    offerId?: string;
    categoryId?: string;
    categoryName?: string;
    error?: string;
    progress?: string;
  },
) => {
  setInventory(
    inventoryState.map((item) =>
      item.id === id
        ? {
            ...item,
            ebayStatus: update.status,
            ebayListingId: update.listingId ?? item.ebayListingId,
            ebayListingUrl: update.listingUrl ?? item.ebayListingUrl,
            ebaySku: update.sku ?? item.ebaySku,
            ebayOfferId: update.offerId ?? item.ebayOfferId,
            ebayCategoryId: update.categoryId ?? item.ebayCategoryId,
            ebayCategoryName: update.categoryName ?? item.ebayCategoryName,
            ebayLastError:
              update.status === "error" ? update.error : undefined,
            ebayProgress:
              update.status === "posting" ? update.progress : undefined,
            ebayUpdatedAt: Date.now(),
            listedPlatforms:
              update.status === "active" &&
              !item.listedPlatforms.includes("ebay")
                ? [...item.listedPlatforms, "ebay"]
                : item.listedPlatforms,
          }
        : item,
    ),
  );
};

export const markInventoryItemEbayEnded = (id: number) => {
  setInventory(
    inventoryState.map((item) =>
      item.id === id
        ? {
            ...item,
            ebayStatus: "idle",
            ebayProgress: undefined,
            ebayLastError: undefined,
            ebayListingId: undefined,
            ebayListingUrl: undefined,
            ebayOfferId: undefined,
            ebayUpdatedAt: Date.now(),
            listedPlatforms: item.listedPlatforms.filter(
              (platform) => platform !== "ebay",
            ),
          }
        : item,
    ),
  );
};

export type {
  InventoryItem,
  PalletSession,
} from "@palletscanner/core";
export type { ResetBackupSummary };

void hydrateInventory();
