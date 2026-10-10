export type InventoryMovementType =
  | "receipt"
  | "correction"
  | "sale"
  | "return_receipt"
  | "restock"
  | "damage"
  | "loss"
  | "discard"
  | "bundle_consumption"
  | "split"
  | "merge";

export type InventoryMovement = {
  id: string;
  inventoryItemId: string;
  quantity: number;
  type: InventoryMovementType;
  reason?: string;
  occurredAt: string;
  idempotencyKey?: string;
};

export type InventoryReservationState =
  | "active"
  | "released"
  | "consumed"
  | "shortage";

export type InventoryReservation = {
  id: string;
  inventoryItemId: string;
  requestedQuantity: number;
  reservedQuantity: number;
  releasedQuantity: number;
  consumedQuantity: number;
  shortageQuantity: number;
  state: InventoryReservationState;
};

export type InventoryBalance = {
  onHand: number;
  reserved: number;
  available: number;
  shortage: number;
};

const requireWholeQuantity = (quantity: number, label: string) => {
  if (!Number.isSafeInteger(quantity)) {
    throw new Error(`${label} must be a whole number.`);
  }
};

export const calculateInventoryBalance = (
  movements: InventoryMovement[],
  reservations: InventoryReservation[] = [],
): InventoryBalance => {
  const onHand = movements.reduce((total, movement) => {
    requireWholeQuantity(movement.quantity, "Movement quantity");
    return total + movement.quantity;
  }, 0);

  const reservationTotals = reservations.reduce(
    (totals, reservation) => {
      for (const [label, value] of [
        ["Requested quantity", reservation.requestedQuantity],
        ["Reserved quantity", reservation.reservedQuantity],
        ["Released quantity", reservation.releasedQuantity],
        ["Consumed quantity", reservation.consumedQuantity],
        ["Shortage quantity", reservation.shortageQuantity],
      ] as const) {
        requireWholeQuantity(value, label);
        if (value < 0) throw new Error(`${label} cannot be negative.`);
      }

      if (!["active", "shortage"].includes(reservation.state)) return totals;
      const committed = Math.max(
        reservation.reservedQuantity -
          reservation.releasedQuantity -
          reservation.consumedQuantity,
        0,
      );
      return {
        reserved: totals.reserved + committed,
        shortage: totals.shortage + reservation.shortageQuantity,
      };
    },
    { reserved: 0, shortage: 0 },
  );

  return {
    onHand,
    reserved: reservationTotals.reserved,
    available: Math.max(onHand - reservationTotals.reserved, 0),
    shortage: Math.max(
      reservationTotals.shortage,
      reservationTotals.reserved - onHand,
    ),
  };
};

export const findLedgerDiscrepancy = (
  cached: InventoryBalance,
  calculated: InventoryBalance,
) => {
  const fields = (["onHand", "reserved", "available", "shortage"] as const)
    .filter((field) => cached[field] !== calculated[field]);
  return fields.length === 0
    ? null
    : { fields, cached, calculated };
};
