import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalProfitability } from "../src/profitability-model.js";

test("allocates landed cost and keeps refunds separate from original sales", () => {
  const report = buildOperationalProfitability({
    acquisitions: [{ id: "a1", name: "Pallet 1", purchase_price: 100, inbound_freight: 20, buyers_premium: 10, acquisition_tax: 0 }],
    items: [{ id: "i1", acquisition_id: "a1", available: 1, low_price: 40, high_price: 60 }],
    movements: [{ inventory_item_id: "i1", movement_type: "receipt", quantity: 2 }],
    sales: [{ item_id: "i1", quantity: 1, sold_price: 100, fees: 10, shipping_cost: 5 }],
    returns: [{ return_financial_events: [{ event_type: "partial_refund", amount: 20 }, { event_type: "fee_credit", amount: 3 }], return_lines: [{ quantity: 1, order_lines: { inventory_item_id: "i1" } }] }],
  });
  assert.equal(report.summary.grossRevenue, 100);
  assert.equal(report.summary.allocatedSoldCost, 65);
  assert.equal(report.summary.returnFinancialImpact, -17);
  assert.equal(report.summary.estimatedProfit, 3);
  assert.equal(report.summary.projectedAvailableValue, 50);
  assert.equal(report.summary.acquisitionAllocationCoveragePercent, 100);
  assert.equal(report.summary.returnRatePercent, 100);
  assert.equal(report.acquisitions[0].costRecoveryPercent, 52.31);
  assert.equal(report.items[0].estimatedProfit, 3);
});

test("keeps observed order subtotal outside estimated profit", () => {
  const report = buildOperationalProfitability({ orders: [{ payment_state: "PAID", pricing_summary: { priceSubtotal: { value: "250.00" } } }] });
  assert.equal(report.summary.observedOrderSubtotal, 250);
  assert.equal(report.summary.estimatedProfit, 0);
  assert.equal(report.summary.acquisitionAllocationCoveragePercent, 100);
});

test("reports sales whose acquisition cost cannot yet be allocated", () => {
  const report = buildOperationalProfitability({ items: [{ id: "i1", acquisition_id: "missing" }], sales: [{ item_id: "i1", quantity: 2, sold_price: 50 }] });
  assert.equal(report.summary.acquisitionAllocationCoveragePercent, 0);
  assert.equal(report.summary.unallocatedSaleCount, 1);
});

test("allocates a multi-item return impact by returned quantity", () => {
  const report = buildOperationalProfitability({
    items: [{ id: "i1", name: "One" }, { id: "i2", name: "Two" }],
    sales: [{ item_id: "i1", quantity: 1, sold_price: 30 }, { item_id: "i2", quantity: 2, sold_price: 60 }],
    returns: [{ return_financial_events: [{ event_type: "refund", amount: 30 }], return_lines: [{ quantity: 1, inventory_item_id: "i1" }, { quantity: 2, inventory_item_id: "i2" }] }],
  });
  assert.equal(report.summary.returnedUnits, 3);
  assert.equal(report.summary.returnRatePercent, 100);
  assert.equal(report.items.find((item) => item.id === "i1").returnImpact, -10);
  assert.equal(report.items.find((item) => item.id === "i2").returnImpact, -20);
});

test("includes confirmed packaging supplies and allocates them by package quantity", () => {
  const report = buildOperationalProfitability({
    acquisitions: [{ id: "a1", name: "Lot", purchase_price: 0 }],
    items: [{ id: "i1", acquisition_id: "a1", name: "One" }, { id: "i2", acquisition_id: "a1", name: "Two" }],
    sales: [{ item_id: "i1", quantity: 1, sold_price: 30 }, { item_id: "i2", quantity: 2, sold_price: 60 }],
    packages: [{ measurement_state: "confirmed", supply_cost: 9, shipment_package_lines: [{ quantity: 1, order_lines: { inventory_item_id: "i1" } }, { quantity: 2, order_lines: { inventory_item_id: "i2" } }] }],
  });
  assert.equal(report.summary.packagingSupplyCost, 9);
  assert.equal(report.summary.directSellingCosts, 9);
  assert.equal(report.summary.estimatedProfit, 81);
  assert.equal(report.items.find((item) => item.id === "i1").directCosts, 3);
  assert.equal(report.items.find((item) => item.id === "i2").directCosts, 6);
});

test("does not count a package preset estimate before packing is confirmed", () => {
  const report = buildOperationalProfitability({ packages: [{ measurement_state: "estimated", supply_cost: 4 }] });
  assert.equal(report.summary.packagingSupplyCost, 0);
  assert.equal(report.summary.estimatedProfit, 0);
});
