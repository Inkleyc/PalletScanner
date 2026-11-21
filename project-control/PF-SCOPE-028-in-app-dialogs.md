# PF-SCOPE-028 — In-app dialogs for the web app

Status: IN_PROGRESS (built 2026-11-21 on
`scope/PF-SCOPE-028-in-app-dialogs`; PR, CI, and the live acceptance
pass remain — the parent runs those)
Owner approval: APPROVED 2026-11-21 ("do it"), given for the drafted
scope after the owner finished the PF-SCOPE-004 return through a
stack of browser-native prompt boxes: "I don't love the popups. They
make me think that Chrome is telling me something. Let's make their
design closer to our app." Recorded as the DIALOG RULE: dialogs are
in-app and wear the app's design.

## Objective

Every web-app flow that asked a question through a browser-native
`window.prompt` / `window.confirm` box now asks it through PalletFlip's
own dialogs, styled by the same theme tokens as the rest of the app
(Day, Work Order, Deep), with behaviour, defaults, validation, and
question wording preserved.

## Current evidence (audit on main `9a02e5e`, 2026-11-21)

- 80 native call sites: `apps/web/src/App.jsx` — 53 `window.prompt`,
  26 `window.confirm`; `apps/web/src/pallet-manager.jsx` — 1
  `window.confirm`. No `window.alert` anywhere.
- The heaviest flows were chained prompt sequences: return create
  (3 prompts), return inspection (up to 6), record refund (5),
  disposition (2), plus confirms gating consequential actions
  throughout.
- Native dialogs are invisible to browser automation — during
  PF-SCOPE-004 every prompt/confirm-gated step (start fulfillment,
  carrier handoff, fee confirmation, the entire manual return) had
  to be clicked by the owner himself. In-app dialogs make these
  flows verifiable in live passes.

## Included

- `apps/web/src/dialog-service.jsx`: a promise-based dialog service
  mirroring the mobile AppAlert pattern. A module-level singleton
  queues requests; one `DialogHost` rendered at the app root displays
  them. `confirmDialog` resolves true/false, `promptDialog` resolves
  the entered string or null on cancel, `formDialog` resolves an
  object of field values or null on cancel — exactly the semantics
  the native dialogs had, so a dismissed dialog still aborts the
  calling flow. Escape and backdrop clicks cancel, matching the
  app's other modals.
- Styling entirely from the existing theme tokens (`.modal-backdrop`
  / `.edit-modal` family): correct in Day and Deep automatically,
  and under Work Order the dialog takes the graduated form treatment
  (squared box, 1.5px ink frame, mono uppercase labels and title).
- All 80 call sites converted; handlers that chained prompts are now
  async. Chained stacks that are really forms collect their fields in
  ONE dialog: return create, return inspection (the original/returned
  serial fields appear only when the identity check is match or
  mismatch), disposition, identity resolution, place hold, verify
  imported item, replacement pack and label steps, return shipping
  label, confirmed eBay decision, eBay message, observed-shipment
  adoption. Single-question prompts and confirms stay single dialogs.
- `apps/web/scripts/check.mjs`: the dialog service joins the required
  files, and a new assertion scans every `apps/web/src` source file
  and fails the check if any native dialog call returns.

## Judgment calls (consolidation details)

- "Choose by number" prompts (return line, refunded line,
  replacement item, package preset) are now real select fields whose
  options carry the same text the numbered list showed; the blank
  preset choice is labelled "Measure during packing", preserving the
  leave-blank-to-measure path.
- Record refund/cost keeps a staged shape — type first, then (for
  refunds) the line, then quantity/amount/note — because the quantity
  field's default is the chosen line's refundable maximum; a single
  form could not keep that default exact. Three dialogs replace five
  prompts.
- Start replacement keeps quantity in the same form as the item
  picker; its default is computed from the first (default-selected)
  candidate, the only case where a default can differ from the old
  per-selection prompt if the operator picks a scarcer item — the
  quantity validation itself (whole number ≥ 1) is unchanged.
- Enumerated free-text prompts (identity check, disposition, money
  type, label source, payer, direction, evidence type, confirmed
  outcome) are select fields over exactly the values the prompt text
  enumerated, shown as the stored codes.
- Form dialogs carry short titles and submit labels derived from the
  button that opens the flow (e.g. "Open manual return" / "Open
  return"); no question wording changed.
- The pallet delete confirm is danger-styled with a "Delete pallet"
  submit label, matching the danger button that opens it.
- Fulfillment package measurements and label recording already used
  in-app forms (Orders) and are untouched, as directed.

## Excluded

- Mobile (already in-app via AppAlert).
- Any behaviour, validation, or wording change to the underlying
  flows.
- PF-SCOPE-025 (Settings status timeout) — separate scope, unaffected.

## Acceptance criteria

- [x] `grep` proves zero `window.prompt` / `window.confirm` in
  `apps/web/src`, and `check.mjs` asserts it on every run.
- [x] Root `npm run check` green on the branch (see Verification).
- [ ] PR opened and CI green (parent).
- [ ] Lenard completes the acceptance return flow unaided in the
  live app (parent, after merge/deploy).
- [ ] Owner spot-check: dialogs read as PalletFlip in Day, Work
  Order, and Deep (parent/owner).

## Verification

- Built flow-by-flow with the web check green after the returns
  conversion (check.mjs passed before the remaining conversions) and
  the full web check (unit tests + check.mjs + vite build) green
  after all 80 sites were converted.
- Root `npm run check` on the finished branch: see the completion
  report for the exit code and head SHA.

Branch: scope/PF-SCOPE-028-in-app-dialogs
Deliverables: dialog service + host + styles, all call-site
conversions, the check.mjs guard, this scope document, and the
register row.
