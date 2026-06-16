import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import {
  browserUriToDataUri,
  readWebStorage,
  writeWebStorage,
} from "@/lib/web-storage";

type InventoryItem = {
  id: number;
  photo: string | null;
  photos?: string[];
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
  ebayListingId?: string;
  ebayListingUrl?: string;
  ebaySku?: string;
  ebayOfferId?: string;
  ebayCategoryId?: string;
  ebayCategoryName?: string;
  ebayStatus?: "idle" | "posting" | "active" | "error";
  ebayProgress?: string;
  ebayLastError?: string;
  ebayUpdatedAt?: number;
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
const inventoryWebKey = "inventory";
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
    if (Platform.OS === "web") {
      await writeWebStorage(inventoryWebKey, JSON.stringify(payload));
      return;
    }
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
  if (Platform.OS === "web") {
    return;
  }
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
  if (Platform.OS === "web") {
    return;
  }
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

const persistPhotoUri = async (uri: string, itemId: number, index = 0) => {
  if (Platform.OS === "web") {
    try {
      return await browserUriToDataUri(uri);
    } catch {
      return uri;
    }
  }
  if (isManagedPhotoPath(uri)) {
    return uri;
  }

  await ensurePhotosDirectory();
  const extension = getPhotoExtension(uri);
  const filename = `item-${itemId}-${index}-${Date.now()}.${extension}`;
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
      if (Platform.OS === "web") {
        const raw = await readWebStorage(inventoryWebKey);
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as
          | InventoryItem[]
          | InventoryPersistence;
        if (Array.isArray(parsed)) {
          const normalizedItems = parsed.map(normalizeInventoryItem);
          setInventoryStateAndPersist(normalizedItems);
          const normalizedState = normalizePalletState(
            ensureMigrationPallet(normalizedItems, []),
            legacyPalletId,
          );
          palletState = normalizedState.pallets;
          activePalletId = normalizedState.activePalletId;
          setResetBackupState(null);
        } else {
          const normalizedItems = Array.isArray(parsed.items)
            ? parsed.items.map(normalizeInventoryItem)
            : [];
          setInventoryStateAndPersist(normalizedItems);
          const normalizedState = normalizePalletState(
            ensureMigrationPallet(
              normalizedItems,
              Array.isArray(parsed.pallets) ? parsed.pallets : [],
            ),
            parsed.activePalletId,
          );
          palletState = normalizedState.pallets;
          activePalletId = normalizedState.activePalletId;
          setResetBackupState(parsed.resetBackup ?? null);
        }
        notifyInventoryListeners();
        return;
      }
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

  const sourcePhotos =
    normalizedItem.photos && normalizedItem.photos.length > 0
      ? normalizedItem.photos
      : normalizedItem.photo
        ? [normalizedItem.photo]
        : [];
  const persistedPhotos = await Promise.all(
    sourcePhotos
      .slice(0, 5)
      .map((photo, index) => persistPhotoUri(photo, normalizedItem.id, index)),
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
      void deleteManagedPhoto(existingPhoto);
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
  await Promise.all(existingPhotos.map((photo) => deleteManagedPhoto(photo)));
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
    const itemPhotos = item.photos?.length
      ? item.photos
      : item.photo
        ? [item.photo]
        : [];
    itemPhotos.forEach((photo) => {
      void deleteManagedPhoto(photo);
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

export type { InventoryItem, PalletSession, ResetBackupSummary };

void hydrateInventory();
