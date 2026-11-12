# PF-SCOPE-022 — Web cloud photo persistence

Status: IN_PROGRESS (built 2026-11-11; owner live pass pending — see Verification)
Owner approval: 2026-11-11 ("Build PF-SCOPE-022 now, then continue 004"), after the gap was found live during the PF-SCOPE-004 run.

## Problem

Uploading a photo to a cloud item in the web app silently did nothing:
the file picker opened, a file could be chosen, and the sheet snapped
back to "No photos attached" with no error. Root cause, verified by
code read: `supabase-inventory-repository.saveItem` never persisted
photos — no storage upload, no `item_photos` write — and then hydrated
state from the database, discarding the picked image. Local mode masked
the gap (localStorage keeps data URLs inline in the item record), and
earlier passes were local; the read side (hydrate/listPhotos) existed
because mobile writes photos, but the web write side was never built.

## Change

- `apps/web/src/supabase-inventory-repository.js`: `saveItem` now calls
  the new exported `syncItemPhotos` after the item/listings upserts
  and before hydrate. It mirrors mobile's `planPhotoSync`
  (`apps/mobile/lib/cloud-sync-policy.ts`): entries that are not
  http(s) URLs are new uploads; everything is keyed by position.
  - New photos (data: URLs from the uploader) upload to the
    `item-photos` bucket at mobile's path convention
    `{userId}/{serverItemId}/{clientId}-{position}.{ext}` with
    `upsert: true`, and an `item_photos` row is upserted on
    `(item_id, position)`.
  - Stored photos come back from hydrate as signed URLs; their storage
    path is parsed from the URL and their row is kept.
  - Reconciliation is by exact (position, path) pairs: rows that no
    final pair matches are deleted, and storage objects no final pair
    points at are removed — so removals from the middle of the array
    land correctly (one deliberate improvement over mobile's
    position-only pruning; the pair rule is a superset of it for the
    append/remove-tail cases both apps exercise most).
- `apps/web/scripts/supabase-photo-sync.test.mjs` (new, wired into the
  web check script): five fake-client cases — first upload, stored
  photo untouched, middle removal with position healing, remove-all,
  and append-after-stored.

## Out of scope

- Mobile's own sync (untouched; it already persists photos).
- The local repository (photos already persist inline there).
- Photo editing, reordering UI, and any storage-policy changes (the
  bucket policies mobile relies on already cover the same signed-in
  user from the web client).

## Verification

- New unit suite: 5/5 pass.
- Root `npm run check` exit 0 (run at build time; see PR).
- Owner live pass (pending at build): on the live site, upload a photo
  to the PF-SCOPE-004 proof item — it must still be attached after the
  sheet reloads, and the item must then publish to the sandbox.
