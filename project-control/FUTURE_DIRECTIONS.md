# PalletFlip Future Directions
Status: Owner-confirmed direction, 2026-11-03. This document records where
PalletFlip is heading. It is **not** authorization to build any of it.
Each item below requires a separately approved scope (see
`SCOPE_PROTOCOL.md`), and protected operations still require separate
explicit owner approval every time (see `AGENTS.md`).

The current priority remains unchanged: finish the existing mobile/web
functionality, usability, design consistency, security, and reliability
(see `PRODUCT_CHARTER.md` and `DECISIONS.md` PF-D-001/PF-D-002).

## Sequencing principle

Prove one complete workflow end to end before expanding breadth: a real
pallet, captured on a real phone, stored in a verified database, listed
through a verified marketplace integration, with inventory and financial
state reconciled across mobile and web. Expand one channel, one AI job,
and one workflow at a time. For marketplace automation, observe or
recommend before mutating.

## 1. Hobbyist / small-business first, expandable by design

PalletFlip is for individuals and small resale businesses first. It
should remain approachable for a one-pallet-at-a-time operator, while
its architecture leaves clean seams for a larger, more corporate tool.

Expandability means seams, not extra features now. Preserve:

- The business/owner boundary (`business_id`, memberships) as the
  ownership seam, even though launch supports one owner.
- Marketplace code behind adapters, so a new channel does not rewrite
  inventory, order, or financial logic.
- Quantity, reservation, order, shipment, return, and marketplace-state
  changes as domain operations with idempotency rules, never as
  ordinary editable fields.
- Single-owner assumptions kept in as few places as possible and
  documented where they exist.

Do not build now: named users/roles, teams, multiple warehouses,
SSO, billing, or corporate administration. A real second operator or
team asking for it is the trigger to revisit, not anticipation alone.

## 2. More marketplaces, one at a time, with PalletFlip as inventory authority

eBay remains first because it provides a seller API for listing,
quantity, orders, and returns. Other marketplaces are of interest only
where they are low-maintenance for the operator.

Future channels must meet the same bar before they are treated as
supported:

- A documented, supported way to list, update quantity, read orders,
  and end/withdraw a listing — or an honest assisted/manual workflow
  with the same status tracking as eBay.
- PalletFlip remains the source of truth for physical stock. A channel
  never independently defines how much stock the business owns.
- When an item sells on one channel, the sale must reserve stock and
  queue a reviewed withdrawal/quantity update on every other channel
  where the item is listed, promptly enough to make overselling
  unlikely, with a defined oversell-recovery path when it happens
  anyway.
- Automation starts observe-only or recommend-only and is validated
  before any outbound mutation is enabled.

Add channels one at a time, in this order for each channel: observe
(import/reconcile) → recommend → reviewed outbound action. Do not
enable a new channel's outbound actions on the strength of another
channel's proof.

Facebook Marketplace remains assisted-only in the current product:
PalletFlip prepares the listing, copies fields, opens Marketplace, and
the seller marks the item listed. There is no official automated
posting API to assume. See §5 for the separate supervised-experiment
idea; it is not the supported Facebook workflow.

## 3. AI, vendor-agnostic, assistive — never authoritative

AI integration is wanted. It is not tied to any one provider, including
Claude/Anthropic. The current Anthropic-only implementation is a
starting point, not the architecture.

Before AI is re-enabled in a product scope:

- Introduce a provider abstraction behind one interface, so the
  provider, model, and prompt for each job can change without
  rewriting capture, listing, or pricing code.
- Define AI jobs separately (for example: photo identification,
  listing copy, category suggestion, pricing draft) and evaluate
  providers on real pallet photos for accuracy, cost, and latency
  before choosing.
- Keep credentials server-side only. No AI key in the app or in
  client-visible configuration.
- AI drafts; the owner decides. Sold listings/comps are the ground
  truth for price, the owner's approved `listing_price` and floor
  price are hard guardrails, and nothing AI produces lists, reprices,
  or changes stock without owner review.
- Barcode lookup remains the preferred path for a known barcode;
  AI earns its keep on unidentified, damaged, or no-barcode items.
- Record which provider/model/prompt version produced a draft, and
  keep fallback drafts working when AI is unavailable.

Re-enabling AI in any form still requires a separately approved scope
and, where credentials or production configuration are involved,
separate explicit owner approval. The handoff control "do not
re-enable AI" remains in force until that scope is approved.

## 4. Sourcing is a later version

Finding, evaluating, and buying pallets or lots (including auction
sourcing) is deferred. It is a different product surface — sourcing,
bidding, payment, and pickup — with different risks from operating
inventory the owner already has.

The current scope starts after acquisition. The only seam to keep is
cheap: a won lot or acquired batch can become a pallet/acquisition in
PalletFlip, initially by manual entry. Automated sourcing or bidding
is not in scope and must not be added silently to an operations scope.

## Open questions (owner decisions, in a future scope)

- Which marketplace, if any, is the second channel after eBay, and
  what evidence would show it is low-maintenance enough?
- Which AI jobs are evaluated first, and what accuracy/cost bar
  counts as good enough to ship?
- What would trigger revisiting team/corporate capabilities, and
  who would be the first real second operator?
- When, if ever, is a supervised Muse-assisted posting experiment
  worth running, and under what approval-per-listing rules? (See §5.)

## 5. Muse-assisted posting: experiment idea only, not a product commitment

The owner raised the idea that Muse could post on the operator's
behalf where a marketplace offers no posting API, notably Facebook
Marketplace. This is recorded here as an experiment idea, not as
approved behaviour and not as a dependency of any scope.

Constraints that must hold for any such experiment:

- Supervised and one at a time, with the owner approving each listing
  before anything is submitted. No silent or bulk posting.
- No marketplace credentials are shared with, stored by, or typed
  from Muse chat/memory. Any sign-in happens through the owner's
  own session/browser, with the owner present or in control.
- Isolated `experiment/<topic>` branch with an `EXPERIMENT.md`
  describing current behaviour, exact differences, benefit,
  tradeoffs, test steps, isolated data, and rollback, per
  `SCOPE_PROTOCOL.md`. No merge to `main` without explicit owner
  approval.
- The experiment must report honestly on fragility: login/2FA/
  CAPTCHA interruptions, automation resistance, and account risk.
  If it is not reliably less work than the assisted copy/paste
  workflow, it does not become a feature.

The supported Facebook workflow remains the assisted workflow in
`docs/facebook-marketplace-workflow.md` unless and until an
experiment is approved for adoption.
