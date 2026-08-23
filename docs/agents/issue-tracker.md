# Issue tracker: GitHub

Issues and specifications for this repository live in GitHub Issues. Use the `gh` CLI from this repository so operations resolve to `annayzhu/Plate-Layout-Planner`.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`.
- Read an issue: `gh issue view <number> --comments`.
- List issues: `gh issue list` with appropriate state and label filters.
- Comment on an issue: `gh issue comment <number> --body "..."`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close an issue: `gh issue close <number> --comment "..."`.
- Infer the repository from `git remote -v`; `gh` resolves it automatically inside this clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Pull requests must not close issues automatically

- Use `Refs #<issue-number>` in pull request bodies.
- Do not use `Closes`, `Fixes`, or `Resolves` for implementation pull requests.
- A merged pull request is only one input to acceptance; it is not completion evidence.
- Close the issue only after the acceptance gate in `docs/agents/acceptance-gate.md` passes in full.
- If a user-visible contradiction is found after closure, reopen the issue or create a regression issue that links the partially satisfied issue; never continue reporting it as complete.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## When work is ready to close

Post the completed acceptance record from `docs/agents/acceptance-gate.md` as an issue comment. Close only when every row is `PASS`. `FAIL`, `BLOCKED`, `NOT RUN`, missing evidence, or stale evidence keeps the issue open.

## Triage

Use the label mapping in `docs/agents/triage-labels.md`.
