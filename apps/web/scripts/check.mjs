import { readFile } from "node:fs/promises";
import { items, pallets } from "../src/mock-data.js";
import {
  getDisplayIssue,
  getDisplayPlatform,
  getMarketplaceQueueItems,
  getQuantity,
  summarizeInventory,
  summarizePallet,
} from "../src/dashboard-model.js";

const requiredFiles = [
  "index.html",
  "src/app.js",
  "src/dashboard-model.js",
  "src/mock-data.js",
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
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

for (const marker of ['id="app"', "./src/app.js", "./src/styles.css"]) {
  if (!html.includes(marker)) {
    throw new Error(`index.html is missing ${marker}`);
  }
}

for (const marker of [
  "Business Dashboard",
  "Attention Queue",
  "data-attention-item-id",
  "Marketplace review queue",
  "Desktop-first review table",
  "Admin Settings",
  "data-action=\"export-inventory\"",
  "Needs Facebook",
  "Needs eBay",
  "filter-facebook",
  "filter-ebay",
  "inventory-status-filter",
  "inventory-platform-filter",
  "inventory-pallet-filter",
  "data-pallet-card-id",
  "data-pallet-id",
  "inventory-context",
  "Filtered Pallet",
  "data-action=\"reset-inventory\"",
  "data-sort-column",
  "inventory-empty-row",
  "inventory-detail",
  "data-sortquantity",
  "data-action=\"connect-ebay\"",
  "Planned for account setup",
  "Not enabled in preview",
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

console.log("Web dashboard scaffold check passed.");
