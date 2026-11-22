# PF-SCOPE-025 — eBay Settings card: status fetch timeout

Status: VERIFIED 2026-11-21 (build + check-script evidence; live pass on the deployed app follows the merge — see Verification)
Owner approval: APPROVED 2026-11-19 (numbered PF-SCOPE-025 by Colton); build authorized 2026-11-21

## Build record (2026-11-21)

- Branch `scope/PF-SCOPE-025-ebay-settings-timeout`. The Settings card's
  `request()` in `apps/web/src/App.jsx` now calls `fetchWithTimeout`
  from the new dependency-free `apps/web/src/timed-fetch.js`; every
  settings flow (status, setup, defaults, location, connect,
  disconnect, import preview/sync) inherits the deadline through the
  shared helper, unchanged otherwise.
- **Deadline: 20s** (the proposed value, kept). Reasoning: a warm
  backend answers these calls in a few seconds at most, so 20s is
  generous headroom for a real response; Render's cold start is ~50s,
  so no deadline short enough to feel responsive would let the first
  click on a sleeping backend succeed anyway. The fix's value is the
  recoverable state — at 20s the click lands on a timeout error
  ("The backend did not answer within 20 seconds. It may still be
  waking up — wait a moment and try again.") on the card's existing
  message line, loading clears via the existing `finally`, and Check
  status is enabled for the retry that reaches the waking/awake
  backend. This replaces the observed failure mode (~90s hangs, most
  recently in PF-SCOPE-024's acceptance check) where the only recovery
  was a page refresh.
- Check-script case: `apps/web/scripts/ebay-settings-timeout.test.mjs`
  (added to the web check list in `apps/web/package.json`). A
  never-resolving fetch stub — faithful to real fetch, pending until
  the AbortSignal fires, then rejecting with AbortError — drives the
  timeout path through a mirror of checkStatus's try/catch/finally and
  asserts loading clears and the timeout message is what renders; plus
  pass-through, non-timeout error propagation, the 20s constant, and a
  wiring assertion that App.jsx's request() uses the timed fetch.
  Root `npm run check` green (84 web tests passing).

## Problem (observed, not hypothetical)

The eBay Settings card can wedge on "Checking…" forever, with both its
buttons disabled, until a page refresh:

- 2026-11-12 evening: Colton's publish succeeded while the card still
  showed "Checking…" and a stale red "Seller account authorization" —
  backend logs later showed the backend only woke at 21:43:39 MST; the
  card's status request was its wake-up call and never repainted.
- Observed again during PF-SCOPE-004, including the 2026-11-21 drill
  preflight (a >60s hang, recovered by refresh).

## Root cause (code-verified)

`apps/web/src/App.jsx`, the eBay settings component:
- Its `request()` helper calls `fetch(...)` with no AbortController /
  signal and no timeout of any kind.
- `checkStatus` sets `loading=true`; the badge renders "Checking…"
  while loading, and the button row is `disabled={loading}` for Check
  status / Connect / Disconnect — so one hung fetch disables the whole
  card with no recovery path short of reloading the page.
- Render's free tier sleeps; a status fetch against a sleeping backend
  is exactly the request most likely to hang or outlast the card.

## Proposed change (small, web-only)

1. Give the settings `request()` an abort timeout (suggest 20s —
   comfortably over Render's ~1-minute cold start is NOT the goal; the
   goal is a recoverable error, and Check status can simply be retried;
   final value is an implementation detail to verify against observed
   cold-start times).
2. On timeout/failure, exit loading, show the existing message line
   ("Could not check eBay status" / a timeout-specific wording), and
   leave Check status enabled so one click retries.
3. Add a check-script case: a never-resolving fetch stub drives
   checkStatus to its timeout path and asserts loading clears and the
   error message renders. (Repo convention: literal-marker assertions
   exist, but a behavioural stub matches the photo-sync test style.)

## Out of scope

- No backend changes; no change to Connect/Disconnect flows beyond them
  inheriting the same timeout through the shared helper.
- Not PF-SCOPE-024 (durable token store) — different failure, different
  fix; 024 stays sequenced per Colton's 2026-11-12 order.

## Sequencing

After PF-SCOPE-004 closes (it closed 2026-11-21; this scope is now
buildable). It was deliberately not landed mid-004-run: a merge
redeploys the backend and wipes the eBay token file, which would have
cost another reconnect while 004's work was pending. It can ride with,
or right after, PF-SCOPE-024.

## Verification

- Root `npm run check` green (incl. the new timeout case). — DONE 2026-11-21.
- Live pass: open Settings with the backend asleep; card must resolve
  to a state or a retryable error — never a permanent "Checking…".
  — PENDING: runs on the deployed app after this scope merges.
