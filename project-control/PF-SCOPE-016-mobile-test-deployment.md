# PF-SCOPE-016 — Phone test builds via TestFlight + EAS Update
Status: APPROVED (build sequenced after the owner's one-time setups below)
Owner approval: APPROVED 2026-11-07 (owner chose the bundle with PF-SCOPE-015; recorded as PF-D-015)
Decision authority: PF-D-015 (test deployments inside approved-scope autonomy); the Expo token lives only as a GitHub repository secret set by the owner — Lenard never holds it.

## Problem

Every mobile device pass currently requires the owner's home machine running Metro on the same Wi-Fi, with the right branch checked out (see the PF-SCOPE-002/013 passes). The owner cannot run a check away from that machine, and each check costs a setup session before the first test step.

## Target flow

Lenard publishes → the build/update appears on the owner's iPhone → the owner tests from anywhere. Full builds via TestFlight (internal testing: no beta review); JS-only changes via EAS Update (OTA) to the preview channel — the owner just relaunches the app.

## Included

- **Repo (Lenard):** add `expo-updates`; `app.json` gains the updates URL (EAS project `36973777-f009-4dd0-ba11-8bd1f7b0c983`) and a `runtimeVersion` policy; `eas.json` preview/production profiles gain channels (`preview` / `production`); development profile unchanged.
- **CI (prepared by Lenard, landed by the owner):** a GitHub Actions workflow that runs `eas update --channel preview` for scope branches and supports a manually-dispatched preview build. Workflow files cannot be pushed through Lenard's GitHub connector (403, established 2026-11-03), so the owner adds the prepared file via the GitHub web editor — one paste.
- **Owner one-time setups:** (1) App Store Connect app record for `com.coltoninkley.palletscanner` + himself as internal tester + TestFlight app installed; (2) an Expo access token pasted into the repo's GitHub secrets as `EXPO_TOKEN` (Lenard never sees it); (3) the first `eas submit` — needs his Apple ID + 2FA, run from paste-ready steps Lenard prepares (or via the CI build + his submit).
- After setup: per-scope device checks become "open TestFlight / relaunch, run the steps" — starting with the waiting PF-SCOPE-013 check.

## Explicitly excluded

- No App Store release, no external testers, no change to the development (dev-client) workflow — Metro stays available.
- No native dependency or Expo SDK changes (those ride their own scopes and always need a full build; OTA covers JS only).
- Android stays deferred (existing decision).

## Acceptance checks

- [ ] Owner installs the TestFlight preview build on the iPhone and signs in.
- [ ] A JS-only change published via `eas update` reaches the installed build on relaunch, with no new TestFlight build.
- [ ] PF-SCOPE-013's device check is run from the TestFlight build.

## Completion record

(Pending — filled in at verification.)
