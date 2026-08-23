# Issue Acceptance Gate

GitHub state is not proof of working behavior. An issue may be closed only after every applicable requirement has current, reproducible evidence.

## Before implementation

1. Number each acceptance criterion as `AC-01`, `AC-02`, and so on.
2. Identify the highest observable test seam for each criterion.
3. Record which delivery surfaces are in scope: local source, browser UI, clipboard, CSV, SVG, JSON, XLSX, print/PDF, Site, and offline package.
4. Use `Refs #<issue>` in pull requests so merging cannot close the issue automatically.

## Required evidence before closure

- The merged `main` commit is identified.
- Every numbered acceptance criterion has a `PASS` row with a test or inspection artifact.
- Unit tests pass when calculation or domain logic changed.
- Real-browser tests pass when user interaction, layout, rendering, persistence, import, or export changed.
- Generated files are read back and checked when CSV, JSON, SVG, or XLSX behavior changed.
- The exact user-reported fixture is included when fixing a regression; a nearby or simplified path is not a substitute.
- All affected delivery surfaces consume the same authoritative model when the requirement promises consistency across UI and exports.
- The production Site is checked after deployment when Site delivery is in scope.
- The offline archive is integrity-checked, freshly extracted, opened, and behaviorally checked when offline delivery is in scope.
- Source, Site package, and offline runtime files are compared when release parity is part of the issue.
- The working tree is clean and the local `main` matches the published `main`.

## Closure record template

Post this table to the issue before closing it:

| Criterion | Result | Evidence | Delivery surface |
| --- | --- | --- | --- |
| AC-01 | PASS | Test name, artifact, or read-back result | Browser UI |

Then record:

- Merged commit:
- Unit tests:
- Browser tests:
- Export read-back:
- Production Site verification:
- Fresh offline-package verification:
- Known limitations or deferred work: `None` or linked open issues

## Hard stop

Do not close when any criterion is `FAIL`, `BLOCKED`, `NOT RUN`, lacks evidence, or was tested only on a different path from the reported behavior. Do not replace missing verification with “PR merged”, “tests passed” without test names, “deployed”, or “file exists”.

If a previously closed issue fails this gate, classify it as partially satisfied, reopen it when appropriate, and keep the regression/remediation issue open until the full gate passes.
