import assert from "node:assert/strict";
import test from "node:test";

import {
  changedSinceBaseline,
  deletedSinceBaseline,
  planPhotoSync,
  restoreBaseline,
  serializeBaseline,
} from "../lib/cloud-sync-policy.ts";

const fingerprint = (record) => JSON.stringify(record);

test("new and edited local records are selected for upload", () => {
  const baseline = new Map([[1, fingerprint({ id: 1, name: "Original" })]]);
  const records = [
    { id: 1, name: "Edited offline" },
    { id: 2, name: "Created offline" },
  ];

  assert.deepEqual(
    changedSinceBaseline(records, baseline, (record) => record.id, fingerprint).map((record) => record.id),
    [1, 2],
  );
});

test("unchanged local records do not overwrite newer cloud values", () => {
  const local = { id: 1, name: "Known value" };
  const baseline = new Map([[1, fingerprint(local)]]);

  assert.deepEqual(changedSinceBaseline([local], baseline, (record) => record.id, fingerprint), []);
});

test("only deletions known to this device are propagated", () => {
  const baseline = new Map([[1, "known"]]);
  const remote = [{ client_id: 1 }, { client_id: 2 }];

  assert.deepEqual(
    deletedSinceBaseline(remote, baseline, new Set(), (record) => record.client_id),
    [{ client_id: 1 }],
  );
});

test("a persisted baseline survives restart for the same account", () => {
  const stored = serializeBaseline(
    "user-a",
    new Map([[42, "item fingerprint"]]),
    new Map([["pallet-a", "pallet fingerprint"]]),
  );
  const restored = restoreBaseline(stored, "user-a");

  assert.equal(restored.matchesUser, true);
  assert.equal(restored.items.get(42), "item fingerprint");
  assert.equal(restored.pallets.get("pallet-a"), "pallet fingerprint");
});

test("a baseline from another account is never reused", () => {
  const stored = serializeBaseline("user-a", new Map([[42, "item"]]), new Map([["pallet-a", "pallet"]]));
  const restored = restoreBaseline(stored, "user-b");

  assert.equal(restored.matchesUser, false);
  assert.equal(restored.items.size, 0);
  assert.equal(restored.pallets.size, 0);
});

test("photo sync uploads device files but not cached signed cloud URLs", () => {
  const plan = planPhotoSync([
    "https://example.supabase.co/storage/photo-1.jpg?token=signed",
    "file:///camera/photo-2.jpg",
    "content://camera/photo-3.png",
  ]);

  assert.deepEqual(plan.uploads, [
    { uri: "file:///camera/photo-2.jpg", position: 1 },
    { uri: "content://camera/photo-3.png", position: 2 },
  ]);
});

test("photo cleanup begins immediately after the last retained position", () => {
  assert.equal(planPhotoSync(["file:///photo-1.jpg", "file:///photo-2.jpg"]).removePositionsFrom, 2);
  assert.equal(planPhotoSync([]).removePositionsFrom, 0);
});
