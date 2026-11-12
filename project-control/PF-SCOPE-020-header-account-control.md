# PF-SCOPE-020 — Header account control (web)

Status: IN_PROGRESS (built + locally verified 2026-11-11 — root `npm run check` exit 0 incl. a pristine `npm ci` reproduction on the PR head; local-mode browser pass green, details below. PR #25's first CI runs failed 2026-11-11 for a step not visible from the connector; re-run triggered the same day after PF-SCOPE-021's PR passed the identical workflow clean. Flip to VERIFIED/CLOSED at merge.)
Owner approval: APPROVED 2026-11-11 (Colton, from live use: "We should put the login up in the upper right corner like other apps.")
Branch: `scope/PF-SCOPE-020-header-account`

## Objective

Put sign-in where users expect it: the top-right of the web app header, visible from every view — instead of only inside Settings, where it had to be hunted for mid-task (hit live during the PF-SCOPE-004 session, 2026-11-11).

## Changes

- **New `apps/web/src/auth-session.js`** — a single shared store that owns the Supabase auth subscription and the repository switch that follows it (`useCloudRepository` / `useLocalRepository`), plus `sendMagicLink` / `signOut` helpers and a `syncRepositoryMode` re-read for flows that switch repositories outside the subscription. Previously the subscription lived inside the Settings-only account card, so a session established anywhere else never switched the app to cloud data; the store fixes that as a side effect of the move. The apply-session logic is the card's original logic, moved unchanged.
- **`AccountControl` in the topbar** (`App.jsx`, started once from `App()` via `startAuthSession()`): signed out → a **Sign in** button opening a small dropdown (email field + "Email sign-in link", the same magic-link call with `emailRedirectTo: window.location.origin`; closes on outside click or Escape; shows send errors and the check-your-email confirmation). Signed in → the account email + **Sign out**. `App()` also starts the auth session store on mount.
- **Settings account card slimmed** to a status summary: Signed in/out badge, account email, cloud/local mode badge, the cloud self-test button (unchanged), and a pointer to the header control. The duplicate sign-in form and sign-out button are removed — one sign-in surface, no drift. The card title stays "Supabase login" (the web `check.mjs` marker contract).
- **Styles** (`styles.css`): `.topbar-actions`, `.account-control`, `.account-email`, `.account-menu` in the existing Slate tokens (surface/border vars, card radius 10px, modal shadow, z-index 10 like the other header menus).

## Excluded

- Mobile sign-in placement (mobile already has its own login flow); any change to how magic-link auth works underneath; the eBay backend token in Settings (a separate session-only credential, untouched).

## Verification (2026-11-11)

- Root `npm run check` exit 0 (includes the web node tests 73/73, `check.mjs` markers, Vite build).
- Local-mode Puppeteer pass against the built app (public Supabase env baked in, matching production): Sign in button renders at the top-right of the header; dropdown opens with working email form (submit enabled when configured); Escape closes it; Settings card shows no form and the pointer text; with a fabricated stored session the header renders the signed-in branch (email + Sign out) — the token was fake, so the cloud hydrate behind it errored by design; the live magic-link round trip itself is an owner click (the request code is the old card's, moved unchanged) and gets exercised naturally in the PF-SCOPE-004 session.
