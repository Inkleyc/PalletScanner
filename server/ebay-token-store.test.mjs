import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createEbayTokenStore,
  createRoutedEbayTokenStore,
  createSupabaseEbayTokenStore,
} from "./ebay-token-store.mjs";

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

// PF-SCOPE-024: the durable store talks to PostgREST with the publishable
// key as apikey and the caller's own session JWT as Authorization. The
// stub below emulates the table's owner-only RLS: a row is visible or
// writable only when the presented JWT belongs to its owner, so a store
// that sent any shared credential instead of the caller's JWT would fail
// these tests.
const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const JWT_BY_OWNER = new Map([
  [OWNER_A, "Bearer session-jwt-a"],
  [OWNER_B, "Bearer session-jwt-b"],
]);
const OWNER_BY_JWT = new Map(
  [...JWT_BY_OWNER.entries()].map(([owner, jwt]) => [jwt, owner]),
);

const createStubPostgrest = () => {
  const rows = new Map();
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const caller = OWNER_BY_JWT.get(options.headers?.Authorization);
    const parsed = new URL(String(url));
    const ownerFilter = parsed.searchParams.get("owner_id");
    const ownerId = ownerFilter?.startsWith("eq.")
      ? ownerFilter.slice(3)
      : null;
    const method = options.method ?? "GET";
    if (method === "GET") {
      const envelope =
        caller && caller === ownerId ? rows.get(ownerId) : undefined;
      return {
        ok: true,
        status: 200,
        json: async () => (envelope ? [{ envelope }] : []),
      };
    }
    if (method === "POST") {
      const body = JSON.parse(options.body);
      if (caller !== body.owner_id) {
        return { ok: false, status: 403, json: async () => ({}) };
      }
      rows.set(body.owner_id, body.envelope);
      return { ok: true, status: 201, json: async () => null };
    }
    if (method === "DELETE") {
      if (caller && caller === ownerId) rows.delete(ownerId);
      return { ok: true, status: 204, json: async () => null };
    }
    throw new Error(`Unexpected method ${method}`);
  };
  return { rows, calls, fetchImpl };
};

const createDatabaseStore = (stub) =>
  createSupabaseEbayTokenStore({
    supabaseUrl: "https://project.example.supabase.co",
    anonKey: "publishable-key",
    fetchImpl: stub.fetchImpl,
  });

test("database store round-trips the encrypted envelope through PostgREST", async () => {
  const stub = createStubPostgrest();
  const store = createDatabaseStore(stub);
  await store.save(
    OWNER_A,
    { refresh_token: "secret-refresh-token" },
    JWT_BY_OWNER.get(OWNER_A),
  );

  const storedEnvelope = stub.rows.get(OWNER_A);
  assert.equal(storedEnvelope.encrypted, true);
  assert.equal(JSON.stringify(storedEnvelope).includes("secret-refresh-token"), false);

  const saveCall = stub.calls.find((call) => call.options.method === "POST");
  assert.equal(saveCall.options.headers.apikey, "publishable-key");
  assert.equal(saveCall.options.headers.Authorization, JWT_BY_OWNER.get(OWNER_A));

  const loaded = await store.load(OWNER_A, JWT_BY_OWNER.get(OWNER_A));
  assert.equal(loaded.refresh_token, "secret-refresh-token");
  const loadCall = stub.calls.find((call) => (call.options.method ?? "GET") === "GET");
  assert.equal(loadCall.options.headers.apikey, "publishable-key");
  assert.equal(loadCall.options.headers.Authorization, JWT_BY_OWNER.get(OWNER_A));
});

test("database store returns null when the owner has no stored connection", async () => {
  const store = createDatabaseStore(createStubPostgrest());
  assert.equal(await store.load(OWNER_A, JWT_BY_OWNER.get(OWNER_A)), null);
});

test("database store remove deletes the owner's row", async () => {
  const stub = createStubPostgrest();
  const store = createDatabaseStore(stub);
  await store.save(OWNER_A, { refresh_token: "secret-refresh-token" }, JWT_BY_OWNER.get(OWNER_A));
  await store.remove(OWNER_A, JWT_BY_OWNER.get(OWNER_A));
  assert.equal(await store.load(OWNER_A, JWT_BY_OWNER.get(OWNER_A)), null);
});

test("one owner cannot read or remove another owner's connection", async () => {
  const stub = createStubPostgrest();
  const store = createDatabaseStore(stub);
  await store.save(OWNER_A, { refresh_token: "secret-refresh-token" }, JWT_BY_OWNER.get(OWNER_A));

  // Owner B's JWT is what reaches PostgREST, so RLS hides owner A's row.
  assert.equal(await store.load(OWNER_A, JWT_BY_OWNER.get(OWNER_B)), null);
  await store.remove(OWNER_A, JWT_BY_OWNER.get(OWNER_B));
  assert.equal(
    (await store.load(OWNER_A, JWT_BY_OWNER.get(OWNER_A))).refresh_token,
    "secret-refresh-token",
  );
});

test("database store surfaces PostgREST failures instead of appearing disconnected", async () => {
  const failingFetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({}),
  });
  const store = createSupabaseEbayTokenStore({
    supabaseUrl: "https://project.example.supabase.co",
    anonKey: "publishable-key",
    fetchImpl: failingFetch,
  });
  await assert.rejects(store.load(OWNER_A, JWT_BY_OWNER.get(OWNER_A)), /could not be read/);
  await assert.rejects(
    store.save(OWNER_A, { refresh_token: "x" }, JWT_BY_OWNER.get(OWNER_A)),
    /could not be saved/,
  );
  await assert.rejects(store.remove(OWNER_A, JWT_BY_OWNER.get(OWNER_A)), /could not be removed/);
});

test("database store refuses to run without a user session", async () => {
  const store = createDatabaseStore(createStubPostgrest());
  await assert.rejects(store.load(OWNER_A, undefined), /signed-in Supabase session/);
  await assert.rejects(store.load(OWNER_A, "shared-api-key"), /signed-in Supabase session/);
});

test("routed store keeps file behaviour without a JWT and uses the database store with one", async () => {
  await withStore(async (fileStore) => {
    const stub = createStubPostgrest();
    const routed = createRoutedEbayTokenStore({
      fileStore,
      getSupabaseStore: () => createDatabaseStore(stub),
    });

    // No JWT (local / shared-key mode): the file store answers.
    await routed.save(OWNER_A, { refresh_token: "file-token" });
    assert.equal(stub.rows.size, 0);
    assert.equal((await routed.load(OWNER_A)).refresh_token, "file-token");

    // A user JWT: the durable store answers, the file store is untouched.
    await routed.save(OWNER_A, { refresh_token: "database-token" }, JWT_BY_OWNER.get(OWNER_A));
    assert.equal(stub.rows.size, 1);
    assert.equal(
      (await routed.load(OWNER_A, JWT_BY_OWNER.get(OWNER_A))).refresh_token,
      "database-token",
    );
    assert.equal((await routed.load(OWNER_A)).refresh_token, "file-token");
  });
});

test("routed store falls back to the file store when Supabase is not configured", async () => {
  await withStore(async (fileStore) => {
    const routed = createRoutedEbayTokenStore({
      fileStore,
      getSupabaseStore: () => null,
    });
    await routed.save(OWNER_A, { refresh_token: "file-token" }, JWT_BY_OWNER.get(OWNER_A));
    assert.equal(
      (await routed.load(OWNER_A, JWT_BY_OWNER.get(OWNER_A))).refresh_token,
      "file-token",
    );
  });
});
