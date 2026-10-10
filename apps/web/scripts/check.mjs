import { readFile } from "node:fs/promises";
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const { items, pallets, repository } = await import("../src/inventory-repository.js");
const { createSupabaseInventoryRepository } = await import("../src/supabase-inventory-repository.js");
const { buildAnalytics } = await import("../src/analytics-model.js");
const { reconcileEbayPreview } = await import("../src/ebay-reconciliation.js");
const { buildEbayObservationRows } = await import("../src/marketplace-observation-model.js");
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
  "src/ebay-reconciliation.js",
  "src/marketplace-observation-repository.js",
  "src/marketplace-observation-model.js",
  "src/activity-panel.jsx",
  "src/pallet-manager.jsx",
  "src/dashboard-components.jsx",
  "src/web-services.js",
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
  "Revenue less cost",
  "All pallets",
  "Review queues",
  "Select an item to view its complete record and photos",
  "ItemThumbnail",
  "inventory-detail-modal",
  "onClick={() => setInventoryModalId(item.id)}",
  "Needs decision",
  "Inventory risks",
  "Publishing issues",
  "isReviewEligible",
  "Mark Facebook listed",
  "Select all visible items",
  "Search inventory (press /)",
  "Create your first pallet",
  "Local preview data",
  "settings-mount",
  "Aging",
  "Listing defaults",
  "Create inventory location",
  "Open eBay setup",
  "Supabase login",
  "Email sign-in link",
  "automatically use shared cloud inventory",
  "Test cloud connection",
  "Export inventory",
  "Active",
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
  "InventoryHistory",
  "History",
  "Quantity adjustment reason",
  "Archived inventory",
  "Restore item",
  "Enable location tracking",
  "Storage location",
  "sellerSku",
  "Place inventory hold",
  "Release hold",
  "Observe-only reconciliation",
  "Preview eBay data",
  "Load next 50",
  "Reconciliation records",
  "All observed",
  "Save audit snapshot",
  "View saved snapshots",
  "Recent reconciliation snapshots",
  "Review decisions",
  "Queue unverified item",
  "Record match",
  "Create zero-stock item",
  "Verify physical inventory",
  "Import observed orders",
  "does not reserve or change inventory",
  "Import observed returns",
  "does not restock or change inventory",
  "Record eBay return label",
  "Return shipment recorded",
  "Observed eBay orders",
  "Lines needing match",
  "This records identity only; it does not reserve or reduce stock",
  "Imported orders never change inventory automatically",
  "Reserve inventory",
  "Verification required",
  "Cancellation confirmed by eBay",
  "Release reserved inventory",
  "Start fulfillment",
  "Package measurements:",
  "Confirm during packing before purchasing a label",
  "Confirm items picked",
  "Enter final package measurements",
  "Confirm final measurements",
  "Purchase label in eBay",
  "Insurance recommendations are not enabled",
  "Record purchased label",
  "Save label details",
  "Confirm carrier handoff",
  "reserved inventory has been consumed",
  "Tracking timeline",
  "Record delivery",
  "Report shipment exception",
  "Record movement resumed",
  "Record tracking event",
  "Item weight (oz, optional)",
  "Package presets",
  "Add package preset",
  "Packing allowance (oz)",
  "Save package preset",
  "Open manual return",
  "Returned inventory stays unavailable",
  "Condition received",
  "Choose disposition",
  "Due within 24 hours",
  "Record refund or return cost",
  "eBay quantity protection",
  "never changes eBay without explicit approval",
  "Allow reviewed outbound actions",
  "Turning off the pause does not enable automatic synchronization",
  "PalletFlip will queue durable work before contacting eBay",
  "Approve update",
  "Withdraw final-unit listing",
  "last available unit is gone",
  "Marketplace action exceptions",
  "Retry failed action",
  "Run due retry",
  "Recover stalled action",
  "Run queued action",
  "/ebay/import-preview",
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
if (!getDisplayIssue({ quantity: 1, shortage: 2 }).startsWith("Urgent inventory shortage")) {
  throw new Error("Inventory shortage did not become an urgent display issue.");
}
if (!getDisplayIssue({ quantity: 0, verificationState: "unverified_import" }).startsWith("Urgent: verify imported item")) {
  throw new Error("Unverified imported inventory did not enter the urgent review queue.");
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

const reconciliation = reconcileEbayPreview({
  inventoryItems: [{ sku: "PF-1", quantity: 2 }, { sku: "PF-2", quantity: 1 }, { sku: "PF-DUPLICATE", quantity: 1 }, { sku: "missing", quantity: 1 }, { sku: "", quantity: 1, productIdentifiers: { upc: ["0-12345-67890-5"] } }],
  offers: [{ sku: "pf-1", offerId: "offer-1", availableQuantity: 2 }, { sku: "", offerId: "offer-known" }, { sku: "PF-1", offerId: "offer-known" }],
  orders: [{ orderId: "order-1", lineItems: [{ sku: "PF-1" }, { sku: "", legacyItemId: "listing-known" }, { sku: "" }] }],
}, [
  { id: 1, serverId: "inventory-server-1", sellerSku: "pf-1", available: 2 },
  { id: 2, sellerSku: "PF-2", available: 3 },
  { id: 3, sellerSku: "PF-DUPLICATE", available: 1 },
  { id: 4, sellerSku: "pf-duplicate", available: 1 },
  { id: 5, ebayOfferId: "offer-known", ebayListingId: "listing-known", available: 1 },
  { id: 6, barcode: "012345678905", available: 1 },
]);
if (reconciliation.summary.matched !== 6 || reconciliation.summary.conflicting !== 2 || reconciliation.summary.uncertain !== 1 || reconciliation.summary.unmatched !== 2) {
  throw new Error("eBay reconciliation did not classify strong SKU matches and quantity conflicts correctly.");
}
if (reconciliation.offers[1].matchReason !== "external_id" || reconciliation.orderLines[1].matchReason !== "external_id") {
  throw new Error("eBay reconciliation did not fall back to known offer and listing identifiers.");
}
if (reconciliation.offers[2].matchReason !== "identifier_conflict") {
  throw new Error("eBay reconciliation did not quarantine disagreeing strong identifiers.");
}
if (reconciliation.inventory[4].matchReason !== "product_identifier") {
  throw new Error("eBay reconciliation did not match a normalized exact product identifier.");
}
const observationRows = buildEbayObservationRows({
  businessId: "business-1",
  ownerId: "owner-1",
  accountId: "account-1",
  runId: "run-1",
  observedAt: "2026-10-10T12:00:00.000Z",
  preview: { orders: [{ orderId: "order-1", raw: { preserved: true } }] },
  reconciliation,
});
if (observationRows.length !== 12 || !observationRows.some((row) => row.resource_type === "order" && row.observed_payload.preserved === true)) {
  throw new Error("Marketplace observation snapshot did not preserve normalized records and raw order evidence.");
}
if (!observationRows.some((row) => row.inventory_item_id && row.reconciliation_state === "matched")) {
  throw new Error("Marketplace observation snapshot did not retain matched cloud inventory links.");
}
if (!observationRows.some((row) => row.resource_type === "offer" && row.external_id === "offer-1" && row.observed_quantity === 2 && row.observed_payload.offerId === "offer-1")) {
  throw new Error("Marketplace observation snapshot did not preserve normalized offer identity and quantity.");
}

const snapshot = repository.getSnapshot();
if (snapshot.items.length !== items.length || snapshot.pallets.length !== pallets.length) {
  throw new Error("Local repository snapshot does not match its seeded collections.");
}
if (!snapshot.items.every((item) => Number.isFinite(item.low_price))) {
  throw new Error("Local repository did not normalize item prices to the shared model.");
}
if (!snapshot.items.every((item) => item.sellerSku?.startsWith("PF-"))) {
  throw new Error("Local repository did not assign stable inventory SKUs.");
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
}, { quantityReason: "Count correction" });
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
if (!(await repository.listMovements(originalItem.id)).some((movement) => movement.type === "correction" && movement.reason === "Count correction")) {
  throw new Error("Local repository did not record a quantity correction movement.");
}
await repository.saveItem(originalItem);
unsubscribe();

const holdItem = repository.getSnapshot().items.find((item) => item.soldPrice === null && getQuantity(item) >= 2);
const startingAvailable = getQuantity(holdItem);
const hold = await repository.reserveItem(holdItem.id, 2, "Awaiting local pickup");
if (hold.reservedQuantity !== 2 || repository.getSnapshot().items.find((item) => item.id === holdItem.id)?.available !== startingAvailable - 2) {
  throw new Error("Local repository did not reserve available inventory.");
}
await repository.releaseReservation(hold.id);
if (repository.getSnapshot().items.find((item) => item.id === holdItem.id)?.available !== startingAvailable) {
  throw new Error("Local repository did not restore availability after releasing a hold.");
}

const removableItem = { ...originalItem, id: 999999, name: "Repository removal test" };
await repository.saveItem(removableItem);
await repository.removeItem(removableItem.id);
const archivedItem = repository.getSnapshot().items.find((item) => item.id === removableItem.id);
if (!archivedItem?.archivedAt) {
  throw new Error("Local repository did not archive an inventory item.");
}
await repository.saveItem({ ...archivedItem, archivedAt: null });
if (repository.getSnapshot().items.find((item) => item.id === removableItem.id)?.archivedAt) {
  throw new Error("Local repository did not restore an archived inventory item.");
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
