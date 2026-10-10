const normalizeSku = (value) => String(value ?? "").trim().toUpperCase();

const localQuantity = (item) => Number(item.available ?? item.quantity ?? 0);

const indexItemsBySku = (items) => items.reduce((index, item) => {
  const sku = normalizeSku(item.sellerSku);
  if (!sku) return index;
  const matches = index.get(sku) ?? [];
  matches.push(item);
  index.set(sku, matches);
  return index;
}, new Map());

const indexItemsByIdentity = (items, fields) => items.reduce((index, item) => {
  for (const field of fields) {
    const value = String(item[field] ?? "").trim();
    if (value) index.set(value, [...(index.get(value) ?? []), item]);
  }
  return index;
}, new Map());

const matchExternal = (external, indexes) => {
  const normalizedSku = normalizeSku(external.sku);
  const skuCandidates = normalizedSku ? indexes.bySku.get(normalizedSku) ?? [] : [];
  const externalIds = [external.offerId, external.listingId, external.legacyItemId].map((value) => String(value ?? "").trim()).filter(Boolean);
  const idCandidates = [...new Map(externalIds.flatMap((id) => indexes.byExternalId.get(id) ?? []).map((item) => [item.id, item])).values()];
  if (skuCandidates.length === 1 && idCandidates.length > 0 && !idCandidates.some((item) => item.id === skuCandidates[0].id)) {
    return { state: "conflicting", matchReason: "identifier_conflict", normalizedSku, candidates: [...skuCandidates, ...idCandidates] };
  }
  if (skuCandidates.length === 1) return { state: "matched", matchReason: "seller_sku", normalizedSku, candidates: skuCandidates };
  if (skuCandidates.length > 1 && idCandidates.length === 1) return { state: "matched", matchReason: "external_id", normalizedSku, candidates: idCandidates };
  if (skuCandidates.length > 1) return { state: "uncertain", matchReason: "duplicate_seller_sku", normalizedSku, candidates: skuCandidates };
  if (idCandidates.length === 1) return { state: "matched", matchReason: "external_id", normalizedSku, candidates: idCandidates };
  if (idCandidates.length > 1) return { state: "uncertain", matchReason: "duplicate_external_id", normalizedSku, candidates: idCandidates };
  return { state: "unmatched", matchReason: "no_strong_identifier", normalizedSku, candidates: [] };
};

export const reconcileEbayPreview = (preview, localItems) => {
  const activeItems = localItems.filter((item) => !item.archivedAt);
  const indexes = {
    bySku: indexItemsBySku(activeItems),
    byExternalId: indexItemsByIdentity(activeItems, ["ebayOfferId", "ebayListingId"]),
  };
  const inventory = (preview?.inventoryItems ?? []).map((external) => {
    const match = matchExternal(external, indexes);
    const localItem = match.candidates[0] ?? null;
    const quantityConflict = match.state === "matched" && localQuantity(localItem) !== Number(external.quantity ?? 0);
    return { ...match, state: quantityConflict ? "conflicting" : match.state, quantityConflict, external, localItem };
  });
  const offers = (preview?.offers ?? []).map((external) => {
    const match = matchExternal(external, indexes);
    return { ...match, external, localItem: match.candidates[0] ?? null };
  });
  const orderLines = (preview?.orders ?? []).flatMap((order) => (order.lineItems ?? []).map((external) => {
    const match = matchExternal(external, indexes);
    return { ...match, external: { ...external, orderId: order.orderId }, localItem: match.candidates[0] ?? null };
  }));
  const records = [...inventory, ...offers, ...orderLines];
  const count = (state) => records.filter((record) => record.state === state).length;
  return {
    inventory,
    offers,
    orderLines,
    summary: {
      matched: count("matched"),
      conflicting: count("conflicting"),
      uncertain: count("uncertain"),
      unmatched: count("unmatched"),
      needsReview: records.filter((record) => record.state !== "matched").length,
    },
  };
};
