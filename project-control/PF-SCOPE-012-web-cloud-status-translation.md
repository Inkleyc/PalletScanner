# PF-SCOPE-012 — Web cloud saves translate workflow status to the database vocabulary
Status: IN_PROGRESS
Owner approval: APPROVED 2026-11-07 (owner directed the fix in the moment during the PF-SCOPE-003 browser pass: "Build the fix now")
Decision authority: PF-D-003 (high autonomy inside a bounded approved scope); PF-D-008 respected (no protected operations — no schema, RLS, credential, or hosted-data changes).

## Problem (found by the owner, PF-SCOPE-003 browser pass check 3, 2026-11-07)

In cloud mode, the web "Add item" flow fails with the generic message "Could not add the item." Root cause, verified against the code and the migration files:

- The web app assigns new/analysis/photo-updated items the local status `"needs_review"` (App.jsx add-item, AI-analysis, and photo-save flows).
- `inventory_items.workflow_status` has a database CHECK (migration 202609110001, never relaxed): `('captured', 'needs_photos', 'needs_research', 'ready', 'sold')`. `"needs_review"` is not in the set, so the cloud upsert is rejected (23514).
- The web cloud repository never translated its local status vocabulary to the database vocabulary. Mobile does (`getCloudWorkflowStatus` in cloud-inventory-sync.ts only ever emits allowed values), which is why phone saves work.
- The failure was invisible until PF-SCOPE-010/011 made signed-in cloud mode usable; the local repository accepts the local vocabulary, so local mode never showed it.
- Aggravating factor: the repository's `throwIfError` throws the raw PostgREST error object (not an `Error`), so every UI catch falls back to a generic message ("Could not add the item.") and the database's actual reason is lost. The same swallowing hid earlier failures (the settings self-test's generic failure during PF-SCOPE-010 Stage C).

## Included

- `apps/web/src/supabase-inventory-repository.js` only:
  - A `toCloudWorkflowStatus(status)` translation used by `saveItem`: values in the database vocabulary pass through untouched; anything else (including `"needs_review"` and missing values) maps to `"captured"` — the database default, meaning "new, awaiting processing." Review eligibility is unaffected (Review shows every non-ready, non-sold item), so a saved item still lands in Review exactly as the local vocabulary intended.
  - `throwIfError` now throws a real `Error` carrying the database message, so UI catches display the actual reason instead of a generic fallback. No call-site changes; all repository flows benefit (add, edit, pallet ops, self-test).
- CI: `scripts/check-live-db.mjs` gains a PF-SCOPE-012 contract section asserting the translation's outputs stay inside the database vocabulary and that an item upserted with the translated status succeeds against the live CI database.
- Register closeouts riding this branch: PF-SCOPE-010 and PF-SCOPE-011 flip VERIFIED → CLOSED (both merged 2026-11-07, PR #8 as fcc8e2d9).

## Explicitly excluded

- No App.jsx changes (avoids any interaction with PF-SCOPE-003's in-flight branch, which does not touch the repository file — verified by diff).
- No change to the local repository or the local status vocabulary; no schema/migration changes; mobile untouched.
- No change to how statuses are displayed (`getDisplayStatus` in dashboard-model.js already treats the vocabularies consistently for review eligibility).

## Acceptance checks

- [ ] CI green on the branch, including the new check-live-db contract section.
- [ ] Web build passes locally.
- [ ] Owner (after this merges and the PF-SCOPE-003 branch is updated from main): re-run browser-pass check 3 — add an item in cloud mode under an existing pallet; the valid save succeeds and the item appears; re-run check 6 (bulk) with the added items.

## Completion record

(Pending — filled in at verification.)
