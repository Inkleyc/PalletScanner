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
  "inventory.listing_price_backfilled": "Listing price initialized",
  "inventory.listing_price_changed": "Approved listing price changed",
  "marketplace.price_review_resolved": "Marketplace price reviewed",
  "pricing.recommendation_settings_changed": "Pricing recommendation settings changed",
  "pricing.recommendation_applied": "Pricing recommendation applied",
  "pricing.recommendation_dismissed": "Pricing recommendation snoozed",
  "sale.recorded": "Sale recorded",
  "data.restored": "Local backup restored",
};

const activitySummary = (event) => {
  const details = event.details ?? {};
  if (details.name) return details.name;
  if (details.resolution) return `${String(details.resolution).replaceAll("_", " ")} · no eBay change`;
  if (details.approved_price !== undefined) return `Approved $${Number(details.approved_price).toFixed(2)}${details.suggested_price !== undefined ? ` · suggested $${Number(details.suggested_price).toFixed(2)}` : ""}`;
  if (details.listing_price !== undefined) return `Listing price $${Number(details.listing_price).toFixed(2)}`;
  if (details.review_after_days !== undefined) return `${details.enabled ? "Enabled" : "Disabled"} · ${details.review_after_days} days · ${details.markdown_percent}%`;
  return event.entityId;
};

export function ActivityPanel({ snapshot }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    repository.listActivity().then(setEvents).catch(() => setEvents([]));
  }, [snapshot]);

  return <section className="panel"><div className="panel-heading"><div><h3>Recent activity</h3><span>Shared history of important inventory and listing changes.</span></div></div><div className="activity-list">{events.length === 0 ? <div className="empty-queue"><strong>No changes yet</strong><span>Item, pallet, and listing changes will appear here.</span></div> : events.slice(0, 10).map((event) => <div className="activity-row" key={event.id}><div><strong>{activityLabels[event.type] ?? event.type}</strong><span>{activitySummary(event)}</span></div><time dateTime={new Date(event.occurredAt).toISOString()}>{new Date(event.occurredAt).toLocaleString()}</time></div>)}</div></section>;
}
