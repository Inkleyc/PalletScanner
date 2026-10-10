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

const mapEbayReturnState = (entry) => {
  const value = String(entry.state || entry.status || "").toUpperCase();
  if (value.includes("CANCEL")) return "cancelled";
  if (value === "CLOSED") return "closed";
  if (value.includes("DELIVERED")) return "received";
  if (value.includes("SHIP")) return "in_transit";
  if (value.includes("REQUESTED") || value.includes("STARTED") || entry.actionDueDate) return "action_required";
  if (value.includes("APPROV")) return "approved";
  return "requested";
};

export const importObservedEbayReturns = async (preview) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in before importing observed returns.");
  const ownerId = userResult.data.user.id;
  const [orderResult, lineResult] = await Promise.all([
    supabase.from("orders").select("id,business_id,external_order_id,raw_payload").eq("owner_id", ownerId).eq("source", "ebay"),
    supabase.from("order_lines").select("id,business_id,order_id,inventory_item_id,raw_payload").eq("owner_id", ownerId),
  ]);
  throwIfError(orderResult); throwIfError(lineResult);
  const orderByExternalId = new Map((orderResult.data ?? []).map((order) => [order.external_order_id, order]));
  let imported = 0; let unmatched = 0;
  for (const observed of preview.returns ?? []) {
    const order = orderByExternalId.get(observed.orderId);
    if (!order || !observed.returnId) { unmatched += 1; continue; }
    const candidates = (lineResult.data ?? []).filter((line) => line.order_id === order.id && String(line.raw_payload?.legacyItemId ?? "") === String(observed.item?.legacyItemId ?? "") && (!observed.item?.legacyTransactionId || !line.raw_payload?.legacyTransactionId || String(line.raw_payload.legacyTransactionId) === String(observed.item.legacyTransactionId)));
    if (candidates.length !== 1) { unmatched += 1; continue; }
    const line = candidates[0];
    const existingResult = await supabase.from("returns").select("id,state").eq("business_id", order.business_id).eq("source", "ebay").eq("external_return_id", observed.returnId).maybeSingle();
    throwIfError(existingResult);
    const marketplaceValues = { reason: observed.reason || observed.reasonType || null, requested_resolution: observed.requestedResolution || null, action_due_at: observed.actionDueDate || null, raw_payload: observed.raw ?? observed, external_created_at: observed.creationDate || null, external_updated_at: new Date().toISOString() };
    let returnId;
    if (existingResult.data) {
      returnId = existingResult.data.id;
      const protectedState = ["received", "inspecting", "resolved", "closed"].includes(existingResult.data.state);
      const updateResult = await supabase.from("returns").update({ ...marketplaceValues, ...(protectedState ? {} : { state: mapEbayReturnState(observed) }) }).eq("id", returnId);
      throwIfError(updateResult);
    } else {
      const insertResult = await supabase.from("returns").insert({ business_id: order.business_id, owner_id: ownerId, order_id: order.id, source: "ebay", external_return_id: observed.returnId, state: mapEbayReturnState(observed), responsibility: "unknown", ...marketplaceValues }).select("id").single();
      throwIfError(insertResult); returnId = insertResult.data.id;
    }
    const returnLineResult = await supabase.from("return_lines").upsert({ business_id: order.business_id, owner_id: ownerId, return_id: returnId, order_line_id: line.id, external_return_line_id: `${observed.returnId}:${observed.item?.legacyItemId || line.id}:${observed.item?.legacyTransactionId || "line"}`, quantity: Math.max(1, Math.floor(Number(observed.item?.quantity || 1))), inventory_item_id: line.inventory_item_id, inventory_state: "unavailable" }, { onConflict: "return_id,external_return_line_id", ignoreDuplicates: true });
    throwIfError(returnLineResult); imported += 1;
  }
  return { imported, unmatched };
};

export const listImportedEbayOrders = async () => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in to view imported orders.");
  const [orderResult, lineResult, shipmentResult] = await Promise.all([
    supabase.from("orders").select("*").eq("owner_id", userResult.data.user.id).order("external_created_at", { ascending: false }),
    supabase.from("order_lines").select("*, inventory_reservations(state)").eq("owner_id", userResult.data.user.id).order("created_at"),
    supabase.from("shipments").select("*, shipment_packages(*), tracking_events(*)").eq("owner_id", userResult.data.user.id).order("created_at"),
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

export const recordShipmentLabel = async ({ shipmentId, source, carrier, service, trackingNumber, cost }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("record_shipment_label", {
    target_shipment_id: shipmentId,
    purchased_label_source: source,
    purchased_carrier: carrier,
    purchased_service: service,
    purchased_tracking_number: trackingNumber,
    purchased_cost: cost,
  });
  throwIfError(result);
  return result.data;
};

export const confirmShipmentShipped = async (shipmentId) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("confirm_shipment_shipped", {
    target_shipment_id: shipmentId,
    carrier_handoff_at: new Date().toISOString(),
  });
  throwIfError(result);
  return result.data;
};

export const recordTrackingEvent = async ({ shipmentId, eventKey, status, description = "", location = "", occurredAt = new Date().toISOString() }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("record_tracking_event", {
    target_shipment_id: shipmentId,
    tracking_event_key: eventKey,
    tracking_status: status,
    tracking_description: description,
    tracking_location: location,
    tracking_occurred_at: occurredAt,
  });
  throwIfError(result);
  return result.data;
};

export const listPackagePresets = async () => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in to manage package presets.");
  const result = await supabase.from("package_presets").select("*").eq("owner_id", userResult.data.user.id).eq("is_active", true).order("name");
  throwIfError(result);
  return result.data ?? [];
};

export const savePackagePreset = async ({ id = null, name, lengthMm, widthMm, heightMm, tareWeightGrams, packingAllowanceGrams, defaultSupplyCost }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in to manage package presets.");
  const ownerId = userResult.data.user.id;
  const businessResult = await supabase.from("businesses").select("id").eq("owner_id", ownerId).single();
  throwIfError(businessResult);
  const values = { business_id: businessResult.data.id, owner_id: ownerId, name: name.trim(), length_mm: lengthMm, width_mm: widthMm, height_mm: heightMm, tare_weight_grams: tareWeightGrams, packing_allowance_grams: packingAllowanceGrams, default_supply_cost: defaultSupplyCost, is_active: true };
  const result = id
    ? await supabase.from("package_presets").update(values).eq("id", id).eq("owner_id", ownerId).select("*").single()
    : await supabase.from("package_presets").insert(values).select("*").single();
  throwIfError(result);
  return result.data;
};

export const archivePackagePreset = async (presetId) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.from("package_presets").update({ is_active: false }).eq("id", presetId).select("id").single();
  throwIfError(result);
  return result.data;
};

export const listReturns = async () => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error("Sign in to manage returns.");
  const result = await supabase.from("returns")
    .select("*, orders(external_order_id), return_lines(*, order_lines(title,seller_sku), return_inspections(*)), return_financial_events(*), return_decisions(*), return_communications(*)")
    .eq("owner_id", userResult.data.user.id)
    .order("created_at", { ascending: false });
  throwIfError(result);
  return result.data ?? [];
};

export const createManualReturn = async ({ orderLineId, quantity, reason, requestKey }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("create_manual_return", { target_order_line_id: orderLineId, returned_quantity: quantity, return_reason: reason, client_request_key: requestKey });
  throwIfError(result);
  return result.data;
};

export const receiveReturnLine = async ({ returnLineId, note }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("receive_return_line", { target_return_line_id: returnLineId, receipt_note: note });
  throwIfError(result);
  return result.data;
};

export const inspectReturnLine = async ({ returnLineId, condition, completeness, notes, recommendation }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("inspect_return_line", { target_return_line_id: returnLineId, received_condition: condition, received_completeness: completeness, inspection_notes: notes, disposition_recommendation: recommendation });
  throwIfError(result);
  return result.data;
};

export const dispositionReturnLine = async ({ returnLineId, disposition, note }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("disposition_return_line", { target_return_line_id: returnLineId, selected_disposition: disposition, disposition_note: note });
  throwIfError(result);
  return result.data;
};

export const recordReturnFinancialEvent = async ({ returnId, type, amount, currency = "USD", eventKey, note = "", occurredAt = new Date().toISOString() }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("record_return_financial_event", { target_return_id: returnId, financial_event_type: type, financial_amount: amount, financial_currency: currency, financial_event_key: eventKey, financial_note: note, financial_occurred_at: occurredAt });
  throwIfError(result);
  return result.data;
};

export const recordReturnShippingHandoff = async ({ returnId, source, payer, carrier, trackingNumber, cost = 0, currency = "USD" }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("record_return_shipping_handoff", {
    target_return_id: returnId,
    shipping_label_source: source,
    shipping_label_payer: payer,
    shipping_carrier: carrier,
    shipping_tracking_number: trackingNumber,
    shipping_label_cost: cost,
    shipping_currency: currency,
  });
  throwIfError(result);
  return result.data;
};

export const recordConfirmedReturnDecision = async ({ returnId, decisionType, eventKey, notes = "" }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("record_confirmed_return_decision", {
    target_return_id: returnId,
    confirmed_decision_type: decisionType,
    confirmed_event_key: eventKey,
    confirmed_notes: notes,
    marketplace_confirmation: true,
  });
  throwIfError(result);
  return result.data;
};

export const recordReturnCommunication = async ({ returnId, direction, body, eventKey, sentAt = new Date().toISOString() }) => {
  if (!supabase) throw new Error("Supabase is not configured for this dashboard.");
  const result = await supabase.rpc("record_return_communication", {
    target_return_id: returnId,
    communication_direction: direction,
    communication_source: "ebay_confirmed",
    communication_body: body,
    communication_event_key: eventKey,
    communication_sent_at: sentAt,
    marketplace_confirmation: true,
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
