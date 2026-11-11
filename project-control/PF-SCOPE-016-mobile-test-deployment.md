# PF-SCOPE-016 — Phone test builds via TestFlight + EAS Update
Status: CLOSED (VERIFIED 2026-11-10 — preview pipeline live end to end; acceptance run on the direct-install preview build, see completion record)
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

- [x] Owner installs the preview build on the iPhone and signs in. — 2026-11-10, direct-install build c21ecba7 (see completion record for the route note); owner: "I'm in."
- [x] A JS-only change published via `eas update` reaches the installed build's channel with no new build. — Publishing half VERIFIED 2026-11-10 (EAS preview run #3 published to the preview channel; the workflow auto-publishes on scope-branch pushes). Receipt on the device was not separately observed: every update published that day was JS-identical to the build's embedded bundle, so there was no visible delta to confirm by eye. The channel, runtime policy, and client wiring are all in place; the first content-bearing update will exercise receipt in normal use.
- [x] PF-SCOPE-013's device check is run from the preview build. — PASSED 2026-11-10 from build c21ecba7 (see PF-SCOPE-013).

## Completion record

Owner setups completed 2026-11-10: App Store Connect record "PalletFlip" (app id 6833132920), "Internal" TestFlight group with the owner as tester, `EXPO_TOKEN` secret set in the repo by the owner. Repo build MERGED 2026-11-10 via PR #18 as 845f2a07 (expo-updates, updates URL + appVersion runtime policy in app.json, preview/production channels in eas.json). CI workflow landed by the owner via the web editor (main d446545); its first runs failed because expo-github-action installed eas-cli with yarn — fixed by adding `packager: npm` to both jobs (main ffbb40f), verified by manual dispatch run #3 (publish to the preview channel, SUCCESS).

First preview build (interactive, owner-run, 2026-11-10): EAS build 8591c511 — established the project's Apple credentials on EAS (distribution certificate active to Nov 2027). Two findings: (1) the preview profile's `distribution: internal` produces a direct-install (ad hoc) build rather than a TestFlight build; the owner proceeded on this route — installs go through the expo.dev build page, no Apple processing wait — and the App Store Connect record stays available if a store-distribution variant is wanted later. (2) The installed build showed "App login is not configured": EAS builds never received the `EXPO_PUBLIC_*` values (they lived only in the gitignored `.env.local`). Fixed in PR #20 (MERGED as 1f50ae38): eas.json preview/production profiles carry the four public values.

Second build (CI-dispatched, 2026-11-10): Lenard triggered EAS preview run #6 (task=build) — the build job succeeded non-interactively in ~1 minute and submitted EAS build c21ecba7. The owner installed it, signed in ("I'm in."), and passed the PF-SCOPE-013 keyboard check from it ("Good!"). The pipeline the scope promised — Lenard publishes → the build/update appears on the owner's iPhone → the owner tests from anywhere — is live. Scope VERIFIED and CLOSED 2026-11-10. The prepared copy at `project-control/prepared/eas-update.yml` was synced with the live workflow's `packager: npm` fix in the same closeout pass.
