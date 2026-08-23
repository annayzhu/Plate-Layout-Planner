# Browser acceptance architecture

## Purpose

The acceptance layer verifies user-visible behavior and saved artifacts without making production modules aware of the test runner. It is deliberately organized around a deep harness and independently meaningful journeys rather than selector-sized helpers or arbitrary file length.

## Module boundaries

| Module | Owns | Must not own |
|---|---|---|
| `scripts/acceptance/harness.mjs` | Playwright loading, browser/context/page lifecycle, clean localStorage and IndexedDB state, workspace persistence, download capture, CSV/XLSX bytes, workbook parsing, failure screenshots, journey-labelled errors | Plate science, expected treatment identities, feature-specific selectors |
| `scripts/acceptance/fixtures.mjs` | Deterministic domain fixtures reusable by more than one journey; exact four-plate A549 regression data | Browser actions, DOM assertions, arbitrary UI state |
| `scripts/acceptance/journeys/*.mjs` | A coherent user journey and its observable acceptance assertions | Browser launch, shared persistence mechanics, duplicated download parsing |
| `scripts/acceptance/runner.mjs` | Journey registry, selection through `ACCEPTANCE_JOURNEYS`, result aggregation | Feature assertions or fixture construction |
| `scripts/visual-smoke.mjs` | Stable public command entry point | Test implementation |

## Adding a journey

1. Add one exported async function under `scripts/acceptance/journeys/`.
2. Accept the harness context rather than importing Playwright directly.
3. Keep fixture construction outside the journey when it is reused or scientifically meaningful.
4. Register the journey in `JOURNEYS`.
5. Add a registry/fixture unit assertion when a new seam is introduced.
6. Run the journey alone first, then the complete suite.
7. Parse downloaded CSV/XLSX content; do not accept download existence alone.

## Coverage migration map

| Historical coverage in the former monolithic script | Current independent journey | Baseline retained |
|---|---|---|
| Initial render, editable name, click/Ctrl/Shift/empty-space selection, three parameter lines, all plate sizes, persisted language | `plate-layout` | `comprehensive` |
| First save, update with stable identity, stale after plate edit, two-step clear, duplicate migration | `liquid-plan-lifecycle` | `comprehensive` |
| Exact A549-1 through A549-4 Mock/NC-FAM/siRNA merge, one shared B mix, CSV and XLSX read-back | `issue-28-merge` | `comprehensive` |
| Deliberate NC-FAM volume incompatibility and operator-facing explanation | `issue-28-split` | `comprehensive` |
| Advanced calculators, recipe library, batch paste, import, responsive layout, project operations, full execution workbook | not yet extracted | `comprehensive` |

The comprehensive journey remains a regression baseline while the most failure-prone domains have independent seams. Future extraction must move a coherent journey and update this map; simply splitting the large file is not an architectural improvement.

## Hosting adapters

The harness accepts `ACCEPTANCE_BASE_URL`. The same journey functions therefore run against:

- local source served by a static server;
- the saved Site build artifact served locally for deterministic browser verification;
- a freshly extracted offline package.

Production Site authentication and deployment are lifecycle checks outside the journey implementation. The tested Site artifact and offline package must be hashed against merged production assets.
