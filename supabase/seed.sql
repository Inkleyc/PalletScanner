-- PalletFlip local seed (PF-SCOPE-001) — intentionally data-free.
--
-- Business data in this schema is owner-scoped: every row references
-- auth.users, and a business row is created by trigger when a user signs up.
-- There is therefore no safe static seed row: seeding an owner, a pallet, or
-- an inventory item here would invent a user that no Auth API session owns.
-- The live-DB check (scripts/check-live-db.mjs) creates one disposable user
-- through the local Auth API, exercises the schema as that user, and cleans
-- up after itself. `supabase db reset` runs this file after migrations; it
-- must stay a no-op so a fresh local database starts empty, exactly like a
-- new owner's database. No real customer data, ever.
do $$
begin
  raise notice 'PalletFlip local seed: no static rows by design (see header comment).';
end
$$;
