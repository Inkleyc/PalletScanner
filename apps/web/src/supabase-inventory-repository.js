const clone = (value) => JSON.parse(JSON.stringify(value));

const requireUser = async (client) => {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in before using cloud inventory.");
  return data.user;
};

const throwIfError = ({ error }) => {
  if (error) throw error;
};

export const createSupabaseInventoryRepository = (client) => {
  let state = { items: [], pallets: [], activePalletId: localStorage.getItem("palletscanner.cloudActivePalletId") };
  const listeners = new Set();
  const publish = () => listeners.forEach((listener) => listener(clone(state)));
  const activity = async (ownerId, type, entityId, details = {}) => {
    throwIfError(await client.from("activity_events").insert({ owner_id: ownerId, event_type: type, entity_id: String(entityId), details }));
  };
  const recordActivitySafely = async (...args) => {
    try { await activity(...args); }
    catch (error) { console.warn("Cloud data saved, but activity logging failed.", error); }
  };

  const repository = {
    getSnapshot: () => clone(state),
    async hydrate() {
      await requireUser(client);
      const [palletResult, itemResult, photoResult, listingResult] = await Promise.all([
        client.from("pallets").select("*").order("created_at"),
        client.from("inventory_items").select("*").order("captured_at"),
        client.from("item_photos").select("*").order("position"),
        client.from("marketplace_listings").select("*").order("updated_at", { ascending: false }),
      ]);
      throwIfError(palletResult); throwIfError(itemResult); throwIfError(photoResult); throwIfError(listingResult);
      const pallets = (palletResult.data ?? []).map((row) => ({ id: row.client_id, serverId: row.id, name: row.name, createdAt: Date.parse(row.created_at), palletCost: row.purchase_cost == null ? null : Number(row.purchase_cost), cost: row.purchase_cost == null ? 0 : Number(row.purchase_cost) }));
      const clientPalletByServerId = new Map(pallets.map((pallet) => [pallet.serverId, pallet.id]));
      const photoPaths = (photoResult.data ?? []).map((row) => row.storage_path);
      const signedResult = photoPaths.length ? await client.storage.from("item-photos").createSignedUrls(photoPaths, 3600) : { data: [], error: null };
      throwIfError(signedResult);
      const signedUrlByPath = new Map((signedResult.data ?? []).map((entry) => [entry.path, entry.signedUrl]));
      const photosByItemId = new Map();
      for (const row of photoResult.data ?? []) {
        const uri = signedUrlByPath.get(row.storage_path);
        if (!uri) continue;
        photosByItemId.set(row.item_id, [...(photosByItemId.get(row.item_id) ?? []), uri]);
      }
      const listingsByItemId = new Map();
      for (const row of listingResult.data ?? []) {
        const current = listingsByItemId.get(row.item_id) ?? {};
        current[row.platform] = row;
        listingsByItemId.set(row.item_id, current);
      }
      const items = (itemResult.data ?? []).map((row) => {
        const photos = photosByItemId.get(row.id) ?? [];
        const listings = listingsByItemId.get(row.id) ?? {};
        const ebay = listings.ebay;
        const facebook = listings.facebook;
        return { id: Number(row.client_id), serverId: row.id, palletId: clientPalletByServerId.get(row.pallet_id) ?? "", name: row.name, condition: row.condition, quantity: row.quantity, low: Number(row.low_price), high: Number(row.high_price), floor: Number(row.floor_price), low_price: Number(row.low_price), high_price: Number(row.high_price), floor_price: Number(row.floor_price), best_platform: row.best_platform, platform: row.best_platform, status: row.workflow_status, listing_title: row.listing_title, listing_description: row.listing_description, listing_title_facebook: row.facebook_title ?? undefined, listing_description_facebook: row.facebook_description ?? undefined, listing_title_ebay: row.ebay_title ?? undefined, listing_description_ebay: row.ebay_description ?? undefined, listedPlatforms: row.listed_platforms ?? [], soldPrice: row.sold_price == null ? null : Number(row.sold_price), photo: photos[0] ?? null, photos, capturedAt: row.captured_at, ebayStatus: ebay?.status, ebayListingId: ebay?.external_listing_id ?? undefined, ebayListingUrl: ebay?.listing_url ?? undefined, ebaySku: ebay?.sku ?? undefined, ebayOfferId: ebay?.offer_id ?? undefined, ebayCategoryId: ebay?.category_id ?? undefined, ebayCategoryName: ebay?.category_name ?? undefined, ebayProgress: ebay?.progress ?? undefined, ebayLastError: ebay?.last_error ?? undefined, ebayUpdatedAt: ebay?.updated_at ? Date.parse(ebay.updated_at) : undefined, facebookStatus: facebook?.status, facebookListingUrl: facebook?.listing_url ?? undefined, facebookLastError: facebook?.last_error ?? undefined, facebookUpdatedAt: facebook?.updated_at ? Date.parse(facebook.updated_at) : undefined };
      });
      const activePalletId = pallets.some((pallet) => pallet.id === state.activePalletId) ? state.activePalletId : pallets[0]?.id ?? null;
      state = { items, pallets, activePalletId };
      publish();
      return clone(state);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async saveItem(item) {
      const user = await requireUser(client);
      const previousItem = state.items.find((entry) => entry.id === item.id);
      const pallet = state.pallets.find((entry) => entry.id === item.palletId);
      if (!pallet?.serverId) throw new Error("The selected cloud pallet was not found.");
      const result = await client.from("inventory_items").upsert({ owner_id: user.id, pallet_id: pallet.serverId, client_id: item.id, name: item.name, condition: item.condition, quantity: item.quantity, low_price: item.low_price, high_price: item.high_price, floor_price: item.floor_price, best_platform: item.best_platform, workflow_status: item.status ?? "captured", listing_title: item.listing_title, listing_description: item.listing_description, facebook_title: item.listing_title_facebook ?? null, facebook_description: item.listing_description_facebook ?? null, ebay_title: item.listing_title_ebay ?? null, ebay_description: item.listing_description_ebay ?? null, listed_platforms: item.listedPlatforms ?? [], sold_price: item.soldPrice }, { onConflict: "owner_id,client_id" }).select("id").single();
      throwIfError(result);
      const listingRows = [];
      if (item.ebayStatus || item.ebayListingId || item.listedPlatforms?.includes("ebay")) {
        listingRows.push({ owner_id: user.id, item_id: result.data.id, platform: "ebay", status: item.ebayStatus ?? (item.listedPlatforms?.includes("ebay") ? "active" : "idle"), external_listing_id: item.ebayListingId ?? null, listing_url: item.ebayListingUrl ?? null, sku: item.ebaySku ?? null, offer_id: item.ebayOfferId ?? null, category_id: item.ebayCategoryId ?? null, category_name: item.ebayCategoryName ?? null, progress: item.ebayProgress ?? null, last_error: item.ebayLastError ?? null });
      }
      if (item.facebookStatus || item.facebookListingUrl || item.listedPlatforms?.includes("facebook")) {
        const facebookStatus = item.facebookStatus === "listed" ? "active" : item.facebookStatus;
        listingRows.push({ owner_id: user.id, item_id: result.data.id, platform: "facebook", status: facebookStatus ?? (item.listedPlatforms?.includes("facebook") ? "active" : "idle"), listing_url: item.facebookListingUrl ?? null, last_error: item.facebookLastError ?? null });
      }
      if (listingRows.length) throwIfError(await client.from("marketplace_listings").upsert(listingRows, { onConflict: "item_id,platform" }));
      await recordActivitySafely(user.id, state.items.some((entry) => entry.id === item.id) ? "item.updated" : "item.created", item.id, { name: item.name });
      if (previousItem && JSON.stringify(previousItem.listedPlatforms ?? []) !== JSON.stringify(item.listedPlatforms ?? [])) {
        await recordActivitySafely(user.id, "listing.updated", item.id, { name: item.name, platforms: (item.listedPlatforms ?? []).join(", ") });
      }
      await repository.hydrate();
    },
    async removeItem(itemId) { const user = await requireUser(client); throwIfError(await client.from("inventory_items").delete().eq("owner_id", user.id).eq("client_id", itemId)); await recordActivitySafely(user.id, "item.deleted", itemId); await repository.hydrate(); },
    async createPallet(name) { const user = await requireUser(client); const clientId = `pallet-${Date.now()}`; const result = await client.from("pallets").insert({ owner_id: user.id, client_id: clientId, name: name?.trim() || `Pallet ${state.pallets.length + 1}` }).select("*").single(); throwIfError(result); await repository.hydrate(); await recordActivitySafely(user.id, "pallet.created", clientId, { name: result.data.name }); return state.pallets.find((pallet) => pallet.id === clientId); },
    async updatePallet(palletId, update) { const user = await requireUser(client); const values = {}; if (update.name !== undefined) values.name = update.name; if (update.palletCost !== undefined) values.purchase_cost = update.palletCost; throwIfError(await client.from("pallets").update(values).eq("owner_id", user.id).eq("client_id", palletId)); await repository.hydrate(); await recordActivitySafely(user.id, "pallet.updated", palletId, { name: update.name ?? palletId }); },
    async removePallet(palletId) { const user = await requireUser(client); throwIfError(await client.from("pallets").delete().eq("owner_id", user.id).eq("client_id", palletId)); await repository.hydrate(); await recordActivitySafely(user.id, "pallet.deleted", palletId); return true; },
    async setActivePallet(palletId) { if (state.pallets.some((pallet) => pallet.id === palletId)) { state.activePalletId = palletId; localStorage.setItem("palletscanner.cloudActivePalletId", palletId); publish(); } },
    async listPhotos(itemId) { const item = state.items.find((entry) => entry.id === itemId); if (!item?.serverId) return []; const result = await client.from("item_photos").select("*").eq("item_id", item.serverId).order("position"); throwIfError(result); return Promise.all((result.data ?? []).map(async (row) => { const signed = await client.storage.from("item-photos").createSignedUrl(row.storage_path, 3600); throwIfError(signed); return { id: row.id, itemId, uri: signed.data.signedUrl, createdAt: Date.parse(row.created_at) }; })); },
    async listSales(itemId) { let query = client.from("sales").select("*, inventory_items!inner(client_id)").order("sold_at", { ascending: false }); if (itemId !== undefined) query = query.eq("inventory_items.client_id", itemId); const result = await query; throwIfError(result); return (result.data ?? []).map((row) => ({ id: row.id, itemId: Number(row.inventory_items.client_id), marketplace: row.marketplace, soldPrice: Number(row.sold_price), fees: Number(row.fees), shippingCost: Number(row.shipping_cost), soldAt: Date.parse(row.sold_at) })); },
    async listActivity(entityId) { let query = client.from("activity_events").select("*").order("occurred_at", { ascending: false }); if (entityId !== undefined) query = query.eq("entity_id", String(entityId)); const result = await query; throwIfError(result); return (result.data ?? []).map((row) => ({ id: row.id, type: row.event_type, entityId: row.entity_id, occurredAt: Date.parse(row.occurred_at), details: row.details })); },
  };
  return repository;
};
