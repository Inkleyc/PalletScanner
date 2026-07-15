import { items, pallets } from "./mock-data.js";
import {
  currency,
  statusClass,
  statusLabel,
  summarizeInventory,
  summarizePallet,
} from "./dashboard-model.js";

const ebaySettings = {
  apiBaseUrl: localStorage.getItem("palletscanner.ebayApiBaseUrl") ?? "",
  authToken: sessionStorage.getItem("palletscanner.authToken") ?? "",
  status: null,
  error: "",
  loading: false,
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderMetric = (label, value, tone = "") => `
  <section class="metric ${tone}">
    <span>${label}</span>
    <strong>${value}</strong>
  </section>
`;

const normalizeBaseUrl = (value) => value.trim().replace(/\/$/, "");

const getEbayHeaders = () => ({
  ...(ebaySettings.authToken.trim()
    ? { Authorization: `Bearer ${ebaySettings.authToken.trim()}` }
    : {}),
});

const requestEbayBackend = async (path, options = {}) => {
  const baseUrl = normalizeBaseUrl(ebaySettings.apiBaseUrl);
  if (!baseUrl) {
    throw new Error("Enter the eBay backend URL first.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...getEbayHeaders(),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `eBay backend returned ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error ?? message;
    } catch {
      message = (await response.text()) || message;
    }
    throw new Error(message);
  }
  return response;
};

const saveEbaySettings = () => {
  ebaySettings.apiBaseUrl = document.querySelector("#ebay-api-base-url").value;
  ebaySettings.authToken = document.querySelector("#ebay-auth-token").value;
  localStorage.setItem(
    "palletscanner.ebayApiBaseUrl",
    normalizeBaseUrl(ebaySettings.apiBaseUrl),
  );
  sessionStorage.setItem(
    "palletscanner.authToken",
    ebaySettings.authToken.trim(),
  );
};

const refreshEbayStatus = async () => {
  saveEbaySettings();
  ebaySettings.loading = true;
  ebaySettings.error = "";
  render();

  try {
    const response = await requestEbayBackend("/ebay/status");
    ebaySettings.status = await response.json();
  } catch (error) {
    ebaySettings.status = null;
    ebaySettings.error =
      error instanceof Error ? error.message : "Unable to reach backend.";
  } finally {
    ebaySettings.loading = false;
    render();
  }
};

const connectEbay = async () => {
  saveEbaySettings();
  ebaySettings.loading = true;
  ebaySettings.error = "";
  render();

  try {
    const response = await requestEbayBackend("/ebay/connect-url");
    const payload = await response.json();
    window.open(payload.authorizationUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    ebaySettings.error =
      error instanceof Error ? error.message : "Unable to start eBay OAuth.";
  } finally {
    ebaySettings.loading = false;
    render();
  }
};

const disconnectEbay = async () => {
  saveEbaySettings();
  ebaySettings.loading = true;
  ebaySettings.error = "";
  render();

  try {
    await requestEbayBackend("/ebay/disconnect", { method: "POST" });
    await refreshEbayStatus();
  } catch (error) {
    ebaySettings.error =
      error instanceof Error ? error.message : "Unable to disconnect eBay.";
    ebaySettings.loading = false;
    render();
  }
};

const renderEbayStatus = () => {
  const status = ebaySettings.status;
  const statusText = !normalizeBaseUrl(ebaySettings.apiBaseUrl)
    ? "Backend URL needed"
    : ebaySettings.loading
      ? "Checking..."
      : ebaySettings.error
        ? "Backend unavailable"
        : status?.readyToList
          ? "Ready to list"
          : status?.connected
            ? "Connected, setup incomplete"
            : status
              ? "Seller account not connected"
              : "Not checked";
  const checks = status?.readinessChecks ?? [];

  return `
    <article class="admin-card integration-card">
      <span class="admin-kicker">Marketplace Backend</span>
      <strong>eBay account connection</strong>
      <p>Connect the seller account and confirm the backend has every policy needed before live posting.</p>
      <label>
        <span>Backend URL</span>
        <input id="ebay-api-base-url" value="${escapeHtml(ebaySettings.apiBaseUrl)}" placeholder="http://localhost:8787" />
      </label>
      <label>
        <span>App auth token</span>
        <input id="ebay-auth-token" value="${escapeHtml(ebaySettings.authToken)}" placeholder="Saved for this browser session only" />
      </label>
      <div class="status-line">
        <span class="badge ${status?.readyToList ? "success" : status?.connected ? "warning" : ""}">${escapeHtml(statusText)}</span>
        ${status ? `<small>${escapeHtml(status.environment)} - ${escapeHtml(status.marketplaceId)}</small>` : ""}
      </div>
      ${
        checks.length > 0
          ? `<div class="check-list">
              ${checks
                .map(
                  (check) => `
                    <div class="check-row">
                      <span class="check-dot ${check.ok ? "ok" : ""}"></span>
                      <span>${escapeHtml(check.label)}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>`
          : ""
      }
      ${ebaySettings.error ? `<p class="error-text">${escapeHtml(ebaySettings.error)}</p>` : ""}
      <div class="button-row">
        <button type="button" data-action="refresh-ebay" ${ebaySettings.loading ? "disabled" : ""}>Check Status</button>
        <button type="button" data-action="connect-ebay" ${ebaySettings.loading ? "disabled" : ""}>${status?.connected ? "Reconnect eBay" : "Connect eBay"}</button>
        ${
          status?.connected
            ? `<button class="danger-button" type="button" data-action="disconnect-ebay" ${ebaySettings.loading ? "disabled" : ""}>Disconnect</button>`
            : ""
        }
      </div>
    </article>
  `;
};

const render = () => {
  const totals = summarizeInventory(items, pallets);
  const palletRows = pallets.map((pallet) => summarizePallet(items, pallet));
  const attentionItems = items.filter((item) => item.issue);

  document.querySelector("#app").innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div>
          <p class="eyebrow">PalletScanner</p>
          <h1>Business Dashboard</h1>
        </div>
        <nav>
          <a class="active" href="#overview">Overview</a>
          <a href="#pallets">Pallets</a>
          <a href="#queue">Attention Queue</a>
          <a href="#inventory">Inventory</a>
          <a href="#admin">Admin Settings</a>
        </nav>
      </aside>

      <main class="main">
        <header class="topbar">
          <div>
            <p class="eyebrow">Web Operations</p>
            <h2>Review value, listing readiness, and cleanup work.</h2>
          </div>
          <button type="button">Export CSV</button>
        </header>

        <section id="overview" class="metrics-grid">
          ${renderMetric("Items", totals.totalItems)}
          ${renderMetric("Sold Revenue", currency(totals.soldRevenue), "success")}
          ${renderMetric("Remaining Low", currency(totals.remainingLow))}
          ${renderMetric("Remaining High", currency(totals.remainingHigh))}
          ${renderMetric("Pallet Cost", currency(totals.totalCost), "warning")}
          ${renderMetric("Gross Profit", currency(totals.grossProfit), totals.grossProfit >= 0 ? "success" : "danger")}
          ${renderMetric("Sell Through", `${totals.sellThrough.toFixed(0)}%`)}
          ${renderMetric("Needs Attention", attentionItems.length, "warning")}
        </section>

        <section id="pallets" class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Pallet Health</p>
              <h3>Profitability and cleanup by pallet</h3>
            </div>
          </div>
          <div class="pallet-grid">
            ${palletRows
              .map(
                (pallet) => `
                  <article class="pallet-card">
                    <div class="card-row">
                      <strong>${pallet.name}</strong>
                      <span>${pallet.itemCount} items</span>
                    </div>
                    <dl>
                      <div><dt>Cost</dt><dd>${currency(pallet.cost)}</dd></div>
                      <div><dt>Sold</dt><dd>${currency(pallet.soldRevenue)}</dd></div>
                      <div><dt>High Est.</dt><dd>${currency(pallet.estimatedHigh)}</dd></div>
                      <div><dt>Open Issues</dt><dd>${pallet.unresolved}</dd></div>
                    </dl>
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>

        <section id="queue" class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Attention Queue</p>
              <h3>Items that need a business decision</h3>
            </div>
          </div>
          <div class="queue-list">
            ${attentionItems
              .map(
                (item) => `
                  <article class="queue-item">
                    <div>
                      <strong>${item.name}</strong>
                      <span>${item.issue}</span>
                    </div>
                    <span class="badge ${statusClass[item.status]}">${statusLabel[item.status]}</span>
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>

        <section id="inventory" class="panel table-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Inventory</p>
              <h3>Desktop-first review table</h3>
            </div>
            <input aria-label="Search inventory" placeholder="Search inventory" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Pallet</th>
                <th>Condition</th>
                <th>Platform</th>
                <th>Range</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map((item) => {
                  const pallet = pallets.find((entry) => entry.id === item.palletId);
                  return `
                    <tr>
                      <td>${item.name}</td>
                      <td>${pallet?.name ?? "Unassigned"}</td>
                      <td>${item.condition}</td>
                      <td>${item.platform}</td>
                      <td>${currency(item.low)}-${currency(item.high)}</td>
                      <td><span class="badge ${statusClass[item.status]}">${statusLabel[item.status]}</span></td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </section>

        <section id="admin" class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Admin Settings</p>
              <h3>Controls that should stay out of the warehouse app</h3>
            </div>
          </div>
          <div class="admin-grid">
            <article class="admin-card">
              <span class="admin-kicker">Usage & Billing</span>
              <strong>Scan plan and monthly usage</strong>
              <p>Put plan limits, billing status, and upgrade controls here instead of interrupting the phone capture flow.</p>
              <button type="button">Review Plan</button>
            </article>
            ${renderEbayStatus()}
            <article class="admin-card">
              <span class="admin-kicker">Security</span>
              <strong>Runtime auth and access policy</strong>
              <p>Developer bearer tokens and production auth rules belong in web/admin tooling, not normal mobile Settings.</p>
              <button type="button">Manage Access</button>
            </article>
            <article class="admin-card danger-zone">
              <span class="admin-kicker">Danger Zone</span>
              <strong>Data reset and restore</strong>
              <p>Destructive actions should require a larger screen, clearer review, and stronger confirmation than a phone tab.</p>
              <button type="button">Review Data Tools</button>
            </article>
          </div>
        </section>
      </main>
    </div>
  `;

  document
    .querySelector("[data-action='refresh-ebay']")
    ?.addEventListener("click", () => {
      void refreshEbayStatus();
    });
  document
    .querySelector("[data-action='connect-ebay']")
    ?.addEventListener("click", () => {
      void connectEbay();
    });
  document
    .querySelector("[data-action='disconnect-ebay']")
    ?.addEventListener("click", () => {
      void disconnectEbay();
    });
};

render();
