# Issue 28 Acceptance Matrix

Issue: `#28` — one project-active liquid-preparation plan per physical plate and explainable cross-plate compatibility.

The issue remains open until every row is `PASS`. PR merge alone is not acceptance evidence.

| Criterion | Required observation | Automated evidence | Release evidence | Status |
| --- | --- | --- | --- | --- |
| AC-01 | First save creates exactly one active plan | `tests/workspace-core.test.js`; browser local-storage read-back | Site + fresh offline browser check | LOCAL PASS |
| AC-02 | Later save replaces the plan, preserves identity, and keeps count at one | Workspace upsert unit test; browser ID/count assertion | Site + fresh offline browser check | LOCAL PASS |
| AC-03 | Draft, saved-current, saved-stale, and empty states are distinct in Chinese and English | Browser lifecycle labels; translated UI render | Site + fresh offline browser check | LOCAL PASS |
| AC-04 | Stale plans do not enter aggregation or project exports | Lifecycle domain test; aggregation/export browser path | Site + fresh offline export read-back | LOCAL PASS |
| AC-05 | Legacy duplicates become one current plan plus recoverable inert archive and notice | Normalization unit test; browser migration/storage assertion | Site + fresh offline migration check | LOCAL PASS |
| AC-06 | Exact A549-1…A549-4 fixture yields one preparation per Mock, NC-FAM, siRNA, and shared B mix covering all four plates | `scripts/visual-smoke.mjs` exact four-plate fixture | Site + fresh offline browser check | LOCAL PASS |
| AC-07 | Real composition or critical-handling difference remains separate with a human reason | Compatibility unit test; deliberate browser volume difference | Site + fresh offline browser check | LOCAL PASS |
| AC-08 | UI-only and location/count metadata do not split equivalent chemistry | Compatibility unit test | Site + fresh offline four-plate check | LOCAL PASS |
| AC-09 | Cargo-containing and cargo-free tube boundaries remain scientifically correct | Liquid-core and liquid-plan-core unit tests; exact operator table | Site + fresh offline browser check | LOCAL PASS |
| AC-10 | Shared overage is applied once after compatible base-demand merge | Workspace merge unit test; XLSX/CSV numeric read-back path | Site + fresh offline export read-back | LOCAL PASS |
| AC-11 | Clipboard, CSV, summary XLSX, project XLSX, and print agree and expose no internal key | Browser clipboard/download parsing and print interception | Site + fresh offline export read-back | LOCAL PASS |
| AC-12 | Local, production Site, and fresh offline archive pass the same fixture and match merged `main` | Local browser matrix complete | Pending merge, Site, offline archive, and hashes | PENDING RELEASE |

## Authoritative seams

- `WorkspaceCore.publishLiquidPlan()` owns the single-current-plan invariant.
- `WorkspaceCore.currentLiquidPlan()` is the only active-plan read seam used by summaries and exports.
- `LiquidPlanCore.preparationCompatibility()` owns chemical preparation compatibility.
- `LiquidPlanCore.buildTransfectionExecutionPlanFromContributions()` owns operator execution order.
- `scripts/visual-smoke.mjs` is the highest observable browser and file-read-back seam for this issue.

## Release evidence

To be filled only after merge and delivery verification:

- Merged commit:
- Unit tests:
- Local browser matrix:
- Production Site:
- Fresh offline package:
- Source/Site/offline hashes:
