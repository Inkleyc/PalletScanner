import test from "node:test";
import assert from "node:assert/strict";
import { syncItemPhotos } from "../src/supabase-inventory-repository.js";

// PF-SCOPE-022: the web cloud repository must persist item photos the
// way mobile's sync does — uploads to the item-photos bucket under
// {userId}/{serverItemId}/{clientId}-{position}.{ext}, one item_photos
// row per position, and removal of whatever the item no longer carries.

const signedUrl = (path) => `https://project.example.co/storage/v1/object/sign/item-photos/${path}?token=abc`;
const dataUri = `data:image/jpeg;base64,${Buffer.from("fake-jpeg").toString("base64")}`;

const makeClient = (existingRows) => {
  const calls = { uploads: [], upserts: [], deletes: [], removes: [] };
  const client = {
    from: (table) => {
      assert.equal(table, "item_photos");
      return {
        select: () => ({ eq: async () => ({ data: existingRows, error: null }) }),
        delete: () => ({ in: async (_column, ids) => { calls.deletes.push(ids); return { error: null }; } }),
        upsert: async (row, options) => { calls.upserts.push({ row, options }); return { error: null }; },
      };
    },
    storage: {
      from: (bucket) => {
        assert.equal(bucket, "item-photos");
        return {
          upload: async (path, blob, options) => { calls.uploads.push({ path, type: blob.type, options }); return { error: null }; },
          remove: async (paths) => { calls.removes.push(paths); return { error: null }; },
        };
      },
    },
  };
  return { client, calls };
};

test("first photo uploads and records its row", async () => {
  const { client, calls } = makeClient([]);
  await syncItemPhotos(client, "user-1", "server-9", { id: 42, photos: [dataUri] });
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.uploads[0].path, "user-1/server-9/42-0.jpg");
  assert.equal(calls.uploads[0].type, "image/jpeg");
  assert.equal(calls.uploads[0].options.upsert, true);
  assert.deepEqual(calls.upserts.map(({ row }) => row), [
    { owner_id: "user-1", item_id: "server-9", storage_path: "user-1/server-9/42-0.jpg", position: 0 },
  ]);
  assert.deepEqual(calls.deletes, []);
  assert.deepEqual(calls.removes, []);
});

test("an already-stored photo (signed URL) is left untouched", async () => {
  const rows = [{ id: "r0", storage_path: "user-1/server-9/42-0.jpg", position: 0 }];
  const { client, calls } = makeClient(rows);
  await syncItemPhotos(client, "user-1", "server-9", { id: 42, photos: [signedUrl("user-1/server-9/42-0.jpg")] });
  assert.deepEqual(calls.uploads, []);
  assert.deepEqual(calls.upserts, []);
  assert.deepEqual(calls.deletes, []);
  assert.deepEqual(calls.removes, []);
});

test("removing a middle photo heals positions and prunes only the removed object", async () => {
  const rows = [
    { id: "r0", storage_path: "user-1/server-9/42-0.jpg", position: 0 },
    { id: "r1", storage_path: "user-1/server-9/42-1.jpg", position: 1 },
    { id: "r2", storage_path: "user-1/server-9/42-2.jpg", position: 2 },
  ];
  const { client, calls } = makeClient(rows);
  await syncItemPhotos(client, "user-1", "server-9", {
    id: 42,
    photos: [signedUrl("user-1/server-9/42-0.jpg"), signedUrl("user-1/server-9/42-2.jpg")],
  });
  assert.deepEqual(calls.uploads, []);
  // The shifted photo gets a row at its new position; the two rows that
  // no longer match a final (position, path) pair are deleted.
  assert.deepEqual(calls.upserts.map(({ row }) => row), [
    { owner_id: "user-1", item_id: "server-9", storage_path: "user-1/server-9/42-2.jpg", position: 1 },
  ]);
  assert.deepEqual(calls.deletes, [["r1", "r2"]]);
  // Only the removed photo's object is deleted; the shifted photo's
  // object is still pointed at by the healed row.
  assert.deepEqual(calls.removes, [["user-1/server-9/42-1.jpg"]]);
});

test("removing every photo deletes all rows and objects", async () => {
  const rows = [{ id: "r0", storage_path: "user-1/server-9/42-0.jpg", position: 0 }];
  const { client, calls } = makeClient(rows);
  await syncItemPhotos(client, "user-1", "server-9", { id: 42, photos: [] });
  assert.deepEqual(calls.uploads, []);
  assert.deepEqual(calls.upserts, []);
  assert.deepEqual(calls.deletes, [["r0"]]);
  assert.deepEqual(calls.removes, [["user-1/server-9/42-0.jpg"]]);
});

test("a data-URL photo after a stored one uploads at its own position", async () => {
  const rows = [{ id: "r0", storage_path: "user-1/server-9/42-0.jpg", position: 0 }];
  const { client, calls } = makeClient(rows);
  await syncItemPhotos(client, "user-1", "server-9", {
    id: 42,
    photos: [signedUrl("user-1/server-9/42-0.jpg"), dataUri],
  });
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.uploads[0].path, "user-1/server-9/42-1.jpg");
  assert.deepEqual(calls.upserts.map(({ row }) => row.position), [1]);
  assert.deepEqual(calls.deletes, []);
});
