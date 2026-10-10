import { useEffect, useState } from "react";

import { repository } from "./repository-router.js";

const activityLabels = {
  "pallet.created": "Pallet created",
  "pallet.updated": "Pallet updated",
  "pallet.deleted": "Pallet deleted",
  "item.created": "Item created",
  "item.updated": "Item updated",
  "item.deleted": "Item removed",
  "listing.updated": "Marketplace status updated",
  "sale.recorded": "Sale recorded",
  "data.restored": "Local backup restored",
};

export function ActivityPanel({ snapshot }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    repository.listActivity().then(setEvents).catch(() => setEvents([]));
  }, [snapshot]);

  return <section className="panel"><div className="panel-heading"><div><h3>Recent activity</h3><span>Shared history of important inventory and listing changes.</span></div></div><div className="activity-list">{events.length === 0 ? <div className="empty-queue"><strong>No changes yet</strong><span>Item, pallet, and listing changes will appear here.</span></div> : events.slice(0, 10).map((event) => <div className="activity-row" key={event.id}><div><strong>{activityLabels[event.type] ?? event.type}</strong><span>{event.details?.name ?? event.entityId}</span></div><time dateTime={new Date(event.occurredAt).toISOString()}>{new Date(event.occurredAt).toLocaleString()}</time></div>)}</div></section>;
}
