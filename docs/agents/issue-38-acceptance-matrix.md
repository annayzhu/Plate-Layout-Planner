# Issue #38 acceptance matrix

Issue: `#38` — plate-canvas wheel zoom and first-phase state-consistency guards.

The issue remains open until every row is `PASS`. PR merge alone is not acceptance evidence.

| AC | Requirement | Evidence | Delivery surface | Status |
|---|---|---|---|---|
| AC-01 | Wheel inside the plate canvas changes only the plate view scale | `issue-38-plate-zoom`: measured well geometry increases after wheel input | Local browser | PASS |
| AC-02 | Zoom is bounded, smooth, starts at 100%, and exposes a bilingual percentage/help cue | Browser checks initial 100%, continuous delta zoom-in/out, and exact 60%/180% bounds; UI contains translated guidance | Local browser | PASS |
| AC-03 | Wheel outside the plate retains normal page scrolling | Browser journey measures increasing `window.scrollY` over the hero | Local browser | PASS |
| AC-04 | Zoom does not change project data, history, liquid plans, exports, or persistence | Browser journey preserves a pre-existing selection, undo availability, saved-plan snapshot, complete persisted workspace, and byte-identical current-plate CSV; a post-zoom edit still undoes its plate-name change while retaining the earlier history entry | Local browser + CSV | PASS |
| AC-05 | Click, Ctrl/Command toggle, empty click, Shift range, and drag-box selection still work after zoom | Browser journey asserts all five interaction paths after zoom | Local browser | PASS |
| AC-06 | Enlarged content remains reachable within a bounded scroll viewport | `.plate-scroll` owns horizontal/vertical overflow and a bounded viewport | Local browser | PASS |
| AC-07 | Import overflow is rejected atomically with incoming/available counts | Domain test plus browser XLSX two-sheet import into a 23-plate workspace | Unit + local browser | PASS |
| AC-08 | Imported names obey the same normalized uniqueness invariant | Domain test plus browser preview of `Incoming A → Incoming A 2` and confirmed tab-name read-back | Unit + local browser | PASS |
| AC-09 | Summary UI and export use current names, membership, and order | Domain identity test plus browser rename/reorder/delete, UI read-back, XLSX read-back, and CSV read-back | Unit + local browser + CSV/XLSX | PASS |
| AC-10 | Presentation-only changes preserve plans; scientific edits make them stale | Browser changes color parameter, then changes a well assignment and reads persistence | Local browser | PASS |
| AC-11 | Complete unit suite passes | `npm test`: 70/70 | Unit | PASS |
| AC-12 | Complete browser suite passes, including 24/96/384 zoom | Comprehensive baseline and all five isolated journeys, including `issue-38-plate-zoom`, pass | Local browser | PASS |
| AC-13 | CSV/XLSX affected outputs are parsed and checked | Renamed summary XLSX and post-delete summary CSV are captured, parsed into sheets or CSV rows/cells, and read back on the exact changed path | Local files | PASS |
| AC-14 | Merged source, production Site, and fresh offline archive pass and match | GitHub `main` `549f617`; Sites version 9 live browser read-back; fresh r15 extraction passed the complete browser suite; core asset hashes match | Main + Site + offline | PASS |

## Authoritative seams

- `WorkspaceCore.importPlates()` owns capacity, atomicity, normalized names, and import application.
- `WorkspaceCore.resolveSummaryPlates()` resolves stored summary scope against current workspace identity and order.
- `currentLiquidSummary()` derives presentation and export rows from current saved plans rather than trusting cached names or groups.
- `plateZoom` is presentation-only session state and never enters workspace persistence or undo history.

## Release evidence

- Product PRs: #39 (implementation) and #40 (cache-safe asset revision), both squash-merged.
- GitHub source: `main` at `549f617bacb5c26bacdbf4259fe7257efccb8fc1`.
- Production Site: version 9 at `https://plate-layout-planner.pountneycitlali784.chatgpt.site/plate/`; live UI changed from 100% to 122% on plate-canvas wheel input and retained a two-well Ctrl/Command selection.
- Offline archive: `Plate-Layout-Planner_Offline_20260915_r15.zip`; a fresh extraction passed the comprehensive journey and all five isolated journeys.
- `Plate-Layout-Planner_Offline_LATEST.zip` is byte-identical to r15; both archives have SHA-256 `1fca3e7bdc5b1ed241970afe00feb1fdc0c02049aaeacc39baf39eb3c2d5782b`.
- Source, Site payload, and fresh offline extraction match for the four changed delivery-critical assets: `index.html` `c514fc10…`, `app.js` `947cf574…`, `styles.css` `bacebb3c…`, and `workspace-core.js` `603c1e8e…`.
