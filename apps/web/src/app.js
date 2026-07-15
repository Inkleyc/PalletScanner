import { items, pallets } from "./mock-data.js";
import {
  currency,
  statusClass,
  statusLabel,
  summarizeInventory,
  summarizePallet,
} from "./dashboard-model.js";

const renderMetric = (label, value, tone = "") => `
  <section class="metric ${tone}">
    <span>${label}</span>
    <strong>${value}</strong>
  </section>
`;

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
            <article class="admin-card">
              <span class="admin-kicker">Marketplace Backend</span>
              <strong>eBay server configuration</strong>
              <p>Show API environment, OAuth callback status, policy IDs, and backend health checks for marketplace admins.</p>
              <button type="button">Open Integration Status</button>
            </article>
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
};

render();
