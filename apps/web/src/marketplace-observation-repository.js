import { supabase } from "./supabase.js";
import { buildEbayObservationRows } from "./marketplace-observation-model.js";

const throwIfError = ({ error }) => {
  if (error) throw error;
};

export const saveEbayObservationSnapshot = async ({ preview, reconciliation }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in before saving a reconciliation snapshot.");
  const ownerId = userResult.data.user.id;
  const businessResult = await supabase.from("businesses").select("id").eq("owner_id", ownerId).single();
  throwIfError(businessResult);
  const businessId = businessResult.data.id;
  const accountResult = await supabase.from("marketplace_accounts").upsert({
    business_id: businessId,
    owner_id: ownerId,
    channel: "ebay",
    marketplace_region: "EBAY_US",
    connection_state: "connected",
    sync_mode: "observe_only",
    outbound_paused: true,
    last_observed_at: preview.fetchedAt,
  }, { onConflict: "business_id,channel,marketplace_region" }).select("id").single();
  throwIfError(accountResult);
  const runResult = await supabase.from("marketplace_import_runs").insert({
    business_id: businessId,
    owner_id: ownerId,
    marketplace_account_id: accountResult.data.id,
    mode: "observe_only",
    status: "running",
    inventory_count: reconciliation.inventory.length,
    offer_count: reconciliation.offers.length,
    order_count: preview.orders?.length ?? 0,
    matched_count: reconciliation.summary.matched,
    uncertain_count: reconciliation.summary.uncertain,
    unmatched_count: reconciliation.summary.unmatched,
    conflicting_count: reconciliation.summary.conflicting,
  }).select("id").single();
  throwIfError(runResult);
  const runId = runResult.data.id;
  try {
    const rows = buildEbayObservationRows({ businessId, ownerId, accountId: accountResult.data.id, runId, preview, reconciliation });
    for (let start = 0; start < rows.length; start += 250) {
      throwIfError(await supabase.from("marketplace_observations").insert(rows.slice(start, start + 250)));
    }
    throwIfError(await supabase.from("marketplace_import_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", runId));
    return { runId, observationCount: rows.length };
  } catch (error) {
    await supabase.from("marketplace_import_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: error instanceof Error ? error.message : "Observation storage failed." }).eq("id", runId);
    throw error;
  }
};

export const listEbayObservationSnapshots = async () => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in before viewing reconciliation history.");
  const result = await supabase.from("marketplace_import_runs")
    .select("id,status,inventory_count,offer_count,order_count,matched_count,uncertain_count,unmatched_count,conflicting_count,error_message,started_at,completed_at")
    .eq("owner_id", userResult.data.user.id)
    .order("started_at", { ascending: false })
    .limit(10);
  throwIfError(result);
  return result.data ?? [];
};

export const loadEbayObservationSnapshot = async (runId) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in before reviewing reconciliation decisions.");
  const observationResult = await supabase.from("marketplace_observations")
    .select("id,business_id,resource_type,external_id,seller_sku,reconciliation_state,inventory_item_id,observed_quantity,observed_payload,observed_at")
    .eq("import_run_id", runId)
    .order("observed_at");
  throwIfError(observationResult);
  const observations = observationResult.data ?? [];
  if (observations.length === 0) return { observations: [], decisions: [] };
  const [decisionResult, importedItemResult] = await Promise.all([
    supabase.from("marketplace_reconciliation_decisions").select("*").in("observation_id", observations.map((observation) => observation.id)).order("decided_at", { ascending: false }),
    supabase.from("inventory_items").select("id,client_id,name,source_observation_id,verification_state").in("source_observation_id", observations.map((observation) => observation.id)),
  ]);
  throwIfError(decisionResult); throwIfError(importedItemResult);
  return { observations, decisions: decisionResult.data ?? [], importedItems: importedItemResult.data ?? [] };
};

export const recordEbayReconciliationDecision = async ({ observation, decisionType, inventoryItemId = null, reason = null }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in before recording a reconciliation decision.");
  if (decisionType === "match_existing" && !inventoryItemId) throw new Error("Select an inventory item before recording this match.");
  const result = await supabase.from("marketplace_reconciliation_decisions").insert({
    business_id: observation.business_id,
    owner_id: userResult.data.user.id,
    observation_id: observation.id,
    decision_type: decisionType,
    inventory_item_id: inventoryItemId,
    reason: reason?.trim() || null,
  }).select("*").single();
  throwIfError(result);
  return result.data;
};

export const createUnverifiedInventoryFromObservation = async (observationId) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("create_unverified_inventory_from_observation", { target_observation_id: observationId });
  throwIfError(result);
  return result.data;
};

export const importObservedEbayOrders = async ({ preview, reconciliation }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in before importing observed orders.");
  const ownerId = userResult.data.user.id;
  const [businessResult, accountResult] = await Promise.all([
    supabase.from("businesses").select("id").eq("owner_id", ownerId).single(),
    supabase.from("marketplace_accounts").select("id,business_id").eq("owner_id", ownerId).eq("channel", "ebay").eq("marketplace_region", "EBAY_US").single(),
  ]);
  throwIfError(businessResult); throwIfError(accountResult);
  const businessId = businessResult.data.id;
  if (accountResult.data.business_id !== businessId) throw new Error("The eBay account does not belong to the active business.");
  const orderRows = (preview.orders ?? []).filter((order) => order.orderId).map((order) => ({
    business_id: businessId,
    owner_id: ownerId,
    marketplace_account_id: accountResult.data.id,
    source: "ebay",
    external_order_id: order.orderId,
    payment_state: order.orderPaymentStatus || "unknown",
    fulfillment_state: order.orderFulfillmentStatus || "unknown",
    cancellation_state: (order.cancellationState || "NONE_REQUESTED").toLowerCase(),
    currency: order.pricingSummary?.total?.currency ?? order.pricingSummary?.priceSubtotal?.currency ?? null,
    pricing_summary: order.pricingSummary ?? {},
    raw_payload: order.raw ?? order,
    external_created_at: order.creationDate,
    external_updated_at: order.lastModifiedDate,
    imported_at: new Date().toISOString(),
  }));
  if (orderRows.length === 0) return { orders: 0, lines: 0 };
  const orderResult = await supabase.from("orders").upsert(orderRows, { onConflict: "business_id,source,external_order_id" }).select("id,external_order_id");
  throwIfError(orderResult);
  const orderIdByExternalId = new Map((orderResult.data ?? []).map((order) => [order.external_order_id, order.id]));
  const lineRows = reconciliation.orderLines.flatMap((record, index) => {
    const orderId = orderIdByExternalId.get(record.external.orderId);
    if (!orderId) return [];
    return [{
      business_id: businessId,
      owner_id: ownerId,
      order_id: orderId,
      external_line_id: record.external.lineItemId || `${record.external.legacyItemId || record.external.sku || "line"}-${index}`,
      seller_sku: record.external.sku || null,
      title: record.external.title || null,
      quantity: Math.max(1, Math.floor(Number(record.external.quantity ?? 1) || 1)),
      inventory_item_id: record.localItem?.serverId || null,
      match_state: record.state,
      line_cost: record.external.lineItemCost ?? {},
      raw_payload: record.external,
    }];
  });
  if (lineRows.length > 0) {
    throwIfError(await supabase.from("order_lines").upsert(lineRows, { onConflict: "order_id,external_line_id" }));
  }
  return { orders: orderRows.length, lines: lineRows.length };
};

export const listImportedEbayOrders = async () => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in to view imported orders.");
  const [orderResult, lineResult, shipmentResult] = await Promise.all([
    supabase.from("orders").select("*").eq("owner_id", userResult.data.user.id).order("external_created_at", { ascending: false }),
    supabase.from("order_lines").select("*, inventory_reservations(state)").eq("owner_id", userResult.data.user.id).order("created_at"),
    supabase.from("shipments").select("*, shipment_packages(*)").eq("owner_id", userResult.data.user.id).order("created_at"),
  ]);
  throwIfError(orderResult); throwIfError(lineResult); throwIfError(shipmentResult);
  const linesByOrder = new Map();
  for (const line of lineResult.data ?? []) linesByOrder.set(line.order_id, [...(linesByOrder.get(line.order_id) ?? []), line]);
  const shipmentByOrder = new Map((shipmentResult.data ?? []).map((shipment) => [shipment.order_id, shipment]));
  return (orderResult.data ?? []).map((order) => ({ ...order, lines: linesByOrder.get(order.id) ?? [], shipment: shipmentByOrder.get(order.id) ?? null }));
};

export const matchImportedOrderLine = async ({ lineId, inventoryItemId }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  if (!lineId || !inventoryItemId) throw new Error("Select an order line and inventory item before recording the match.");
  const result = await supabase.rpc("match_order_line", {
    target_line_id: lineId,
    target_item_id: inventoryItemId,
  });
  throwIfError(result);
  return result.data;
};

export const reserveImportedOrder = async (orderId) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  if (!orderId) throw new Error("Select an imported order before reserving inventory.");
  const result = await supabase.rpc("reserve_imported_order", { target_order_id: orderId });
  throwIfError(result);
  return Number(result.data ?? 0);
};

export const releaseCancelledOrderReservations = async (orderId) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  if (!orderId) throw new Error("Select a cancelled order before releasing inventory.");
  const result = await supabase.rpc("release_cancelled_order_reservations", { target_order_id: orderId });
  throwIfError(result);
  return Number(result.data ?? 0);
};

export const startOrderFulfillment = async (orderId, packagePresetId = null) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  if (!orderId) throw new Error("Select an order before starting fulfillment.");
  const result = await supabase.rpc("start_order_fulfillment", {
    target_order_id: orderId,
    target_package_preset_id: packagePresetId,
  });
  throwIfError(result);
  return result.data;
};

export const confirmShipmentPicked = async (shipmentId) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("confirm_shipment_picked", { target_shipment_id: shipmentId });
  throwIfError(result);
  return result.data;
};

export const confirmShipmentPackage = async ({ packageId, weightGrams, lengthMm, widthMm, heightMm }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("confirm_shipment_package", {
    target_package_id: packageId,
    confirmed_weight_grams: weightGrams,
    confirmed_length_mm: lengthMm,
    confirmed_width_mm: widthMm,
    confirmed_height_mm: heightMm,
  });
  throwIfError(result);
  return result.data;
};

export const listMarketplaceQuantityQueue = async () => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in to review marketplace quantities.");
  const result = await supabase.from("marketplace_listings")
    .select("id,platform,status,sku,external_listing_id,offer_id,advertised_quantity,desired_quantity,quantity_sync_state,sync_paused,last_error,updated_at,inventory_items(name,seller_sku,available)")
    .eq("owner_id", userResult.data.user.id)
    .eq("platform", "ebay")
    .order("updated_at", { ascending: false });
  throwIfError(result);
  return result.data ?? [];
};

export const getEbayMarketplaceControl = async () => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in to manage marketplace automation.");
  const result = await supabase.from("marketplace_accounts")
    .select("id,channel,sync_mode,outbound_paused,connection_state,last_observed_at")
    .eq("owner_id", userResult.data.user.id)
    .eq("channel", "ebay")
    .maybeSingle();
  throwIfError(result);
  return result.data;
};

export const setEbayOutboundPause = async ({ accountId, paused }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("set_marketplace_outbound_pause", {
    target_account_id: accountId,
    should_pause: paused,
  });
  throwIfError(result);
  return result.data;
};

export const queueEbayQuantitySync = async (listingId) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("queue_ebay_quantity_sync", { target_listing_id: listingId });
  throwIfError(result);
  return result.data;
};

export const listMarketplaceActionJobs = async () => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in to review marketplace jobs.");
  const result = await supabase.from("marketplace_action_jobs")
    .select("id,action_type,status,attempt_count,max_attempts,next_attempt_at,last_error,payload,created_at,updated_at,marketplace_listings(sku,inventory_items(name,seller_sku))")
    .eq("owner_id", userResult.data.user.id)
    .in("status", ["pending", "running", "retry_wait", "failed"])
    .order("updated_at", { ascending: false })
    .limit(100);
  throwIfError(result);
  return result.data ?? [];
};

export const retryFailedMarketplaceActionJob = async (jobId) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("retry_failed_marketplace_action_job", { target_job_id: jobId });
  throwIfError(result);
  return result.data;
};
