import assert from "node:assert/strict";
import test from "node:test";

import { createEbayReadService } from "./ebay-read-service.mjs";

test("builds an observe-only inventory, offer, order, and return preview", async () => {
  const requests = [];
  const service = createEbayReadService({
    getUserAccessToken: async (userId) => `token-for-${userId}`,
    ebayFetch: async (pathname, options) => {
      requests.push({ pathname, authorization: options.headers.Authorization });
      if (pathname.includes("inventory_item")) return { total: 1, inventoryItems: [{ sku: "PF-1", condition: "USED_GOOD", product: { title: "Drill", imageUrls: ["image"], upc: ["012345678905"], ean: ["4006381333931"] }, availability: { shipToLocationAvailability: { quantity: 2 } } }] };
      if (pathname.includes("/offer")) return { total: 1, offers: [{ offerId: "offer-1", sku: "PF-1", status: "PUBLISHED", availableQuantity: 2, listing: { listingId: "listing-1" } }] };
      if (pathname.includes("post-order")) return { paginationOutput: { totalNumberOfEntries: 1 }, members: [{ returnId: "return-1", orderId: "order-1", state: "RETURN_STARTED", status: "RETURN_REQUESTED", currentType: "MONEY_BACK", creationInfo: { reason: "DOES_NOT_FIT", creationDate: { value: "2026-10-10T10:00:00Z" }, item: { itemId: "legacy-1", transactionId: "txn-1", returnQuantity: 1 } }, sellerResponseDue: { respondByDate: { value: "2026-10-11T10:00:00Z" } } }] };
      return { total: 1, orders: [{ orderId: "order-1", cancelStatus: { cancelState: "CANCELED" }, lineItems: [{ lineItemId: "line-1", sku: "PF-1", quantity: 1 }] }] };
    },
  });

  const preview = await service.getImportPreview("seller", { limit: 500 });
  assert.equal(preview.observeOnly, true);
  assert.equal(preview.pagination.limit, 100);
  assert.equal(preview.inventoryItems[0].quantity, 2);
  assert.deepEqual(preview.inventoryItems[0].productIdentifiers.upc, ["012345678905"]);
  assert.equal(preview.offers[0].listingId, "listing-1");
  assert.equal(preview.orders[0].lineItems[0].sku, "PF-1");
  assert.equal(preview.orders[0].cancellationState, "CANCELED");
  assert.equal(preview.returns[0].returnId, "return-1");
  assert.equal(preview.returns[0].item.legacyTransactionId, "txn-1");
  assert.equal(preview.pagination.returnTotal, 1);
  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => request.authorization === "Bearer token-for-seller"));
});

test("keeps the preview usable when Post-Order returns are unavailable", async () => {
  const service = createEbayReadService({
    getUserAccessToken: async () => "token",
    ebayFetch: async (pathname) => {
      if (pathname.includes("post-order")) throw new Error("Returns are not supported in Sandbox");
      if (pathname.includes("inventory_item")) return { inventoryItems: [] };
      if (pathname.includes("/offer")) return { offers: [] };
      return { orders: [] };
    },
  });
  const preview = await service.getImportPreview("seller");
  assert.deepEqual(preview.returns, []);
  assert.match(preview.returnsUnavailable, /not supported in Sandbox/);
});
