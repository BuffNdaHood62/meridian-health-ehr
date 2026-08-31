# Engineering Standards & Quality Gates

Companion to [`code-quality-audit.md`](./code-quality-audit.md). This is the **ongoing system** —
the audit is the snapshot, this is the process that keeps it from regressing.

**Design principle:** a standard nobody follows is worse than no standard. Every gate here runs
in under 3 minutes or is automated. If a rule can't be enforced by a tool, it has to fit on
one line in a checklist.

---

## The three gates

```
 ┌─ Gate 0: local (pre-commit)  ── <15s ── typecheck + lint on staged files
 │
 ├─ Gate 1: CI (per PR)         ── <3min ── typecheck + lint + test + build + coverage floor
 │
 └─ Gate 2: human review        ── <10min ── checklist below, on a diff < 400 lines
```

Gate 1 is worthless without Gate 2 — but Gate 2 is impossible if the diff is 4,000 lines.
That's why **diff size is a hard requirement, not a preference.**

---

## Gate 0 — Local (pre-commit)

Catch it before it leaves the machine. Staged files only, so it stays fast.

```bash
npm i -D husky lint-staged
npx husky init
```

`.husky/pre-commit`:
```bash
npx lint-staged
```

`package.json`:
```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["bash -c 'npx tsc --noEmit -p .'", "eslint --max-warnings=0"]
  }
}
```

> **Windows / git-bash note:** repo-wide `tsc` is documented as timeout-prone in this
> environment. If the hook feels slow, swap to `eslint --max-warnings=0` only and let CI
> own the typecheck. A fast hook that runs beats a thorough one that gets `--no-verify`'d.

---

## Gate 1 — CI

`.github/workflows/ci.yml` **already exists and was hardened during the audit.** Current state:

```yaml
- run: npm run typecheck
- run: npx eslint . --max-warnings=0 --rule '{"react-refresh/only-export-components":"off"}'
- run: npm test
- run: npm run build
```

Two things changed, and both matter:

1. **`--max-warnings=0`** — warnings now fail the build. This is the single highest-value
   change in the audit: the LabResults stale-closure bug (P0-1) was an ESLint *warning* that
   shipped and broke a whole page. `react-refresh/only-export-components` is exempted because
   it's HMR-ergonomics only (colocating a context with its component is a valid pattern);
   the 8 remaining warnings are all that rule. **Fix them and remove the exemption.**
2. **Node 20 → 24** — CI now matches the toolchain pinned in `AGENTS.md`. It passed on 20 by
   luck (Vite 7 needs ≥20.19); version drift between CI and local is how you get "works on
   my machine" CI failures.

> **You must still enable branch protection manually** — repo settings, not a file:
> Settings → Branches → Add rule on `master` → require a PR, 1 approval, and the `build`
> status check to pass. Until this is on, CI is advisory and everything above is optional.

**Coverage floor (later):** not installed yet — it needs `@vitest/coverage-v8`. When you add it,
start the floor at **5%** (you're at ~3.7%) and ratchet +5 per sprint. A floor set at 80% today
teaches the team to ignore CI; a floor that only ever ratchets up builds the habit.

**Branch protection** on `master`:
- ✅ Require a pull request before merging
- ✅ Require 1 approval
- ✅ Require status checks to pass (select `quality`)
- ✅ Require branches to be up to date
- ❌ Do **not** allow force pushes

---

## Language baseline

### `tsconfig.json` — target state

```jsonc
{
  "compilerOptions": {
    "strict": true,                        // ✅ already on
    "noUnusedLocals": true,                // ✅ already on
    "noUnusedParameters": true,            // ✅ already on
    "noFallthroughCasesInSwitch": true,    // ✅ already on
    "noUncheckedIndexedAccess": true,      // ⬅ ADD — catches the P0-4 bug class
    "exactOptionalPropertyTypes": true,    // ⬅ ADD (stretch — larger blast radius)
    "noImplicitOverride": true             // ⬅ ADD — free
  }
}
```

**Migration for `noUncheckedIndexedAccess`:** enable it, fix the ~18 errors, ship as one
reviewable commit. Most sites are already written defensively (`p[0]?.toUpperCase() ?? ""`),
so expect it to be quicker than it sounds. Do **not** sprinkle `!` to make errors go away —
each `!` is a claim that needs to be true.

### Zero-tolerance rules

| Rule | Why |
|---|---|
| **No `as X` to silence the compiler.** | An assertion is a lie the compiler believes. Annotate the return type instead. |
| **No `eslint-disable` without a `// why:` comment.** | A suppression with no reason is a debt nobody remembers taking on. |
| **No `console.*` in `src/`.** | You're at 0. Keep it that way. |
| **Every `catch` must either handle or rethrow with context.** | `catch {}` is how P0-2 happens. |

---

## Testing strategy — test by risk, not by ease

The current distribution is **inverted**: `utils/format.ts` is pure and easy, so it has tests;
`data/api.ts` is the highest-blast-radius file in the repo and has none. Fix the distribution.

```
Priority 1  ── data/api.ts mappers       (schema drift, the `as X` lie, empty-list bugs)
Priority 2  ── users.ts canAccess matrix (the authz gate — a hole here is a security bug)
Priority 3  ── auth flows                (lockout, session lifecycle, doctor-code gate)
Priority 4  ── page render smoke tests   (catches P0-4-class crashes cheaply)
Priority 5  ── CDS rules                 (already covered — maintain)
```

**Rule: any bug that reaches production gets a regression test in the same commit as the fix.**
No exceptions. This is the single highest-ROI testing rule there is.

**Rule: don't test what types already guarantee.** A test asserting `formatDate` returns a
string when the signature says `string` is testing the compiler. Test behaviour, branches,
and boundaries.

---

## Gate 2 — PR review checklist

Keep it to seven lines. Longer checklists get rubber-stamped.

**Author:**
- [ ] Diff is **< 400 lines and < 10 files** — split it otherwise
- [ ] One logical change (a feature and a removal are two PRs)
- [ ] New/changed logic has a test; bug fixes have a regression test
- [ ] `AGENTS.md` updated if architecture changed (this repo is agent-documented)

**Reviewer:**
- [ ] **Can I explain what this does and why?** If not, it's too big — request a split
- [ ] Are errors surfaced, not swallowed? (see P0-2)
- [ ] Any new `as X`, `eslint-disable`, or `!` — and is each one justified?

### Review etiquette

- **Blocking:** correctness, security, data loss, silent failures.
- **Non-blocking:** naming, style, structure. Prefix with `nit:` and approve anyway.
- **Praise specific good decisions.** "Nice use of `ponytail:` here" teaches more than three
  critical comments. Review is the team's main teaching channel — use it.

---

## Commit & branch discipline

```
master  ← protected, always deployable
  └─ feat/orders-step-up-auth
  └─ fix/patient-empty-vitals
  └─ refactor/api-drop-type-assertions
```

- **Conventional commits** — already in use, keep them:
  `feat:` `fix:` `refactor:` `test:` `docs:` `chore:`
- **Imperative subject, < 72 chars.** `fix: guard empty vitals on patient chart`, not
  `Fixed some stuff in PatientDetail`.
- **Explain *why* in the body, not *what*.** The diff already says what.
- **Squash on merge.** Keep `master` history readable.

---

## Definition of Done

A change is done when **all** of these hold:

1. Typecheck clean
2. Lint clean, zero warnings
3. Tests pass; new logic covered
4. Build passes (single-file `dist/` output)
5. Reviewed and approved
6. Verified in the running app — not just in the test runner
7. `AGENTS.md` / `Documentation.md` updated if behaviour or architecture changed

---

## House rules specific to this codebase

These come from patterns already present in the code — codify them so they survive turnover.

| Rule | Detail |
|---|---|
| **`ponytail:` convention** | Every deliberate simplification gets `ponytail:` naming its ceiling **and** upgrade path. This is your best practice — enforce it in review. |
| **Types start in `src/types.ts`** | Change domain types there first, nowhere else. Let the compiler find the fallout. |
| **`src/data/` owns all content** | No clinical/demo data inlined in pages. |
| **`src/data/api.ts` is the only backend seam** | Pages never call `supabase` directly. |
| **Never commit real PHI** | Non-negotiable. Mock data only, forever. |
| **`utils/` stays pure** | No React, no I/O. That's what makes it testable. |
| **Hand-rolled SVG charts** | No chart library. Keeps the single-file bundle small. |

---

## Metrics to track

Track these four. If you can't measure it, you can't tell improvement from motion.

| Metric | Now | Target (90 days) | Why |
|---|---|---|---|
| Line coverage | ~3.7% | 25% | Ratchet +5/sprint |
| Tests on `data/api.ts` | 0 | mapper + error paths | Highest-risk file |
| Median PR size | ~4,000 lines | < 400 lines | Reviewability |
| `eslint-disable` count | 1 | 0 (or all justified) | Suppression debt |

Review these monthly. If a metric isn't moving, the gate isn't working — fix the gate,
not the team.

---

## Rollout

| Week | Action | Owner |
|---|---|---|
| **Now** | **Enable branch protection on `master`** (repo settings — 10 min, cannot be committed). **Everything else is blocked on this.** | Lead |
| 1 | `unwrap()` on all Supabase queries (P0-2). Fix stale `AGENTS.md` claims (P2-7). | — |
| 2 | Mapper tests for `data/api.ts` (P0-3). Drop the 5 `as X` assertions (P1-3). | — |
| 3 | `loadPatient` → single nested select (P1-4). Enable `noUncheckedIndexedAccess` (P1-5). | — |
| 4 | Pre-commit hook (Gate 0). Split contexts out of `auth*.tsx` / `Badge.tsx`; drop the CI exemption. | — |
| 5+ | Page smoke tests, `canAccess` matrix tests, add `@vitest/coverage-v8` and start the floor at 5%. | — |

Week 0 first — and it's the one item nobody can do for you in a commit. Every code improvement
in weeks 1–5 will regress without branch protection, because nothing will stop a 4,000-line
commit from landing unreviewed again.
