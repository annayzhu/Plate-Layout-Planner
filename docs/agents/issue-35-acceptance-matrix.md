# Issue #35 acceptance matrix

| AC | Requirement | Evidence | Delivery surface | Status |
|---|---|---|---|---|
| AC-01 | Plate-name comparison trims whitespace, normalizes Unicode, and ignores case | `compares plate names after trimming, unicode normalization, and case folding` | Domain unit test | PASS |
| AC-02 | A duplicate manual name is blocked without changing the committed name or tab | `plate-layout` journey checks duplicate `control plate` against `Control Plate` and retains `Isolated plate journey` | Local browser + production Site | PASS |
| AC-03 | Duplicate-name feedback is inline, bilingual, and accessible | `plate-layout` checks Chinese and English messages plus `aria-invalid=true`; no native dialog is invoked | Browser UI | PASS |
| AC-04 | Correcting the name clears the error and Enter updates the active tab | `plate-layout` renames to `Treatment Plate` and checks error removal/tab synchronization | Local browser + production Site | PASS |
| AC-05 | Automatically generated copy names remain unique within 80 characters | `generates a unique bounded copy name even when the source name is 80 characters` | Domain unit test | PASS |
| AC-06 | A compact current-plate clear action uses two-step in-page confirmation | `plate-layout` asserts the first click enters `.confirming` and leaves `Sample-A` unchanged | Local browser + production Site | PASS |
| AC-07 | Confirmed clear removes all format-specific well maps and current selection | `plate-layout` reads all five physical-plate maps and checks `已选 0 孔` | Browser + persisted workspace | PASS |
| AC-08 | Clear removes generated calculation dimensions, outputs, and logs but preserves user dimensions | Domain `clearPlateLayout` test plus browser persisted-state read-back | Unit + browser | PASS |
| AC-09 | Clear preserves plate name and active plate format | Browser checks `Treatment Plate` and active 24-well format after clear | Browser UI + persisted workspace | PASS |
| AC-10 | Clear marks the saved liquid plan stale | Browser reads `stale=true`, `status=stale`; domain test checks the same transition | Unit + browser | PASS |
| AC-11 | Undo button and Ctrl/Command+Z restore the complete cleared state | Browser restores visible 24-well values, hidden 6-well values, calculation output, and current liquid plan through both paths | Browser + persisted workspace | PASS |
| AC-12 | Cross-format maps survive normalization and therefore remain undoable | `normalization preserves well maps from every format of a physical plate` | Domain unit test | PASS |
| AC-13 | Existing planner behavior remains intact | `npm test`: 65/65; comprehensive plus all four isolated journeys pass | Unit + full browser matrix | PASS |
| AC-14 | Merged source, Site, and fresh offline package deliver the same production assets | source/Site/offline hashes match for `app.js`, `index.html`, `styles.css`, and `workspace-core.js` | Main + Site v8 + offline r14 | PASS |

## Delivery evidence

- Implementation PR: #36, squash-merged as `723058b99591fb92d0605c64a35b589418a6e10f`.
- Unit suite: 65/65 PASS after code-review fixes.
- Code review: spec axis has no remaining findings; the standards hard finding was fixed by moving workspace reads into the acceptance harness.
- Browser matrix: comprehensive, `plate-layout`, `liquid-plan-lifecycle`, `issue-28-merge`, and `issue-28-split` all PASS locally and from a fresh r14 extraction.
- Production Site: owner-only version 8 deployed successfully; authenticated live-browser checks passed duplicate-name rejection, clear confirmation, clear, and undo at `https://plate-layout-planner.pountneycitlali784.chatgpt.site/plate/`.
- Offline delivery: `Plate-Layout-Planner_Offline_20260824_r14.zip` and `Plate-Layout-Planner_Offline_LATEST.zip`; archive integrity and fresh-extraction browser matrix PASS; both SHA-256 `44b1fae118e24644a11022fcef214c3f4cd5f40caa77569b6f90944d3f27e030`.
- Production asset SHA-256 values shared by merged source, Site, and offline r14:
  - `app.js`: `c4ede81fd1219ff1426a77fcbb1e3a74d68a9ee44836e5f38a47e95c3ee8e138`
  - `index.html`: `3594d5fce7527e9106af01a2bd9f301c8bb35653ac96d3a7af94b203b037cbc9`
  - `styles.css`: `3b51c483d377e83ae8cffae019b50ce67b1e2a8b4ab20fcfdee228a2dab149e4`
  - `workspace-core.js`: `e49e7ce03d11a7db0a0567a4c01b3af952d7fc1ee3c47ad6965002854c882f41`
- Known limitations or deferred work: none for Issue #35.
