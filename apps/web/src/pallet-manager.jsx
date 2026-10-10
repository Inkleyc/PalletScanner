import { useState } from "react";

import { currency } from "./dashboard-model.js";
import { repository } from "./repository-router.js";

export function PalletManager({ pallets, summaries, selectedPalletId, onFilter }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setCreating(false);
    setEditingId(null);
    setName("");
    setCost("");
    setError("");
  };

  const startEdit = (pallet) => {
    setEditingId(pallet.id);
    setName(pallet.name);
    setCost(pallet.palletCost == null ? "" : String(pallet.palletCost));
    setCreating(false);
    setError("");
  };

  const save = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const parsedCost = cost.trim() === "" ? null : Number(cost);
    if (!trimmedName) {
      setError("Pallet name is required.");
      return;
    }
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setError("Pallet cost must be blank or a valid non-negative number.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await repository.updatePallet(editingId, { name: trimmedName, palletCost: parsedCost });
      } else {
        const pallet = await repository.createPallet(trimmedName);
        if (!pallet) throw new Error("The pallet was saved but could not be reloaded.");
        if (parsedCost !== null) {
          await repository.updatePallet(pallet.id, { palletCost: parsedCost });
        }
      }
      cancel();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the pallet.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (pallet) => {
    const summary = summaries.find((entry) => entry.id === pallet.id);
    const detail = summary?.itemCount
      ? ` This will also remove ${summary.itemCount} item${summary.itemCount === 1 ? "" : "s"} from local preview data.`
      : "";
    if (!window.confirm(`Delete ${pallet.name}?${detail}`)) return;
    await repository.removePallet(pallet.id);
    if (selectedPalletId === pallet.id) onFilter("all");
    if (editingId === pallet.id) cancel();
  };

  return (
    <section className="panel" id="pallets">
      <div className="panel-heading"><div><h3>Pallet health</h3><span>Cost, recovery, estimated value, and open issues.</span></div><button onClick={() => { cancel(); setCreating(true); }}>New pallet</button></div>
      <div className="pallet-grid">{summaries.map((pallet) => <article tabIndex="0" className={`pallet-card ${selectedPalletId === pallet.id ? "selected-card" : ""}`} key={pallet.id} onClick={() => onFilter(pallet.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onFilter(pallet.id); }}><div className="pallet-card-heading"><div className="pallet-title-row"><strong>{pallet.name}</strong></div><button className="compact-edit-button" aria-label={`Edit ${pallet.name}`} title="Edit pallet" onClick={(event) => { event.stopPropagation(); startEdit(pallet); }}>Edit</button></div><dl><div><dt>Items</dt><dd>{pallet.itemCount}</dd></div><div><dt>Cost</dt><dd>{currency(pallet.cost)}</dd></div><div><dt>Sold</dt><dd>{currency(pallet.soldRevenue)}</dd></div><div><dt>Issues</dt><dd>{pallet.unresolved}</dd></div></dl></article>)}</div>
      {(creating || editingId) && <div className="modal-backdrop" role="presentation" onMouseDown={cancel}><form className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-pallet-title" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div><h3 id="edit-pallet-title">{editingId ? "Edit pallet" : "New pallet"}</h3><p>{editingId ? "Update this pallet's name or purchase cost." : "Create a pallet for grouping inventory and purchase cost."}</p></div><label><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Pallet name" /></label><label><span>Purchase cost</span><input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Optional" /></label>{error && <p className="error-text">{error}</p>}<div className="button-row">{editingId && <button type="button" className="danger-button" disabled={saving} onClick={() => { const pallet = pallets.find((entry) => entry.id === editingId); if (pallet) void remove(pallet); }}>Delete pallet</button>}<button type="button" disabled={saving} onClick={cancel}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save" : "Create pallet"}</button></div></form></div>}
    </section>
  );
}
