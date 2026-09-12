import { useEffect, useMemo, useRef, useState } from "react";

import {
  currency,
  getDisplayIssue,
  getDisplayPlatform,
  getDisplayStatus,
  getItemAgeDays,
  getMarketplaceQueueItems,
  getQuantity,
  getStaleInventoryItems,
  statusClass,
  statusLabel,
  summarizeInventory,
  summarizePallet,
} from "./dashboard-model.js";
import { getRepositoryMode, repository, useCloudRepository, useLocalRepository } from "./repository-router.js";
import { isSupabaseConfigured, supabase } from "./supabase.js";

const readPreference = (key, fallback) => localStorage.getItem(key) ?? fallback;
const price = (item, field) => item[field] ?? item[`${field}_price`] ?? 0;

function Metric({ label, value, tone = "", onClick }) {
  const Tag = onClick ? "button" : "section";
  return (
    <Tag className={`metric ${onClick ? "metric-button" : ""} ${tone}`} onClick={onClick}>
      <span>{label}</span><strong>{value}</strong>
    </Tag>
  );
}

function Queue({ title, subtitle, items, empty, onSelect, renderMeta }) {
  return (
    <section className="panel">
      <div className="panel-heading"><div><h3>{title}</h3><span>{subtitle}</span></div></div>
      <div className="queue-list">
        {items.length === 0 ? (
          <div className="empty-queue"><strong>{empty}</strong><span>No action is needed right now.</span></div>
        ) : items.map((item) => (
          <button className="queue-item" key={item.id} onClick={() => onSelect(item.id)}>
            <div><strong>{item.name}</strong><span>{getDisplayIssue(item) ?? renderMeta(item)}</span></div>
            <span className={`badge ${statusClass[getDisplayStatus(item)]}`}>{renderMeta(item)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PalletManager({ pallets, summaries, activePalletId, selectedPalletId, onFilter }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (pallet) => {
    setEditingId(pallet.id);
    setName(pallet.name);
    setCost(pallet.palletCost == null ? "" : String(pallet.palletCost));
    setCreating(false);
    setError("");
  };
  const cancel = () => { setCreating(false); setEditingId(null); setName(""); setCost(""); setError(""); };
  const save = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const parsedCost = cost.trim() === "" ? null : Number(cost);
    if (!trimmedName) return setError("Pallet name is required.");
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) return setError("Pallet cost must be blank or a valid non-negative number.");
    setSaving(true); setError("");
    try {
      if (editingId) await repository.updatePallet(editingId, { name: trimmedName, palletCost: parsedCost });
      else {
        const pallet = await repository.createPallet(trimmedName);
        if (!pallet) throw new Error("The pallet was saved but could not be reloaded.");
        if (parsedCost !== null) await repository.updatePallet(pallet.id, { palletCost: parsedCost });
      }
      cancel();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the pallet.");
    } finally { setSaving(false); }
  };
  const remove = async (pallet) => {
    const summary = summaries.find((entry) => entry.id === pallet.id);
    const detail = summary?.itemCount ? ` This will also remove ${summary.itemCount} item${summary.itemCount === 1 ? "" : "s"} from local preview data.` : "";
    if (!window.confirm(`Delete ${pallet.name}?${detail}`)) return;
    await repository.removePallet(pallet.id);
    if (selectedPalletId === pallet.id) onFilter("all");
  };

  return (
    <section className="panel" id="pallets">
      <div className="panel-heading"><div><h3>Pallet health</h3><span>Cost, recovery, estimated value, and open issues.</span></div><button onClick={() => { cancel(); setCreating(true); }}>New pallet</button></div>
      {(creating || editingId) && <form className="inline-editor" onSubmit={save}><label><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Pallet name" /></label><label><span>Purchase cost</span><input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Optional" /></label><div className="button-row"><button type="button" disabled={saving} onClick={cancel}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save pallet" : "Create pallet"}</button></div>{error && <p className="error-text">{error}</p>}</form>}
      <div className="pallet-grid">{summaries.map((pallet) => <article tabIndex="0" className={`pallet-card ${selectedPalletId === pallet.id ? "selected-card" : ""}`} key={pallet.id} onClick={() => onFilter(pallet.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onFilter(pallet.id); }}><div className="card-row"><strong>{pallet.name}</strong>{activePalletId === pallet.id && <span className="badge success">Active</span>}</div><dl><div><dt>Items</dt><dd>{pallet.itemCount}</dd></div><div><dt>Cost</dt><dd>{currency(pallet.cost)}</dd></div><div><dt>Sold</dt><dd>{currency(pallet.soldRevenue)}</dd></div><div><dt>Issues</dt><dd>{pallet.unresolved}</dd></div></dl><div className="card-actions"><button onClick={(event) => { event.stopPropagation(); repository.setActivePallet(pallet.id); }}>Set active</button><button onClick={(event) => { event.stopPropagation(); startEdit(pallet); }}>Edit</button><button className="danger-button" onClick={(event) => { event.stopPropagation(); remove(pallet); }}>Delete</button></div></article>)}</div>
    </section>
  );
}

function NewItemForm({ pallets, defaultPalletId, onCreated, onCancel }) {
  const [draft, setDraft] = useState({ name: "", condition: "Unknown", palletId: defaultPalletId, quantity: "1", low: "0", high: "0", floor: "0", platform: "Review" });
  const [error, setError] = useState("");
  const update = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    const quantity = Number(draft.quantity); const low = Number(draft.low); const high = Number(draft.high); const floor = Number(draft.floor);
    if (!draft.name.trim() || !draft.condition.trim() || !draft.palletId) return setError("Name, condition, and pallet are required.");
    if (!Number.isInteger(quantity) || quantity < 1) return setError("Quantity must be a whole number of at least 1.");
    if (![low, high, floor].every((value) => Number.isFinite(value) && value >= 0) || high < low) return setError("Enter a valid price range with the high price at or above the low price.");
    const id = Date.now();
    await repository.saveItem({ id, photo: null, photos: [], name: draft.name.trim(), condition: draft.condition.trim(), quantity, low, high, floor, low_price: low, high_price: high, floor_price: floor, best_platform: draft.platform, platform: draft.platform, listing_title: draft.name.trim(), listing_description: "", listedPlatforms: [], palletId: draft.palletId, soldPrice: null, status: "captured" });
    onCreated(id);
  };
  return <form className="inventory-detail edit-form" onSubmit={save}><div className="panel-heading"><h3>New inventory item</h3><div className="button-row"><button type="button" onClick={onCancel}>Cancel</button><button type="submit">Create item</button></div></div><div className="edit-grid"><label><span>Name</span><input autoFocus value={draft.name} onChange={update("name")} /></label><label><span>Condition</span><input value={draft.condition} onChange={update("condition")} /></label><label><span>Pallet</span><select value={draft.palletId} onChange={update("palletId")}>{pallets.map((pallet) => <option key={pallet.id} value={pallet.id}>{pallet.name}</option>)}</select></label><label><span>Quantity</span><input type="number" min="1" step="1" value={draft.quantity} onChange={update("quantity")} /></label><label><span>Platform</span><select value={draft.platform} onChange={update("platform")}><option>Facebook</option><option>eBay</option><option>Review</option></select></label><label><span>Low price</span><input type="number" min="0" step="0.01" value={draft.low} onChange={update("low")} /></label><label><span>High price</span><input type="number" min="0" step="0.01" value={draft.high} onChange={update("high")} /></label><label><span>Floor price</span><input type="number" min="0" step="0.01" value={draft.floor} onChange={update("floor")} /></label></div>{error && <p className="error-text">{error}</p>}</form>;
}

const itemDraft = (item) => ({
  name: item.name ?? "",
  condition: item.condition ?? "",
  palletId: item.palletId ?? "",
  quantity: String(getQuantity(item)),
  low: String(price(item, "low")),
  high: String(price(item, "high")),
  floor: String(price(item, "floor")),
  status: getDisplayStatus(item),
  platform: getDisplayPlatform(item),
  soldPrice: item.soldPrice == null ? "" : String(item.soldPrice),
  listing_title: item.listing_title ?? "",
  listing_description: item.listing_description ?? "",
});

function PhotoReview({ item }) {
  const photos = item.photos?.length ? item.photos : item.photo ? [item.photo] : [];
  return <section className="photo-review"><div className="card-row"><div><strong>Listing photos</strong><span>{photos.length === 0 ? "No photos attached" : `${photos.length} photo${photos.length === 1 ? "" : "s"} available`}</span></div><span className={`badge ${photos.length > 0 ? "success" : "warning"}`}>{photos.length > 0 ? "Review" : "Needed"}</span></div>{photos.length > 0 ? <div className="photo-grid">{photos.map((uri, index) => uri.startsWith("mock://") ? <div className="photo-placeholder" key={uri}><span>Photo {index + 1}</span><small>Preview fixture</small></div> : <img key={uri} src={uri} alt={`${item.name} listing photo ${index + 1}`} />)}</div> : <p className="detail-issue">Capture photos from the phone before publishing this item.</p>}<small>Photos are captured on the phone and securely loaded from shared cloud storage for review.</small></section>;
}

function ListingReview({ item, onSave }) {
  const [savingPlatform, setSavingPlatform] = useState(null);
  const [error, setError] = useState("");
  const updatePlatform = async (platform) => {
    setSavingPlatform(platform);
    setError("");
    const isListed = item.listedPlatforms.includes(platform);
    const listedPlatforms = isListed ? item.listedPlatforms.filter((value) => value !== platform) : [...item.listedPlatforms, platform];
    const statusUpdate = platform === "ebay"
      ? { ebayStatus: isListed ? "idle" : "active", ebayUpdatedAt: Date.now() }
      : { facebookStatus: isListed ? "idle" : "listed", facebookUpdatedAt: Date.now() };
    try { await onSave({ ...item, ...statusUpdate, listedPlatforms }); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not update marketplace status."); }
    finally { setSavingPlatform(null); }
  };
  return <section className="photo-review"><div className="card-row"><div><strong>Marketplace review</strong><span>Confirm where this item is currently listed.</span></div></div><div className="button-row"><button disabled={savingPlatform !== null} onClick={() => updatePlatform("facebook")}>{savingPlatform === "facebook" ? "Saving…" : item.listedPlatforms.includes("facebook") ? "Remove Facebook listed mark" : "Mark listed on Facebook"}</button><button disabled={savingPlatform !== null} onClick={() => updatePlatform("ebay")}>{savingPlatform === "ebay" ? "Saving…" : item.listedPlatforms.includes("ebay") ? "Remove eBay listed mark" : "Mark listed on eBay"}</button></div>{error && <p className="error-text">{error}</p>}{item.ebayLastError && <p className="error-text">eBay: {item.ebayLastError}</p>}{item.facebookLastError && <p className="error-text">Facebook: {item.facebookLastError}</p>}</section>;
}

function InventoryDetail({ item, palletName, pallets, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => item ? itemDraft(item) : null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(item ? itemDraft(item) : null);
    setEditing(false);
    setError("");
  }, [item?.id]);

  if (!item) return <div className="inventory-detail"><strong>No item matches the current filters.</strong></div>;
  const update = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    const quantity = Number(draft.quantity);
    const low = Number(draft.low);
    const high = Number(draft.high);
    const floor = Number(draft.floor);
    const soldPrice = draft.soldPrice.trim() === "" ? null : Number(draft.soldPrice);
    if (!draft.name.trim() || !draft.condition.trim()) return setError("Name and condition are required.");
    if (!Number.isInteger(quantity) || quantity < 1) return setError("Quantity must be a whole number of at least 1.");
    if (![low, high, floor].every((value) => Number.isFinite(value) && value >= 0)) return setError("Prices must be valid non-negative numbers.");
    if (high < low) return setError("High price cannot be lower than low price.");
    if (soldPrice !== null && (!Number.isFinite(soldPrice) || soldPrice < 0)) return setError("Sold price must be blank or a valid non-negative number.");
    setSaving(true); setError("");
    try {
      await onSave({
        ...item,
        name: draft.name.trim(),
        condition: draft.condition.trim(),
        palletId: draft.palletId,
        quantity,
        low,
        high,
        floor,
        low_price: low,
        high_price: high,
        floor_price: floor,
        status: soldPrice === null && draft.status === "sold" ? "ready" : soldPrice !== null ? "sold" : draft.status,
        platform: draft.platform,
        best_platform: draft.platform,
        soldPrice,
        listing_title: draft.listing_title.trim(),
        listing_description: draft.listing_description.trim(),
      });
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the item.");
    } finally { setSaving(false); }
  };
  const setWorkflowStatus = async (status) => {
    setError("");
    try { await onSave({ ...item, status, soldPrice: status === "sold" ? item.soldPrice : null }); }
    catch (workflowError) { setError(workflowError instanceof Error ? workflowError.message : "Could not update status."); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${item.name} from inventory? This cannot be undone.`)) return;
    await onRemove(item.id);
  };

  if (editing) return (
    <form className="inventory-detail edit-form" onSubmit={save}>
      <div className="panel-heading"><h3>Edit item</h3><div className="button-row"><button type="button" onClick={() => { setDraft(itemDraft(item)); setEditing(false); setError(""); }}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save item"}</button></div></div>
      <div className="edit-grid">
        <label><span>Name</span><input value={draft.name} onChange={update("name")} /></label>
        <label><span>Condition</span><input value={draft.condition} onChange={update("condition")} /></label>
        <label><span>Pallet</span><select value={draft.palletId} onChange={update("palletId")}>{pallets.map((pallet) => <option key={pallet.id} value={pallet.id}>{pallet.name}</option>)}</select></label>
        <label><span>Quantity</span><input type="number" min="1" step="1" value={draft.quantity} onChange={update("quantity")} /></label>
        <label><span>Low price</span><input type="number" min="0" step="0.01" value={draft.low} onChange={update("low")} /></label>
        <label><span>High price</span><input type="number" min="0" step="0.01" value={draft.high} onChange={update("high")} /></label>
        <label><span>Floor price</span><input type="number" min="0" step="0.01" value={draft.floor} onChange={update("floor")} /></label>
        <label><span>Status</span><select value={draft.status} onChange={update("status")}>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Platform</span><select value={draft.platform} onChange={update("platform")}><option>Facebook</option><option>eBay</option><option>Review</option></select></label>
        <label><span>Sold price</span><input type="number" min="0" step="0.01" value={draft.soldPrice} onChange={update("soldPrice")} placeholder="Not sold" /></label>
        <label className="wide-field"><span>Listing title</span><input value={draft.listing_title} onChange={update("listing_title")} /></label>
        <label className="wide-field"><span>Listing description</span><textarea rows="4" value={draft.listing_description} onChange={update("listing_description")} /></label>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
  return (
    <section className="inventory-detail" aria-label="Selected inventory item">
      <div className="panel-heading"><h3>{item.name}</h3><button onClick={() => setEditing(true)}>Edit item</button></div>
      <div className="detail-grid">
        <div><span>Pallet</span><strong>{palletName}</strong></div>
        <div><span>Condition</span><strong>{item.condition}</strong></div>
        <div><span>Quantity</span><strong>{getQuantity(item)}</strong></div>
        <div><span>Low</span><strong>{currency(price(item, "low"))}</strong></div>
        <div><span>High</span><strong>{currency(price(item, "high"))}</strong></div>
        <div><span>Platform</span><strong>{getDisplayPlatform(item)}</strong></div>
        <div><span>Age</span><strong>{getItemAgeDays(item)} days</strong></div>
      </div>
      <p className={getDisplayIssue(item) ? "detail-issue" : "detail-ready"}>
        {getDisplayIssue(item) ?? "Ready for the next marketplace action."}
      </p>
      <PhotoReview item={item} />
      <ListingReview item={item} onSave={onSave} />
      <div className="button-row workflow-actions">{item.soldPrice === null ? <><button onClick={() => setWorkflowStatus("needs_photos")}>Needs photos</button><button onClick={() => setWorkflowStatus("needs_research")}>Needs research</button><button onClick={() => setWorkflowStatus("ready")}>Mark ready</button></> : <button onClick={() => setWorkflowStatus("ready")}>Clear sold status</button>}<button className="danger-button" onClick={remove}>Remove item</button></div>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function SupabaseAccount() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [repositoryMode, setRepositoryMode] = useState(() => getRepositoryMode());
  const [testingCloud, setTestingCloud] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let active = true;
    const applySession = async (nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(true);
      try {
        if (nextSession) {
          await useCloudRepository();
          if (active) setRepositoryMode("cloud");
        } else {
          await useLocalRepository();
          if (active) setRepositoryMode("local");
        }
        if (active) setMessage("");
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Could not load inventory.");
      } finally {
        if (active) setLoading(false);
      }
    };
    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => { void applySession(nextSession); }, 0);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const sendMagicLink = async (event) => {
    event.preventDefault();
    if (!email.trim() || !supabase) return;
    setLoading(true); setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    setMessage(error ? error.message : "Check your email for the PalletFlip sign-in link.");
  };

  const signOut = async () => {
    setLoading(true); setMessage("");
    await supabase?.auth.signOut();
    await useLocalRepository();
    setRepositoryMode("local"); setLoading(false);
  };

  const testCloud = async () => {
    setTestingCloud(true); setMessage("Connecting to cloud inventory…");
    let pallet = null;
    const itemId = Date.now();
    try {
      await useCloudRepository();
      setRepositoryMode("cloud");
      setMessage("Testing pallet creation…");
      pallet = await repository.createPallet("Temporary cloud self-test");
      setMessage("Testing pallet update…");
      await repository.updatePallet(pallet.id, { palletCost: 1 });
      setMessage("Testing inventory creation…");
      await repository.saveItem({ id: itemId, photo: null, photos: [], name: "Temporary cloud self-test item", condition: "Test", quantity: 1, low: 1, high: 2, floor: 1, low_price: 1, high_price: 2, floor_price: 1, best_platform: "Review", platform: "Review", listing_title: "Temporary cloud self-test item", listing_description: "Temporary record used to verify authenticated cloud writes.", listedPlatforms: [], palletId: pallet.id, soldPrice: null, status: "ready" });
      setMessage("Testing cloud cleanup…");
      await repository.removeItem(itemId);
      await repository.removePallet(pallet.id);
      setMessage("Cloud create, update, read, and delete checks passed. Temporary records were removed.");
    } catch (error) {
      if (pallet) {
        try { await repository.removeItem(itemId); await repository.removePallet(pallet.id); } catch { /* Preserve the original diagnostic error. */ }
      }
      setMessage(error instanceof Error ? error.message : "Cloud self-test failed.");
    } finally { setTestingCloud(false); }
  };

  const messageIsProgress = message.startsWith("Check") || message.includes("passed") || message.startsWith("Connecting") || message.startsWith("Testing");
  return <article className="admin-card integration-card"><span className="admin-kicker">Shared Account</span><strong>Supabase login</strong><p>{isSupabaseConfigured ? "Signed-in sessions automatically use shared cloud inventory. Local preview data is never uploaded automatically." : "Add the public Supabase URL and publishable key to enable login."}</p>{session ? <><div className="status-line"><span className="badge success">Signed in</span><small>{session.user.email}</small><span className={`badge ${repositoryMode === "cloud" ? "primary" : "warning"}`}>{loading ? "Loading cloud inventory…" : repositoryMode === "cloud" ? "Cloud inventory" : "Local fallback"}</span></div><div className="button-row"><button disabled={loading || testingCloud} onClick={testCloud}>{testingCloud ? "Testing…" : repositoryMode === "cloud" ? "Test cloud connection" : "Reconnect and test cloud"}</button><button disabled={loading || testingCloud} onClick={signOut}>Sign out</button></div></> : <form onSubmit={sendMagicLink}><label><span>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><button disabled={loading || !isSupabaseConfigured} type="submit">{loading ? "Checking…" : "Email sign-in link"}</button></form>}{message && <p className={messageIsProgress ? "" : "error-text"}>{message}</p>}</article>;
}

function EbaySettings() {
  const [baseUrl, setBaseUrl] = useState(() => readPreference("palletscanner.ebayApiBaseUrl", ""));
  const [token, setToken] = useState(() => sessionStorage.getItem("palletscanner.authToken") ?? "");
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const backupInput = useRef(null);

  const request = async (path, options = {}) => {
    if (!baseUrl.trim()) throw new Error("Enter the eBay backend URL first.");
    const response = await fetch(`${baseUrl.trim().replace(/\/$/, "")}${path}`, {
      ...options,
      headers: { ...(token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}), ...(options.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Backend returned ${response.status}.`);
    return body;
  };

  const checkStatus = async () => {
    setLoading(true); setMessage("");
    try { setStatus(await request("/ebay/status")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not check eBay status."); }
    finally { setLoading(false); }
  };

  const connect = async () => {
    setLoading(true); setMessage("");
    try {
      const result = await request("/ebay/connect-url");
      if (!result.authorizationUrl) throw new Error("The backend did not return a connection URL.");
      window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start eBay connection."); setLoading(false); }
  };

  const disconnect = async () => {
    setLoading(true); setMessage("");
    try { await request("/ebay/disconnect", { method: "POST" }); setStatus(await request("/ebay/status")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not disconnect eBay."); }
    finally { setLoading(false); }
  };

  const save = () => {
    localStorage.setItem("palletscanner.ebayApiBaseUrl", baseUrl.trim());
    sessionStorage.setItem("palletscanner.authToken", token.trim());
    setMessage("Settings saved for this browser.");
  };
  const downloadBackup = () => {
    const backup = { version: 1, exportedAt: new Date().toISOString(), ...repository.getSnapshot() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `palletscanner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const restoreBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup.version !== 1) throw new Error("This backup version is not supported.");
      if (!window.confirm(`Replace local dashboard data with ${backup.items?.length ?? 0} items and ${backup.pallets?.length ?? 0} pallets from this backup?`)) return;
      await repository.replaceSnapshot(backup);
      setMessage("Local data restored from backup.");
    } catch (restoreError) {
      setMessage(restoreError instanceof Error ? restoreError.message : "Could not restore this backup.");
    }
  };

  return (
    <section className="panel" id="settings">
      <div className="panel-heading"><div><p className="eyebrow">Administration</p><h3>Admin Settings</h3></div></div>
      <div className="admin-grid">
        <SupabaseAccount />
        <article className="admin-card integration-card">
          <strong>eBay Integration</strong>
          <p>Connect the dashboard to the protected PalletFlip marketplace backend.</p>
          <label><span>Backend URL</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com" /></label>
          <label><span>App auth token</span><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Session-only token" /></label>
          <div className="status-line"><span className={`badge ${status?.readyToList ? "success" : status?.connected ? "warning" : ""}`}>{loading ? "Checking…" : status?.readyToList ? "Ready to list" : status?.connected ? "Connected, setup incomplete" : status ? "Seller not connected" : "Not checked"}</span>{status && <small>{status.environment} · {status.marketplaceId}</small>}</div>
          {status?.readinessChecks?.length > 0 && <div className="check-list">{status.readinessChecks.map((check) => <div className="check-row" key={check.label}><span className={`check-dot ${check.ok ? "ok" : ""}`} /><span>{check.label}</span></div>)}</div>}
          <div className="button-row"><button onClick={save}>Save settings</button><button disabled={loading} onClick={checkStatus}>Check status</button><button disabled={loading} onClick={connect}>{status?.connected ? "Reconnect eBay" : "Connect eBay"}</button>{status?.connected && <button className="danger-button" disabled={loading} onClick={disconnect}>Disconnect</button>}</div>
          {message && <p className={message.includes("saved") ? "" : "error-text"}>{message}</p>}
        </article>
        <article className="admin-card"><strong>Billing</strong><p>Usage and plan controls belong here once hosting is selected.</p><span className="planned-chip">Planned for account setup</span></article>
        <article className="admin-card"><strong>Local data backup</strong><p>Download or restore pallets, inventory, active-pallet state, and activity history before moving to a hosted backend.</p><button onClick={downloadBackup}>Download JSON backup</button><button className="danger-button" onClick={() => backupInput.current?.click()}>Restore JSON backup</button><input ref={backupInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={restoreBackup} /></article>
      </div>
    </section>
  );
}

const activityLabels = {
  "pallet.created": "Pallet created",
  "pallet.updated": "Pallet updated",
  "pallet.deleted": "Pallet deleted",
  "item.created": "Item created",
  "item.updated": "Item updated",
  "item.deleted": "Item removed",
  "listing.updated": "Marketplace status updated",
  "data.restored": "Local backup restored",
};

function ActivityPanel({ snapshot }) {
  const [events, setEvents] = useState([]);
  useEffect(() => { repository.listActivity().then(setEvents).catch(() => setEvents([])); }, [snapshot]);
  return <section className="panel"><div className="panel-heading"><div><h3>Recent activity</h3><span>Shared history of important inventory and listing changes.</span></div></div><div className="activity-list">{events.length === 0 ? <div className="empty-queue"><strong>No changes yet</strong><span>Item, pallet, and listing changes will appear here.</span></div> : events.slice(0, 10).map((event) => <div className="activity-row" key={event.id}><div><strong>{activityLabels[event.type] ?? event.type}</strong><span>{event.details?.name ?? event.entityId}</span></div><time dateTime={new Date(event.occurredAt).toISOString()}>{new Date(event.occurredAt).toLocaleString()}</time></div>)}</div></section>;
}

const dashboardViews = ["overview", "pallets", "inventory", "listings", "activity", "settings"];
const viewCopy = {
  overview: ["Business overview", "Know what is selling, what is stuck, and what needs your decision."],
  pallets: ["Pallets", "Track the cost, recovery, and health of each purchase."],
  inventory: ["Inventory", "Search, review, and update every item in one focused workspace."],
  listings: ["Listings", "Move ready inventory onto marketplaces and catch aging items."],
  activity: ["Activity", "Review the shared audit trail across your operation."],
  settings: ["Settings", "Manage cloud access, marketplace connections, and backups."],
};
const navItems = dashboardViews.map((id) => [id, id[0].toUpperCase() + id.slice(1)]);

export function App() {
  const initialView = window.location.hash.slice(1);
  const [view, setView] = useState(dashboardViews.includes(initialView) ? initialView : "overview");
  const [snapshot, setSnapshot] = useState(() => repository.getSnapshot());
  const [query, setQuery] = useState(() => readPreference("palletscanner.inventorySearch", ""));
  const [statusFilter, setStatusFilter] = useState(() => readPreference("palletscanner.inventoryStatusFilter", "all"));
  const [platformFilter, setPlatformFilter] = useState(() => readPreference("palletscanner.inventoryPlatformFilter", "all"));
  const [palletFilter, setPalletFilter] = useState(() => readPreference("palletscanner.inventoryPalletFilter", "all"));
  const [sort, setSort] = useState(() => ({ column: readPreference("palletscanner.inventorySortColumn", "name"), direction: readPreference("palletscanner.inventorySortDirection", "asc") }));
  const [selectedId, setSelectedId] = useState(() => Number(readPreference("palletscanner.selectedInventoryItemId", "0")));
  const [creatingItem, setCreatingItem] = useState(false);

  useEffect(() => repository.subscribe(setSnapshot), []);
  useEffect(() => {
    const handleHashChange = () => {
      const nextView = window.location.hash.slice(1);
      if (dashboardViews.includes(nextView)) setView(nextView);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
  useEffect(() => {
    localStorage.setItem("palletscanner.inventorySearch", query);
    localStorage.setItem("palletscanner.inventoryStatusFilter", statusFilter);
    localStorage.setItem("palletscanner.inventoryPlatformFilter", platformFilter);
    localStorage.setItem("palletscanner.inventoryPalletFilter", palletFilter);
    localStorage.setItem("palletscanner.inventorySortColumn", sort.column);
    localStorage.setItem("palletscanner.inventorySortDirection", sort.direction);
  }, [query, statusFilter, platformFilter, palletFilter, sort]);

  const { items, pallets } = snapshot;
  const palletName = (id) => pallets.find((pallet) => pallet.id === id)?.name ?? "Unassigned";
  const totals = useMemo(() => summarizeInventory(items, pallets), [items, pallets]);
  const palletSummaries = useMemo(() => pallets.map((pallet) => summarizePallet(items, pallet)), [items, pallets]);
  const attention = items.filter((item) => getDisplayIssue(item));
  const marketplace = getMarketplaceQueueItems(items);
  const stale = getStaleInventoryItems(items);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const text = [item.name, palletName(item.palletId), item.condition, getDisplayPlatform(item), statusLabel[getDisplayStatus(item)]].join(" ").toLowerCase();
      return (!normalizedQuery || text.includes(normalizedQuery)) &&
        (statusFilter === "all" || getDisplayStatus(item) === statusFilter) &&
        (platformFilter === "all" || getDisplayPlatform(item).toLowerCase() === platformFilter.toLowerCase()) &&
        (palletFilter === "all" || item.palletId === palletFilter);
    });
    return [...filtered].sort((a, b) => {
      const value = (item) => sort.column === "pallet" ? palletName(item.palletId) : sort.column === "quantity" ? getQuantity(item) : sort.column === "age" ? getItemAgeDays(item) : sort.column === "low" || sort.column === "high" ? price(item, sort.column) : String(item[sort.column] ?? item.name).toLowerCase();
      const first = value(a); const second = value(b);
      const comparison = first < second ? -1 : first > second ? 1 : 0;
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [items, pallets, query, statusFilter, platformFilter, palletFilter, sort]);

  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const navigate = (nextView) => {
    setView(nextView);
    window.history.replaceState(null, "", `#${nextView}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const selectItem = (id) => { setSelectedId(id); localStorage.setItem("palletscanner.selectedInventoryItemId", String(id)); navigate("inventory"); };
  const changeSort = (column) => setSort((current) => ({ column, direction: current.column === column && current.direction === "asc" ? "desc" : "asc" }));
  const resetFilters = () => { setQuery(""); setStatusFilter("all"); setPlatformFilter("all"); setPalletFilter("all"); };
  const exportCsv = () => {
    const rows = [["Name", "Pallet", "Status", "Platform", "Quantity", "Low", "High", "Sold", "Age Days"], ...visibleItems.map((item) => [item.name, palletName(item.palletId), statusLabel[getDisplayStatus(item)], getDisplayPlatform(item), getQuantity(item), price(item, "low"), price(item, "high"), item.soldPrice ?? "", getItemAgeDays(item)])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "palletscanner-inventory.csv"; link.click(); URL.revokeObjectURL(url);
  };

  const SortButton = ({ column, children }) => <button className="sort-button" data-sort-direction={sort.column === column ? sort.direction : undefined} onClick={() => changeSort(column)}>{children}</button>;

  return (
    <div className="shell">
      <aside className="sidebar"><div><p className="eyebrow">From pallet to profit</p><h1>PalletFlip</h1></div><nav aria-label="Dashboard sections">{navItems.map(([id, label]) => <button className={view === id ? "active" : ""} key={id} onClick={() => navigate(id)}>{label}</button>)}</nav></aside>
      <main className="main">
        <header className="topbar"><div><p className="eyebrow">Business Dashboard</p><h2>{viewCopy[view][0]}</h2><span>{viewCopy[view][1]}</span></div>{view === "inventory" && <button onClick={exportCsv}>Export inventory</button>}</header>
        {view === "overview" && <div className="view-stack"><section className="metrics-grid">
          <Metric label="Inventory" value={totals.totalItems} /><Metric label="Sell-through" value={`${totals.sellThrough.toFixed(0)}%`} tone="success" /><Metric label="Sold revenue" value={currency(totals.soldRevenue)} /><Metric label="Pallet cost" value={currency(totals.totalCost)} />
          <Metric label="Remaining value" value={`${currency(totals.remainingLow)}–${currency(totals.remainingHigh)}`} /><Metric label="Gross profit" value={currency(totals.grossProfit)} tone={totals.grossProfit >= 0 ? "success" : "danger"} /><Metric label="Needs Facebook" value={totals.needsFacebook} tone="warning" onClick={() => { setPlatformFilter("Facebook"); navigate("inventory"); }} /><Metric label="Needs eBay" value={totals.needsEbay} tone="warning" onClick={() => { setPlatformFilter("eBay"); navigate("inventory"); }} />
        </section>
        <Queue title="Attention Queue" subtitle="Items missing information needed for a business decision." items={attention} empty="Attention queue is clear" onSelect={selectItem} renderMeta={(item) => statusLabel[getDisplayStatus(item)]} />
        </div>}
        {view === "pallets" && <PalletManager pallets={pallets} summaries={palletSummaries} activePalletId={snapshot.activePalletId} selectedPalletId={palletFilter} onFilter={(id) => { setPalletFilter(id); navigate("inventory"); }} />}
        {view === "listings" && <div className="view-stack"><Queue title="Marketplace review queue" subtitle="Items that still need Facebook or eBay work." items={marketplace} empty="Marketplace queue is clear" onSelect={selectItem} renderMeta={getDisplayPlatform} />
        <Queue title="Aging inventory" subtitle="Unsold items older than 14 days." items={stale} empty="No stale inventory" onSelect={selectItem} renderMeta={(item) => `${getItemAgeDays(item)} days`} />
        </div>}
        {view === "inventory" && <section className="panel table-panel" id="inventory">
          <div className="panel-heading"><div><h3>Inventory</h3><span>Desktop-first review table</span></div><div className="inventory-tools"><span>{visibleItems.length} items</span><button disabled={pallets.length === 0} onClick={() => setCreatingItem(true)}>New item</button><button onClick={exportCsv}>Export CSV</button><button className="reset-filter-button" onClick={resetFilters}>Reset</button></div></div>
          <div className="inventory-tools"><input aria-label="Search inventory" placeholder="Search inventory" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Platform filter" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">All platforms</option><option>Facebook</option><option>eBay</option><option>Review</option></select><select aria-label="Pallet filter" value={palletFilter} onChange={(event) => setPalletFilter(event.target.value)}><option value="all">All pallets</option>{pallets.map((pallet) => <option key={pallet.id} value={pallet.id}>{pallet.name}</option>)}</select></div>
          {palletFilter !== "all" && <div className="inventory-context"><strong>Filtered Pallet: {palletName(palletFilter)}</strong><button onClick={() => setPalletFilter("all")}>Show all</button></div>}
          <table><thead><tr><th><SortButton column="name">Item</SortButton></th><th><SortButton column="pallet">Pallet</SortButton></th><th>Status</th><th>Platform</th><th><SortButton column="quantity">Quantity</SortButton></th><th><SortButton column="low">Low</SortButton></th><th><SortButton column="high">High</SortButton></th><th><SortButton column="age">Age Days</SortButton></th></tr></thead><tbody>{visibleItems.length === 0 ? <tr><td className="empty-table-cell" colSpan="8">No inventory matches these filters.</td></tr> : visibleItems.map((item) => <tr tabIndex="0" className={selected?.id === item.id ? "selected-row" : ""} key={item.id} onClick={() => selectItem(item.id)}><td><strong>{item.name}</strong></td><td>{palletName(item.palletId)}</td><td><span className={`badge ${statusClass[getDisplayStatus(item)]}`}>{statusLabel[getDisplayStatus(item)]}</span></td><td>{getDisplayPlatform(item)}</td><td>{getQuantity(item)}</td><td>{currency(price(item, "low"))}</td><td>{currency(price(item, "high"))}</td><td>{getItemAgeDays(item)}</td></tr>)}</tbody></table>
          {creatingItem ? <NewItemForm pallets={pallets} defaultPalletId={palletFilter !== "all" ? palletFilter : snapshot.activePalletId ?? pallets[0]?.id ?? ""} onCancel={() => setCreatingItem(false)} onCreated={(id) => { setCreatingItem(false); resetFilters(); selectItem(id); }} /> : <InventoryDetail item={selected} palletName={selected ? palletName(selected.palletId) : ""} pallets={pallets} onSave={(item) => repository.saveItem(item)} onRemove={(id) => repository.removeItem(id)} />}
        </section>}
        {view === "settings" && <EbaySettings />}
        {view === "activity" && <ActivityPanel snapshot={snapshot} />}
      </main>
    </div>
  );
}
