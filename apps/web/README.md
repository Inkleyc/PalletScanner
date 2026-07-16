# PalletScanner Web

Home for the business dashboard.

This is currently a dependency-free static scaffold so we can shape the desktop product before committing to the final web framework. Do not build this as Expo web long-term. The web app should be a web-first app focused on desktop workflows:

- inventory table
- pallet profitability
- listing review queues
- missing-data cleanup
- reports
- marketplace/admin settings

Current preview behavior:

- Overview metrics for item count, sell-through, sold revenue, remaining value, pallet cost, gross profit, and marketplace work counts.
- Pallet health cards with cost, sold revenue, estimated value, and open issues.
- Attention queue for items that need a business decision, with a clear empty state.
- Listings queue for marketplace work across Facebook and eBay, with a clear empty state.
- Aging queue for unsold items that have been sitting longer than the review window.
- Inventory table with search, pallet/status/platform filters, clickable pallet and marketplace drill-ins, filtered pallet context, quantity-aware sortable columns, no-results state, selected-item detail, and filtered CSV export.
- Inventory view preferences persist in the browser until the user resets them.
- Admin Settings includes the eBay backend URL, session-only app auth token, seller connection, disconnect, and readiness checklist.

Preview-only notes:

- Data is still mock data in `src/mock-data.js`.
- Billing, access management, and data reset controls are shown as planned states, not clickable actions.
- eBay connection requires a running backend and the correct backend URL.
- Auth tokens are stored in `sessionStorage`, while harmless view preferences and backend URL are stored in `localStorage`.

Run the scaffold:

```bash
npm run dev -w @palletscanner/web
```

Check the scaffold:

```bash
npm run check -w @palletscanner/web
```
