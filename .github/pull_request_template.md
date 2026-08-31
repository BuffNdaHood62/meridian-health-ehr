## What / why

<!-- One paragraph. The diff says WHAT; tell us WHY. -->

## Changes

<!-- Bullet list of the substantive changes. -->

## Verification

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm test` passing
- [ ] `npm run build` passing
- [ ] Checked in the running app, not just the test runner

## Risk / rollback

<!-- What breaks if this is wrong? How do we revert it?
     If the answer is "nothing" or "just revert", say so. -->

## Author checklist

- [ ] Diff is **< 400 lines and < 10 files** (split it otherwise — big diffs don't get reviewed)
- [ ] One logical change (a feature and a removal are two PRs)
- [ ] New/changed logic has a test; bug fixes have a **regression test**
- [ ] `AGENTS.md` updated if architecture or data flow changed
- [ ] No new `as X`, `eslint-disable`, or `!` — or each one justified in a comment
- [ ] No `console.*` left in `src/`
- [ ] No real PHI in any file (mock data only)

## Reviewer checklist

- [ ] **I can explain what this does and why** — if not, request a split
- [ ] Errors are surfaced, not swallowed (no bare `catch {}`, no dropped `error`)
- [ ] No new type assertions or lint suppressions without a stated reason
