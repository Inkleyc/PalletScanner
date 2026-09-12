# PalletFlip Web

Home for the business dashboard.

This is a React application built with Vite. It remains local-first while the
desktop workflows are shaped, and it is separate from Expo web. The web app is
focused on desktop workflows:

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
- Inventory table with search, pallet/status/platform filters, clickable pallet and marketplace drill-ins, filtered pallet context, quantity- and age-aware sortable columns, no-results state, selected-item detail, and filtered CSV export.
- Repository-backed item editing for identity, condition, pallet assignment, quantity,
  price range, workflow status, platform, sold price, and listing copy.
- Local pallet and item creation, guarded deletion, active-pallet selection, and
  quick workflow-state actions.
- Local activity history for pallet and inventory mutations.
- Downloadable and validated/restorable JSON backups of local repository data
  and activity history. Restore requires explicit replacement confirmation.
- Web photo review and missing-photo visibility. Capture and photo mutation stay
  on mobile until shared object storage is connected.
- An authenticated Supabase repository adapter is prepared alongside the local
  adapter. Switching and initial upload remain explicit so local data is never
  replaced merely by signing in.
- Signed-in users automatically use cloud inventory. Signing out returns to the
  separate development preview; fixture data is never uploaded automatically.
- An authenticated cloud CRUD self-test verifies create, update, read, and
  delete behavior, then removes its own temporary records.
- Inventory view preferences persist in the browser until the user resets them.
- Admin Settings includes the eBay backend URL, session-only app auth token, seller connection, disconnect, and readiness checklist.

Preview-only notes:

- Data uses a local repository contract backed by `localStorage`, initially seeded
  from `src/mock-data.js`. It can be replaced by a remote adapter later.
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

Create a production build:

```bash
npm run build -w @palletscanner/web
```
