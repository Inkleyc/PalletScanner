// Live-database check (PF-SCOPE-001).
//
// Proves the migrations in supabase/migrations/ actually execute against a
// real, disposable LOCAL Supabase stack (`supabase start`) and that the
// inventory/reservation and return-lifecycle RPCs behave against real data
// as a real signed-in user. It never touches a hosted project.
//
// Transport:
//   * Catalog assertions (migration versions, table/function/policy counts,
//     RLS) run through `psql` against SUPABASE_DB_URL (the local Postgres
//     URL from `supabase status`). `psql` is installed by CI; see
//     .github/workflows/check.yml.
//   * Behaviour runs over HTTP against SUPABASE_URL with a disposable user
//     created through the local Auth API. No new dependencies: global fetch.
//
// Skip behaviour: when SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_DB_URL
// are all unset, this prints SKIP and exits 0, so `npm run check` never
// depends on a local database. When any of them is set, all three are
// required and a failure is a failure — a half-configured run must not
// silently pass. Run it explicitly with `npm run check:live`.
//
// Env names: the SUPABASE_* names above are accepted, as are the names
// `supabase status --output env` actually exports — API_URL, ANON_KEY and
// DB_URL — as fallbacks. A set SUPABASE_* variable wins over its alias.
// The checks below run against the resolved values either way.
//
// Quoting: `supabase status --output env` wraps each exported value in
// surrounding double quotes (e.g. API_URL="http://127.0.0.1:54321").
// Surrounding matching quotes (double or single) are stripped from each
// resolved value after trimming, and a value that is empty after stripping
// counts as unset.
//
// Safety: SUPABASE_URL / SUPABASE_DB_URL must point at 127.0.0.1 or
// localhost. Anything else (including *.supabase.co) is rejected before
// any request is made. No token, password, or key is ever printed.

import { readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const cleanEnvValue = (value) => {
  let cleaned = (value ?? "").trim();
  if (cleaned.length >= 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      cleaned = cleaned.slice(1, -1).trim();
    }
  }
  return cleaned;
};

const SUPABASE_URL = cleanEnvValue(process.env.SUPABASE_URL) || cleanEnvValue(process.env.API_URL);
const SUPABASE_ANON_KEY = cleanEnvValue(process.env.SUPABASE_ANON_KEY) || cleanEnvValue(process.env.ANON_KEY);
const SUPABASE_DB_URL = cleanEnvValue(process.env.SUPABASE_DB_URL) || cleanEnvValue(process.env.DB_URL);

if (!SUPABASE_URL && !SUPABASE_ANON_KEY && !SUPABASE_DB_URL) {
  console.log(
    "Live-DB check SKIPPED: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_DB_URL are unset (no local Supabase running). Run `supabase start`, export the values from `supabase status -o env`, then `npm run check:live`.",
  );
  process.exit(0);
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_DB_URL) {
  throw new Error(
    "Live-DB check misconfigured: set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_DB_URL together (or their `supabase status -o env` names API_URL, ANON_KEY and DB_URL), or unset all of them to skip.",
  );
}

const apiUrl = new URL(SUPABASE_URL);
if (!["127.0.0.1", "localhost"].includes(apiUrl.hostname)) {
  throw new Error(`Refusing to run live-DB check against non-local SUPABASE_URL host: ${apiUrl.hostname}`);
}
if (apiUrl.protocol !== "http:") {
  throw new Error("Refusing to run live-DB check against a non-http SUPABASE_URL (local Supabase uses http).");
}
const dbUrl = new URL(SUPABASE_DB_URL);
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) {
  throw new Error(`Refusing to run live-DB check against non-local SUPABASE_DB_URL host: ${dbUrl.hostname}`);
}
if (dbUrl.username !== "postgres" || dbUrl.pathname !== "/postgres") {
  throw new Error("SUPABASE_DB_URL must be the local postgres URL (postgres@127.0.0.1:54322/postgres).");
}

const fail = (message) => {
  throw new Error(`Live-DB check FAILED: ${message}`);
};
const pass = (message) => console.log(`  ok - ${message}`);
const assert = (condition, message) => {
  if (!condition) fail(message);
  pass(message);
};
const assertEqual = (actual, expected, label) => {
  assert(
    actual === expected,
    `${label}: expected ${expected}, got ${actual}. If the schema intentionally changed, update the expected counts in scripts/check-live-db.mjs and the PF-SCOPE-001 scope document together, with evidence.`,
  );
};

// ---------------------------------------------------------------------------
// 1. Text recount of the migration files (the audit's counts, re-derived).
// ---------------------------------------------------------------------------

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
assert(migrationFiles.length > 0, "migration files found");
const migrationTexts = await Promise.all(
  migrationFiles.map((name) => readFile(new URL(name, migrationDir), "utf8")),
);
const migrationSql = migrationTexts.join("\n");
const textTables = new Set(
  [...migrationSql.matchAll(/create table (?:if not exists )?public\.([a-z_0-9]+)/gi)].map((m) => m[1]),
);
const textFunctions = new Set(
  [...migrationSql.matchAll(/function public\.([a-z_0-9]+)/gi)].map((m) => m[1]),
);
// Policy total is 53: 46 on public tables plus 7 on storage.objects (photo /
// return-evidence buckets). Two public policy headers span two lines, so
// the public recount must allow whitespace (including a newline) between
// the policy name and `on public.`.
const textPolicyCount = [...migrationSql.matchAll(/create policy\s+"[^"]+"/gi)].length;
const textPublicPolicyCount = [...migrationSql.matchAll(/create policy\s+"[^"]+"\s+on public\./gi)].length;
const textStoragePolicyCount = [...migrationSql.matchAll(/create policy\s+"[^"]+"\s+on storage\.objects/gi)].length;
const fileVersions = migrationFiles.map((name) => name.split("_")[0]);
console.log(
  `Migration text recount: ${migrationFiles.length} files, ${textTables.size} tables, ${textFunctions.size} functions, ${textPolicyCount} policies (${textPublicPolicyCount} public + ${textStoragePolicyCount} storage).`,
);

// ---------------------------------------------------------------------------
// 2. Catalog assertions via psql against the local database.
// ---------------------------------------------------------------------------

let psqlAvailable = true;
try {
  await execFileAsync("psql", ["--version"]);
} catch {
  psqlAvailable = false;
}
if (!psqlAvailable) {
  fail(
    "psql was not found, but SUPABASE_DB_URL is set. Install the PostgreSQL client (CI installs postgresql-client; locally: the postgresql-client package) and re-run `npm run check:live`.",
  );
}

const catalogSql = `
select json_build_object(
  'migration_count', (select count(*) from supabase_migrations.schema_migrations),
  'migration_versions', (select coalesce(json_agg(version order by version), '[]'::json) from supabase_migrations.schema_migrations),
  'tables', (select coalesce(json_agg(table_name order by table_name), '[]'::json) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
  'function_count', (select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'),
  'policy_count', (select count(*) from pg_policies where schemaname in ('public', 'storage')),
  'public_policy_count', (select count(*) from pg_policies where schemaname = 'public'),
  'storage_policy_count', (select count(*) from pg_policies where schemaname = 'storage'),
  'rls_off', (select coalesce(json_agg(c.relname order by c.relname), '[]'::json) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'tables_without_policy', (select coalesce(json_agg(c.relname order by c.relname), '[]'::json) from pg_class c join pg_namespace n on n.oid = c.relnamespace left join (select distinct tablename from pg_policies where schemaname = 'public') pol on pol.tablename = c.relname where n.nspname = 'public' and c.relkind = 'r' and pol.tablename is null),
  'pgcrypto', (select count(*) from pg_extension where extname = 'pgcrypto'),
  'auth_users_table', (select count(*) from information_schema.tables where table_schema = 'auth' and table_name = 'users'),
  'storage_buckets_table', (select count(*) from information_schema.tables where table_schema = 'storage' and table_name = 'buckets')
);
`;

let catalog;
try {
  const { stdout } = await execFileAsync(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-t", "-A", SUPABASE_DB_URL, "-c", catalogSql],
    { env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) }, maxBuffer: 1024 * 1024 },
  );
  catalog = JSON.parse(stdout.trim());
} catch (error) {
  fail(`psql catalog query failed (is the local database running at ${dbUrl.hostname}:${dbUrl.port}?): ${error.message}`);
}

const appliedVersions = new Set(catalog.migration_versions);
const missingMigrations = fileVersions.filter((version) => !appliedVersions.has(version));
const extraMigrations = [...appliedVersions].filter((version) => !fileVersions.includes(version));
assert(
  missingMigrations.length === 0 && extraMigrations.length === 0,
  `all ${migrationFiles.length} migration files applied exactly once (applied=${catalog.migration_count}, missing=[${missingMigrations.join(", ")}], extra=[${extraMigrations.join(", ")}]). A missing migration means it failed to execute — report it as a decision needed; do not edit migrations to make this pass.`,
);
assertEqual(catalog.tables.length, textTables.size, "live public table count matches migration text");
assertEqual(catalog.tables.length, 35, "live public table count matches the audit baseline");
assertEqual(catalog.function_count, textFunctions.size, "live public function count matches migration text");
assertEqual(catalog.function_count, 73, "live public function count matches the audit baseline");
assertEqual(catalog.policy_count, textPolicyCount, "live policy count (public + storage) matches migration text");
assertEqual(catalog.policy_count, 53, "live policy count matches the audit baseline");
assertEqual(catalog.public_policy_count, textPublicPolicyCount, "live public policy count matches migration text");
assertEqual(catalog.storage_policy_count, textStoragePolicyCount, "live storage policy count matches migration text");
assert(catalog.rls_off.length === 0, `row-level security enabled on every public table (off: [${catalog.rls_off.join(", ")}])`);
assert(
  catalog.tables_without_policy.length === 0,
  `every public table has at least one policy (without: [${catalog.tables_without_policy.join(", ")}])`,
);
assertEqual(catalog.pgcrypto, 1, "pgcrypto extension present");
assertEqual(catalog.auth_users_table, 1, "auth.users table present (Supabase Auth schema)");
assertEqual(catalog.storage_buckets_table, 1, "storage.buckets table present (Supabase Storage schema)");

// ---------------------------------------------------------------------------
// 3. Behaviour as a real disposable user over HTTP (Auth + PostgREST).
// ---------------------------------------------------------------------------

const suffix = randomUUID().slice(0, 8);
const testEmail = `live-check-${suffix}@example.invalid`;
const testPassword = `${randomUUID()}Aa1!`;

async function api(path, { method = "GET", token = null, body = undefined, expectError = null } = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (expectError !== null) {
    assert(
      !response.ok && typeof data?.message === "string" && data.message.includes(expectError),
      `expected PostgREST/RPC error containing "${expectError}" for ${method} ${path}, got HTTP ${response.status}: ${text.slice(0, 200)}`,
    );
    return data;
  }
  if (!response.ok) {
    fail(`HTTP ${response.status} for ${method} ${path}: ${text.slice(0, 300)}`);
  }
  return data;
}

// Create the disposable user through the local Auth API. Local config has
// email confirmations off, so sign-up returns a session immediately.
const signup = await api("/auth/v1/signup", {
  method: "POST",
  body: { email: testEmail, password: testPassword },
});
if (!signup?.access_token || !signup?.user?.id) {
  fail(
    "local sign-up did not return a session. The local config expects auth.email.enable_confirmations=false; check supabase/config.toml and that `supabase start` used this repo's config.",
  );
}
const userId = signup.user.id;
const userToken = signup.access_token;
console.log(`Disposable live-check user created (id ${userId}); no credentials printed.`);

const created = { palletId: null, acquisitionId: null, itemId: null, orderId: null, shipmentId: null, returnId: null };

async function getItem() {
  const rows = await api(`/rest/v1/inventory_items?id=eq.${created.itemId}&select=id,on_hand,reserved,available,shortage`, {
    token: userToken,
  });
  assert(rows.length === 1, "live-check item readable by its owner (RLS)");
  return rows[0];
}

try {
  // The auth trigger must have created exactly one business for the new user.
  const businesses = await api("/rest/v1/businesses?select=id", { token: userToken });
  assert(businesses.length === 1, "auth trigger created exactly one business for the new user");
  const businessId = businesses[0].id;

  // A new user sees no pallets (RLS isolation starts empty).
  const emptyPallets = await api("/rest/v1/pallets?select=id", { token: userToken });
  assert(emptyPallets.length === 0, "new user sees no pallets (RLS starts empty)");

  // Pallet + item, then a receipt movement that must refresh balances.
  const [pallet] = await api("/rest/v1/pallets", {
    method: "POST",
    token: userToken,
    body: { owner_id: userId, business_id: businessId, client_id: `live-check-${suffix}`, name: "Live-DB check pallet" },
  });
  created.palletId = pallet.id;
  // inventory_items.acquisition_id is NOT NULL with FK (acquisition_id,
  // business_id) -> acquisitions(id, business_id). The migration backfill
  // created one acquisition per pre-existing pallet, but a brand-new pallet
  // has no acquisitions row, so the parent row must be created first —
  // inserting the item without it fails with FK violation 23503.
  const [acquisition] = await api("/rest/v1/acquisitions", {
    method: "POST",
    token: userToken,
    body: {
      owner_id: userId,
      business_id: businessId,
      type: "pallet",
      name: "Live-DB check acquisition",
    },
  });
  created.acquisitionId = acquisition.id;
  const [item] = await api("/rest/v1/inventory_items", {
    method: "POST",
    token: userToken,
    body: {
      owner_id: userId,
      business_id: businessId,
      acquisition_id: acquisition.id,
      pallet_id: pallet.id,
      client_id: 900001,
      name: "Live-DB check item",
      quantity: 1,
    },
  });
  created.itemId = item.id;
  // The item insert itself is stock, not an empty shell: the
  // compatibility audit trigger (inventory_items_audit_quantity,
  // 202610100003, redefined in 202610100014) inserts an opening receipt
  // movement for the item's quantity, and
  // refresh_inventory_item_balance sets on_hand to the SUM of all
  // movements for the item. So quantity 1 here already means on_hand 1
  // before any explicit receipt; the receipt below ADDS to it. The
  // acquisitions insert has no such side effect (its only trigger is
  // set_updated_at), and assign_inventory_authority only fills
  // business_id/acquisition_id. Pin the opening balance explicitly so
  // the ledger semantics stay visible if the expectations below move.
  const opening = await getItem();
  assertEqual(opening.on_hand, 1, "item creation opening receipt set on_hand to 1");
  assertEqual(opening.available, 1, "item creation opening receipt set available to 1");
  await api("/rest/v1/inventory_movements", {
    method: "POST",
    token: userToken,
    body: {
      business_id: businessId,
      owner_id: userId,
      inventory_item_id: item.id,
      quantity: 2,
      movement_type: "receipt",
      reason: "Live-DB check receipt",
      source_type: "live_check",
      source_id: suffix,
      idempotency_key: `live-check-receipt-${suffix}`,
    },
  });
  let current = await getItem();
  assertEqual(current.on_hand, 3, "receipt movement raised on_hand to 3 (opening receipt 1 + receipt 2)");
  assertEqual(current.available, 3, "receipt movement raised available to 3 (opening receipt 1 + receipt 2)");

  // Reservation: reserve 1, prove idempotency, release, prove balances return.
  const [reservation] = await api("/rest/v1/rpc/reserve_inventory", {
    method: "POST",
    token: userToken,
    body: {
      target_item_id: item.id,
      reservation_source_type: "live_check",
      reservation_source_id: suffix,
      requested_units: 1,
      reservation_idempotency_key: `live-check-reserve-${suffix}`,
    },
  });
  assertEqual(reservation.reserved_quantity, 1, "reserve_inventory reserved 1 unit");
  assertEqual(reservation.state, "active", "reserve_inventory reservation is active");
  current = await getItem();
  assertEqual(current.available, 2, "reservation reduced available to 2");
  const [reservationAgain] = await api("/rest/v1/rpc/reserve_inventory", {
    method: "POST",
    token: userToken,
    body: {
      target_item_id: item.id,
      reservation_source_type: "live_check",
      reservation_source_id: suffix,
      requested_units: 1,
      reservation_idempotency_key: `live-check-reserve-${suffix}`,
    },
  });
  assert(reservationAgain.id === reservation.id, "reserve_inventory is idempotent on its key (same reservation returned)");
  const [released] = await api("/rest/v1/rpc/release_inventory_reservation", {
    method: "POST",
    token: userToken,
    body: { target_reservation_id: reservation.id },
  });
  assertEqual(released.state, "released", "release_inventory_reservation released the reservation");
  current = await getItem();
  assertEqual(current.available, 3, "release restored available to 3");

  // Guard probes: the RPCs must execute and reject unknown ids, not just
  // exist in migration text.
  await api("/rest/v1/rpc/reserve_inventory", {
    method: "POST",
    token: userToken,
    body: {
      target_item_id: randomUUID(),
      reservation_source_type: "live_check",
      reservation_source_id: suffix,
      requested_units: 1,
      reservation_idempotency_key: `live-check-guard-${suffix}`,
    },
    expectError: "Active inventory item was not found.",
  });
  pass("reserve_inventory guard rejects an unknown item");
  await api("/rest/v1/rpc/create_manual_return", {
    method: "POST",
    token: userToken,
    body: {
      target_order_line_id: randomUUID(),
      returned_quantity: 1,
      return_reason: "Live-DB check guard probe",
      client_request_key: `live-check-guard-${suffix}`,
    },
    expectError: "Order line was not found.",
  });
  pass("create_manual_return guard rejects an unknown order line");

  // Return lifecycle, end to end: shipped order -> manual return -> receipt
  // into quarantine -> inspection -> restock disposition -> resolved.
  const [order] = await api("/rest/v1/orders", {
    method: "POST",
    token: userToken,
    body: { business_id: businessId, owner_id: userId, source: "manual", external_order_id: `live-check-order-${suffix}` },
  });
  created.orderId = order.id;
  const [orderLine] = await api("/rest/v1/order_lines", {
    method: "POST",
    token: userToken,
    body: {
      business_id: businessId,
      owner_id: userId,
      order_id: order.id,
      external_line_id: `live-check-line-${suffix}`,
      quantity: 1,
      inventory_item_id: item.id,
    },
  });
  const [shipment] = await api("/rest/v1/shipments", {
    method: "POST",
    token: userToken,
    body: { business_id: businessId, owner_id: userId, order_id: order.id, state: "shipped" },
  });
  created.shipmentId = shipment.id;
  const [returnRow] = await api("/rest/v1/rpc/create_manual_return", {
    method: "POST",
    token: userToken,
    body: {
      target_order_line_id: orderLine.id,
      returned_quantity: 1,
      return_reason: "Live-DB check return",
      client_request_key: `live-check-return-${suffix}`,
    },
  });
  created.returnId = returnRow.id;
  assertEqual(returnRow.state, "requested", "create_manual_return created a requested return");
  const [returnLine] = await api(`/rest/v1/return_lines?return_id=eq.${returnRow.id}&select=id,inventory_state,inventory_item_id`, {
    token: userToken,
  });
  assertEqual(returnLine.inventory_state, "unavailable", "return line starts unavailable");
  assertEqual(returnLine.inventory_item_id, item.id, "return line matched to the live-check item");

  const [received] = await api("/rest/v1/rpc/receive_return_line", {
    method: "POST",
    token: userToken,
    body: { target_return_line_id: returnLine.id, receipt_note: "Live-DB check receipt" },
  });
  assertEqual(received.inventory_state, "quarantined", "receive_return_line quarantined the return");
  current = await getItem();
  assertEqual(current.on_hand, 4, "return receipt raised on_hand to 4");
  assertEqual(current.available, 3, "quarantine reservation held available at 3");

  await api("/rest/v1/rpc/inspect_return_line", {
    method: "POST",
    token: userToken,
    body: {
      target_return_line_id: returnLine.id,
      received_condition: "Good",
      received_completeness: "Complete",
      inspection_notes: "Live-DB check inspection",
      disposition_recommendation: "restock",
    },
  });
  pass("inspect_return_line recorded an inspection after quarantine");
  const [dispositioned] = await api("/rest/v1/rpc/disposition_return_line", {
    method: "POST",
    token: userToken,
    body: {
      target_return_line_id: returnLine.id,
      selected_disposition: "restock",
      disposition_note: "Live-DB check restock",
    },
  });
  assertEqual(dispositioned.inventory_state, "restocked", "disposition_return_line restocked the return");
  const [resolvedReturn] = await api(`/rest/v1/returns?id=eq.${returnRow.id}&select=state`, { token: userToken });
  assertEqual(resolvedReturn.state, "resolved", "return resolved once its only line was dispositioned");
  current = await getItem();
  assertEqual(current.on_hand, 4, "restock disposition kept on_hand at 4");
  assertEqual(current.available, 4, "restock disposition released quarantine, available is 4");
} finally {
  // Cleanup: delete what this run created, in FK-safe order, as postgres
  // (RLS has no delete policy for orders/order lines, so HTTP cleanup alone
  // cannot remove them). If psql cleanup is unavailable, the rows remain in
  // this disposable local database only; `supabase stop` / `supabase db reset`
  // discards them. Report, do not hide, any leftovers.
  if (created.palletId || created.orderId) {
    const cleanupSql = `
      delete from public.shipments where order_id = '${created.orderId ?? "00000000-0000-0000-0000-000000000000"}';
      delete from public.return_lines where return_id = '${created.returnId ?? "00000000-0000-0000-0000-000000000000"}';
      delete from public.returns where id = '${created.returnId ?? "00000000-0000-0000-0000-000000000000"}';
      delete from public.order_lines where order_id = '${created.orderId ?? "00000000-0000-0000-0000-000000000000"}';
      delete from public.orders where id = '${created.orderId ?? "00000000-0000-0000-0000-000000000000"}';
      delete from public.inventory_reservations where inventory_item_id = '${created.itemId ?? "00000000-0000-0000-0000-000000000000"}';
      delete from public.inventory_movements where inventory_item_id = '${created.itemId ?? "00000000-0000-0000-0000-000000000000"}';
      delete from public.inventory_items where id = '${created.itemId ?? "00000000-0000-0000-0000-000000000000"}';
      delete from public.acquisitions where id = '${created.acquisitionId ?? "00000000-0000-0000-0000-000000000000"}';
      delete from public.pallets where id = '${created.palletId ?? "00000000-0000-0000-0000-000000000000"}';
    `;
    try {
      await execFileAsync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-t", "-A", SUPABASE_DB_URL, "-c", cleanupSql], {
        env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) },
      });
      const remaining = await api(`/rest/v1/pallets?id=eq.${created.palletId}&select=id`, { token: userToken });
      assert(remaining.length === 0, "cleanup removed the live-check pallet");
      console.log("Cleanup: live-check rows removed via local psql.");
    } catch (error) {
      console.log(
        `Cleanup: psql cleanup did not complete (${error.message.slice(0, 160)}). Live-check rows may remain in the disposable local database only; they are scoped to the disposable test user and discarded by \`supabase stop\` / \`supabase db reset\`.`,
      );
    }
  }
}

console.log("Live-DB check passed.");
