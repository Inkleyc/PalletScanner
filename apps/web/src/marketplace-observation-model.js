const observationIdentity = (type, external, index) => {
  if (type === "inventory_item") return external.sku || `inventory-item-${index}`;
  if (type === "offer") return external.offerId || external.listingId || `offer-${external.sku || index}`;
  return external.lineItemId || `${external.orderId || "order"}-${external.sku || index}`;
};

export const buildEbayObservationRows = ({ businessId, ownerId, accountId, runId, preview, reconciliation, observedAt = new Date().toISOString() }) => {
  const reconciledRows = [
    ...reconciliation.inventory.map((record) => ({ type: "inventory_item", record })),
    ...reconciliation.offers.map((record) => ({ type: "offer", record })),
    ...reconciliation.orderLines.map((record) => ({ type: "order_line", record })),
  ].map(({ type, record }, index) => ({
    business_id: businessId,
    owner_id: ownerId,
    marketplace_account_id: accountId,
    import_run_id: runId,
    resource_type: type,
    external_id: String(observationIdentity(type, record.external, index)),
    seller_sku: record.external.sku || null,
    reconciliation_state: record.state,
    inventory_item_id: record.localItem?.serverId || null,
    observed_quantity: record.external.quantity == null ? null : Number(record.external.quantity),
    observed_payload: record.external.raw ?? record.external,
    observed_at: observedAt,
  }));
  const orderRows = (preview.orders ?? []).map((order, index) => {
    const lineStates = reconciliation.orderLines.filter((record) => record.external.orderId === order.orderId).map((record) => record.state);
    const reconciliationState = ["conflicting", "uncertain", "unmatched"].find((state) => lineStates.includes(state)) ?? "matched";
    return {
      business_id: businessId,
      owner_id: ownerId,
      marketplace_account_id: accountId,
      import_run_id: runId,
      resource_type: "order",
      external_id: String(order.orderId || `order-${index}`),
      seller_sku: null,
      reconciliation_state: reconciliationState,
      inventory_item_id: null,
      observed_quantity: null,
      observed_payload: order.raw ?? order,
      observed_at: observedAt,
    };
  });
  return [...reconciledRows, ...orderRows];
};
