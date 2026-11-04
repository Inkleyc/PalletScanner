import { useState } from "react";

import { getItemPhotos } from "@palletscanner/core";
import { currency } from "./dashboard-model.js";

export function Metric({ label, value, tone = "", onClick }) {
  const Tag = onClick ? "button" : "section";
  return (
    <Tag className={`metric ${onClick ? "metric-button" : ""} ${tone}`} onClick={onClick}>
      <span>{label}</span><strong>{value}</strong>
    </Tag>
  );
}

export function ItemThumbnail({ item }) {
  const uri = getItemPhotos(item)[0];
  if (!uri || uri.startsWith("mock://")) {
    return <div className="item-thumbnail placeholder" aria-label={uri ? `${item.name} preview photo` : `${item.name} has no photo`}><span>{uri ? item.name.charAt(0).toUpperCase() : "No photo"}</span></div>;
  }
  return <img className="item-thumbnail" src={uri} alt={`${item.name} thumbnail`} />;
}

export function EbayRequirementsDialog({ questions, answers, onChange, onFinishLater, onSave }) {
  const [error, setError] = useState("");
  const save = () => {
    const missing = questions.find(
      (question) => question.required && !String(answers[question.key] ?? "").trim(),
    );
    if (missing) {
      setError(`${missing.label} is required, or choose Finish later.`);
      return;
    }
    setError("");
    onSave();
  };
  return <div className="modal-backdrop requirements-backdrop" role="presentation"><div className="edit-modal ebay-questions-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-questions-title"><div><h3 id="analysis-questions-title">Review eBay details</h3><p>These fields are required for the category eBay selected. Review AI&apos;s choices and correct anything that is not right.</p></div><div className="edit-grid">{questions.map((question, index) => <label key={question.key}><span>{question.label}</span>{question.type === "select" ? <select autoFocus={index === 0} value={answers[question.key] ?? ""} onChange={(event) => onChange(question.key, event.target.value)}><option value="">Select an answer</option>{question.options.map((option) => <option key={option}>{option}</option>)}</select> : <input autoFocus={index === 0} value={answers[question.key] ?? ""} onChange={(event) => onChange(question.key, event.target.value)} />}<small>{question.reason}</small></label>)}</div>{error && <p className="error-text">{error}</p>}<div className="button-row"><button type="button" onClick={onFinishLater}>Finish later</button><button type="button" className="primary-button" onClick={save}>Save details</button></div></div></div>;
}

export function PerformanceTable({ title, subtitle, rows, kind = "group" }) {
  return <section className="panel analysis-table"><div className="panel-heading"><div><h3>{title}</h3><span>{subtitle}</span></div></div>{rows.length === 0 ? <div className="empty-queue"><strong>No results yet</strong><span>Record sales to build this comparison.</span></div> : <div className="table-scroll"><table><thead><tr><th>{title.replace(" performance", "")}</th>{kind === "platform" ? <><th>Sales</th><th>Gross</th><th>Costs</th><th>Net</th><th>Avg sale</th></> : <><th>Inventory</th><th>Sold</th><th>Sell-through</th><th>Net</th><th>Avg sale</th>{kind === "pallet" && <th>Profit</th>}</>}</tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td><strong>{row.label}</strong></td>{kind === "platform" ? <><td>{row.sales}</td><td>{currency(row.gross)}</td><td>{currency(row.costs)}</td><td>{currency(row.net)}</td><td>{currency(row.averageSale)}</td></> : <><td>{row.inventory}</td><td>{row.sold}</td><td><div className="rate-cell"><span>{row.sellThrough.toFixed(0)}%</span><i style={{ width: `${Math.min(100, row.sellThrough)}%` }} /></div></td><td>{currency(row.net)}</td><td>{currency(row.averageSale)}</td>{kind === "pallet" && <td className={row.profit >= 0 ? "positive-value" : "negative-value"}>{currency(row.profit)}</td>}</>}</tr>)}</tbody></table></div>}</section>;
}
