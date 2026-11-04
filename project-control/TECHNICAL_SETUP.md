# Technical Setup and Environment Safety
This guide orients a new agent. **Do not assume a fresh workstation or safe local backend is configured.**

## Repository
https://github.com/Inkleyc/PalletScanner — handoff base `9594cf4492c641f338895459957dc0568390fe2a`.

## Components
- `apps/mobile`: Expo/React Native, camera/scanning/intake.
- `apps/web`: React/Vite operations app.
- `packages/core`: shared domain logic.
- `packages/api-client`: shared API contracts/client.
- `server`: eBay, authentication, backend-only services.
- `supabase/migrations`: schema, policies, storage.
- `docs`: implementation decisions, guides, runbooks and historical audits.

## Root commands (inspect configuration before running)
```bash
npm install
npm start                  # mobile Expo
npm run dashboard:dev      # web Vite
npm run ebay-server        # backend; only with verified safe environment
npm run check              # aggregate lint/types/tests/schema checks
npm run mobile:emulator-check
npm run supabase:app-check
```

## Environment boundaries
Prefer isolated local Supabase and disposable local test accounts, after validating migration replay. The previous Docker/Supabase CLI plan was **proposed, not implemented/verified**. Keep both existing hosted Supabase projects untouched. Do not clone hosted user data. Verify Expo's actual environment loading; `.env.emulator.local` is not necessarily auto-loaded. Desktop and Android emulator loopback hosts differ. HTTPS requirements and local-only exceptions must be verified without weakening production guards.

Secrets stay backend-only. No Anthropic key reactivation without approval. eBay uses sandbox for safe integration work; no live listing/order actions. Facebook Marketplace is an assisted workflow. Check active Render deployment and auto-deploy behavior; the repository's `render.yaml` is not proof of remote state.

## Existing documentation to preserve and reconcile
- `README.md`, `apps/mobile/README.md`, `apps/web/README.md`
- `docs/backend-data-contract.md`
- `docs/inventory-operations-framework.md`
- `docs/inventory-operations-data-model.md`
- `docs/web-mobile-split-gameplan.md`
- `docs/web-flow-audit.md`
- `docs/mobile-working-code-reconciliation.md`
- `docs/return-lifecycle-validation.md`
- `docs/ebay-integration-guide.md`
- `docs/ebay-production-runbook.md`
- `docs/facebook-marketplace-workflow.md`
- `docs/supabase-setup-guide.md`
- `docs/production-launch-checklist.md`
- `docs/mobile-testing-and-expo-strategy.md`

Never commit secrets, tokens, environment files, production exports or private customer data.
