const pallets = [
  {
    id: "pallet-1",
    name: "P01-07/2026",
    cost: 420,
    createdAt: "2026-07-01",
  },
  {
    id: "pallet-2",
    name: "P02-07/2026",
    cost: 610,
    createdAt: "2026-07-10",
  },
  {
    id: "pallet-3",
    name: "P03-07/2026",
    cost: 0,
    createdAt: "2026-07-14",
  },
];

const items = [
  {
    id: 1,
    palletId: "pallet-1",
    name: "DeWalt 20V Drill Kit",
    condition: "Used - good",
    low: 55,
    high: 85,
    floor: 45,
    soldPrice: 70,
    status: "sold",
    platform: "Facebook",
    issue: null,
  },
  {
    id: 2,
    palletId: "pallet-1",
    name: "Ninja Air Fryer AF101",
    condition: "Open box",
    low: 45,
    high: 70,
    floor: 38,
    soldPrice: null,
    status: "ready",
    platform: "eBay",
    issue: "Needs final listing review",
  },
  {
    id: 3,
    palletId: "pallet-2",
    name: "Samsung 27 inch Monitor",
    condition: "Untested",
    low: 40,
    high: 95,
    floor: 30,
    soldPrice: null,
    status: "needs_research",
    platform: "eBay",
    issue: "Needs testing notes",
  },
  {
    id: 4,
    palletId: "pallet-2",
    name: "Lot of Kitchen Utensils",
    condition: "Mixed",
    low: 18,
    high: 35,
    floor: 12,
    soldPrice: null,
    status: "needs_photos",
    platform: "Facebook",
    issue: "Missing photos",
  },
  {
    id: 5,
    palletId: "pallet-3",
    name: "Barcode capture placeholder",
    condition: "Unknown",
    low: 10,
    high: 25,
    floor: 7,
    soldPrice: null,
    status: "captured",
    platform: "Review",
    issue: "Needs category and photos",
  },
];

const currency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const getQuantity = () => 1;

const summarize = () => {
  const soldItems = items.filter((item) => item.soldPrice !== null);
  const unsoldItems = items.filter((item) => item.soldPrice === null);
  const soldRevenue = soldItems.reduce((sum, item) => sum + item.soldPrice, 0);
  const remainingLow = unsoldItems.reduce(
    (sum, item) => sum + item.low * getQuantity(item),
    0,
  );
  const remainingHigh = unsoldItems.reduce(
    (sum, item) => sum + item.high * getQuantity(item),
    0,
  );
  const totalCost = pallets.reduce((sum, pallet) => sum + pallet.cost, 0);

  return {
    totalItems: items.length,
    soldCount: soldItems.length,
    soldRevenue,
    remainingLow,
    remainingHigh,
    totalCost,
    grossProfit: soldRevenue - totalCost,
    sellThrough: items.length > 0 ? (soldItems.length / items.length) * 100 : 0,
  };
};

const summarizePallet = (pallet) => {
  const palletItems = items.filter((item) => item.palletId === pallet.id);
  const soldRevenue = palletItems.reduce(
    (sum, item) => sum + (item.soldPrice ?? 0),
    0,
  );
  const estimatedHigh = palletItems.reduce((sum, item) => sum + item.high, 0);
  const unresolved = palletItems.filter((item) => item.issue).length;

  return {
    ...pallet,
    itemCount: palletItems.length,
    soldRevenue,
    estimatedHigh,
    unresolved,
    margin: soldRevenue - pallet.cost,
  };
};

const statusLabel = {
  captured: "Captured",
  needs_photos: "Needs Photos",
  needs_research: "Needs Research",
  ready: "Ready",
  sold: "Sold",
};

const statusClass = {
  captured: "neutral",
  needs_photos: "warning",
  needs_research: "warning",
  ready: "success",
  sold: "primary",
};

const renderMetric = (label, value, tone = "") => `
  <section class="metric ${tone}">
    <span>${label}</span>
    <strong>${value}</strong>
  </section>
`;

const render = () => {
  const totals = summarize();
  const palletRows = pallets.map(summarizePallet);
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
      </main>
    </div>
  `;
};

render();
