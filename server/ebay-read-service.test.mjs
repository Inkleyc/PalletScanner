import assert from "node:assert/strict";
import test from "node:test";

import { createEbayReadService } from "./ebay-read-service.mjs";

test("builds an observe-only inventory, offer, and order preview", async () => {
  const requests = [];
  const service = createEbayReadService({
    getUserAccessToken: async (userId) => `token-for-${userId}`,
    ebayFetch: async (pathname, options) => {
      requests.push({ pathname, authorization: options.headers.Authorization });
      if (pathname.includes("inventory_item")) return { total: 1, inventoryItems: [{ sku: "PF-1", condition: "USED_GOOD", product: { title: "Drill", imageUrls: ["image"], upc: ["012345678905"], ean: ["4006381333931"] }, availability: { shipToLocationAvailability: { quantity: 2 } } }] };
      if (pathname.includes("/offer")) return { total: 1, offers: [{ offerId: "offer-1", sku: "PF-1", status: "PUBLISHED", availableQuantity: 2, listing: { listingId: "listing-1" } }] };
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
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.authorization === "Bearer token-for-seller"));
});
