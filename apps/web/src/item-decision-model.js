// One edit path for Web Review/Inventory decisions (PF-SCOPE-003).
//
// The floor/approved-price rules themselves are unchanged; this module is
// the single place that enforces them on the web, so the edit dialog,
// add-item, AI photo-analysis save, and bulk actions cannot drift apart.
// Validation messages match the edit dialog's long-standing wording
// verbatim, so existing behaviour is preserved, not reworded.
//
// Which saves are gated:
// - Price-setting saves (edit dialog, add-item, AI analysis results) are
//   validated in full: name/condition, quantity, and prices.
// - AI analysis results are gated on prices only: analysis fills
//   name/condition from photos, so a missing name or condition is the
//   operator's edit-dialog concern, but a below-floor approved price must
//   never be persisted silently.
// - Price-preserving saves (photos, status-only workflow buttons) are not
//   re-validated, so fixing photos or status on a legacy record is never
//   blocked by a price problem the operator did not just create.
// - Bulk decisions are validated like price-setting saves, because
//   "Mark ready" asserts the item is decision-complete. Items that fail
//   are skipped, never saved, and reported.
//
// This deliberately stays plain JS in the web app's existing style. The
// web does not import packages/core or packages/api-client (see the
// PF-SCOPE-003 scope document); consolidating the duplicated rules is
// explicitly out of scope.

const numericField = (item, field) =>
  Number(item[field] ?? item[`${field}_price`]);

// Read an item in either field style (plain `low`/`high`/`floor` or
// `low_price`/`high_price`/`floor_price`, `listing_price` or
// `listingPrice`) into the normalized candidate the validator checks.
// Quantity is the record quantity, not available-to-sell: bulk decisions
// never change quantity, and available can legitimately be 0 on a sold
// item without the record itself being invalid.
export const toDecisionCandidate = (item) => ({
  name: item.name ?? "",
  condition: item.condition ?? "",
  quantity: Number(item.quantity),
  low: numericField(item, "low"),
  high: numericField(item, "high"),
  floor: numericField(item, "floor"),
  listingPrice: Number(item.listing_price ?? item.listingPrice ?? numericField(item, "high")),
});

export const validateItemPrices = (candidate) => {
  const errors = [];
  const low = Number(candidate.low);
  const high = Number(candidate.high);
  const floor = Number(candidate.floor);
  const listingPrice = Number(candidate.listingPrice);
  if (![low, high, floor, listingPrice].every((value) => Number.isFinite(value) && value >= 0)) {
    errors.push("Prices must be valid non-negative numbers.");
    return errors;
  }
  if (high < low) {
    errors.push("High price cannot be lower than low price.");
  }
  if (listingPrice < floor) {
    errors.push("Approved listing price cannot be lower than the floor price.");
  }
  return errors;
};

export const validateItemDecision = (candidate, options = {}) => {
  const errors = [];
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const condition = typeof candidate.condition === "string" ? candidate.condition.trim() : "";
  if (!name || !condition) {
    errors.push("Name and condition are required.");
  }
  const quantity = Number(candidate.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    errors.push("Quantity must be a whole number of at least 1.");
  }
  if (
    options.previousQuantity !== undefined &&
    quantity !== Number(options.previousQuantity) &&
    !String(options.quantityReason ?? "").trim()
  ) {
    errors.push("Choose a reason whenever you change quantity.");
  }
  errors.push(...validateItemPrices(candidate));
  return errors;
};

// Split bulk candidates into the ones that pass the decision rules
// (to save, in input order) and the ones that fail (to skip and report).
// Nothing here writes anything: the caller saves `applied` and reports
// `skipped` with their reasons.
export const applyBulkDecision = (items, transform) =>
  items.reduce(
    (result, item) => {
      const candidate = transform(item);
      const errors = validateItemDecision(toDecisionCandidate(candidate), {
        previousQuantity: toDecisionCandidate(item).quantity,
      });
      if (errors.length > 0) {
        result.skipped.push({ item, candidate, errors });
      } else {
        result.applied.push(candidate);
      }
      return result;
    },
    { applied: [], skipped: [] },
  );

// Local-vs-cloud state, labelled wherever an item is shown or edited.
// Anything that is not positively the cloud mode is described as local:
// the UI must never claim edits are shared when they are not.
export const describeDataSource = (mode) =>
  mode === "cloud"
    ? {
        badge: "Cloud data",
        note: "Cloud inventory — edits save to shared inventory and sync to mobile.",
      }
    : {
        badge: "Local preview data",
        note: "Local preview data — edits stay in this browser only and are not shared or synced to mobile.",
      };
