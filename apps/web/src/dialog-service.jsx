import { useEffect, useState } from "react";

// PF-SCOPE-028: in-app dialogs replace the browser-native prompt/confirm
// boxes. One module-level service queues requests; a single DialogHost
// rendered at the app root displays them. Every request returns a promise:
// confirm resolves true/false, prompt resolves the entered string or null
// on cancel, and form resolves an object of field values or null on
// cancel — exactly the semantics the native dialogs had, so a dismissed
// dialog still aborts the calling flow.

let nextId = 1;
let current = null;
const queue = [];
const listeners = new Set();

const emit = () => {
  const request = current?.request ?? null;
  listeners.forEach((listener) => listener(request));
};

function open(request) {
  return new Promise((resolve) => {
    const entry = { request: { ...request, id: nextId++ }, resolve };
    if (current) queue.push(entry);
    else {
      current = entry;
      emit();
    }
  });
}

function settle(value) {
  if (!current) return;
  const { resolve } = current;
  current = queue.shift() ?? null;
  emit();
  resolve(value);
}

export function confirmDialog(message, options = {}) {
  return open({ kind: "confirm", message, ...options });
}

export function promptDialog(message, defaultValue = "", options = {}) {
  return open({ kind: "prompt", message, defaultValue: String(defaultValue ?? ""), ...options });
}

// fields: [{ name, label, defaultValue, type: "text" | "select" |
// "textarea", options: [value | { value, label }], hint,
// visibleWhen: (values) => boolean }]
export function formDialog({ title, message, fields, submitLabel }) {
  return open({ kind: "form", title, message, fields, submitLabel });
}

const cancelValue = (request) => (request.kind === "confirm" ? false : null);

export function DialogHost() {
  const [request, setRequest] = useState(null);
  const [values, setValues] = useState({});

  useEffect(() => {
    listeners.add(setRequest);
    return () => listeners.delete(setRequest);
  }, []);

  useEffect(() => {
    if (!request) return;
    if (request.kind === "prompt") setValues({ value: request.defaultValue });
    else if (request.kind === "form") {
      setValues(Object.fromEntries(request.fields.map((field) => [field.name, String(field.defaultValue ?? "")])));
    } else setValues({});
  }, [request]);

  useEffect(() => {
    if (!request) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") settle(cancelValue(request));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [request]);

  if (!request) return null;

  const cancel = () => settle(cancelValue(request));
  const submit = (event) => {
    event.preventDefault();
    if (request.kind === "confirm") settle(true);
    else if (request.kind === "prompt") settle(values.value ?? "");
    else settle({ ...values });
  };
  const update = (name) => (event) => setValues((currentValues) => ({ ...currentValues, [name]: event.target.value }));
  const visibleFields = request.kind === "form"
    ? request.fields.filter((field) => !field.visibleWhen || field.visibleWhen(values))
    : [];
  const submitLabel = request.submitLabel ?? (request.kind === "confirm" ? "Confirm" : "OK");

  const renderField = (field, index) => {
    const options = (field.options ?? []).map((option) => (typeof option === "object" ? option : { value: option, label: option }));
    return (
      <label key={field.name}>
        <span>{field.label}</span>
        {field.type === "select" ? (
          <select autoFocus={index === 0} value={values[field.name] ?? ""} onChange={update(field.name)}>
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : field.type === "textarea" ? (
          <textarea autoFocus={index === 0} rows={4} value={values[field.name] ?? ""} onChange={update(field.name)} />
        ) : (
          <input autoFocus={index === 0} value={values[field.name] ?? ""} onChange={update(field.name)} />
        )}
        {field.hint && <small>{field.hint}</small>}
      </label>
    );
  };

  return (
    <div className="modal-backdrop dialog-backdrop" role="presentation" onMouseDown={cancel}>
      <form className="edit-modal dialog-modal" role="dialog" aria-modal="true" aria-label={request.title ?? "Confirmation"} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        {request.title && <div><h3>{request.title}</h3></div>}
        {request.message && <p className="dialog-message">{request.message}</p>}
        {request.kind === "prompt" && (
          <label>
            {request.label && <span>{request.label}</span>}
            <input autoFocus value={values.value ?? ""} onChange={update("value")} onFocus={(event) => event.target.select()} />
          </label>
        )}
        {request.kind === "form" && <div className="dialog-form-fields">{visibleFields.map(renderField)}</div>}
        <div className="button-row">
          <button type="button" onClick={cancel}>Cancel</button>
          <button className={request.danger ? "danger-button" : "primary-button"} type="submit">{submitLabel}</button>
        </div>
      </form>
    </div>
  );
}
