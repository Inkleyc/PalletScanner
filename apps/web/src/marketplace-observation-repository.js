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
