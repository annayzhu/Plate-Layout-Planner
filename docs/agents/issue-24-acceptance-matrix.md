# Issue 24 Acceptance Matrix

Issue: `#24` — unify single-plate and cross-plate Transfection execution plans.

The issue remains open until every row is `PASS`. PR merge alone is not acceptance evidence.

| Criterion | Required observation | Automated evidence | Release evidence | Status |
| --- | --- | --- | --- | --- |
| AC-01 | Single-plate UI orders all treatment-specific tubes before the shared tube, mixing, and dosing | `scripts/visual-smoke.mjs` exact Mock / NC-FAM / siRNA fixture | Site + fresh offline browser check | PASS |
| AC-02 | Save, close, and edit preserve the same versioned plan, targets, and order | Browser local-storage snapshot and reopen assertions | Site + fresh offline browser check | PASS |
| AC-03 | Single-plate clipboard uses the canonical plan | Browser clipboard read-back | Site + fresh offline browser check | PASS |
| AC-04 | Single-plate CSV uses the canonical plan | Download and UTF-8 read-back | Site + fresh offline browser check | PASS |
| AC-05 | Print/PDF uses the canonical result DOM | Browser print interception plus DOM assertions | Site + fresh offline browser check | PASS |
| AC-06 | Cross-plate summary keeps the same dependency order and safe merge boundary | Browser summary table assertions | Site + fresh offline browser check | PASS |
| AC-07 | Summary copy, CSV, and XLSX share the plan and expose no internal recipe key | Clipboard/download/read-back assertions | Site + fresh offline browser check | PASS |
| AC-08 | Project XLSX contains per-plate and global canonical execution sheets | XLSX parse/read-back assertions | Site + fresh offline archive read-back | PASS |
| AC-09 | Forward/reverse workflows and arbitrary treatment names work in Chinese and English | `tests/liquid-plan-core.test.js` plus browser language assertions | Site + fresh offline browser check | PASS |
| AC-10 | Legacy saved plans cannot silently enter a current summary | Execution-plan version bump and legacy skip warning | Site + fresh offline browser check | PASS |
| AC-11 | Checked-plate controls are compact, keyboard reachable, visibly focused, translated, and narrow-safe | Browser geometry/focus/language/overflow assertions | Site + fresh offline browser check | PASS |
| AC-12 | Tests, deployed Site, and fresh offline package match merged `main` | Full test runs, hashes, and fresh extraction | Site version 6 and offline r11/LATEST | PASS |

## Authoritative model

`LiquidPlanCore.buildTransfectionExecutionPlanFromContributions()` is the single-plate adapter. It produces the same versioned execution-plan schema consumed by the cross-plate summary. UI rendering, saved snapshots, clipboard, CSV, print DOM, per-plate XLSX, and cross-plate exports must project from that schema rather than reconstructing protocol order.

## Release evidence

- Product merge: `451f66fc512a6c39387cf2520b77343fe57c905c`.
- Unit tests: 53/53 passed.
- Browser matrix: local, production Site, and freshly extracted offline package passed the same workflow.
- Production Site: version 6 at `https://plate-layout-planner.pountneycitlali784.chatgpt.site`.
- Offline delivery: `Plate-Layout-Planner_Offline_20260823_r11.zip` and `Plate-Layout-Planner_Offline_LATEST.zip`; both archives passed integrity checks and share SHA-256 `be27c270a94dd1fc94df3f4df87c467240ac975e603a3bb6b4d45d0ed367c624`.
- Source/Site/offline `app.js` SHA-256: `55116bc9791d9e6b21643a3591899926ca9323d23d8ccc6422399a258266a540`.
