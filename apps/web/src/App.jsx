import { useEffect, useMemo, useRef, useState } from "react";

import {
  currency,
  getDisplayIssue,
  getDisplayPlatform,
  getDisplayStatus,
  getItemAgeDays,
  getQuantity,
  statusClass,
  statusLabel,
  summarizeInventory,
  summarizePallet,
} from "./dashboard-model.js";
import { getRepositoryMode, repository, useCloudRepository, useLocalRepository } from "./repository-router.js";
import { isSupabaseConfigured, supabase } from "./supabase.js";
import { buildAnalytics } from "./analytics-model.js";
import { reconcileEbayPreview } from "./ebay-reconciliation.js";
import { ActivityPanel } from "./activity-panel.jsx";
import { PalletManager } from "./pallet-manager.jsx";
import {
  EbayRequirementsDialog,
  ItemThumbnail,
  Metric,
  PerformanceTable,
} from "./dashboard-components.jsx";
import {
  MAX_ITEM_PHOTOS,
  analyzeItemPhotos,
  getEbayListingRequirements,
  postItemToEbay,
  preferredListingPrice,
  preferredMarketplace,
  readPreference,
  resizePhoto,
} from "./web-services.js";

const price = (item, field) => item[field] ?? item[`${field}_price`] ?? 0;
const isReviewEligible = (item) => item.soldPrice === null && !["ready", "sold"].includes(getDisplayStatus(item));
const matchesWorkFilter = (item, filter) => {
  if (filter === "inventory") return (item.shortage ?? 0) > 0 || (item.available ?? item.quantity ?? 0) < 0 || (item.reserved ?? 0) < 0 || (item.onHand ?? item.quantity ?? 0) < 0;
  if (!isReviewEligible(item)) return false;
  if (filter === "decision") return Boolean(getDisplayIssue(item));
  if (filter === "failed") return item.ebayStatus === "error" || item.facebookStatus === "error";
  if (filter === "aging") return getItemAgeDays(item) > 14;
  return Boolean(getDisplayIssue(item));
};

const itemDraft = (item) => ({
  name: item.name ?? "",
  category: item.category ?? "Uncategorized",
  condition: item.condition ?? "",
  palletId: item.palletId ?? "",
  quantity: String(getQuantity(item)),
  quantityReason: "",
  storageLocation: item.storageLocation ?? "",
  low: String(price(item, "low")),
  high: String(price(item, "high")),
  floor: String(price(item, "floor")),
  status: getDisplayStatus(item),
  platform: getDisplayPlatform(item),
  soldPrice: item.soldPrice == null ? "" : String(item.soldPrice),
  listing_title: item.listing_title ?? "",
  listing_description: item.listing_description ?? "",
  ebayItemSpecifics: { ...(item.ebayItemSpecifics ?? {}) },
});

function PhotoReview({ item, onSave }) {
  const photos = item.photos?.length ? item.photos : item.photo ? [item.photo] : [];
  const inputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const addPhotos = async (event) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setWorking("Adding photos…"); setError("");
    try {
      const added = await Promise.all(files.slice(0, MAX_ITEM_PHOTOS - photos.length).map(resizePhoto));
      const nextPhotos = [...photos, ...added].slice(0, MAX_ITEM_PHOTOS);
      await onSave({ ...item, photo: nextPhotos[0] ?? null, photos: nextPhotos, status: getDisplayStatus(item) === "needs_photos" ? "needs_review" : item.status });
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Could not add the photos."); }
    finally { setWorking(""); }
  };
  const removePhoto = async (index) => {
    const nextPhotos = photos.filter((_, photoIndex) => photoIndex !== index);
    setWorking("Removing photo…"); setError("");
    try { await onSave({ ...item, photo: nextPhotos[0] ?? null, photos: nextPhotos }); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Could not remove the photo."); }
    finally { setWorking(""); }
  };
  const analyze = async () => {
    setWorking("Analyzing photos…"); setError("");
    try {
      const result = await analyzeItemPhotos(item, photos);
      const low = Number(result.low_price); const high = Number(result.high_price); const floor = Number(result.floor_price);
      const nextLow = Number.isFinite(low) ? low : price(item, "low");
      const nextHigh = Number.isFinite(high) ? high : price(item, "high");
      await onSave({
        ...item,
        name: result.name?.trim() || item.name,
        category: result.category?.trim() || item.category,
        condition: result.condition?.trim() || item.condition,
        low: nextLow, low_price: nextLow,
        high: nextHigh, high_price: nextHigh,
        listing_price: preferredListingPrice(nextLow, nextHigh),
        floor: Number.isFinite(floor) ? floor : price(item, "floor"), floor_price: Number.isFinite(floor) ? floor : price(item, "floor"),
        platform: preferredMarketplace(result.best_platform?.trim() || item.platform), best_platform: preferredMarketplace(result.best_platform?.trim() || item.best_platform),
        listing_title: result.listing_title?.trim() || item.listing_title,
        listing_description: result.listing_description?.trim() || item.listing_description,
        listing_title_ebay: result.listing_title_ebay?.trim() || item.listing_title_ebay,
        listing_description_ebay: result.listing_description_ebay?.trim() || item.listing_description_ebay,
        listing_title_facebook: result.listing_title_facebook?.trim() || item.listing_title_facebook,
        listing_description_facebook: result.listing_description_facebook?.trim() || item.listing_description_facebook,
        ebayItemSpecifics: { ...(item.ebayItemSpecifics ?? {}), ...(result.ebay_item_specifics ?? {}) },
        status: "needs_review",
      });
    } catch (analysisError) { setError(analysisError instanceof Error ? analysisError.message : "AI could not analyze these photos."); }
    finally { setWorking(""); }
  };
return <section className="photo-review"><div className="card-row"><div><strong>Listing photos</strong><span>{photos.length === 0 ? "No photos attached" : `${photos.length} photo${photos.length === 1 ? "" : "s"} available`}</span></div><span className={`badge ${photos.length > 0 ? "success" : "warning"}`}>{photos.length > 0 ? "Review" : "Needed"}</span></div>{photos.length > 0 ? <div className="photo-grid">{photos.map((uri, index) => <div className="photo-tile" key={`${uri.slice(0, 40)}-${index}`}>{uri.startsWith("mock://") ? <div className="photo-placeholder"><span>Photo {index + 1}</span><small>Preview fixture</small></div> : <img src={uri} alt={`${item.name} listing photo ${index + 1}`} />}<button type="button" className="photo-remove" aria-label={`Remove photo ${index + 1}`} title="Remove photo" disabled={Boolean(working)} onClick={() => removePhoto(index)}>×</button></div>)}</div> : <p className="detail-issue">Add photos to identify the item and prepare its listing.</p>}<input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={addPhotos} /><input ref={inputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={addPhotos} /><div className="photo-actions"><button type="button" disabled={Boolean(working) || photos.length >= MAX_ITEM_PHOTOS} onClick={() => cameraInputRef.current?.click()}>Take photo</button><button type="button" disabled={Boolean(working) || photos.length >= MAX_ITEM_PHOTOS} onClick={() => inputRef.current?.click()}>Upload</button><button type="button" className="primary-button" disabled={Boolean(working) || !photos.some((uri) => uri.startsWith("data:"))} onClick={analyze}>{working === "Analyzing photos…" ? working : "Analyze with AI"}</button></div>{working && working !== "Analyzing photos…" && <small>{working}</small>}{error && <p className="error-text">{error}</p>}</section>;
}

function AddItemDialog({ pallets, activePalletId, onCancel, onCreate }) {
  const [draft, setDraft] = useState({ name: "", category: "Uncategorized", palletId: activePalletId || pallets[0]?.id || "", condition: "Details need review", quantity: "1", low: "0", high: "0", floor: "0", platform: "Review", listing_title: "", listing_description: "", listing_title_ebay: "", listing_description_ebay: "", listing_title_facebook: "", listing_description_facebook: "" });
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [ebayQuestions, setEbayQuestions] = useState([]);
  const [ebayItemSpecifics, setEbayItemSpecifics] = useState({});
  const [showEbayQuestions, setShowEbayQuestions] = useState(false);
  const photoInput = useRef(null);
  const cameraInput = useRef(null);
  const update = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const addPhotos = async (event) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setError("");
    try { setPhotos((current) => current); const added = await Promise.all(files.slice(0, MAX_ITEM_PHOTOS - photos.length).map(resizePhoto)); setPhotos((current) => [...current, ...added].slice(0, MAX_ITEM_PHOTOS)); }
    catch (photoError) { setError(photoError instanceof Error ? photoError.message : "Could not add the photos."); }
  };
  const analyze = async () => {
    setAnalyzing(true); setError("");
    try {
      const result = await analyzeItemPhotos({ name: draft.name, category: draft.category, condition: draft.condition, listing_title: draft.listing_title }, photos);
      const nextDraft = {
        ...draft,
        name: result.name?.trim() || draft.name,
        category: result.category?.trim() || draft.category,
        condition: result.condition?.trim() || draft.condition,
        low: Number.isFinite(Number(result.low_price)) ? String(result.low_price) : draft.low,
        high: Number.isFinite(Number(result.high_price)) ? String(result.high_price) : draft.high,
        floor: Number.isFinite(Number(result.floor_price)) ? String(result.floor_price) : draft.floor,
        platform: preferredMarketplace(result.best_platform?.trim() || draft.platform),
        listing_title: result.listing_title?.trim() || draft.listing_title,
        listing_description: result.listing_description?.trim() || draft.listing_description,
        listing_title_ebay: result.listing_title_ebay?.trim() || draft.listing_title_ebay,
        listing_description_ebay: result.listing_description_ebay?.trim() || draft.listing_description_ebay,
        listing_title_facebook: result.listing_title_facebook?.trim() || draft.listing_title_facebook,
        listing_description_facebook: result.listing_description_facebook?.trim() || draft.listing_description_facebook,
      };
      setDraft(nextDraft);
      const requirements = await getEbayListingRequirements({
        ...nextDraft,
        listing_title: nextDraft.listing_title_ebay || nextDraft.listing_title || nextDraft.name,
        listing_description: nextDraft.listing_description_ebay || nextDraft.listing_description,
        ebayItemSpecifics: { ...ebayItemSpecifics, ...(result.ebay_item_specifics ?? {}) },
      });
      setEbayItemSpecifics((current) => ({ ...current, ...(result.ebay_item_specifics ?? {}), ...(requirements.itemSpecifics ?? {}) }));
      const reviewFields = requirements.fields ?? requirements.questions ?? [];
      setEbayQuestions(reviewFields);
      setShowEbayQuestions(reviewFields.length > 0);
    } catch (analysisError) { setError(analysisError instanceof Error ? analysisError.message : "AI could not analyze these photos."); }
    finally { setAnalyzing(false); }
  };
  const submit = async (event) => {
    event.preventDefault();
    const quantity = Number(draft.quantity);
    const low = Number(draft.low); const high = Number(draft.high); const floor = Number(draft.floor);
    if (!draft.palletId) return setError("Choose a pallet first.");
    if (!Number.isInteger(quantity) || quantity < 1) return setError("Quantity must be a whole number of at least 1.");
    if (![low, high, floor].every((value) => Number.isFinite(value) && value >= 0)) return setError("Prices must be valid non-negative numbers.");
    if (high < low) return setError("High price cannot be lower than low price.");
    setSaving(true); setError("");
    try {
      await onCreate({
        id: Date.now(),
        name: draft.name.trim() || "New item",
        category: draft.category.trim() || "Uncategorized",
        condition: draft.condition.trim() || "Details need review",
        palletId: draft.palletId,
        quantity,
        low, high, floor,
        low_price: low, high_price: high, floor_price: floor,
        listing_price: preferredListingPrice(low, high),
        status: "needs_review",
        platform: draft.platform,
        best_platform: draft.platform,
        soldPrice: null,
        photo: photos[0] ?? null,
        photos,
        listedPlatforms: [],
        listing_title: draft.listing_title.trim(),
        listing_description: draft.listing_description.trim(),
        listing_title_ebay: draft.listing_title_ebay.trim(),
        listing_description_ebay: draft.listing_description_ebay.trim(),
        listing_title_facebook: draft.listing_title_facebook.trim(),
        listing_description_facebook: draft.listing_description_facebook.trim(),
        ebayItemSpecifics,
      });
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Could not add the item."); setSaving(false); }
  };
  return <><div className="modal-backdrop" role="presentation" onMouseDown={onCancel}><form className="edit-modal item-edit-modal add-item-modal" role="dialog" aria-modal="true" aria-labelledby="add-item-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div><h3 id="add-item-title">Add item</h3><p>Add pictures first and let AI prepare the item record. Everything remains editable before saving.</p></div><section className="add-item-photos"><input ref={cameraInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={addPhotos} /><input ref={photoInput} className="visually-hidden" type="file" accept="image/*" multiple onChange={addPhotos} />{photos.length > 0 && <div className="photo-grid">{photos.map((uri, index) => <div className="photo-tile" key={index}><img src={uri} alt={`New item photo ${index + 1}`} /><button type="button" className="photo-remove" aria-label={`Remove photo ${index + 1}`} onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}>×</button></div>)}</div>}<div className="photo-actions"><button type="button" disabled={saving || analyzing || photos.length >= MAX_ITEM_PHOTOS} onClick={() => cameraInput.current?.click()}>Take photo</button><button type="button" disabled={saving || analyzing || photos.length >= MAX_ITEM_PHOTOS} onClick={() => photoInput.current?.click()}>Upload</button><button type="button" className="primary-button" disabled={saving || analyzing || photos.length === 0} onClick={analyze}>{analyzing ? "Analyzing…" : "Analyze with AI"}</button></div></section><div className="edit-grid"><label className="wide-field"><span>Name</span><input value={draft.name} onChange={update("name")} placeholder="AI will fill this from the pictures" /></label><label><span>Category</span><input value={draft.category} onChange={update("category")} /></label><label><span>Condition</span><input value={draft.condition} onChange={update("condition")} /></label><label><span>Pallet</span><select value={draft.palletId} onChange={update("palletId")}>{pallets.map((pallet) => <option key={pallet.id} value={pallet.id}>{pallet.name}</option>)}</select></label><label><span>Quantity</span><input type="number" min="1" step="1" value={draft.quantity} onChange={update("quantity")} /></label><label><span>Low price</span><input type="number" min="0" step="0.01" value={draft.low} onChange={update("low")} /></label><label><span>High price</span><input type="number" min="0" step="0.01" value={draft.high} onChange={update("high")} /></label><label><span>Floor price</span><input type="number" min="0" step="0.01" value={draft.floor} onChange={update("floor")} /></label><label><span>Platform</span><select value={draft.platform} onChange={update("platform")}><option>Review</option><option>eBay</option><option>Facebook</option></select></label><label className="wide-field"><span>Listing title</span><input value={draft.listing_title} onChange={update("listing_title")} /></label><label className="wide-field"><span>Listing description</span><textarea rows="4" value={draft.listing_description} onChange={update("listing_description")} /></label></div>{Object.entries(ebayItemSpecifics).some(([, value]) => String(value).trim()) && <section className="required-details"><strong>eBay details</strong><div className="edit-grid">{Object.entries(ebayItemSpecifics).filter(([, value]) => String(value).trim()).map(([key, value]) => <label key={key}><span>{key}</span><input value={value} onChange={(event) => setEbayItemSpecifics((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div></section>}{error && <p className="error-text">{error}</p>}<div className="button-row"><button type="button" disabled={saving || analyzing} onClick={onCancel}>Cancel</button><button className="primary-button" type="submit" disabled={saving || analyzing}>{saving ? "Adding…" : "Add item"}</button></div></form></div>{showEbayQuestions && <EbayRequirementsDialog questions={ebayQuestions} answers={ebayItemSpecifics} onChange={(key, value) => setEbayItemSpecifics((current) => ({ ...current, [key]: value }))} onFinishLater={() => setShowEbayQuestions(false)} onSave={() => setShowEbayQuestions(false)} />}</>;
}

function ListingReview({ item, onSave }) {
  const [savingPlatform, setSavingPlatform] = useState(null);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
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
  const completeEbayPublish = async (candidate) => {
    const result = await postItemToEbay(candidate);
    await onSave({ ...candidate, ebayStatus: "active", ebayOfferId: result.offerId, ebayListingId: result.listingId, ebayListingUrl: result.listingUrl, ebayLastError: null, ebayUpdatedAt: Date.now(), listedPlatforms: [...new Set([...(candidate.listedPlatforms ?? []), "ebay"])] });
  };
  const publishEbay = async () => {
    if (!window.confirm(`Publish ${item.name} to eBay for ${currency(item.listing_price ?? price(item, "high"))}?`)) return;
    setSavingPlatform("ebay-post"); setError("");
    try {
      await onSave({ ...item, ebayStatus: "posting", ebayLastError: null, ebayUpdatedAt: Date.now() });
      const requirements = await getEbayListingRequirements(item);
      if (requirements.status === "needs_input") {
        setAnswers(Object.fromEntries(requirements.questions.map((question) => [question.key, item.ebayItemSpecifics?.[question.key] ?? ""])));
        setQuestions(requirements.questions);
        return;
      }
      await completeEbayPublish({ ...item, ebayItemSpecifics: { ...(item.ebayItemSpecifics ?? {}), ...(requirements.itemSpecifics ?? {}) } });
    } catch (publishError) {
      const message = publishError instanceof Error ? publishError.message : "Could not publish this eBay listing.";
      setError(message);
    } finally { setSavingPlatform(null); }
  };
  const submitAnswers = async (event) => {
    event.preventDefault();
    const missing = questions.find((question) => question.required && !String(answers[question.key] ?? "").trim());
    if (missing) return setError(`${missing.label} is required.`);
    setSavingPlatform("ebay-questions"); setError("");
    const candidate = { ...item, ebayItemSpecifics: { ...(item.ebayItemSpecifics ?? {}), ...answers } };
    try {
      await onSave(candidate);
      await completeEbayPublish(candidate);
      setQuestions([]);
    } catch (publishError) { setError(publishError instanceof Error ? publishError.message : "Could not publish this eBay listing."); }
    finally { setSavingPlatform(null); }
  };
  const openFacebookDraft = async () => {
    setSavingPlatform("facebook-open"); setError("");
    const title = item.listing_title_facebook || item.listing_title || item.name;
    const description = item.listing_description_facebook || item.listing_description || item.description || "";
    try {
      await navigator.clipboard.writeText(`${title}\n\n${description}`.trim());
      window.open("https://www.facebook.com/marketplace/create/item", "_blank", "noopener,noreferrer");
    } catch { setError("Facebook Marketplace could not be opened. Check browser popup and clipboard permissions."); }
    finally { setSavingPlatform(null); }
  };
  return <><section className="photo-review"><div className="card-row"><div><strong>Marketplace actions</strong><span>Publish to eBay or prepare the Facebook Marketplace draft.</span></div></div><div className="marketplace-action"><div><strong>eBay</strong><span>{item.ebayListingId ? `Listing ${item.ebayListingId}` : "Checks current eBay requirements before publishing."}</span></div>{item.ebayListingUrl ? <a className="button-link" href={item.ebayListingUrl} target="_blank" rel="noreferrer">View eBay listing</a> : <button className="primary-button" disabled={savingPlatform !== null} onClick={publishEbay}>{savingPlatform === "ebay-post" ? "Checking…" : "Post to eBay"}</button>}</div><div className="marketplace-action"><div><strong>Facebook Marketplace</strong><span>Copies the listing text and opens Facebook’s item composer.</span></div><button disabled={savingPlatform !== null} onClick={openFacebookDraft}>{savingPlatform === "facebook-open" ? "Opening…" : "Open Facebook draft"}</button></div><div className="marketplace-confirm"><span>{item.listedPlatforms.includes("facebook") ? "Marked as listed on Facebook" : "After publishing on Facebook, confirm it here."}</span><button disabled={savingPlatform !== null} onClick={() => updatePlatform("facebook")}>{savingPlatform === "facebook" ? "Saving…" : item.listedPlatforms.includes("facebook") ? "Remove listed mark" : "Mark listed"}</button></div>{error && <p className="error-text">{error}</p>}{item.ebayLastError && item.ebayStatus === "error" && <p className="error-text">eBay: {item.ebayLastError}</p>}{item.facebookLastError && <p className="error-text">Facebook: {item.facebookLastError}</p>}</section>{questions.length > 0 && <div className="modal-backdrop" role="presentation"><form className="edit-modal ebay-questions-modal" role="dialog" aria-modal="true" aria-labelledby="ebay-questions-title" onSubmit={submitAnswers}><div><h3 id="ebay-questions-title">A few details before posting</h3><p>eBay requires these details for the selected category. PalletFlip will save your answers with this item.</p></div>{questions.map((question) => <label key={question.key}><span>{question.label}</span>{question.type === "select" ? <select autoFocus value={answers[question.key] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))}><option value="">Select an answer</option>{question.options.map((option) => <option key={option}>{option}</option>)}</select> : <input autoFocus value={answers[question.key] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))} />}<small>{question.reason}</small></label>)}{error && <p className="error-text">{error}</p>}<div className="button-row"><button type="button" disabled={savingPlatform !== null} onClick={() => { setQuestions([]); setError(""); }}>Cancel</button><button className="primary-button" type="submit" disabled={savingPlatform !== null}>{savingPlatform === "ebay-questions" ? "Publishing…" : "Save and publish"}</button></div></form></div>}</>;
}

function RecordSale({ item, onRecorded }) {
  const [open, setOpen] = useState(false);
  const [recordedSales, setRecordedSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ marketplace: "facebook", quantity: "1", soldPrice: item.soldPrice == null ? "" : String(item.soldPrice), fees: "0", shippingCost: "0", soldAt: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; setLoading(true); repository.listSales(item.id).then((sales) => { if (active) setRecordedSales(sales); }).catch(() => { if (active) setRecordedSales([]); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [item.id, item.soldPrice]);
  const update = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    const quantity = Number(draft.quantity); const soldPrice = Number(draft.soldPrice); const fees = Number(draft.fees); const shippingCost = Number(draft.shippingCost); const soldAt = Date.parse(`${draft.soldAt}T12:00:00`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > getQuantity(item)) return setError(`Quantity must be between 1 and ${getQuantity(item)}.`);
    if (![soldPrice, fees, shippingCost].every((value) => Number.isFinite(value) && value >= 0) || !Number.isFinite(soldAt)) return setError("Enter a valid sale price, costs, and date.");
    setSaving(true); setError("");
    try {
      await repository.recordSale({ itemId: item.id, marketplace: draft.marketplace, quantity, soldPrice, fees, shippingCost, soldAt });
      setRecordedSales(await repository.listSales(item.id));
      setOpen(false);
      onRecorded();
    } catch (saleError) { setError(saleError instanceof Error ? saleError.message : "Could not record the sale."); }
    finally { setSaving(false); }
  };
  const hasDetailedSale = recordedSales.some((sale) => !sale.id.startsWith("preview-sale-") && !sale.id.startsWith("legacy-sale-"));
  if (loading) return <section className="sale-card"><div><strong>Checking sale details…</strong></div></section>;
  if (item.soldPrice !== null && hasDetailedSale) return <section className="sale-card"><div><strong>Sold for {currency(item.soldPrice)}</strong><span>The complete sale appears in Analysis.</span></div></section>;
  return <><section className="sale-card"><div><strong>{item.soldPrice === null ? "Did this item sell?" : `Sold for ${currency(item.soldPrice)}`}</strong><span>{item.soldPrice === null ? "Record the marketplace, quantity, and costs to improve your analysis." : "Add the missing marketplace, costs, and date so this sale can be analyzed accurately."}</span></div><button className="primary-button" onClick={() => setOpen(true)}>{item.soldPrice === null ? "Record sale" : "Complete sale details"}</button></section>{open && <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}><form className="edit-modal item-edit-modal" role="dialog" aria-modal="true" aria-labelledby="record-sale-title" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div><h3 id="record-sale-title">Record sale</h3><p>Gross price minus fees and shipping becomes net proceeds.</p></div><div className="edit-grid"><label><span>Marketplace</span><select value={draft.marketplace} onChange={update("marketplace")}><option value="facebook">Facebook</option><option value="ebay">eBay</option><option value="other">Other</option></select></label><label><span>Quantity</span><input required type="number" min="1" max={getQuantity(item)} step="1" value={draft.quantity} onChange={update("quantity")} /></label><label><span>Total sold price</span><input autoFocus required type="number" min="0" step="0.01" value={draft.soldPrice} onChange={update("soldPrice")} /></label><label><span>Marketplace fees</span><input type="number" min="0" step="0.01" value={draft.fees} onChange={update("fees")} /></label><label><span>Shipping cost</span><input type="number" min="0" step="0.01" value={draft.shippingCost} onChange={update("shippingCost")} /></label><label><span>Sold date</span><input required type="date" value={draft.soldAt} onChange={update("soldAt")} /></label></div>{error && <p className="error-text">{error}</p>}<div className="button-row"><button type="button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Recording…" : "Save sale"}</button></div></form></div>}</>;
}

function InventoryHistory({ item }) {
  const [movements, setMovements] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([repository.listMovements(item.id), repository.listReservations(item.id)])
      .then(([movementRows, reservationRows]) => { if (active) { setMovements(movementRows); setReservations(reservationRows); } })
      .catch((historyError) => { if (active) setError(historyError instanceof Error ? historyError.message : "Could not load inventory history."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [item.id, item.available, item.quantity, refreshKey]);

  const placeHold = async () => {
    const quantityAnswer = window.prompt("How many units should be held?", "1");
    if (quantityAnswer === null) return;
    const quantity = Number(quantityAnswer);
    if (!Number.isInteger(quantity) || quantity < 1) return setError("Hold quantity must be a whole number of at least 1.");
    const reason = window.prompt("Why are these units being held?", "Manual inventory hold");
    if (reason === null || !reason.trim()) return setError("A hold reason is required.");
    setWorking(true); setError("");
    try { await repository.reserveItem(item.id, quantity, reason); setRefreshKey((current) => current + 1); }
    catch (holdError) { setError(holdError instanceof Error ? holdError.message : "Could not place the inventory hold."); }
    finally { setWorking(false); }
  };
  const releaseHold = async (reservationId) => {
    setWorking(true); setError("");
    try { await repository.releaseReservation(reservationId); setRefreshKey((current) => current + 1); }
    catch (releaseError) { setError(releaseError instanceof Error ? releaseError.message : "Could not release the inventory hold."); }
    finally { setWorking(false); }
  };

  if (loading) return <p>Loading inventory history…</p>;
  const activeReservations = reservations.filter((reservation) => ["active", "shortage"].includes(reservation.state));
  return <div><div className="detail-grid"><div><span>On hand</span><strong>{item.onHand ?? item.quantity}</strong></div><div><span>Reserved</span><strong>{item.reserved ?? 0}</strong></div><div><span>Available</span><strong>{item.available ?? item.quantity}</strong></div><div><span>Shortage</span><strong>{item.shortage ?? 0}</strong></div></div><div className="button-row"><button disabled={working || item.archivedAt || getQuantity(item) < 1} onClick={placeHold}>Place inventory hold</button></div>{error && <p className="error-text">{error}</p>}{activeReservations.map((reservation) => <section className="sale-card" key={reservation.id}><div><strong>{reservation.reservedQuantity} held{reservation.shortageQuantity > 0 ? ` · ${reservation.shortageQuantity} short` : ""}</strong><span>{reservation.reason || "Inventory hold"}</span></div><button disabled={working} onClick={() => releaseHold(reservation.id)}>Release hold</button></section>)}{!error && movements.length === 0 && <p>No quantity movements have been recorded yet.</p>}{movements.map((movement) => <section className="sale-card" key={movement.id}><div><strong>{movement.quantity > 0 ? "+" : ""}{movement.quantity} · {movement.type.replaceAll("_", " ")}</strong><span>{movement.reason || "Inventory movement"} · {new Date(movement.occurredAt).toLocaleString()}</span></div></section>)}</div>;
}

function InventoryDetail({ item, palletName, pallets, onSave, onRemove, onSaleRecorded, onClose, allowEditing = true, showWorkflowActions = true, locationTrackingEnabled = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => item ? itemDraft(item) : null);
  const [detailTab, setDetailTab] = useState("details");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(item ? itemDraft(item) : null);
    setEditing(false);
    setDetailTab("details");
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
    const quantityChanged = quantity !== getQuantity(item);
    const persistedQuantity = item.quantity + (quantity - getQuantity(item));
    if (!draft.name.trim() || !draft.condition.trim()) return setError("Name and condition are required.");
    if (!Number.isInteger(quantity) || quantity < 1) return setError("Quantity must be a whole number of at least 1.");
    if (quantityChanged && !draft.quantityReason.trim()) return setError("Choose a reason whenever you change quantity.");
    if (![low, high, floor].every((value) => Number.isFinite(value) && value >= 0)) return setError("Prices must be valid non-negative numbers.");
    if (high < low) return setError("High price cannot be lower than low price.");
    if (soldPrice !== null && (!Number.isFinite(soldPrice) || soldPrice < 0)) return setError("Sold price must be blank or a valid non-negative number.");
    setSaving(true); setError("");
    try {
      await onSave({
        ...item,
        name: draft.name.trim(),
        category: draft.category.trim() || "Uncategorized",
        condition: draft.condition.trim(),
        palletId: draft.palletId,
        storageLocation: locationTrackingEnabled ? draft.storageLocation.trim() || undefined : item.storageLocation,
        quantity: persistedQuantity,
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
        ebayItemSpecifics: { ...(draft.ebayItemSpecifics ?? {}) },
      }, { quantityReason: quantityChanged ? draft.quantityReason.trim() : undefined });
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
    if (!window.confirm(`Archive ${item.name}? It will leave active inventory but keep its history.`)) return;
    await onRemove(item.id);
  };
  const restore = async () => {
    await onSave({ ...item, archivedAt: null });
  };

  const closeEdit = () => { setDraft(itemDraft(item)); setEditing(false); setError(""); };
  const editDialog = editing ? (
    <div className="modal-backdrop" role="presentation" onMouseDown={closeEdit}>
    <form className="edit-modal item-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-item-title" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
      <div className="panel-heading"><div><h3 id="edit-item-title">Edit item</h3><span>Update the selected inventory record.</span></div></div>
      <div className="edit-grid">
        <label><span>Name</span><input value={draft.name} onChange={update("name")} /></label>
        <label><span>Category</span><input value={draft.category} onChange={update("category")} placeholder="Tools, Electronics, Furniture…" /></label>
        <label><span>Condition</span><input value={draft.condition} onChange={update("condition")} /></label>
        <label><span>Pallet</span><select value={draft.palletId} onChange={update("palletId")}>{pallets.map((pallet) => <option key={pallet.id} value={pallet.id}>{pallet.name}</option>)}</select></label>
        {locationTrackingEnabled && <label><span>Storage location</span><input value={draft.storageLocation} onChange={update("storageLocation")} placeholder="Garage / Rack 2" /></label>}
        <label><span>Available quantity</span><input type="number" min="1" step="1" value={draft.quantity} onChange={update("quantity")} /></label>
        {Number(draft.quantity) !== getQuantity(item) && <label className="wide-field"><span>Quantity adjustment reason</span><select required value={draft.quantityReason} onChange={update("quantityReason")}><option value="">Choose a reason</option><option>Count correction</option><option>Found additional units</option><option>Damaged or lost</option><option>Returned to supplier</option><option>Other manual adjustment</option></select></label>}
        <label><span>Low price</span><input type="number" min="0" step="0.01" value={draft.low} onChange={update("low")} /></label>
        <label><span>High price</span><input type="number" min="0" step="0.01" value={draft.high} onChange={update("high")} /></label>
        <label><span>Floor price</span><input type="number" min="0" step="0.01" value={draft.floor} onChange={update("floor")} /></label>
        <label><span>Status</span><select value={draft.status} onChange={update("status")}>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Platform</span><select value={draft.platform} onChange={update("platform")}><option>Facebook</option><option>eBay</option><option>Review</option></select></label>
        <label className="wide-field"><span>Listing title</span><input value={draft.listing_title} onChange={update("listing_title")} /></label>
        <label className="wide-field"><span>Listing description</span><textarea rows="4" value={draft.listing_description} onChange={update("listing_description")} /></label>
        {Object.entries(draft.ebayItemSpecifics ?? {}).map(([key, value]) => <label key={key}><span>{key}</span><input value={value} onChange={(event) => setDraft((current) => ({ ...current, ebayItemSpecifics: { ...(current.ebayItemSpecifics ?? {}), [key]: event.target.value } }))} /></label>)}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="button-row"><button type="button" onClick={closeEdit}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save item"}</button></div>
    </form>
    </div>
  ) : null;
  return (
    <>
    <section className="inventory-detail" aria-label="Selected inventory item">
      <div className="panel-heading"><h3>{item.name}</h3><div className="detail-header-actions">{allowEditing && <button onClick={() => setEditing(true)}>Edit item</button>}{onClose && <button type="button" onClick={onClose}>Close</button>}</div></div>
      <div className="item-detail-workspace">
        <PhotoReview item={item} onSave={onSave} />
        <div className="item-detail-content">
          <div className="detail-tabs" role="tablist" aria-label="Item details"><button role="tab" aria-selected={detailTab === "details"} onClick={() => setDetailTab("details")}>Details</button><button role="tab" aria-selected={detailTab === "marketplace"} onClick={() => setDetailTab("marketplace")}>Marketplace</button><button role="tab" aria-selected={detailTab === "sale"} onClick={() => setDetailTab("sale")}>Sale</button><button role="tab" aria-selected={detailTab === "history"} onClick={() => setDetailTab("history")}>History</button></div>
          {detailTab === "details" && <div className="detail-tab-panel" role="tabpanel"><div className="detail-grid"><div><span>Pallet</span><strong>{palletName}</strong></div><div><span>Condition</span><strong>{item.condition}</strong></div><div><span>Category</span><strong>{item.category ?? "Uncategorized"}</strong></div><div><span>Quantity</span><strong>{getQuantity(item)}</strong></div><div><span>Low</span><strong>{currency(price(item, "low"))}</strong></div><div><span>High</span><strong>{currency(price(item, "high"))}</strong></div><div><span>Floor</span><strong>{currency(price(item, "floor"))}</strong></div><div><span>Status</span><strong>{statusLabel[getDisplayStatus(item)]}</strong></div><div><span>Platform</span><strong>{getDisplayPlatform(item)}</strong></div><div><span>Age</span><strong>{getItemAgeDays(item)} days</strong></div>{item.soldPrice !== null && <div><span>Sold price</span><strong>{currency(item.soldPrice)}</strong></div>}{Object.entries(item.ebayItemSpecifics ?? {}).filter(([, value]) => String(value).trim()).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div><p className={getDisplayIssue(item) ? "detail-issue" : "detail-ready"}>{getDisplayIssue(item) ?? "Ready for the next marketplace action."}</p><section className="listing-copy"><div><span>Listing title</span><strong>{item.listing_title || item.name}</strong></div><div><span>Listing description</span><p>{item.listing_description || "No listing description saved."}</p></div></section>{showWorkflowActions && item.soldPrice === null && <div className="button-row workflow-actions"><button onClick={() => setWorkflowStatus("needs_photos")}>Needs photos</button><button onClick={() => setWorkflowStatus("needs_research")}>Needs research</button><button onClick={() => setWorkflowStatus("ready")}>Mark ready</button></div>}</div>}
          {detailTab === "marketplace" && <div className="detail-tab-panel" role="tabpanel"><ListingReview item={item} onSave={onSave} /></div>}
          {detailTab === "sale" && <div className="detail-tab-panel" role="tabpanel">{item.archivedAt ? <section className="sale-card"><div><strong>Archived inventory</strong><span>This item is preserved with its history and excluded from active work.</span></div><button className="primary-button" onClick={restore}>Restore item</button></section> : <><RecordSale item={item} onRecorded={onSaleRecorded} /><button className="danger-button remove-item-button" onClick={remove}>Archive item</button></>}</div>}
          {detailTab === "history" && <div className="detail-tab-panel" role="tabpanel"><InventoryHistory item={item} /></div>}
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
    </section>
    {editDialog}
    </>
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

function SellingDefaults() {
  const [priceRule, setPriceRule] = useState(() => readPreference("palletscanner.listingPriceRule", "high"));
  const [marketplace, setMarketplace] = useState(() => readPreference("palletscanner.defaultMarketplace", "ai"));
  const [saved, setSaved] = useState(false);
  const saveDefaults = () => {
    localStorage.setItem("palletscanner.listingPriceRule", priceRule);
    localStorage.setItem("palletscanner.defaultMarketplace", marketplace);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  return <article className="admin-card integration-card"><span className="admin-kicker">Selling defaults</span><strong>New listing preferences</strong><p>These choices are applied when AI analyzes new inventory. You can still change any item before posting.</p><label><span>Listing price</span><select value={priceRule} onChange={(event) => setPriceRule(event.target.value)}><option value="high">High estimate</option><option value="midpoint">Middle of range</option><option value="low">Low estimate</option></select><small>The exact price initially sent to eBay.</small></label><label><span>Preferred marketplace</span><select value={marketplace} onChange={(event) => setMarketplace(event.target.value)}><option value="ai">Use AI recommendation</option><option value="eBay">Prefer eBay</option><option value="Facebook">Prefer Facebook</option></select><small>Sets the initial marketplace recommendation on new items.</small></label><button className="primary-button" type="button" onClick={saveDefaults}>{saved ? "Saved" : "Save defaults"}</button></article>;
}

function EbaySettings({ mode = "all" }) {
  const [baseUrl, setBaseUrl] = useState(() => readPreference("palletscanner.ebayApiBaseUrl", ""));
  const [token, setToken] = useState(() => sessionStorage.getItem("palletscanner.authToken") ?? "");
  const [configOpen, setConfigOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [defaults, setDefaults] = useState({ merchantLocationKey: "", paymentPolicyId: "", returnPolicyId: "", fulfillmentPolicyId: "" });
  const [locationDraft, setLocationDraft] = useState({ name: "Main inventory", postalCode: "", city: "", stateOrProvince: "", country: "US" });
  const [importPreview, setImportPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFilter, setPreviewFilter] = useState("review");
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
    try {
      const nextStatus = await request("/ebay/status");
      setStatus(nextStatus);
      if (nextStatus.connected) {
        const nextSetup = await request("/ebay/setup");
        setSetup(nextSetup);
        setDefaults(nextSetup.defaults);
      } else {
        setSetup(null);
      }
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not check eBay status."); }
    finally { setLoading(false); }
  };

  const saveDefaults = async () => {
    setLoading(true); setMessage("");
    try {
      const result = await request("/ebay/setup/defaults", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(defaults) });
      setDefaults(result.defaults);
      const nextStatus = await request("/ebay/status");
      setStatus(nextStatus);
      setMessage("eBay defaults saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save eBay defaults."); }
    finally { setLoading(false); }
  };

  const createLocation = async (event) => {
    event.preventDefault();
    setLoading(true); setMessage("");
    try {
      await request("/ebay/setup/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(locationDraft) });
      const nextSetup = await request("/ebay/setup");
      setSetup(nextSetup);
      setDefaults(nextSetup.defaults);
      setStatus(await request("/ebay/status"));
      setMessage("Inventory location created and selected.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the inventory location."); }
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

  const loadImportPreview = async (append = false) => {
    setPreviewLoading(true); setMessage("");
    try {
      const current = append ? importPreview : null;
      const parameters = new URLSearchParams({
        limit: "50",
        inventoryOffset: String(current?.inventoryItems?.length ?? 0),
        offerOffset: String(current?.offers?.length ?? 0),
        orderOffset: String(current?.orders?.length ?? 0),
      });
      const preview = await request(`/ebay/import-preview?${parameters}`);
      setImportPreview(current ? {
        ...preview,
        inventoryItems: [...(current.inventoryItems ?? []), ...(preview.inventoryItems ?? [])],
        offers: [...(current.offers ?? []), ...(preview.offers ?? [])],
        orders: [...(current.orders ?? []), ...(preview.orders ?? [])],
      } : preview);
      setMessage("Observe-only preview refreshed. Nothing was changed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not preview eBay data."); }
    finally { setPreviewLoading(false); }
  };

  const reconciliation = reconcileEbayPreview(importPreview, repository.getSnapshot().items);
  const reconciliationRecords = [
    ...reconciliation.inventory.map((record) => ({ ...record, resourceType: "Inventory" })),
    ...reconciliation.offers.map((record) => ({ ...record, resourceType: "Offer" })),
    ...reconciliation.orderLines.map((record) => ({ ...record, resourceType: "Order line" })),
  ];
  const reviewRecords = reconciliationRecords.filter((record) => record.state !== "matched");
  const filteredReconciliationRecords = previewFilter === "all" ? reconciliationRecords : previewFilter === "matched" ? reconciliationRecords.filter((record) => record.state === "matched") : reviewRecords;
  const visibleReconciliationRecords = filteredReconciliationRecords.slice(0, 100);
  const hasMorePreviewRecords = Boolean(importPreview) && [
    [importPreview.inventoryItems?.length ?? 0, importPreview.pagination?.inventoryTotal ?? 0],
    [importPreview.offers?.length ?? 0, importPreview.pagination?.offerTotal ?? 0],
    [importPreview.orders?.length ?? 0, importPreview.pagination?.orderTotal ?? 0],
  ].some(([shown, total]) => shown < total);
  const messageIsSuccess = message.includes("saved") || message.includes("refreshed") || message.includes("restored");

  const save = () => {
    localStorage.setItem("palletscanner.ebayApiBaseUrl", baseUrl.trim());
    sessionStorage.setItem("palletscanner.authToken", token.trim());
    setMessage("Settings saved for this browser.");
    setConfigOpen(false);
  };
  const cancelConfig = () => {
    setBaseUrl(readPreference("palletscanner.ebayApiBaseUrl", ""));
    setToken(sessionStorage.getItem("palletscanner.authToken") ?? "");
    setConfigOpen(false);
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
      <div className="panel-heading"><div><p className="eyebrow">Account and integrations</p><h3>Settings</h3></div></div>
      <div className="admin-grid">
        <div className="settings-group-heading"><h4>Selling</h4><p>Choose the defaults applied to newly analyzed inventory.</p></div>
        {mode !== "settings" && <SellingDefaults />}
        <div className="settings-group-heading"><h4>Account</h4><p>Manage sign-in and inventory syncing for this dashboard.</p></div>
        {mode !== "ebay" && <SupabaseAccount />}
        <div className="settings-group-heading"><h4>eBay</h4><p>Connect your seller account and confirm it is ready to publish listings.</p></div>
        {mode !== "settings" && <article className="admin-card integration-card">
          <strong>eBay Integration</strong>
          <p>Connect the dashboard to the protected PalletFlip marketplace backend.</p>
          <div className="status-line"><span className={`badge ${status?.readyToList ? "success" : status?.connected ? "warning" : ""}`}>{loading ? "Checking…" : status?.readyToList ? "Ready to list" : status?.connected ? "Connected, setup incomplete" : status ? "Seller not connected" : "Not checked"}</span>{status && <small>{status.environment} · {status.marketplaceId}</small>}</div>
          {status?.readinessChecks?.length > 0 && <div className="check-list">{status.readinessChecks.map((check) => <div className="check-row" key={check.label}><span className={`check-dot ${check.ok ? "ok" : ""}`} /><span>{check.label}</span></div>)}</div>}
          <div className="button-row"><button disabled={loading} onClick={checkStatus}>Check status</button><button className="primary-button" disabled={loading} onClick={connect}>{status?.connected ? "Reconnect eBay" : "Connect eBay"}</button>{status?.connected && <button className="danger-button" disabled={loading} onClick={disconnect}>Disconnect</button>}</div>
          <button onClick={() => setConfigOpen(true)}>Edit backend configuration</button>
          {message && <p className={messageIsSuccess ? "" : "error-text"}>{message}</p>}
        </article>}
        {mode !== "settings" && <article className="admin-card ebay-setup-card">
          <strong>Listing defaults</strong>
          <p>These account-level choices are reused automatically whenever PalletFlip publishes an item.</p>
          {!status?.connected ? <div className="setup-empty"><span>Connect eBay, then check the status to load locations and policies.</span></div> : !setup ? <button type="button" onClick={checkStatus} disabled={loading}>Load eBay setup</button> : <>
            <label><span>Inventory location</span><select value={defaults.merchantLocationKey} onChange={(event) => setDefaults((current) => ({ ...current, merchantLocationKey: event.target.value }))}><option value="">Select a location</option>{setup.locations.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
            {setup.locations.length === 0 && <form className="location-form" onSubmit={createLocation}><strong>Create inventory location</strong><div className="compact-field-grid"><label><span>Location name</span><input required value={locationDraft.name} onChange={(event) => setLocationDraft((current) => ({ ...current, name: event.target.value }))} /></label><label><span>Postal code</span><input value={locationDraft.postalCode} onChange={(event) => setLocationDraft((current) => ({ ...current, postalCode: event.target.value }))} /></label><label><span>City</span><input value={locationDraft.city} onChange={(event) => setLocationDraft((current) => ({ ...current, city: event.target.value }))} /></label><label><span>State</span><input value={locationDraft.stateOrProvince} onChange={(event) => setLocationDraft((current) => ({ ...current, stateOrProvince: event.target.value }))} /></label><label><span>Country</span><input required maxLength={2} value={locationDraft.country} onChange={(event) => setLocationDraft((current) => ({ ...current, country: event.target.value.toUpperCase() }))} /></label></div><button className="primary-button" disabled={loading} type="submit">Create location</button></form>}
            <label><span>Payment policy</span><select value={defaults.paymentPolicyId} onChange={(event) => setDefaults((current) => ({ ...current, paymentPolicyId: event.target.value }))}><option value="">Select a payment policy</option>{setup.paymentPolicies.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
            <label><span>Return policy</span><select value={defaults.returnPolicyId} onChange={(event) => setDefaults((current) => ({ ...current, returnPolicyId: event.target.value }))}><option value="">Select a return policy</option>{setup.returnPolicies.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
            <label><span>Shipping policy</span><select value={defaults.fulfillmentPolicyId} onChange={(event) => setDefaults((current) => ({ ...current, fulfillmentPolicyId: event.target.value }))}><option value="">Select a shipping policy</option>{setup.fulfillmentPolicies.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
            {(setup.paymentPolicies.length === 0 || setup.returnPolicies.length === 0 || setup.fulfillmentPolicies.length === 0) && <div className="setup-warning"><strong>Business policies are missing</strong><span>Create payment, return, and shipping policies on eBay, then return here and refresh.</span><a className="button-link" href={setup.businessPoliciesUrl} target="_blank" rel="noreferrer">Open eBay setup</a></div>}
            <div className="button-row"><button type="button" onClick={checkStatus} disabled={loading}>Refresh from eBay</button><button className="primary-button" type="button" onClick={saveDefaults} disabled={loading || !defaults.merchantLocationKey || !defaults.paymentPolicyId || !defaults.returnPolicyId || !defaults.fulfillmentPolicyId}>Save defaults</button></div>
          </>}
        </article>}
        {mode !== "settings" && <article className="admin-card integration-card">
          <div className="status-line"><strong>Observe-only reconciliation</strong><span className="badge primary">Observe only</span></div>
          <p>Compare eBay inventory, offers, and recent orders with PalletFlip SKUs. This preview cannot import records or change quantities.</p>
          <button type="button" onClick={() => loadImportPreview(false)} disabled={previewLoading || !status?.connected}>{previewLoading ? "Reading eBay data..." : "Preview eBay data"}</button>
          {!status?.connected && <small>Connect eBay and check its status before loading a preview.</small>}
          {importPreview && <>
            <div className="check-list">
              <div className="check-row"><span className="check-dot ok" /><span>{importPreview.pagination?.inventoryTotal ?? importPreview.inventoryItems?.length ?? 0} eBay inventory records ({importPreview.inventoryItems?.length ?? 0} shown)</span></div>
              <div className="check-row"><span className="check-dot ok" /><span>{importPreview.pagination?.offerTotal ?? importPreview.offers?.length ?? 0} eBay offers ({importPreview.offers?.length ?? 0} shown)</span></div>
              <div className="check-row"><span className="check-dot ok" /><span>{importPreview.pagination?.orderTotal ?? importPreview.orders?.length ?? 0} recent eBay orders ({importPreview.orders?.length ?? 0} shown)</span></div>
              <div className="check-row"><span className="check-dot ok" /><span>{reconciliation.summary.matched} records matched by seller SKU</span></div>
              <div className="check-row"><span className={`check-dot ${reconciliation.summary.conflicting === 0 ? "ok" : ""}`} /><span>{reconciliation.summary.conflicting} quantity conflict{reconciliation.summary.conflicting === 1 ? "" : "s"}</span></div>
              <div className="check-row"><span className={`check-dot ${reconciliation.summary.uncertain === 0 ? "ok" : ""}`} /><span>{reconciliation.summary.uncertain} uncertain match{reconciliation.summary.uncertain === 1 ? "" : "es"}</span></div>
              <div className="check-row"><span className={`check-dot ${reconciliation.summary.unmatched === 0 ? "ok" : ""}`} /><span>{reconciliation.summary.unmatched} unmatched record{reconciliation.summary.unmatched === 1 ? "" : "s"}</span></div>
            </div>
            {reviewRecords.length > 0 && <div className="setup-warning"><strong>{reconciliation.summary.needsReview} records need review</strong><span>{reviewRecords.slice(0, 5).map((record) => `${record.external.sku || "No SKU"} (${record.state}${record.quantityConflict ? `: eBay ${record.external.quantity}, PalletFlip ${record.localItem?.available ?? record.localItem?.quantity ?? 0}` : ""})`).join(" | ")}</span><small>No automatic action is available until matching review is built and proven.</small></div>}
            <label><span>Reconciliation records</span><select value={previewFilter} onChange={(event) => setPreviewFilter(event.target.value)}><option value="review">Needs review ({reviewRecords.length})</option><option value="matched">Matched ({reconciliation.summary.matched})</option><option value="all">All observed ({reconciliationRecords.length})</option></select></label>
            <div className="check-list reconciliation-records">{visibleReconciliationRecords.length === 0 ? <small>No records in this view.</small> : visibleReconciliationRecords.map((record, index) => <div className="check-row" key={`${record.resourceType}-${record.external.offerId ?? record.external.lineItemId ?? record.external.sku ?? index}`}><span className={`check-dot ${record.state === "matched" ? "ok" : ""}`} /><span><strong>{record.external.sku || "No SKU"}</strong> · {record.resourceType} · {record.state.replaceAll("_", " ")}{record.matchReason === "external_id" ? " by known listing / offer ID" : record.matchReason === "product_identifier" ? " by exact product identifier" : ""}{record.quantityConflict ? ` · eBay ${record.external.quantity}, PalletFlip ${record.localItem?.available ?? record.localItem?.quantity ?? 0}` : ""}{record.external.title ? ` · ${record.external.title}` : ""}</span></div>)}</div>
            {filteredReconciliationRecords.length > 100 && <small>Showing the first 100 records in this view. Refine the filter to inspect the remainder.</small>}
            <div className="button-row">{hasMorePreviewRecords && <button type="button" onClick={() => loadImportPreview(true)} disabled={previewLoading}>{previewLoading ? "Reading next batch..." : "Load next 50"}</button>}<small>Fetched {new Date(importPreview.fetchedAt).toLocaleString()} · up to {importPreview.pagination?.limit ?? 50} more records per batch</small></div>
          </>}
        </article>}
        <div className="settings-group-heading"><h4>Data</h4><p>Keep a portable backup of your pallets and inventory.</p></div>
        {mode !== "ebay" && <article className="admin-card"><strong>Data export</strong><p>Download a portable JSON copy of the currently loaded pallets and inventory.</p><button onClick={downloadBackup}>Download JSON backup</button>{getRepositoryMode() === "local" && <><button className="danger-button" onClick={() => backupInput.current?.click()}>Restore local backup</button><input ref={backupInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={restoreBackup} /></>}</article>}
      </div>
      {mode !== "settings" && configOpen && <div className="modal-backdrop" role="presentation" onMouseDown={cancelConfig}><div className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="backend-config-title" onMouseDown={(event) => event.stopPropagation()}><div><h3 id="backend-config-title">Backend configuration</h3><p>These connection settings apply only to this browser session.</p></div><label><span>Backend URL</span><input autoFocus value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com" /></label><label><span>App auth token</span><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Session-only token" /></label><div className="button-row"><button type="button" onClick={cancelConfig}>Cancel</button><button className="primary-button" type="button" onClick={save}>Save</button></div></div></div>}
    </section>
  );
}

function AnalysisPanel({ snapshot }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ pallet: "all", category: "all", condition: "all", marketplace: "all", from: "", to: "" });
  useEffect(() => { let active = true; setLoading(true); repository.listSales().then((rows) => { if (active) setSales(rows); }).catch(() => { if (active) setSales([]); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [snapshot]);
  const choices = useMemo(() => ({ categories: [...new Set(snapshot.items.map((item) => item.category?.trim() || "Uncategorized"))].sort(), conditions: [...new Set(snapshot.items.map((item) => item.condition?.trim() || "Unknown"))].sort() }), [snapshot.items]);
  const filtered = useMemo(() => {
    const items = snapshot.items.filter((item) => (filters.pallet === "all" || item.palletId === filters.pallet) && (filters.category === "all" || (item.category?.trim() || "Uncategorized") === filters.category) && (filters.condition === "all" || (item.condition?.trim() || "Unknown") === filters.condition));
    const itemIds = new Set(items.map((item) => item.id));
    const from = filters.from ? Date.parse(`${filters.from}T00:00:00`) : Number.NEGATIVE_INFINITY;
    const to = filters.to ? Date.parse(`${filters.to}T23:59:59.999`) : Number.POSITIVE_INFINITY;
    const matchingSales = sales.filter((sale) => itemIds.has(sale.itemId) && (filters.marketplace === "all" || sale.marketplace === filters.marketplace) && sale.soldAt >= from && sale.soldAt <= to);
    const pallets = snapshot.pallets.filter((pallet) => (filters.pallet === "all" || pallet.id === filters.pallet) && items.some((item) => item.palletId === pallet.id));
    return { items, sales: matchingSales, pallets };
  }, [snapshot, sales, filters]);
  const analysis = useMemo(() => buildAnalytics(filtered.items, filtered.pallets, filtered.sales), [filtered]);
  const updateFilter = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));
  const resetFilters = () => setFilters({ pallet: "all", category: "all", condition: "all", marketplace: "all", from: "", to: "" });
  const filterSummary = [filters.pallet === "all" ? "All pallets" : snapshot.pallets.find((pallet) => pallet.id === filters.pallet)?.name, filters.category === "all" ? "All categories" : filters.category, filters.condition === "all" ? "All conditions" : filters.condition, filters.marketplace === "all" ? "All marketplaces" : filters.marketplace === "ebay" ? "eBay" : filters.marketplace[0].toUpperCase() + filters.marketplace.slice(1), filters.from || filters.to ? `${filters.from || "Beginning"} to ${filters.to || "Today"}` : "All dates"].filter(Boolean).join(" · ");
  const exportReport = () => {
    const rows = [["PalletFlip Analysis Report"], ["Generated", new Date().toLocaleString()], ["Filters", filterSummary], [], ["Summary"], ["Recorded sales", analysis.summary.sales], ["Sell-through", `${analysis.summary.sellThrough}%`], ["Gross revenue", analysis.summary.grossRevenue], ["Selling costs", analysis.summary.expenses], ["Net proceeds", analysis.summary.netProceeds], [], ["Category", "Inventory", "Sold", "Sell-through %", "Gross", "Net", "Average sale"], ...analysis.byCategory.map((row) => [row.label, row.inventory, row.sold, row.sellThrough, row.gross, row.net, row.averageSale]), [], ["Condition", "Inventory", "Sold", "Sell-through %", "Gross", "Net", "Average sale"], ...analysis.byCondition.map((row) => [row.label, row.inventory, row.sold, row.sellThrough, row.gross, row.net, row.averageSale]), [], ["Marketplace", "Sales", "Gross", "Costs", "Net", "Average sale"], ...analysis.byPlatform.map((row) => [row.label, row.sales, row.gross, row.costs, row.net, row.averageSale]), [], ["Pallet", "Inventory", "Sold", "Sell-through %", "Net proceeds", "Pallet cost", "Profit"], ...analysis.byPallet.map((row) => [row.label, row.inventory, row.sold, row.sellThrough, row.net, row.cost, row.profit]), [], ["Sale date", "Item", "Category", "Condition", "Pallet", "Marketplace", "Sold price", "Fees", "Shipping", "Net"], ...filtered.sales.map((sale) => { const item = filtered.items.find((entry) => entry.id === sale.itemId); const pallet = snapshot.pallets.find((entry) => entry.id === item?.palletId); return [new Date(sale.soldAt).toLocaleDateString(), item?.name ?? sale.itemId, item?.category ?? "Uncategorized", item?.condition ?? "Unknown", pallet?.name ?? "Unassigned", sale.marketplace, sale.soldPrice, sale.fees, sale.shippingCost, sale.soldPrice - sale.fees - sale.shippingCost]; })];
    const csvCell = (cell) => { const value = String(cell ?? ""); const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value; return `"${safe.replaceAll('"', '""')}"`; };
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `palletflip-analysis-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  if (loading) return <section className="panel"><strong>Loading analysis…</strong></section>;
  return <div className="view-stack analysis-report"><section className="print-only report-heading"><h1>PalletFlip Analysis Report</h1><p>{filterSummary}</p><small>Generated {new Date().toLocaleString()}</small></section><section className="panel analysis-controls no-print"><div className="panel-heading"><div><h3>Report filters</h3><span>Combine filters to answer a specific business question.</span></div><div className="button-row"><button onClick={resetFilters}>Clear filters</button><button onClick={exportReport}>Export CSV report</button><button className="primary-button" onClick={() => window.print()}>Print / Save PDF</button></div></div><div className="analysis-filter-grid"><label><span>Pallet</span><select value={filters.pallet} onChange={updateFilter("pallet")}><option value="all">All pallets</option>{snapshot.pallets.map((pallet) => <option key={pallet.id} value={pallet.id}>{pallet.name}</option>)}</select></label><label><span>Category / item type</span><select value={filters.category} onChange={updateFilter("category")}><option value="all">All categories</option>{choices.categories.map((category) => <option key={category}>{category}</option>)}</select></label><label><span>Condition</span><select value={filters.condition} onChange={updateFilter("condition")}><option value="all">All conditions</option>{choices.conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label><label><span>Marketplace</span><select value={filters.marketplace} onChange={updateFilter("marketplace")}><option value="all">All marketplaces</option><option value="facebook">Facebook</option><option value="ebay">eBay</option><option value="other">Other</option></select></label><label><span>Sold from</span><input type="date" value={filters.from} onChange={updateFilter("from")} /></label><label><span>Sold through</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={updateFilter("to")} /></label></div><p className="active-filter-summary">{filterSummary}</p></section><section className="metrics-grid"><Metric label="Recorded sales" value={analysis.summary.sales} /><Metric label="Sell-through" value={`${analysis.summary.sellThrough.toFixed(0)}%`} tone="success" /><Metric label="Gross revenue" value={currency(analysis.summary.grossRevenue)} /><Metric label="Selling costs" value={currency(analysis.summary.expenses)} /><Metric label="Net proceeds" value={currency(analysis.summary.netProceeds)} tone="success" /></section>
    {!analysis.hasRecordedSales && <section className="panel getting-started"><span className="admin-kicker">Build your baseline</span><h3>Record the next sale from Inventory</h3><p>Add its marketplace, fees, shipping, and date. As sales accumulate, PalletFlip will show which categories, conditions, marketplaces, and pallets perform best.</p></section>}
    {analysis.uncategorizedCount > 0 && <section className="analysis-note"><strong>{analysis.uncategorizedCount} item{analysis.uncategorizedCount === 1 ? " is" : "s are"} uncategorized.</strong><span>Add categories while reviewing Inventory to improve item-type comparisons.</span></section>}
    <div className="analysis-grid"><PerformanceTable title="Category performance" subtitle="Which item types sell through and return the most net proceeds." rows={analysis.byCategory} /><PerformanceTable title="Condition performance" subtitle="Compare actual outcomes by recorded item condition." rows={analysis.byCondition} /><PerformanceTable title="Marketplace performance" subtitle="Gross sales, direct selling costs, and net proceeds by channel." rows={analysis.byPlatform} kind="platform" /><PerformanceTable title="Pallet performance" subtitle="Filtered net proceeds less full pallet purchase cost. Unsold inventory remains open." rows={analysis.byPallet} kind="pallet" /></div>
    <p className="analysis-disclaimer">These are descriptive results from your recorded inventory and sales. They show patterns, but do not prove that condition or marketplace caused an item to sell.</p>
  </div>;
}

const dashboardViews = ["overview", "review", "inventory", "pallets", "analysis", "settings"];
const viewCopy = {
  overview: ["Business overview", "Know what is selling, what is stuck, and what needs your decision."],
  review: ["Review", "Work through inventory decisions one item at a time."],
  pallets: ["Pallets", "Track the cost, recovery, and health of each purchase."],
  inventory: ["Inventory", "Search, filter, and manage the complete inventory record."],
  analysis: ["Data & Analysis", "Learn what sells, where it sells, and what actually returns a profit."],
  settings: ["Settings", "Manage your account, backups, and activity history."],
};
const navLabels = { overview: "Overview", review: "Review", inventory: "Inventory", pallets: "Pallets", analysis: "Data / Analysis", settings: "Settings" };
const navItems = dashboardViews.map((id) => [id, navLabels[id]]);

export function App() {
  const initialView = window.location.hash.slice(1);
  const [view, setView] = useState(dashboardViews.includes(initialView) ? initialView : "overview");
  const [snapshot, setSnapshot] = useState(() => repository.getSnapshot());
  const [query, setQuery] = useState(() => readPreference("palletscanner.inventorySearch", ""));
  const [workFilter, setWorkFilter] = useState("decision");
  const [platformFilter, setPlatformFilter] = useState(() => readPreference("palletscanner.inventoryPlatformFilter", "all"));
  const [palletFilter, setPalletFilter] = useState(() => readPreference("palletscanner.inventoryPalletFilter", "all"));
  const [archiveFilter, setArchiveFilter] = useState(() => readPreference("palletscanner.inventoryArchiveFilter", "active"));
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(() => readPreference("palletscanner.locationTrackingEnabled", "false") === "true");
  const [overviewPalletId, setOverviewPalletId] = useState("all");
  const [overviewMenuOpen, setOverviewMenuOpen] = useState(false);
  const [sort, setSort] = useState(() => ({ column: readPreference("palletscanner.inventorySortColumn", "name"), direction: readPreference("palletscanner.inventorySortDirection", "asc") }));
  const [inventoryModalId, setInventoryModalId] = useState(null);
  const [addingItem, setAddingItem] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [toast, setToast] = useState("");
  const searchInput = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => repository.subscribe(setSnapshot), []);
  useEffect(() => {
    if (!dashboardViews.includes(view)) navigate("settings");
  }, [view]);
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
    localStorage.setItem("palletscanner.inventoryPlatformFilter", platformFilter);
    localStorage.setItem("palletscanner.inventoryPalletFilter", palletFilter);
    localStorage.setItem("palletscanner.inventoryArchiveFilter", archiveFilter);
    localStorage.setItem("palletscanner.locationTrackingEnabled", String(locationTrackingEnabled));
    localStorage.setItem("palletscanner.inventorySortColumn", sort.column);
    localStorage.setItem("palletscanner.inventorySortDirection", sort.direction);
  }, [query, platformFilter, palletFilter, archiveFilter, locationTrackingEnabled, sort]);
  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        navigate("inventory");
        window.setTimeout(() => searchInput.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });
  useEffect(() => {
    if (inventoryModalId === null) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setInventoryModalId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [inventoryModalId]);

  const { items: allItems, pallets } = snapshot;
  const items = useMemo(() => allItems.filter((item) => !item.archivedAt), [allItems]);
  const palletName = (id) => pallets.find((pallet) => pallet.id === id)?.name ?? "Unassigned";
  const overviewScope = overviewPalletId === "all" || pallets.some((pallet) => pallet.id === overviewPalletId) ? overviewPalletId : "all";
  const overviewItems = overviewScope === "all" ? items : items.filter((item) => item.palletId === overviewScope);
  const overviewPallets = overviewScope === "all" ? pallets : pallets.filter((pallet) => pallet.id === overviewScope);
  const overviewTotals = useMemo(() => summarizeInventory(overviewItems, overviewPallets), [overviewItems, overviewPallets]);
  const palletSummaries = useMemo(() => pallets.map((pallet) => summarizePallet(items, pallet)), [items, pallets]);
  const attention = items.filter((item) => matchesWorkFilter(item, "inventory") || (isReviewEligible(item) && (Boolean(getDisplayIssue(item)) || item.ebayStatus === "error" || item.facebookStatus === "error" || getItemAgeDays(item) > 14)));
  const workViews = [
    { id: "inventory", label: "Inventory risks" },
    { id: "decision", label: "Needs decision" },
    { id: "failed", label: "Publishing issues" },
    { id: "aging", label: "Aging" },
  ].map((entry) => ({ ...entry, count: items.filter((item) => matchesWorkFilter(item, entry.id)).length }));
  const overviewPalletName = overviewScope === "all" ? "All pallets" : palletName(overviewScope);
  const overviewNeedsAttention = overviewScope === "all"
    ? attention.length > 0
    : attention.some((item) => item.palletId === overviewScope);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const inventoryItems = archiveFilter === "all" ? allItems : archiveFilter === "archived" ? allItems.filter((item) => item.archivedAt) : items;
    const filtered = inventoryItems.filter((item) => {
      const text = [item.name, item.sellerSku, item.barcode, item.storageLocation, item.category, palletName(item.palletId), item.condition, getDisplayPlatform(item), statusLabel[getDisplayStatus(item)]].join(" ").toLowerCase();
      return (!normalizedQuery || text.includes(normalizedQuery)) &&
        (platformFilter === "all" || getDisplayPlatform(item).toLowerCase() === platformFilter.toLowerCase()) &&
        (palletFilter === "all" || item.palletId === palletFilter);
    });
    return [...filtered].sort((a, b) => {
      const value = (item) => sort.column === "pallet" ? palletName(item.palletId) : sort.column === "quantity" ? getQuantity(item) : sort.column === "age" ? getItemAgeDays(item) : sort.column === "low" || sort.column === "high" ? price(item, sort.column) : String(item[sort.column] ?? item.name).toLowerCase();
      const first = value(a); const second = value(b);
      const comparison = first < second ? -1 : first > second ? 1 : 0;
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [allItems, items, pallets, query, platformFilter, palletFilter, archiveFilter, sort]);

  const reviewItems = items.filter((item) => matchesWorkFilter(item, workFilter));
  const inventoryModalItem = allItems.find((item) => item.id === inventoryModalId) ?? null;
  const navigate = (nextView) => {
    setView(nextView);
    window.history.replaceState(null, "", `#${nextView}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const notify = (message) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  };
  const toggleSelected = (id) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const bulkUpdate = async (label, transform) => {
    const chosen = items.filter((item) => selectedIds.has(item.id));
    if (chosen.length === 0) return;
    setBulkSaving(true);
    try {
      for (const item of chosen) await repository.saveItem(transform(item));
      setSelectedIds(new Set());
      notify(`${chosen.length} item${chosen.length === 1 ? "" : "s"} ${label}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Bulk update failed.");
    } finally { setBulkSaving(false); }
  };
  const changeSort = (column) => setSort((current) => ({ column, direction: current.column === column && current.direction === "asc" ? "desc" : "asc" }));
  const resetFilters = () => { setQuery(""); setPlatformFilter("all"); setPalletFilter("all"); setArchiveFilter("active"); };
  const exportCsv = () => {
    const rows = [["SKU", "Name", "Category", "Pallet", "Location", "Status", "Platform", "Quantity", "Low", "High", "Sold", "Age Days"], ...visibleItems.map((item) => [item.sellerSku ?? `PF-${item.id}`, item.name, item.category ?? "Uncategorized", palletName(item.palletId), item.storageLocation ?? "", statusLabel[getDisplayStatus(item)], getDisplayPlatform(item), getQuantity(item), price(item, "low"), price(item, "high"), item.soldPrice ?? "", getItemAgeDays(item)])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "palletscanner-inventory.csv"; link.click(); URL.revokeObjectURL(url);
  };

  const SortButton = ({ column, children }) => <button className="sort-button" data-sort-direction={sort.column === column ? sort.direction : undefined} onClick={() => changeSort(column)}>{children}</button>;

  return (
    <div className="shell">
      <aside className="sidebar"><div><p className="eyebrow">From pallet to profit</p><h1>PalletFlip</h1></div><nav aria-label="Dashboard sections">{navItems.map(([id, label]) => { const count = id === "review" ? attention.length : id === "inventory" ? items.length : null; return <button className={view === id ? "active" : ""} key={id} onClick={() => navigate(id)}><span>{label}</span>{count !== null && <span className="nav-count">{count}</span>}</button>; })}</nav></aside>
      <main className="main">
        <header className="topbar"><div><div className="title-status"><p className="eyebrow">Business Dashboard</p><span className={`badge cloud-status ${getRepositoryMode() === "cloud" ? "success" : "warning"}`}>{getRepositoryMode() === "cloud" ? "Cloud data" : "Local preview data"}</span></div><h2>{(viewCopy[view] ?? viewCopy.settings)[0]}</h2><span>{(viewCopy[view] ?? viewCopy.settings)[1]}</span></div><div className="button-row">{view === "inventory" && <><button onClick={exportCsv}>Export inventory</button><button className="primary-button" disabled={pallets.length === 0} onClick={() => setAddingItem(true)}>Add item</button></>}</div></header>
        {view === "overview" && <div className="view-stack"><div className="overview-scope"><span className="overview-scope-label">Viewing</span><div className="pallet-scope-select"><button className="pallet-scope-trigger" type="button" aria-haspopup="listbox" aria-expanded={overviewMenuOpen} onClick={() => setOverviewMenuOpen((open) => !open)}><span className={`status-dot ${overviewNeedsAttention ? "attention" : "clear"}`} /><span>{overviewPalletName}</span><span className="select-chevron" aria-hidden="true">▾</span></button>{overviewMenuOpen && <div className="pallet-scope-menu" role="listbox" aria-label="Overview pallet"><button type="button" role="option" aria-selected={overviewScope === "all"} onClick={() => { setOverviewPalletId("all"); setOverviewMenuOpen(false); }}><span className={`status-dot ${attention.length > 0 ? "attention" : "clear"}`} /><span>All pallets</span>{attention.length > 0 && <small>{attention.length} need attention</small>}</button>{pallets.map((pallet) => { const attentionCount = attention.filter((item) => item.palletId === pallet.id).length; return <button key={pallet.id} type="button" role="option" aria-selected={overviewScope === pallet.id} onClick={() => { setOverviewPalletId(pallet.id); setOverviewMenuOpen(false); }}><span className={`status-dot ${attentionCount > 0 ? "attention" : "clear"}`} /><span>{pallet.name}</span><small>{attentionCount > 0 ? `${attentionCount} need attention` : "Clear"}</small></button>; })}</div>}</div></div><section className="metrics-grid overview-metrics">
          <Metric label="Items" value={overviewTotals.totalItems} onClick={() => { setPalletFilter(overviewScope); navigate("inventory"); }} /><Metric label="Sold items" value={overviewTotals.soldCount} /><Metric label="Sell-through" value={`${overviewTotals.sellThrough.toFixed(0)}%`} tone="success" /><Metric label="Sold revenue" value={currency(overviewTotals.soldRevenue)} /><Metric label="Pallet cost" value={currency(overviewTotals.totalCost)} /><Metric label="Revenue less cost" value={currency(overviewTotals.grossProfit)} tone={overviewTotals.grossProfit >= 0 ? "success" : "danger"} />
        </section>
        {pallets.length === 0 && <section className="panel getting-started"><span className="admin-kicker">Start here</span><h3>Create your first pallet</h3><p>A pallet groups its purchase cost, inventory, listings, and profit. Create one before adding items.</p><button className="primary-button" onClick={async () => { const pallet = await repository.createPallet("Pallet 1"); await repository.setActivePallet(pallet.id); notify("Your first pallet is ready."); navigate("pallets"); }}>Create first pallet</button></section>}
        </div>}
        {view === "review" && <section className="panel review-panel"><div className="saved-views" aria-label="Review queues">{workViews.map((workView) => <button key={workView.id} aria-pressed={workFilter === workView.id} onClick={() => setWorkFilter(workView.id)}><span>{workView.label}</span><strong>{workView.count}</strong></button>)}</div><div className="review-workspace"><div className="review-list" aria-label="Items to review">{reviewItems.length === 0 ? <div className="empty-queue"><strong>This queue is clear</strong><span>Choose another review category.</span></div> : reviewItems.map((item) => <button key={item.id} onClick={() => setInventoryModalId(item.id)}><ItemThumbnail item={item} /><div><strong>{item.name}</strong><span>{palletName(item.palletId)} · {getDisplayPlatform(item)}</span></div><span className={`badge ${statusClass[getDisplayStatus(item)]}`}>{statusLabel[getDisplayStatus(item)]}</span></button>)}</div></div></section>}
        {view === "pallets" && <PalletManager pallets={pallets} summaries={palletSummaries} activePalletId={snapshot.activePalletId} selectedPalletId={palletFilter} onFilter={(id) => { setPalletFilter(id); navigate("inventory"); }} />}
        {view === "analysis" && <AnalysisPanel snapshot={snapshot} />}
        {view === "inventory" && <section className="panel table-panel" id="inventory">
          <div className="panel-heading inventory-heading"><div><strong>{visibleItems.length} of {archiveFilter === "active" ? items.length : allItems.length} items</strong><span>Select an item to view its complete record and photos.</span></div><button className="reset-filter-button" onClick={resetFilters}>Clear filters</button></div>
          <div className="inventory-tools"><input ref={searchInput} aria-label="Search inventory" placeholder="Search inventory (press /)" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Inventory state filter" value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value)}><option value="active">Active inventory</option><option value="archived">Archived inventory</option><option value="all">Active and archived</option></select><select aria-label="Platform filter" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">All platforms</option><option>Facebook</option><option>eBay</option><option>Review</option></select><select aria-label="Pallet filter" value={palletFilter} onChange={(event) => setPalletFilter(event.target.value)}><option value="all">All pallets</option>{pallets.map((pallet) => <option key={pallet.id} value={pallet.id}>{pallet.name}</option>)}</select></div>
          {selectedIds.size > 0 && <div className="bulk-bar"><strong>{selectedIds.size} selected</strong><button disabled={bulkSaving} onClick={() => bulkUpdate("marked ready", (item) => ({ ...item, status: "ready", soldPrice: null }))}>Mark ready</button><button disabled={bulkSaving} onClick={() => bulkUpdate("marked listed on Facebook", (item) => ({ ...item, facebookStatus: "listed", facebookUpdatedAt: Date.now(), listedPlatforms: [...new Set([...(item.listedPlatforms ?? []), "facebook"])] }))}>Mark Facebook listed</button><button disabled={bulkSaving} onClick={() => bulkUpdate("marked listed on eBay", (item) => ({ ...item, ebayStatus: "active", ebayUpdatedAt: Date.now(), listedPlatforms: [...new Set([...(item.listedPlatforms ?? []), "ebay"])] }))}>Mark eBay listed</button><button disabled={bulkSaving} onClick={() => setSelectedIds(new Set())}>Clear</button></div>}
          {palletFilter !== "all" && <div className="inventory-context"><strong>Filtered Pallet: {palletName(palletFilter)}</strong><button onClick={() => setPalletFilter("all")}>Show all</button></div>}
          <div className="inventory-workspace"><div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible items" checked={visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id))} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); visibleItems.forEach((item) => event.target.checked ? next.add(item.id) : next.delete(item.id)); return next; })} /></th><th>Photo</th><th><SortButton column="name">Item</SortButton></th><th><SortButton column="pallet">Pallet</SortButton></th><th>Status</th><th>Platform</th><th><SortButton column="quantity">Qty</SortButton></th><th><SortButton column="age">Age</SortButton></th></tr></thead><tbody>{visibleItems.length === 0 ? <tr><td className="empty-table-cell" colSpan="8">No inventory matches these filters.</td></tr> : visibleItems.map((item) => <tr data-inventory-row tabIndex="0" key={item.id} onClick={() => setInventoryModalId(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setInventoryModalId(item.id); }}><td><input type="checkbox" aria-label={`Select ${item.name}`} checked={selectedIds.has(item.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(item.id)} /></td><td><ItemThumbnail item={item} /></td><td><strong>{item.name}</strong><span>{item.sellerSku ?? `PF-${item.id}`}</span></td><td>{palletName(item.palletId)}</td><td><span className={`badge ${statusClass[getDisplayStatus(item)]}`}>{statusLabel[getDisplayStatus(item)]}</span></td><td>{getDisplayPlatform(item)}</td><td>{getQuantity(item)}</td><td>{getItemAgeDays(item)}d</td></tr>)}</tbody></table></div>
          </div>
        </section>}
        {inventoryModalItem && <div className="modal-backdrop" role="presentation" onMouseDown={() => setInventoryModalId(null)}><div className="inventory-detail-modal" role="dialog" aria-modal="true" aria-label={`${inventoryModalItem.name} inventory record`} onMouseDown={(event) => event.stopPropagation()}><InventoryDetail item={inventoryModalItem} palletName={palletName(inventoryModalItem.palletId)} pallets={pallets} locationTrackingEnabled={locationTrackingEnabled} showWorkflowActions={false} onClose={() => setInventoryModalId(null)} onSave={async (item, options) => { await repository.saveItem(item, options); notify(item.archivedAt === null ? "Inventory item restored." : "Changes saved."); }} onRemove={async (id) => { await repository.removeItem(id); setInventoryModalId(null); notify("Inventory item archived."); }} onSaleRecorded={() => notify("Sale recorded. Analysis is updated.")} /></div></div>}
        {addingItem && <AddItemDialog pallets={pallets} activePalletId={snapshot.activePalletId} onCancel={() => setAddingItem(false)} onCreate={async (item) => { await repository.saveItem(item); setAddingItem(false); setInventoryModalId(item.id); notify("Item added. Add photos or edit its details."); }} />}
        <div className="settings-mount" hidden={view !== "settings"}><div className="view-stack"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Inventory preferences</p><h3>Storage locations</h3><span>Optional for garages, shelves, bins, or racks.</span></div><label><input type="checkbox" checked={locationTrackingEnabled} onChange={(event) => setLocationTrackingEnabled(event.target.checked)} /> Enable location tracking</label></div></section><EbaySettings /><ActivityPanel snapshot={snapshot} /></div></div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    </div>
  );
}
