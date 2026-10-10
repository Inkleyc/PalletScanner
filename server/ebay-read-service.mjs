const boundedInteger = (value, fallback, maximum) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? Math.min(parsed, maximum)
    : fallback;
};

const summarizeInventoryItem = (item) => ({
  sku: item.sku ?? null,
  title: item.product?.title ?? null,
  condition: item.condition ?? null,
  quantity: Number(item.availability?.shipToLocationAvailability?.quantity ?? 0),
  productIdentifiers: {
    upc: item.product?.upc ?? [],
    ean: item.product?.ean ?? [],
    isbn: item.product?.isbn ?? [],
    mpn: item.product?.mpn ?? null,
    brand: item.product?.brand ?? null,
  },
  imageUrl: item.product?.imageUrls?.[0] ?? null,
  raw: item,
});

const summarizeOffer = (offer) => ({
  offerId: offer.offerId ?? null,
  sku: offer.sku ?? null,
  listingId: offer.listing?.listingId ?? null,
  listingStatus: offer.status ?? null,
  availableQuantity: Number(offer.availableQuantity ?? 0),
  price: offer.pricingSummary?.price ?? null,
  marketplaceId: offer.marketplaceId ?? null,
  raw: offer,
});

const summarizeOrder = (order) => ({
  orderId: order.orderId ?? null,
  creationDate: order.creationDate ?? null,
  lastModifiedDate: order.lastModifiedDate ?? null,
  orderFulfillmentStatus: order.orderFulfillmentStatus ?? null,
  orderPaymentStatus: order.orderPaymentStatus ?? null,
  pricingSummary: order.pricingSummary ?? null,
  lineItems: (order.lineItems ?? []).map((line) => ({
    lineItemId: line.lineItemId ?? null,
    legacyItemId: line.legacyItemId ?? null,
    sku: line.sku ?? null,
    title: line.title ?? null,
    quantity: Number(line.quantity ?? 0),
    lineItemCost: line.lineItemCost ?? null,
  })),
  raw: order,
});

export const createEbayReadService = ({ ebayFetch, getUserAccessToken }) => ({
  async getImportPreview(userId, query = {}) {
    const accessToken = await getUserAccessToken(userId);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const limit = boundedInteger(query.limit, 50, 100) || 50;
    const inventoryOffset = boundedInteger(query.inventoryOffset, 0, 100_000);
    const offerOffset = boundedInteger(query.offerOffset, 0, 100_000);
    const orderOffset = boundedInteger(query.orderOffset, 0, 100_000);

    const [inventoryResult, offerResult, orderResult] = await Promise.all([
      ebayFetch(`/sell/inventory/v1/inventory_item?limit=${limit}&offset=${inventoryOffset}`, { headers }),
      ebayFetch(`/sell/inventory/v1/offer?limit=${limit}&offset=${offerOffset}`, { headers }),
      ebayFetch(`/sell/fulfillment/v1/order?limit=${limit}&offset=${orderOffset}`, { headers }),
    ]);

    return {
      observeOnly: true,
      fetchedAt: new Date().toISOString(),
      pagination: {
        limit,
        inventoryOffset,
        offerOffset,
        orderOffset,
        inventoryTotal: Number(inventoryResult?.total ?? 0),
        offerTotal: Number(offerResult?.total ?? 0),
        orderTotal: Number(orderResult?.total ?? 0),
      },
      inventoryItems: (inventoryResult?.inventoryItems ?? []).map(summarizeInventoryItem),
      offers: (offerResult?.offers ?? []).map(summarizeOffer),
      orders: (orderResult?.orders ?? []).map(summarizeOrder),
    };
  },
});
