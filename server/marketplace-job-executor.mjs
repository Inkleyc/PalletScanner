const requiredText = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

export const createMarketplaceJobExecutor = ({ callRpc, ebayFetch, getUserAccessToken }) => ({
  async execute(userId, jobId) {
    const job = await callRpc("claim_marketplace_action_job", { target_job_id: requiredText(jobId, "Job ID") });
    try {
      if (job.action_type !== "sync_quantity") throw new Error(`Unsupported marketplace action: ${job.action_type}`);
      const sku = requiredText(job.payload?.sku, "eBay SKU");
      const offerId = requiredText(job.payload?.offer_id, "eBay offer ID");
      const quantity = Number(job.payload?.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("Quantity must be a non-negative whole number.");
      const accessToken = await getUserAccessToken(userId);
      const result = await ebayFetch("/sell/inventory/v1/bulk_update_price_quantity", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ sku, shipToLocationAvailability: { quantity }, offers: [{ offerId, availableQuantity: quantity }] }] }),
      });
      const failures = (result?.responses ?? []).filter((response) => Number(response.statusCode ?? 500) >= 300);
      if (failures.length > 0) throw new Error(failures.map((failure) => failure.errors?.map((error) => error.message).join("; ") || `eBay status ${failure.statusCode}`).join("; "));
      const completed = await callRpc("complete_marketplace_action_job", { target_job_id: job.id });
      return { job: completed, ebay: result };
    } catch (error) {
      await callRpc("fail_marketplace_action_job", { target_job_id: job.id, failure_message: error instanceof Error ? error.message : "Marketplace action failed." });
      throw error;
    }
  },
});
