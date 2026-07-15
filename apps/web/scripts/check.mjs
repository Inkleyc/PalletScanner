import { readFile } from "node:fs/promises";

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
  "Desktop-first review table",
  "Admin Settings",
  "data-action=\"export-inventory\"",
  "inventory-status-filter",
  "inventory-platform-filter",
  "data-sort-column",
  "inventory-empty-row",
  "data-action=\"connect-ebay\"",
]) {
  if (!app.includes(marker)) {
    throw new Error(`app.js is missing ${marker}`);
  }
}

console.log("Web dashboard scaffold check passed.");
