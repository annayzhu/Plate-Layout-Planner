# Issue 28 Acceptance Matrix

Issue: `#28` — one project-active liquid-preparation plan per physical plate and explainable cross-plate compatibility.

The issue remains open until every row is `PASS`. PR merge alone is not acceptance evidence.

| Criterion | Required observation | Automated evidence | Release evidence | Status |
| --- | --- | --- | --- | --- |
| AC-01 | First save creates exactly one active plan | `tests/workspace-core.test.js`; browser local-storage read-back | Site build + fresh offline browser matrix | PASS |
| AC-02 | Later save replaces the plan, preserves identity, and keeps count at one | Workspace upsert unit test; browser ID/count assertion | Site build + fresh offline browser matrix | PASS |
| AC-03 | Draft, saved-current, saved-stale, and empty states are distinct in Chinese and English | Browser lifecycle labels; translated UI render | Site build + fresh offline browser matrix | PASS |
| AC-04 | Stale plans do not enter aggregation or project exports | Lifecycle domain test; aggregation/export browser path | Site build + fresh offline export read-back | PASS |
| AC-05 | Legacy duplicates become one current plan plus recoverable inert archive and notice | Normalization unit test; browser migration/storage assertion | Site build + fresh offline migration check | PASS |
| AC-06 | Exact A549-1…A549-4 fixture yields one preparation per Mock, NC-FAM, siRNA, and shared B mix covering all four plates | `scripts/visual-smoke.mjs` exact four-plate fixture | Site build + fresh offline browser matrix | PASS |
| AC-07 | Real composition or critical-handling difference remains separate with a human reason | Compatibility unit test; deliberate browser volume difference | Site build + fresh offline browser matrix | PASS |
| AC-08 | UI-only and location/count metadata do not split equivalent chemistry | Compatibility and normalized-unit unit tests | Site build + fresh offline four-plate check | PASS |
| AC-09 | Cargo-containing and cargo-free tube boundaries remain scientifically correct | Liquid-core and liquid-plan-core unit tests; exact operator table | Site build + fresh offline browser matrix | PASS |
| AC-10 | Shared overage is applied once after compatible base-demand merge | Workspace merge unit test; XLSX/CSV numeric read-back path | Site build + fresh offline export read-back | PASS |
| AC-11 | Clipboard, CSV, summary XLSX, project XLSX, and print agree and expose no internal key | Browser clipboard/download parsing and print interception | Site build + fresh offline export read-back | PASS |
| AC-12 | Local, production Site, and fresh offline archive pass the same fixture and match merged `main` | 59/59 unit tests; local, saved Site build, and fresh-offline browser matrices | Site version 7; offline r12; source/Site/offline hashes match | PASS |

## Authoritative seams

- `WorkspaceCore.publishLiquidPlan()` owns the single-current-plan invariant.
- `WorkspaceCore.currentLiquidPlan()` is the only active-plan read seam used by summaries and exports.
- `LiquidPlanCore.preparationCompatibility()` owns chemical preparation compatibility.
- `LiquidPlanCore.buildTransfectionExecutionPlanFromContributions()` owns operator execution order.
- `scripts/visual-smoke.mjs` is the highest observable browser and file-read-back seam for this issue.

## Release evidence

- Product merge: `946b2aaaf1c07445edd09d3fea80dda7b6f80d7b`.
- Unit tests: 59/59 passed.
- Local browser matrix: passed, including the exact four-plate A549 fixture, deliberate split explanation, clipboard, CSV, XLSX, print, persistence, and migration read-back.
- Production Site: version 7 deployed successfully at `https://plate-layout-planner.pountneycitlali784.chatgpt.site`; its saved build artifact passed the same browser matrix and the owner-only URL was opened in Codex.
- Fresh offline package: `Plate-Layout-Planner_Offline_20260823_r12.zip` was integrity-checked, freshly extracted, served, and passed the same browser matrix; `Plate-Layout-Planner_Offline_LATEST.zip` was refreshed from the identical archive.
- Source/Site/offline `app.js` SHA-256: `346eae3a796c6e6daf5dc59edcabc656fc223194b3388df4d69a8beb4517f1f6`.
- r12/LATEST ZIP SHA-256: `6fe944d3cb318fa87f6904af5b58f7c25ea95dbefac8ba8513c4d4cd7027ad9b`.
- Known limitations or deferred work: none for Issue #28.
