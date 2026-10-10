const normalizeSku = (value) => String(value ?? "").trim().toUpperCase();
const normalizeProductIdentifier = (value) => String(value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
const ignoredProductIdentifiers = new Set(["", "NA", "NONE", "DOESNOTAPPLY", "NOTAPPLICABLE", "UNKNOWN"]);

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
  const productIds = [external.productIdentifiers?.upc, external.productIdentifiers?.ean, external.productIdentifiers?.isbn].flat().map(normalizeProductIdentifier).filter((value) => !ignoredProductIdentifiers.has(value));
  const productCandidates = [...new Map(productIds.flatMap((id) => indexes.byProductId.get(id) ?? []).map((item) => [item.id, item])).values()];
  const sources = [
    { reason: "seller_sku", candidates: skuCandidates },
    { reason: "external_id", candidates: idCandidates },
    { reason: "product_identifier", candidates: productCandidates },
  ];
  const selectedSource = sources.find((source) => source.candidates.length === 1);
  if (selectedSource) {
    const selected = selectedSource.candidates[0];
    const disagreement = sources.some((source) => source.candidates.length > 0 && !source.candidates.some((item) => item.id === selected.id));
    if (disagreement) return { state: "conflicting", matchReason: "identifier_conflict", normalizedSku, candidates: [...new Map(sources.flatMap((source) => source.candidates).map((item) => [item.id, item])).values()] };
    return { state: "matched", matchReason: selectedSource.reason, normalizedSku, candidates: [selected] };
  }
  const duplicateSource = sources.find((source) => source.candidates.length > 1);
  if (duplicateSource) return { state: "uncertain", matchReason: `duplicate_${duplicateSource.reason}`, normalizedSku, candidates: duplicateSource.candidates };
  return { state: "unmatched", matchReason: "no_strong_identifier", normalizedSku, candidates: [] };
};

export const reconcileEbayPreview = (preview, localItems) => {
  const activeItems = localItems.filter((item) => !item.archivedAt);
  const indexes = {
    bySku: indexItemsBySku(activeItems),
    byExternalId: indexItemsByIdentity(activeItems, ["ebayOfferId", "ebayListingId"]),
    byProductId: activeItems.reduce((index, item) => {
      const identifier = normalizeProductIdentifier(item.barcode);
      if (!ignoredProductIdentifiers.has(identifier)) index.set(identifier, [...(index.get(identifier) ?? []), item]);
      return index;
    }, new Map()),
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
