import { readFile } from "node:fs/promises";
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const { items, pallets, repository } = await import("../src/inventory-repository.js");
const { createSupabaseInventoryRepository } = await import("../src/supabase-inventory-repository.js");
const { buildAnalytics } = await import("../src/analytics-model.js");
if (typeof createSupabaseInventoryRepository !== "function") {
  throw new Error("Supabase inventory repository factory is unavailable.");
}
import {
  getDisplayIssue,
  getDisplayPlatform,
  getMarketplaceQueueItems,
  getItemAgeDays,
  getStaleInventoryItems,
  getQuantity,
  summarizeInventory,
  summarizePallet,
} from "../src/dashboard-model.js";

const requiredFiles = [
  "index.html",
  "src/main.jsx",
  "src/App.jsx",
  "src/dashboard-model.js",
  "src/mock-data.js",
  "src/inventory-repository.js",
  "src/supabase.js",
  "src/supabase-inventory-repository.js",
  "src/repository-router.js",
  "src/analytics-model.js",
  "src/styles.css",
  "scripts/serve.mjs",
];

await Promise.all(
  requiredFiles.map(async (file) => {
    const content = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    if (!content.trim()) {
      throw new Error(`${file} is empty`);
    }
  }),
);

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

for (const marker of ['id="app"', "/src/main.jsx"]) {
  if (!html.includes(marker)) {
    throw new Error(`index.html is missing ${marker}`);
  }
}

for (const marker of [
  "Business Dashboard",
  "Attention Queue",
  "Attention queue is clear",
  "Listing pipeline",
  "Needs preparation",
  "Ready to publish",
  "Published",
  "Mark Facebook listed",
  "Select all visible items",
  "Search inventory (press /)",
  "Create your first pallet",
  "Local preview",
  "settings-mount",
  "Unsold items older than 14 days",
  "items shown",
  "Admin Settings",
  "Supabase login",
  "Email sign-in link",
  "automatically use shared cloud inventory",
  "Test cloud connection",
  "Export inventory",
  "Needs Facebook",
  "Needs eBay",
  "inventory-context",
  "Filtered Pallet",
  "inventory-detail",
  "Age Days",
  "Connect eBay",
  "readinessChecks",
  "Disconnect",
  "Backend configuration",
  "Download JSON backup",
  "Restore local backup",
  "Data / Analysis",
  "Category performance",
  "Condition performance",
  "Marketplace performance",
  "Record sale",
  "Report filters",
  "Category / item type",
  "Export CSV report",
  "Print / Save PDF",
]) {
  if (!app.includes(marker)) {
    throw new Error(`app.js is missing ${marker}`);
  }
}

const totals = summarizeInventory(items, pallets);
if (totals.totalItems !== items.length) {
  throw new Error("Inventory total item count is wrong.");
}
if (totals.remainingHigh <= totals.remainingLow) {
  throw new Error("Inventory remaining high estimate should exceed low estimate.");
}
if (totals.needsFacebook <= 0 || totals.needsEbay <= 0) {
  throw new Error("Expected marketplace work counts in dashboard totals.");
}

const palletSummaries = pallets.map((pallet) => summarizePallet(items, pallet));
if (!palletSummaries.some((pallet) => pallet.unresolved > 0)) {
  throw new Error("Expected at least one pallet with unresolved issues.");
}
if (getQuantity(items.find((item) => item.quantity === 3)) !== 3) {
  throw new Error("Quantity helper did not preserve item quantity.");
}
if (getDisplayPlatform(items[0]) !== "Facebook") {
  throw new Error("Display platform helper returned an unexpected value.");
}
if (!getDisplayIssue(items.find((item) => item.name === "Unknown Barcode Item"))) {
  throw new Error("Display issue helper should identify mock cleanup work.");
}
if (getMarketplaceQueueItems(items).length === 0) {
  throw new Error("Expected marketplace queue items.");
}
if (getItemAgeDays(items[1], new Date("2026-07-15T12:00:00Z")) < 14) {
  throw new Error("Expected mock item to be old enough for aging checks.");
}
if (getStaleInventoryItems(items, new Date("2026-07-15T12:00:00Z")).length === 0) {
  throw new Error("Expected stale inventory queue items.");
}

const snapshot = repository.getSnapshot();
if (snapshot.items.length !== items.length || snapshot.pallets.length !== pallets.length) {
  throw new Error("Local repository snapshot does not match its seeded collections.");
}
if (!snapshot.items.every((item) => Number.isFinite(item.low_price))) {
  throw new Error("Local repository did not normalize item prices to the shared model.");
}
if (!snapshot.pallets.every((pallet) => "palletCost" in pallet)) {
  throw new Error("Local repository did not normalize pallet costs to the shared model.");
}

const startingPalletCount = pallets.length;
const testPallet = await repository.createPallet("Repository contract test");
await repository.updatePallet(testPallet.id, { palletCost: 125 });
if (repository.getSnapshot().pallets.find((pallet) => pallet.id === testPallet.id)?.palletCost !== 125) {
  throw new Error("Local repository did not update a pallet.");
}
await repository.removePallet(testPallet.id);
if (pallets.length !== startingPalletCount) {
  throw new Error("Local repository did not remove its contract-test pallet.");
}

const originalItem = structuredClone(items[0]);
let repositoryNotificationCount = 0;
const unsubscribe = repository.subscribe(() => {
  repositoryNotificationCount += 1;
});
await repository.saveItem({
  ...originalItem,
  name: "Repository edit test",
  quantity: 2,
  low: 60,
  low_price: 60,
});
const editedItem = repository.getSnapshot().items.find((item) => item.id === originalItem.id);
if (editedItem?.name !== "Repository edit test" || editedItem.quantity !== 2 || editedItem.low_price !== 60) {
  throw new Error("Local repository did not persist an inventory edit.");
}
if (repositoryNotificationCount !== 1) {
  throw new Error("Local repository did not notify subscribers after an inventory edit.");
}
if (!(await repository.listActivity(String(originalItem.id))).some((event) => event.type === "item.updated")) {
  throw new Error("Local repository did not record inventory activity.");
}
await repository.saveItem(originalItem);
unsubscribe();

const removableItem = { ...originalItem, id: 999999, name: "Repository removal test" };
await repository.saveItem(removableItem);
await repository.removeItem(removableItem.id);
if (repository.getSnapshot().items.some((item) => item.id === removableItem.id)) {
  throw new Error("Local repository did not remove an inventory item.");
}

const roundTripSnapshot = repository.getSnapshot();
await repository.saveItem({ ...originalItem, name: "Temporary restore test" });
await repository.replaceSnapshot(roundTripSnapshot);
if (repository.getSnapshot().items.find((item) => item.id === originalItem.id)?.name !== originalItem.name) {
  throw new Error("Local repository did not restore a backup snapshot.");
}
let invalidBackupRejected = false;
try {
  await repository.replaceSnapshot({ items: [{ id: 5, name: "Orphan", palletId: "missing" }], pallets: [] });
} catch {
  invalidBackupRejected = true;
}
if (!invalidBackupRejected) {
  throw new Error("Local repository accepted an invalid backup snapshot.");
}

const analysis = buildAnalytics(
  [{ id: 1, category: "Tools", condition: "New", palletId: "p1", capturedAt: "2026-09-01T12:00:00Z" }, { id: 2, category: "Tools", condition: "Used", palletId: "p1", capturedAt: "2026-09-02T12:00:00Z" }],
  [{ id: "p1", name: "Test pallet", palletCost: 50 }],
  [{ id: "s1", itemId: 1, marketplace: "ebay", soldPrice: 100, fees: 10, shippingCost: 5, soldAt: Date.parse("2026-09-05T12:00:00Z") }],
);
if (analysis.summary.netProceeds !== 85 || analysis.byCategory[0].sellThrough !== 50 || analysis.byPlatform[0].label !== "eBay" || analysis.byPallet[0].profit !== 35) {
  throw new Error("Analysis model returned incorrect sale performance results.");
}

console.log("Web dashboard scaffold check passed.");
