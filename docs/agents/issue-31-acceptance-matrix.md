# Issue #31 acceptance matrix

| AC | Requirement | Evidence | Status |
|---|---|---|---|
| AC-01 | Unit suite remains passing | `npm test`: 61/61 after final merge | PASS |
| AC-02 | Stable `npm run test:visual` command passes | full runner: comprehensive baseline plus four isolated journeys | PASS |
| AC-03 | Plate-layout journey runs independently | `plate-layout`: 24-well render, selection, assignment, all formats, language persistence | PASS |
| AC-04 | Liquid-plan lifecycle journey runs independently | `liquid-plan-lifecycle`: create, stable-ID update, stale, clear, duplicate migration | PASS |
| AC-05 | Exact A549 fixture independently parses CSV/XLSX | `issue-28-merge`: seven expected preparation labels; CSV and three-sheet XLSX read back | PASS |
| AC-06 | Incompatible recipe independently explains split | `issue-28-split`: NC-FAM split retained with `每孔组分或体积不同` | PASS |
| AC-07 | Localization/responsive/accessibility checks are isolated | `plate-layout`: English persistence, keyboard focus, 390 px viewport = 390 px document width | PASS |
| AC-08 | Every independent journey starts clean | harness `runJourney` clears localStorage and IndexedDB before each journey | PASS |
| AC-09 | Failure output includes journey name | forced failure audit emitted `[journey:plate-layout]` and a dedicated screenshot path | PASS |
| AC-10 | Same journey contract runs through local, Site artifact, and offline adapters | full runner PASS on local source, Site build at `/plate/index.html`, and fresh r13 extraction | PASS |
| AC-11 | No historical user-visible assertion removed | migrated comprehensive baseline PASS after fixture extraction | PASS |
| AC-12 | Old assertions map to new journeys or retained baseline | `docs/agents/acceptance-architecture.md` coverage migration map | PASS |
| AC-13 | Production assets unchanged by test-only refactor | source/Site/offline `app.js` SHA-256 `346eae3a...f1f6`; all five production hashes unchanged | PASS |
| AC-14 | Matrix completed before closure | all AC-01 through AC-15 have current evidence | PASS |
| AC-15 | PR, main, Site, and offline states reported separately | PR #32 and #33 merged; main `6a898b6`; Site deployment succeeded; offline r13/LATEST verified | PASS |

## Delivery evidence

- Architecture PR: #32, merged as `e5882616b9a788dd038a6074b28ea1d7554962f4`.
- Delivery-neutral fixture adapter PR: #33, merged as `6a898b62fe62e60de96e3663ee4472c471c8d358`.
- Site: owner-only production deployment succeeded using validated version 7. Production application content was unchanged, so Sites deduplicated the saved build to the existing version.
- Offline: `Plate-Layout-Planner_Offline_20260823_r13.zip` and `Plate-Layout-Planner_Offline_LATEST.zip` both passed archive integrity and fresh-extraction browser verification.
- Offline SHA-256: `13bcb0773c913a9b6e56cf64751a6e733797807a7609f891a4b4d0428bc391ee`.
- Production asset SHA-256 values remain:
  - `app.js`: `346eae3a796c6e6daf5dc59edcabc656fc223194b3388df4d69a8beb4517f1f6`
  - `index.html`: `bdf818d24297dd6515552d15233ff9ff0e5672b36c192e34dd80edd9eee32c64`
  - `styles.css`: `110ef4a6b394178101d88e32786ea841414bb0564d4057f2ae4b927f62505c34`
  - `liquid-plan-core.js`: `45d9bb39d1f224f3fdd455e8ffe02f660829a99722087cfb04287d386caca0ff`
  - `workspace-core.js`: `35510306e480d02376d9860827eccf987eac7998c31737ad7e587a543f4053f6`
