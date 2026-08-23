# Issue #31 acceptance matrix

| AC | Requirement | Evidence | Status |
|---|---|---|---|
| AC-01 | Unit suite remains passing | `npm test` | PENDING |
| AC-02 | Stable `npm run test:visual` command passes | full runner output | PENDING |
| AC-03 | Plate-layout journey runs independently | `ACCEPTANCE_JOURNEYS=plate-layout` | PENDING |
| AC-04 | Liquid-plan lifecycle journey runs independently | `ACCEPTANCE_JOURNEYS=liquid-plan-lifecycle` | PENDING |
| AC-05 | Exact A549 fixture independently parses CSV/XLSX | `ACCEPTANCE_JOURNEYS=issue-28-merge` | PENDING |
| AC-06 | Incompatible recipe independently explains split | `ACCEPTANCE_JOURNEYS=issue-28-split` | PENDING |
| AC-07 | Localization/responsive coverage is isolated where extracted and mapped otherwise | architecture coverage map | PENDING |
| AC-08 | Every independent journey starts clean | harness `runJourney` + browser evidence | PENDING |
| AC-09 | Failure output includes journey name | harness test and forced failure audit | PENDING |
| AC-10 | Same journey contract runs through local, Site artifact, and offline adapters | three delivery runs | PENDING |
| AC-11 | No historical user-visible assertion removed | full comprehensive baseline + coverage map | PENDING |
| AC-12 | Old assertions map to new journeys or retained baseline | `acceptance-architecture.md` | PENDING |
| AC-13 | Production assets unchanged by test-only refactor | before/after hashes | PENDING |
| AC-14 | Matrix completed before closure | this document | PENDING |
| AC-15 | PR, main, Site, and offline states reported separately | release evidence | PENDING |
