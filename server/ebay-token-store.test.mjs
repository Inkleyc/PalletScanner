import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createEbayTokenStore } from "./ebay-token-store.mjs";

process.env.EBAY_ENVIRONMENT = "production";
process.env.EBAY_TOKEN_ENCRYPTION_KEY = "test-encryption-key";

const withStore = async (run) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "palletflip-token-test-"));
  try {
    const store = createEbayTokenStore({
      dataDirectory: directory,
      legacyTokenFile: path.join(directory, "legacy.json"),
    });
    await run(store, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("encrypts and restores a per-user eBay connection", async () => {
  await withStore(async (store, directory) => {
    await store.save("seller-1", { refresh_token: "secret-refresh-token" });
    const files = await readdir(path.join(directory, "ebay-connections"));
    const raw = await readFile(path.join(directory, "ebay-connections", files[0]), "utf8");
    assert.equal(raw.includes("secret-refresh-token"), false);
    assert.equal((await store.load("seller-1")).refresh_token, "secret-refresh-token");
  });
});

test("returns null when a user has no stored connection", async () => {
  await withStore(async (store) => {
    assert.equal(await store.load("missing-seller"), null);
  });
});

test("surfaces corrupted connection storage instead of appearing disconnected", async () => {
  await withStore(async (store, directory) => {
    await store.save("seller-1", { refresh_token: "secret-refresh-token" });
    const files = await readdir(path.join(directory, "ebay-connections"));
    await writeFile(path.join(directory, "ebay-connections", files[0]), "not-json", "utf8");
    await assert.rejects(store.load("seller-1"), /could not be read/);
  });
});
