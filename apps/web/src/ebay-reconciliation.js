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

const matchBySku = (sku, localBySku) => {
  const normalizedSku = normalizeSku(sku);
  const candidates = normalizedSku ? localBySku.get(normalizedSku) ?? [] : [];
  if (candidates.length === 0) return { state: "unmatched", normalizedSku, candidates };
  if (candidates.length > 1) return { state: "uncertain", normalizedSku, candidates };
  return { state: "matched", normalizedSku, candidates };
};

export const reconcileEbayPreview = (preview, localItems) => {
  const localBySku = indexItemsBySku(localItems.filter((item) => !item.archivedAt));
  const inventory = (preview?.inventoryItems ?? []).map((external) => {
    const match = matchBySku(external.sku, localBySku);
    const localItem = match.candidates[0] ?? null;
    const quantityConflict = match.state === "matched" && localQuantity(localItem) !== Number(external.quantity ?? 0);
    return { ...match, state: quantityConflict ? "conflicting" : match.state, quantityConflict, external, localItem };
  });
  const offers = (preview?.offers ?? []).map((external) => {
    const match = matchBySku(external.sku, localBySku);
    return { ...match, external, localItem: match.candidates[0] ?? null };
  });
  const orderLines = (preview?.orders ?? []).flatMap((order) => (order.lineItems ?? []).map((external) => {
    const match = matchBySku(external.sku, localBySku);
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
