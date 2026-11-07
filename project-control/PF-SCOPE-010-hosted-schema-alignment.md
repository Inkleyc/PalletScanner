# PF-SCOPE-010 — Hosted Supabase schema alignment
Status: VERIFIED (2026-11-07; closes on merge of PR #8, which carries this record)
Owner approval: Stage A APPROVED 2026-11-07 13:41 MST; Stage B go-ahead (second, separate) 2026-11-07 13:46 MST. This scope is a protected operation under PF-D-008 (hosted database writes).
Execution: Supabase dashboard SQL Editor against the hosted project (no repo branch — no repo changes were required; the repo migrations were applied as-is). Working artifacts (Stage A report, pre-apply backup, batch files) are in Lenard's audit workspace `scope010/`; the proposal is `scope-proposal-010-hosted-schema-alignment.md` in the same workspace.

## Objective

The hosted Supabase database had only migrations 1–2 of 67 applied (hand-applied in the Codex era, no tracking table): app reads returned 200/empty, writes failed HTTP 400 on missing columns, and mobile cloud sync failed silently. Align the hosted schema to the repo's 67-migration end state so both apps work against the real cloud, and put the project under proper migration tracking.

## Stages and results

- **Stage A (read-only diff):** hosted DB was a faithful copy of migrations 1–2 only — 6 tables, 1 function, 3 triggers, 7 policies, the private item-photos bucket; no `supabase_migrations` tracking; no hosted-only objects. Migrations 3–67 create new objects and ALTER the six existing tables only — no bridges anticipated.
- **Stage B (apply, checkpointed):** backup captured first (21 rows, all test data). Baseline recorded for migrations 1–2; the authority migration (202610100001) applied alone and verified (business created; Loose Items pallet; 6/6 pallets with business_id); the remaining 64 migrations applied in five batches with a tracking-count check after each. **Zero errors; no bridge migrations needed.** Final state: 67/67 versions tracked, 35 public tables, 73 functions, 46 public policies (the repo's 53 total minus 7 on storage.objects — exact), all app-critical `inventory_items` columns present, pallets intact.
- **Stage C (verify):** (1) web "Test cloud connection" — initially failed at item save with 409, which exposed the acquisition contract gap (items under NEW pallets fail FK 23503 because no client created the pallet's acquisition row); that gap was split out as PF-SCOPE-011 at the owner's direction (client fix, not a database bridge). With PR #8's branch checked out, the self-test passed end to end 2026-11-07 15:35 MST. (2) A phone-saved item appeared in the web cloud Inventory (owner-verified 2026-11-07 15:42 MST, under phone-created pallet "P06-11/2026", whose sync-created acquisition was confirmed by read-only DB check).

## Excluded (unchanged)

- No app code changes (the acquisition gap became PF-SCOPE-011), no data seeding/cleanup (test-era rows remain; the stocked self-test pallets from Stage C attempts are app-undeletable under the ledger rule and can be removed by SQL on owner request), no RLS changes beyond the migrations' own definitions, no schema redesign.
