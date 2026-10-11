import type { InventoryItem, PalletSession } from "@palletscanner/core";
import * as FileSystem from "expo-file-system/legacy";

import {
  getActivePalletId,
  getInventory,
  getPallets,
  hydrateInventory,
  replaceInventorySnapshot,
  subscribeInventory,
} from "@/lib/inventory-store";
import {
  getSupabaseAuthSnapshot,
  getSupabaseClient,
  hydrateSupabaseAuth,
  subscribeSupabaseAuth,
} from "@/lib/supabase-auth";
import {
  changedSinceBaseline,
  deletedSinceBaseline,
  planPhotoSync,
  restoreBaseline,
  serializeBaseline,
  type SyncBaseline,
} from "@/lib/cloud-sync-policy";

type SyncState = {
  enabled: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
};

const listeners = new Set<() => void>();
let state: SyncState = { enabled: false, syncing: false, lastSyncedAt: null, error: null };
let started = false;
let applyingCloud = false;
let cloudLoaded = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let baselineItems = new Map<number, string>();
let baselinePallets = new Map<string, string>();
let syncChain: Promise<void> = Promise.resolve();
const baselineFile = `${FileSystem.documentDirectory}cloud-inventory-baseline.json`;

const comparableItem = (item: InventoryItem) => JSON.stringify(item);
const comparablePallet = (pallet: PalletSession) => JSON.stringify(pallet);
const persistBaseline = async (userId: string) => {
  await FileSystem.writeAsStringAsync(
    baselineFile,
    JSON.stringify(serializeBaseline(userId, baselineItems, baselinePallets)),
  );
};

const loadBaseline = async (userId: string) => {
  try {
    const info = await FileSystem.getInfoAsync(baselineFile);
    if (!info.exists) return false;
    const stored = JSON.parse(await FileSystem.readAsStringAsync(baselineFile)) as SyncBaseline;
    const restored = restoreBaseline(stored, userId);
    baselineItems = restored.items;
    baselinePallets = restored.pallets;
    return restored.matchesUser;
  } catch {
    baselineItems = new Map();
    baselinePallets = new Map();
    return false;
  }
};
const queueSync = (operation: () => Promise<void>) => {
  syncChain = syncChain.then(operation, operation).catch(handleError);
  return syncChain;
};

const updateState = (update: Partial<SyncState>) => {
  state = { ...state, ...update };
  listeners.forEach((listener) => listener());
};

export const getCloudInventorySyncSnapshot = () => state;
export const subscribeCloudInventorySync = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const mapCloudItem = (row: Record<string, unknown>, palletId: string): InventoryItem => ({
  id: Number(row.client_id),
  photo: null,
  photos: [],
  name: String(row.name ?? "Unnamed item"),
  barcode: row.product_barcode ? String(row.product_barcode) : undefined,
  sellerSku: row.seller_sku ? String(row.seller_sku) : undefined,
  condition: String(row.condition ?? "Unknown"),
  quantity: Number(row.quantity ?? 1),
  onHand: Number(row.on_hand ?? row.quantity ?? 1),
  reserved: Number(row.reserved ?? 0),
  available: Number(row.available ?? row.quantity ?? 1),
  shortage: Number(row.shortage ?? 0),
  storageLocation: row.storage_location ? String(row.storage_location) : undefined,
  low_price: Number(row.low_price ?? 0),
  high_price: Number(row.high_price ?? 0),
  floor_price: Number(row.floor_price ?? 0),
  listing_price: Number(row.listing_price ?? row.high_price ?? 0),
  best_platform: String(row.best_platform ?? "Review"),
  listing_title: String(row.listing_title ?? ""),
  listing_description: String(row.listing_description ?? ""),
  listing_title_facebook: row.facebook_title ? String(row.facebook_title) : undefined,
  listing_description_facebook: row.facebook_description ? String(row.facebook_description) : undefined,
  listing_title_ebay: row.ebay_title ? String(row.ebay_title) : undefined,
  listing_description_ebay: row.ebay_description ? String(row.ebay_description) : undefined,
  listedPlatforms: Array.isArray(row.listed_platforms)
    ? row.listed_platforms.filter((value): value is "facebook" | "ebay" => value === "facebook" || value === "ebay")
    : [],
  palletId,
  soldPrice: row.sold_price == null ? null : Number(row.sold_price),
});

const decodeBase64 = (value: string) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes).buffer;
};

const photoExtension = (uri: string) => {
  const extension = uri.split("?")[0]?.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]{2,5}$/.test(extension) ? extension : "jpg";
};

const getCloudWorkflowStatus = (item: InventoryItem) => {
  if (item.soldPrice !== null) return "sold";
  const photos = item.photos?.length ? item.photos : item.photo ? [item.photo] : [];
  if (photos.length === 0) return "needs_photos";
  if (!item.listing_title.trim() || !item.listing_description.trim() || item.high_price <= 0) {
    return "needs_research";
  }
  return "ready";
};

const pullCloudSnapshot = async () => {
  const supabase = getSupabaseClient();
  const auth = getSupabaseAuthSnapshot();
  if (!supabase || !auth.signedIn || !auth.userId) return;
  updateState({ enabled: true, syncing: true, error: null });
  const [palletResult, itemResult, photoResult, listingResult] = await Promise.all([
    supabase.from("pallets").select("*").order("created_at"),
    supabase.from("inventory_items").select("*").is("archived_at", null).order("captured_at"),
    supabase.from("item_photos").select("*").order("position"),
    supabase.from("marketplace_listings").select("*").order("updated_at", { ascending: false }),
  ]);
  if (palletResult.error) throw palletResult.error;
  if (itemResult.error) throw itemResult.error;
  if (photoResult.error) throw photoResult.error;
  if (listingResult.error) throw listingResult.error;
  const photoPaths = (photoResult.data ?? []).map((row) => row.storage_path);
  const signedPhotoResult = photoPaths.length
    ? await supabase.storage.from("item-photos").createSignedUrls(photoPaths, 3600)
    : { data: [], error: null };
  if (signedPhotoResult.error) throw signedPhotoResult.error;
  const signedUrlByPath = new Map((signedPhotoResult.data ?? []).map((entry) => [entry.path, entry.signedUrl]));
  const photosByItemId = new Map<string, string[]>();
  for (const row of photoResult.data ?? []) {
    const signedUrl = signedUrlByPath.get(row.storage_path);
    if (!signedUrl) continue;
    const current = photosByItemId.get(row.item_id) ?? [];
    current.push(signedUrl);
    photosByItemId.set(row.item_id, current);
  }
  const pallets: PalletSession[] = (palletResult.data ?? []).map((row) => ({
    id: row.client_id,
    name: row.name,
    createdAt: Date.parse(row.created_at),
    palletCost: row.purchase_cost == null ? null : Number(row.purchase_cost),
    isSystem: row.is_system === true,
    acquisitionType:
      row.acquisition_type === "loose_system" ? "loose_system" : "pallet",
  }));
  const palletClientIdByServerId = new Map((palletResult.data ?? []).map((row) => [row.id, row.client_id]));
  const listingsByItemId = new Map<string, Record<string, (typeof listingResult.data)[number]>>();
  for (const row of listingResult.data ?? []) {
    const current = listingsByItemId.get(row.item_id) ?? {};
    current[row.platform] = row;
    listingsByItemId.set(row.item_id, current);
  }
  const items = (itemResult.data ?? []).reduce<InventoryItem[]>((mappedItems, row) => {
      const palletId = palletClientIdByServerId.get(row.pallet_id);
      if (!palletId) return mappedItems;
      const item = mapCloudItem(row, palletId);
      const photos = photosByItemId.get(row.id) ?? [];
      const listings = listingsByItemId.get(row.id) ?? {};
      const ebay = listings.ebay;
      const facebook = listings.facebook;
      mappedItems.push({
        ...item,
        photo: photos[0] ?? null,
        photos,
        ebayStatus: ebay?.status === "posting" || ebay?.status === "active" || ebay?.status === "error" ? ebay.status : "idle",
        ebayListingId: ebay?.external_listing_id ?? undefined,
        ebayListingUrl: ebay?.listing_url ?? undefined,
        ebaySku: ebay?.sku ?? undefined,
        ebayOfferId: ebay?.offer_id ?? undefined,
        ebayCategoryId: ebay?.category_id ?? undefined,
        ebayCategoryName: ebay?.category_name ?? undefined,
        ebayProgress: ebay?.progress ?? undefined,
        ebayLastError: ebay?.last_error ?? undefined,
        ebayUpdatedAt: ebay?.updated_at ? Date.parse(ebay.updated_at) : undefined,
        facebookStatus: facebook?.status === "active" ? "listed" : facebook?.status === "opened" || facebook?.status === "error" ? facebook.status : "idle",
        facebookListingUrl: facebook?.listing_url ?? undefined,
        facebookLastError: facebook?.last_error ?? undefined,
        facebookUpdatedAt: facebook?.updated_at ? Date.parse(facebook.updated_at) : undefined,
      });
      return mappedItems;
    }, []);
  applyingCloud = true;
  replaceInventorySnapshot(items, pallets, getActivePalletId());
  applyingCloud = false;
  cloudLoaded = true;
  baselineItems = new Map(items.map((item) => [item.id, comparableItem(item)]));
  baselinePallets = new Map(pallets.map((pallet) => [pallet.id, comparablePallet(pallet)]));
  await persistBaseline(auth.userId);
  updateState({ syncing: false, lastSyncedAt: Date.now(), error: null });
};

const pushLocalSnapshot = async () => {
  const supabase = getSupabaseClient();
  const auth = getSupabaseAuthSnapshot();
  if (!supabase || !auth.signedIn || !auth.userId || !cloudLoaded || applyingCloud) return;
  updateState({ enabled: true, syncing: true, error: null });
  const pallets = getPallets();
  const items = getInventory();
  const changedPallets = changedSinceBaseline(pallets, baselinePallets, (pallet) => pallet.id, comparablePallet);
  const changedItems = changedSinceBaseline(items, baselineItems, (item) => item.id, comparableItem);
  if (changedPallets.length > 0) {
    const result = await supabase.from("pallets").upsert(
      changedPallets.map((pallet) => ({ owner_id: auth.userId, client_id: pallet.id, name: pallet.name, purchase_cost: pallet.palletCost, is_system: pallet.isSystem === true, acquisition_type: pallet.acquisitionType ?? "pallet" })),
      { onConflict: "owner_id,client_id" },
    );
    if (result.error) throw result.error;
  }
  const palletResult = await supabase.from("pallets").select("id,client_id");
  if (palletResult.error) throw palletResult.error;
  const palletServerIdByClientId = new Map((palletResult.data ?? []).map((row) => [row.client_id, row.id]));
  if (changedItems.length > 0) {
    const result = await supabase.from("inventory_items").upsert(
      changedItems.map((item) => ({ owner_id: auth.userId, pallet_id: palletServerIdByClientId.get(item.palletId), client_id: item.id, name: item.name, product_barcode: item.barcode ?? null, seller_sku: item.sellerSku ?? null, storage_location: item.storageLocation ?? null, condition: item.condition, quantity: item.quantity, last_quantity_reason: "Mobile inventory quantity update", low_price: item.low_price, high_price: item.high_price, floor_price: item.floor_price, listing_price: item.listing_price ?? item.high_price, best_platform: item.best_platform, workflow_status: getCloudWorkflowStatus(item), listing_title: item.listing_title, listing_description: item.listing_description, facebook_title: item.listing_title_facebook ?? null, facebook_description: item.listing_description_facebook ?? null, ebay_title: item.listing_title_ebay ?? null, ebay_description: item.listing_description_ebay ?? null, listed_platforms: item.listedPlatforms, sold_price: item.soldPrice })),
      { onConflict: "owner_id,client_id" },
    );
    if (result.error) throw result.error;
  }
  const cloudItemResult = await supabase.from("inventory_items").select("id,client_id");
  if (cloudItemResult.error) throw cloudItemResult.error;
  const itemServerIdByClientId = new Map((cloudItemResult.data ?? []).map((row) => [Number(row.client_id), row.id]));
  const changedListingRows = changedItems.flatMap((item) => {
    const itemId = itemServerIdByClientId.get(item.id);
    if (!itemId) return [];
    const rows: Record<string, unknown>[] = [];
    if (item.ebayStatus || item.ebayListingId || item.listedPlatforms.includes("ebay")) {
      rows.push({ owner_id: auth.userId, item_id: itemId, platform: "ebay", status: item.ebayStatus ?? (item.listedPlatforms.includes("ebay") ? "active" : "idle"), external_listing_id: item.ebayListingId ?? null, listing_url: item.ebayListingUrl ?? null, sku: item.ebaySku ?? null, offer_id: item.ebayOfferId ?? null, category_id: item.ebayCategoryId ?? null, category_name: item.ebayCategoryName ?? null, progress: item.ebayProgress ?? null, last_error: item.ebayLastError ?? null });
    }
    if (item.facebookStatus || item.facebookListingUrl || item.listedPlatforms.includes("facebook")) {
      rows.push({ owner_id: auth.userId, item_id: itemId, platform: "facebook", status: item.facebookStatus === "listed" ? "active" : item.facebookStatus ?? (item.listedPlatforms.includes("facebook") ? "active" : "idle"), listing_url: item.facebookListingUrl ?? null, last_error: item.facebookLastError ?? null });
    }
    return rows;
  });
  if (changedListingRows.length) {
    const listingUpsert = await supabase.from("marketplace_listings").upsert(changedListingRows, { onConflict: "item_id,platform" });
    if (listingUpsert.error) throw listingUpsert.error;
  }
  for (const item of changedItems) {
    const serverItemId = itemServerIdByClientId.get(item.id);
    if (!serverItemId) continue;
    const photos = item.photos?.length ? item.photos : item.photo ? [item.photo] : [];
    const photoPlan = planPhotoSync(photos);
    for (const { position, uri } of photoPlan.uploads) {
      const extension = photoExtension(uri);
      const storagePath = `${auth.userId}/${serverItemId}/${item.id}-${position}.${extension}`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const upload = await supabase.storage.from("item-photos").upload(storagePath, decodeBase64(base64), {
        contentType: extension === "png" ? "image/png" : "image/jpeg",
        upsert: true,
      });
      if (upload.error) throw upload.error;
      const photoRow = await supabase.from("item_photos").upsert(
        { owner_id: auth.userId, item_id: serverItemId, storage_path: storagePath, position },
        { onConflict: "item_id,position" },
      );
      if (photoRow.error) throw photoRow.error;
    }
    const stalePhotos = await supabase.from("item_photos").select("id,storage_path,position").eq("item_id", serverItemId).gte("position", photoPlan.removePositionsFrom);
    if (stalePhotos.error) throw stalePhotos.error;
    if ((stalePhotos.data ?? []).length > 0) {
      const paths = (stalePhotos.data ?? []).map((row) => row.storage_path);
      const removeObjects = await supabase.storage.from("item-photos").remove(paths);
      if (removeObjects.error) throw removeObjects.error;
      const removeRows = await supabase.from("item_photos").delete().in("id", (stalePhotos.data ?? []).map((row) => row.id));
      if (removeRows.error) throw removeRows.error;
    }
  }
  const remotePallets = await supabase.from("pallets").select("client_id");
  const remoteItems = await supabase.from("inventory_items").select("id,client_id").is("archived_at", null);
  if (remotePallets.error) throw remotePallets.error;
  if (remoteItems.error) throw remoteItems.error;
  const localItemIds = new Set(items.map((item) => item.id));
  const deletedItems = deletedSinceBaseline(remoteItems.data ?? [], baselineItems, localItemIds, (row) => Number(row.client_id));
  if (deletedItems.length) {
    const deletedServerIds = deletedItems.map((row) => row.id);
    const deletedPhotos = await supabase.from("item_photos").select("storage_path").in("item_id", deletedServerIds);
    if (deletedPhotos.error) throw deletedPhotos.error;
    const deletedPaths = (deletedPhotos.data ?? []).map((row) => row.storage_path);
    if (deletedPaths.length) {
      const removeObjects = await supabase.storage.from("item-photos").remove(deletedPaths);
      if (removeObjects.error) throw removeObjects.error;
    }
    const result = await supabase.from("inventory_items").update({ archived_at: new Date().toISOString() }).in("client_id", deletedItems.map((row) => row.client_id));
    if (result.error) throw result.error;
  }
  const localPalletIds = new Set(pallets.map((pallet) => pallet.id));
  const deletedPalletIds = deletedSinceBaseline(remotePallets.data ?? [], baselinePallets, localPalletIds, (row) => row.client_id).map((row) => row.client_id);
  if (deletedPalletIds.length) {
    const result = await supabase.from("pallets").delete().in("client_id", deletedPalletIds);
    if (result.error) throw result.error;
  }
  await pullCloudSnapshot();
};

const handleError = (error: unknown) => {
  applyingCloud = false;
  updateState({ syncing: false, error: error instanceof Error ? error.message : "Cloud inventory sync failed." });
};

const handleAuthChange = async () => {
  const auth = getSupabaseAuthSnapshot();
  if (!auth.signedIn || !auth.userId) {
    cloudLoaded = false;
    baselineItems = new Map();
    baselinePallets = new Map();
    updateState({ enabled: false, syncing: false, error: null });
    return;
  }
  const hasBaseline = await loadBaseline(auth.userId);
  if (hasBaseline) {
    cloudLoaded = true;
    await queueSync(pushLocalSnapshot);
  } else {
    await queueSync(pullCloudSnapshot);
  }
};

export const startCloudInventorySync = async () => {
  if (started) return;
  started = true;
  await Promise.all([hydrateInventory(), hydrateSupabaseAuth()]);
  subscribeSupabaseAuth(handleAuthChange);
  subscribeInventory(() => {
    if (applyingCloud || !cloudLoaded) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { void queueSync(pushLocalSnapshot); }, 400);
  });
  void handleAuthChange();
};

export const retryCloudInventorySync = async () => {
  await queueSync(cloudLoaded ? pushLocalSnapshot : pullCloudSnapshot);
};
