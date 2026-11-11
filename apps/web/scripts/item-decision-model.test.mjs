import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBulkDecision,
  describeDataSource,
  toDecisionCandidate,
  validateItemDecision,
  validateItemPrices,
} from "../src/item-decision-model.js";

const valid = {
  name: "Drill",
  condition: "Used",
  quantity: 2,
  low: 10,
  high: 20,
  floor: 8,
  listingPrice: 20,
};

test("accepts a decision that satisfies every rule", () => {
  assert.deepEqual(validateItemDecision(valid), []);
});

test("refuses an approved price below the floor with the existing wording", () => {
  assert.deepEqual(validateItemDecision({ ...valid, listingPrice: 5 }), [
    "Approved listing price cannot be lower than the floor price.",
  ]);
});

test("accepts an approved price exactly at the floor", () => {
  assert.deepEqual(validateItemDecision({ ...valid, listingPrice: 8 }), []);
});

test("refuses a high price below the low price", () => {
  assert.deepEqual(validateItemDecision({ ...valid, high: 5 }), [
    "High price cannot be lower than low price.",
  ]);
});

test("refuses non-finite or negative prices without adding further price errors", () => {
  assert.deepEqual(validateItemDecision({ ...valid, low: Number.NaN }), [
    "Prices must be valid non-negative numbers.",
  ]);
  assert.deepEqual(validateItemDecision({ ...valid, floor: -1 }), [
    "Prices must be valid non-negative numbers.",
  ]);
});

test("refuses a missing name or condition", () => {
  assert.deepEqual(validateItemDecision({ ...valid, name: "  " }), [
    "Name and condition are required.",
  ]);
  assert.deepEqual(validateItemDecision({ ...valid, condition: "" }), [
    "Name and condition are required.",
  ]);
});

test("refuses a fractional or zero quantity", () => {
  assert.deepEqual(validateItemDecision({ ...valid, quantity: 0 }), [
    "Quantity must be a whole number of at least 1.",
  ]);
  assert.deepEqual(validateItemDecision({ ...valid, quantity: 1.5 }), [
    "Quantity must be a whole number of at least 1.",
  ]);
});

test("requires a reason only when the quantity changes", () => {
  assert.deepEqual(
    validateItemDecision({ ...valid, quantity: 3 }, { previousQuantity: 2 }),
    ["Choose a reason whenever you change quantity."],
  );
  assert.deepEqual(
    validateItemDecision({ ...valid, quantity: 3 }, { previousQuantity: 2, quantityReason: "Count correction" }),
    [],
  );
  assert.deepEqual(validateItemDecision(valid, { previousQuantity: 2 }), []);
});

test("price-only validation ignores name and condition", () => {
  assert.deepEqual(validateItemPrices({ ...valid, name: "", condition: "" }), []);
  assert.deepEqual(validateItemPrices({ ...valid, listingPrice: 1 }), [
    "Approved listing price cannot be lower than the floor price.",
  ]);
});

test("reads both plain and _price field styles", () => {
  const candidate = toDecisionCandidate({
    name: "Saw",
    condition: "New",
    quantity: 1,
    low_price: 10,
    high_price: 20,
    floor_price: 8,
    listing_price: 20,
  });
  assert.equal(candidate.low, 10);
  assert.equal(candidate.high, 20);
  assert.equal(candidate.floor, 8);
  assert.equal(candidate.listingPrice, 20);
  assert.deepEqual(validateItemDecision(candidate), []);
});

test("bulk decisions apply the valid items and skip violators with reasons", () => {
  const good = { ...valid, id: 1, name: "Good" };
  const bad = { ...valid, id: 2, name: "Bad", listingPrice: 1 };
  const { applied, skipped } = applyBulkDecision([good, bad], (item) => ({
    ...item,
    status: "ready",
  }));
  assert.equal(applied.length, 1);
  assert.equal(applied[0].id, 1);
  assert.equal(applied[0].status, "ready");
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].item.id, 2);
  assert.deepEqual(skipped[0].errors, [
    "Approved listing price cannot be lower than the floor price.",
  ]);
});

test("bulk decisions preserve input order and do not mutate the inputs", () => {
  const items = [
    { ...valid, id: 1 },
    { ...valid, id: 2 },
  ];
  const { applied } = applyBulkDecision(items, (item) => ({ ...item, status: "ready" }));
  assert.deepEqual(applied.map((item) => item.id), [1, 2]);
  assert.equal(items[0].status, undefined);
});

test("data-source labels never claim sharing outside cloud mode", () => {
  assert.equal(
    describeDataSource("cloud").note,
    "Cloud inventory — edits save to shared inventory and sync to mobile.",
  );
  assert.equal(
    describeDataSource("local").note,
    "Local preview data — edits stay in this browser only and are not shared or synced to mobile.",
  );
  assert.equal(describeDataSource("unknown").badge, "Local preview data");
  assert.equal(describeDataSource(undefined).badge, "Local preview data");
});
