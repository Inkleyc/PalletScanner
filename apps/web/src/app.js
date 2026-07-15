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

const inventorySort = {
  column: localStorage.getItem("palletscanner.inventorySortColumn") ?? "name",
  direction:
    localStorage.getItem("palletscanner.inventorySortDirection") === "desc"
      ? "desc"
      : "asc",
};

const inventoryFilters = {
  query: localStorage.getItem("palletscanner.inventorySearch") ?? "",
  status: localStorage.getItem("palletscanner.inventoryStatusFilter") ?? "all",
  platform:
    localStorage.getItem("palletscanner.inventoryPlatformFilter") ?? "all",
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

const getPalletName = (palletId) =>
  pallets.find((entry) => entry.id === palletId)?.name ?? "Unassigned";

const getInventorySearchText = (item) =>
  [
    item.name,
    getPalletName(item.palletId),
    item.condition,
    item.platform,
    statusLabel[item.status],
  ]
    .join(" ")
    .toLowerCase();

const applyInventorySearch = () => {
  const searchInput = document.querySelector("#inventory-search");
  const statusFilter = document.querySelector("#inventory-status-filter");
  const platformFilter = document.querySelector("#inventory-platform-filter");
  const rows = [...document.querySelectorAll("[data-inventory-row]")];
  const query = searchInput?.value.trim().toLowerCase() ?? "";
  const selectedStatus = statusFilter?.value ?? "all";
  const selectedPlatform = platformFilter?.value ?? "all";
  let visibleCount = 0;

  inventoryFilters.query = searchInput?.value ?? "";
  inventoryFilters.status = selectedStatus;
  inventoryFilters.platform = selectedPlatform;
  localStorage.setItem("palletscanner.inventorySearch", inventoryFilters.query);
  localStorage.setItem(
    "palletscanner.inventoryStatusFilter",
    selectedStatus,
  );
  localStorage.setItem(
    "palletscanner.inventoryPlatformFilter",
    selectedPlatform,
  );

  for (const row of rows) {
    const matchesSearch = !query || row.dataset.searchText.includes(query);
    const matchesStatus =
      selectedStatus === "all" || row.dataset.status === selectedStatus;
    const matchesPlatform =
      selectedPlatform === "all" || row.dataset.platform === selectedPlatform;
    const isVisible = matchesSearch && matchesStatus && matchesPlatform;
    row.hidden = !isVisible;
    if (isVisible) {
      visibleCount += 1;
    }
  }

  const resultCount = document.querySelector("#inventory-result-count");
  if (resultCount) {
    resultCount.textContent = `${visibleCount} item${visibleCount === 1 ? "" : "s"}`;
  }

  const emptyRow = document.querySelector("#inventory-empty-row");
  if (emptyRow) {
    emptyRow.hidden = visibleCount > 0;
  }

  const resetButton = document.querySelector("[data-action='reset-inventory']");
  if (resetButton) {
    resetButton.hidden =
      !query && selectedStatus === "all" && selectedPlatform === "all";
  }
};

const downloadCsv = (filename, rows) => {
  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const exportVisibleInventory = () => {
  const visibleRows = [...document.querySelectorAll("[data-inventory-row]")]
    .filter((row) => !row.hidden)
    .map((row) => Number(row.dataset.itemId))
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter(Boolean);

  downloadCsv("palletscanner-inventory.csv", [
    [
      "Item",
      "Pallet",
      "Condition",
      "Platform",
      "Low Estimate",
      "High Estimate",
      "Floor",
      "Sold Price",
      "Status",
      "Issue",
    ],
    ...visibleRows.map((item) => [
      item.name,
      getPalletName(item.palletId),
      item.condition,
      item.platform,
      item.low,
      item.high,
      item.floor,
      item.soldPrice ?? "",
      statusLabel[item.status] ?? item.status,
      item.issue ?? "",
    ]),
  ]);
};

const sortInventoryRows = (column, toggleDirection = true) => {
  if (toggleDirection) {
    inventorySort.direction =
      inventorySort.column === column && inventorySort.direction === "asc"
        ? "desc"
        : "asc";
  }
  inventorySort.column = column;
  localStorage.setItem("palletscanner.inventorySortColumn", column);
  localStorage.setItem(
    "palletscanner.inventorySortDirection",
    inventorySort.direction,
  );

  const tbody = document.querySelector("#inventory-table-body");
  if (!tbody) {
    return;
  }

  const rows = [...tbody.querySelectorAll("[data-inventory-row]")];
  rows
    .sort((first, second) => {
      const firstValue = first.dataset[`sort${column}`] ?? "";
      const secondValue = second.dataset[`sort${column}`] ?? "";
      const firstNumber = Number(firstValue);
      const secondNumber = Number(secondValue);
      const result =
        Number.isFinite(firstNumber) && Number.isFinite(secondNumber)
          ? firstNumber - secondNumber
          : firstValue.localeCompare(secondValue, undefined, {
              numeric: true,
              sensitivity: "base",
            });
      return inventorySort.direction === "asc" ? result : -result;
    })
    .forEach((row) => tbody.append(row));

  document.querySelectorAll("[data-sort-column]").forEach((button) => {
    const isActive = button.dataset.sortColumn === column;
    button.dataset.sortDirection = isActive ? inventorySort.direction : "";
  });
};

const resetInventoryView = () => {
  inventoryFilters.query = "";
  inventoryFilters.status = "all";
  inventoryFilters.platform = "all";
  localStorage.removeItem("palletscanner.inventorySearch");
  localStorage.removeItem("palletscanner.inventoryStatusFilter");
  localStorage.removeItem("palletscanner.inventoryPlatformFilter");

  const searchInput = document.querySelector("#inventory-search");
  const statusFilter = document.querySelector("#inventory-status-filter");
  const platformFilter = document.querySelector("#inventory-platform-filter");
  if (searchInput) {
    searchInput.value = "";
  }
  if (statusFilter) {
    statusFilter.value = "all";
  }
  if (platformFilter) {
    platformFilter.value = "all";
  }
  applyInventorySearch();
};

const renderSortButton = (column, label) => `
  <button class="sort-button" type="button" data-sort-column="${column}" data-sort-direction="${inventorySort.column === column ? inventorySort.direction : ""}">
    ${label}
  </button>
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
  const platformOptions = [...new Set(items.map((item) => item.platform))].sort();

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
          <button type="button" data-action="export-inventory">Export CSV</button>
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
                      <strong>${escapeHtml(pallet.name)}</strong>
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
                      <strong>${escapeHtml(item.name)}</strong>
                      <span>${escapeHtml(item.issue)}</span>
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
            <div class="inventory-tools">
              <span id="inventory-result-count">${items.length} items</span>
              <select id="inventory-status-filter" aria-label="Filter inventory status">
                <option value="all">All statuses</option>
                ${Object.entries(statusLabel)
                  .map(
                    ([value, label]) =>
                      `<option value="${escapeHtml(value)}" ${inventoryFilters.status === value ? "selected" : ""}>${escapeHtml(label)}</option>`,
                  )
                  .join("")}
              </select>
              <select id="inventory-platform-filter" aria-label="Filter inventory platform">
                <option value="all">All platforms</option>
                ${platformOptions
                  .map(
                    (platform) =>
                      `<option value="${escapeHtml(platform)}" ${inventoryFilters.platform === platform ? "selected" : ""}>${escapeHtml(platform)}</option>`,
                  )
                  .join("")}
              </select>
              <input id="inventory-search" aria-label="Search inventory" placeholder="Search inventory" value="${escapeHtml(inventoryFilters.query)}" />
              <button class="reset-filter-button" type="button" data-action="reset-inventory">Reset</button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>${renderSortButton("name", "Item")}</th>
                <th>${renderSortButton("pallet", "Pallet")}</th>
                <th>${renderSortButton("condition", "Condition")}</th>
                <th>${renderSortButton("platform", "Platform")}</th>
                <th>${renderSortButton("range", "Range")}</th>
                <th>${renderSortButton("status", "Status")}</th>
              </tr>
            </thead>
            <tbody id="inventory-table-body">
              ${items
                .map((item) => {
                  const palletName = getPalletName(item.palletId);
                  return `
                    <tr
                      data-inventory-row
                      data-item-id="${item.id}"
                      data-status="${escapeHtml(item.status)}"
                      data-platform="${escapeHtml(item.platform)}"
                      data-search-text="${escapeHtml(getInventorySearchText(item))}"
                      data-sortname="${escapeHtml(item.name)}"
                      data-sortpallet="${escapeHtml(palletName)}"
                      data-sortcondition="${escapeHtml(item.condition)}"
                      data-sortplatform="${escapeHtml(item.platform)}"
                      data-sortrange="${item.high}"
                      data-sortstatus="${escapeHtml(statusLabel[item.status] ?? item.status)}"
                    >
                      <td>${escapeHtml(item.name)}</td>
                      <td>${escapeHtml(palletName)}</td>
                      <td>${escapeHtml(item.condition)}</td>
                      <td>${escapeHtml(item.platform)}</td>
                      <td>${currency(item.low)}-${currency(item.high)}</td>
                      <td><span class="badge ${statusClass[item.status]}">${statusLabel[item.status]}</span></td>
                    </tr>
                  `;
                })
                .join("")}
              <tr id="inventory-empty-row" hidden>
                <td class="empty-table-cell" colspan="6">No inventory matches these filters.</td>
              </tr>
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
  document
    .querySelector("[data-action='export-inventory']")
    ?.addEventListener("click", exportVisibleInventory);
  document.querySelectorAll("[data-sort-column]").forEach((button) => {
    button.addEventListener("click", () => {
      sortInventoryRows(button.dataset.sortColumn);
    });
  });
  document
    .querySelector("[data-action='reset-inventory']")
    ?.addEventListener("click", resetInventoryView);
  sortInventoryRows(inventorySort.column, false);
  document
    .querySelector("#inventory-search")
    ?.addEventListener("input", applyInventorySearch);
  document
    .querySelector("#inventory-status-filter")
    ?.addEventListener("change", applyInventorySearch);
  document
    .querySelector("#inventory-platform-filter")
    ?.addEventListener("change", applyInventorySearch);
  applyInventorySearch();
};

render();
