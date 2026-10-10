import assert from "node:assert/strict";
import test from "node:test";
import { createMarketplaceJobExecutor } from "./marketplace-job-executor.mjs";

test("executes a reviewed quantity job at inventory and offer levels", async () => {
  const calls = [];
  const executor = createMarketplaceJobExecutor({
    callRpc: async (name) => {
      calls.push(name);
      if (name === "claim_marketplace_action_job") return { id: "job-1", action_type: "sync_quantity", payload: { sku: "PF-1", offer_id: "offer-1", quantity: 0 } };
      return { id: "job-1", status: "succeeded" };
    },
    getUserAccessToken: async () => "ebay-token",
    ebayFetch: async (path, options) => {
      assert.equal(path, "/sell/inventory/v1/bulk_update_price_quantity");
      assert.equal(options.headers.Authorization, "Bearer ebay-token");
      assert.deepEqual(JSON.parse(options.body), { requests: [{ sku: "PF-1", shipToLocationAvailability: { quantity: 0 }, offers: [{ offerId: "offer-1", availableQuantity: 0 }] }] });
      return { responses: [{ statusCode: 200 }] };
    },
  });
  const result = await executor.execute("owner-1", "job-1");
  assert.equal(result.job.status, "succeeded");
  assert.deepEqual(calls, ["claim_marketplace_action_job", "complete_marketplace_action_job"]);
});

test("records a retry after an eBay quantity failure", async () => {
  const calls = [];
  const executor = createMarketplaceJobExecutor({
    callRpc: async (name, payload) => {
      calls.push([name, payload]);
      if (name === "claim_marketplace_action_job") return { id: "job-2", action_type: "sync_quantity", payload: { sku: "PF-2", offer_id: "offer-2", quantity: 1 } };
      return { id: "job-2", status: "retry_wait" };
    },
    getUserAccessToken: async () => "ebay-token",
    ebayFetch: async () => ({ responses: [{ statusCode: 400, errors: [{ message: "Rejected" }] }] }),
  });
  await assert.rejects(() => executor.execute("owner-1", "job-2"), /Rejected/);
  assert.equal(calls.at(-1)[0], "fail_marketplace_action_job");
  assert.equal(calls.at(-1)[1].failure_message, "Rejected");
});

test("withdraws a reviewed listing after its final available unit is gone", async () => {
  const calls = [];
  const executor = createMarketplaceJobExecutor({
    callRpc: async (name) => {
      calls.push(name);
      if (name === "claim_marketplace_action_job") return { id: "job-3", action_type: "withdraw_listing", payload: { offer_id: "offer/final", quantity: 0 } };
      return { id: "job-3", status: "succeeded" };
    },
    getUserAccessToken: async () => "ebay-token",
    ebayFetch: async (path, options) => {
      assert.equal(path, "/sell/inventory/v1/offer/offer%2Ffinal/withdraw");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer ebay-token");
      assert.equal(options.body, undefined);
      return null;
    },
  });
  const result = await executor.execute("owner-1", "job-3");
  assert.equal(result.job.status, "succeeded");
  assert.deepEqual(calls, ["claim_marketplace_action_job", "complete_marketplace_action_job"]);
});
