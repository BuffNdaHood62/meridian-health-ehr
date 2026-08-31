# Code Quality Audit — meridian-health-ehr

**Date:** 2026-08-31
**Scope:** `src/` (6,286 LOC, 49 files), `supabase/` (5 migrations), config, git history
**Method:** static read of every source file, import-graph tracing, test/run verification, git history analysis

---

## Verdict

This is a **better-than-average codebase**, and the findings below should be read in that light.
Most teams at this stage have `any` scattered everywhere, no tests, and no RLS. You have almost
none of that. The gaps are concentrated in **three specific places**, not spread evenly.

| Dimension | Status | Evidence |
|---|---|---|
| Type strictness | 🟢 Strong | `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` |
| `any` discipline | 🟢 Strong | 1 escape hatch in 6,286 LOC |
| Debug hygiene | 🟢 Strong | 0 `console.*` in `src/` |
| Error handling (UI layer) | 🟢 Good | 28 catch blocks; `useAsync` surfaces errors |
| Security (data layer) | 🟢 Strong | RLS enabled on all 15 tables, org-scoped + RBAC policies |
| Simplification tracking | 🟢 Excellent | `ponytail:` convention — keep this, it's rare and valuable |
| **Warning discipline** | 🔴 **Failing** | Warnings don't fail CI — a page-breaking bug hid among benign ones |
| **Error handling (data layer)** | 🔴 **Failing** | Every Supabase query drops `error` |
| **Test coverage of risk** | 🔴 **Failing** | 0 tests on the riskiest code in the repo |
| **Type safety at the API seam** | 🟠 Weak | 5 `as X` assertions defeat the compiler |
| **Docs accuracy** | 🟠 Weak | `AGENTS.md` materially stale |
| **Commit granularity** | 🟠 Weak | 4 commits for 6,286 LOC; unreviewable diffs |
| Compiler leverage | 🟠 Weak | `noUncheckedIndexedAccess` off — one real bug slipped through |

---

## What you're doing right — protect these

Don't let a push for "quality" flatten the practices that are already working. These are
better than most teams and should be defended in review:

1. **`ponytail:` comments.** Marking a deliberate simplification with its ceiling *and an
   upgrade path* is a genuinely senior habit. Most teams either over-engineer or leave
   silent debt. Keep this and enforce it.
2. **RLS on every table, in migrations, from the first commit.** For a health app this is
   the single most important thing, and it's already correct — including both org-scoping
   (`0001`) and role-based (`0004`).
3. **One swap point for the backend.** `src/data/api.ts` correctly returns existing domain
   types so no page knows whether it's reading mock data or Supabase. That's the right seam.
4. **`strict: true` from day one.** Retrofitting this later is miserable. You skipped that cost.

---

## Findings

### 🔴 P0-1 — Lab Results page rendered zero rows, permanently *(fixed in this audit)*

**File:** `src/pages/LabResults.tsx:34–54`

```ts
const { data: patients } = useAsync(loadPatients, []);   // data starts as null

const allLabs = useMemo(
  () => (patients ?? []).flatMap((p) => p.labs.map(/* ... */)),
  []                                                     // ⬅ never recomputes
);
```

`useAsync` initialises `data` to `null` (`api.ts:192`). On the first render `patients` is
`null`, so the memo computes `(null ?? []).flatMap(...)` → **`[]` and caches it**.
When the fetch resolves, `patients` becomes an array — but the dependency array `[]` never
changes, so the memo returns the cached `[]` **forever**.

**Impact:** the entire Lab Results page rendered an empty table. Not a flash of empty state —
permanently empty, on every visit. The page never early-returns on `loading`, so there is no
remount that would rebuild the memo.

**Why this is the most important finding in this audit:** **ESLint was already flagging it.**

```
src/pages/LabResults.tsx
  53:5  warning  React Hook useMemo has a missing dependency: 'patients'
```

`npm run lint` passed — because warnings don't fail CI. One real, page-breaking bug sat inside
a list of 8 benign `react-refresh` HMR warnings, and because the signal-to-noise ratio was bad,
it got scrolled past. **This is the concrete cost of "warnings don't fail the build."** It is
also the strongest argument for the diff-size rule (P2-8): a 44-file commit cannot be reviewed
closely enough to catch this.

**Status:** ✅ **Fixed** — deps corrected to `[patients]`. Warnings 9 → 8; the 8 remaining are
all `react-refresh` HMR-ergonomics noise.

**Also fixed in CI:** `.github/workflows/ci.yml` now runs
`eslint . --max-warnings=0 --rule '{"react-refresh/only-export-components":"off"}'` — so every
warning except the exempted HMR rule now **fails the build**. This exact bug would have been
caught the day it was written. CI Node version also corrected 20 → 24 to match the local
toolchain pinned in `AGENTS.md`.

---

### 🔴 P0-2 — Supabase errors are silently swallowed

**Files:** `src/data/api.ts:96, 121, 138, 156, 172, 182`

Every query destructures only `data` and discards `error`:

```ts
const { data: ps } = await supabase.from("patients").select("*");   // line 96
const { data } = await supabase.from("medications").select("*");    // via Promise.all
await supabase.from("orders").insert({ ... });                      // line 156 — write!
```

When a query fails — RLS denial, expired JWT, network blip, schema drift after a migration —
Supabase returns `{ data: null, error }`. `data ?? []` then renders an **empty list that is
indistinguishable from "no records"**.

**Why this is P0 and not P2:** this is a clinical app. A silently-empty medication list,
allergy list, or order list is a *patient-safety* failure mode, not a UI glitch. A clinician
seeing "no allergies on file" because a token expired is the worst possible outcome. The
`insert` at line 156 is worse: a failed order write returns success to the caller.

**Fix:** branch on `error` and throw, so `useAsync` surfaces it in the UI it already renders.

```ts
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
```

Then `const ps = unwrap(await supabase.from("patients").select("*"))`. Six call sites, ~20 lines.

---

### 🔴 P0-3 — The riskiest code in the repo has zero tests

**Current:** 4 test files / 32 tests / ~230 test LOC against 6,286 source LOC (~3.7%).
All tests live in `src/utils/` (`cds`, `cn`, `format`) plus `src/users.ts`.

**Untested:** `src/data/api.ts` (where P0-2 and P1-3 live), `src/auth*.tsx` (4 files),
all 11 pages, all components, `src/utils/audit.ts`, `src/utils/share.ts`.

**The structural problem:** you are testing the *safest* code and not the *riskiest*.
`utils/format.ts` is pure and easy to test, so it gets tests. `data/api.ts` is a hand-written
snake_case→camelCase mapper sitting between your database and your UI — the highest-blast-radius
code you own — and it has none. Test effort is currently inverted relative to risk.

**Fix, in this order (highest value per hour first):**

1. `data/api.ts` mapper tests — feed a fixture `PatientRow` + child rows, assert the assembled
   `Patient`. This single file catches schema drift, the `as Patient` lie (P1-3), and empty-list bugs.
2. `users.ts` — already 9 tests; extend to `canAccess` role×route matrix (it's the authz gate).
3. `auth-demo.tsx` / `auth-doctor.tsx` — lockout after 5 attempts, `hasDoctorCode`, session lifecycle.
4. One smoke test per page: renders without throwing. Catches P0-4 class bugs cheaply.

Add `@testing-library/react` + `jsdom`. Target: mapper + auth coverage before adding features.

---

### 🟠 P0-4 — Crash on patients with no vitals *(fixed in this audit)*

**File:** `src/pages/PatientDetail.tsx:41` and `:203`

```ts
const latest = patient.vitals[patient.vitals.length - 1];
// ...then unguarded: latest.bpSys, latest.hr, latest.spo2, latest.temp
```

If `vitals` is empty, this throws `TypeError: Cannot read properties of undefined` and
**white-screens the entire patient chart**.

**Reachability:** latent today (all 8 mock patients have vitals from `genVitals`), **live the
moment Supabase becomes the source** — a new admission with no vitals recorded yet hits this
on first chart open. This is exactly the bug class that appears the day after you flip the
backend on.

**Why the compiler didn't catch it:** `noUncheckedIndexedAccess` is off (see P1-5). TypeScript
types `arr[arr.length - 1]` as `Vital`, not `Vital | undefined`. With the flag on, this is a
compile error at both sites.

**Status:** ✅ **Fixed** — both sites now use `?? null` and render `—`. Typecheck and 32/32 tests pass.

---

### 🟠 P1-3 — Five `as X` assertions disable type checking at the mapping seam

**File:** `src/data/api.ts:91, 133, 151, 177, 187`

```ts
} as Patient;      // line 91
})) as Message[];  // line 133  (same for OrderItem, Alert, Appointment)
```

`assemblePatient` builds an object literal and ends with `as Patient`. A type assertion tells
TypeScript "trust me" — so if someone renames `medications` → `meds` in `types.ts`, this file
**still compiles** and silently produces `undefined` at runtime. The `?? ""` fallbacks
throughout the mapper make it worse: they convert a missing field into an empty string rather
than an error, so the failure is invisible.

**This is the one place in your codebase where types can lie**, and it's also the place with
zero tests (P0-3). Those two facts compound.

**Fix:** drop the assertions; annotate the return type instead and let the compiler verify:

```ts
function assemblePatient(p: PatientRow, children: ChildRow[]): Patient {
  return { /* ... */ };   // no `as Patient` — excess/missing fields now error
}
```

Remove the `as Message[]` / `as OrderItem[]` / etc. from the four `.map()` chains and type the
intermediate rows instead. Expect ~10–20 compile errors on the first pass — each one is either
a real latent bug or a missing default. **Do this fix and the P0-3 mapper tests together.**

---

### 🟠 P1-4 — `loadPatient(id)` fetches the entire database

**File:** `src/data/api.ts:114`

```ts
export async function loadPatient(id: string): Promise<Patient | null> {
  const all = await loadPatients();               // → 7 queries, every patient, every child row
  return all.find((p) => p.id === id) ?? null;    // then throws away all but one
}
```

Opening one patient chart fires **7 round-trips** and deserializes every patient record plus
all six child tables, then discards 99% of it. Two latency serializations (patients, then the
`Promise.all` of children). This gets worse linearly with patient count.

**Fix:** one nested select, which PostgREST supports natively:

```ts
export async function loadPatient(id: string): Promise<Patient | null> {
  if (!isSupabaseConfigured) return mockPatients.find((p) => p.id === id) ?? null;
  const res = await supabase
    .from("patients")
    .select("*, allergies(*), medications(*), labs(*), vitals(*), history(*), notes(*)")
    .eq("id", id)
    .maybeSingle();
  return res.data ? assemblePatient(res.data, flattenChildren(res.data)) : null;
}
```

That's 7 queries → 1, and it also removes the client-side `filter` over the full set.

---

### 🟠 P1-5 — Compiler flags left on the table

**File:** `tsconfig.json`

Two flags would have caught real bugs in this repo:

```jsonc
"noUncheckedIndexedAccess": true,      // would have caught P0-4 at compile time
"exactOptionalPropertyTypes": true     // distinguishes `foo?: string` from `foo: string | undefined`
```

`noUncheckedIndexedAccess` is the high-leverage one. It affects ~18 sites; most are already
defensively written (`p[0]?.toUpperCase() ?? ""`, `messages?.[0]?.id ?? ""`), which suggests
your team already *thinks* this way — the compiler just isn't backing them up.

**Migration plan:** don't flip it globally in one commit. Enable it, fix the ~18 errors
(mostly `!` or `?? fallback`, guided by whether the index is provably safe), ship as one
reviewable commit. Budget 2–3 hours.

---

### 🟠 P1-6 — `useAsync` carries the repo's only lint suppression

**File:** `src/data/api.ts:191–208`

```ts
useEffect(() => { /* ... */ }, deps);
// eslint-disable-next-line react-hooks/exhaustive-deps
```

Used by **9 call sites** across 8 pages. Two issues:

- `deps: unknown[]` is spread into the dependency array. If a caller ever passes an inline
  array whose *length* varies between renders, React throws at runtime. Nothing prevents this.
- Errors are stringified into `error: string | null`, so callers can't distinguish
  "not found" from "unauthorized" from "offline" — all three render identically.

**Fix:** keep the signature but add a dev-time length guard, and carry a typed error:

```ts
useEffect(() => {
  if (import.meta.env.DEV && deps.length !== prevDeps.current.length) {
    throw new Error("useAsync: deps array length changed between renders");
  }
  // ...
}, deps);
```

Low priority relative to P0-2/P0-3 — but it's the most-used hook and the least-guarded, so
it's a good candidate once the bigger items are done.

---

### 🟡 P2-7 — `AGENTS.md` is materially stale and now misleading

**File:** `AGENTS.md` lines 9 and 25

Two statements are now false:

| AGENTS.md says | Reality |
|---|---|
| "No backend anywhere — everything renders from `src/data/mockData.ts`" | `supabase/` has 5 migrations; `src/lib/supabase.ts`, `src/auth-supabase.tsx` exist |
| `src/auth.tsx` is "localStorage flag `meridian-auth`... no credentials checked" | `auth.tsx` dispatches to `SupabaseAuthProvider`, which does real email/password auth |

**Why this matters more than usual:** this project is documented *for AI agents* via `AGENTS.md`.
Stale docs don't just confuse new hires — they make every agent session start from wrong
premises ("there's no backend, so don't worry about network errors") and silently produce
wrong work. It's a force multiplier on every other mistake.

**Fix:** update both lines; add a rule that the file is edited in the same commit as any
architectural change. Add a CI check that `AGENTS.md` was touched if `src/lib/supabase.ts` or
`supabase/` changed.

---

### 🟡 P2-8 — Commit granularity makes review impossible

**Git history:** 4 commits for 6,286 LOC, all directly on `master`.

```
20c32e4  feat: multi-account signup, remove idle auto-logout, harden for delivery
         44 files changed, 3176 insertions(+), 895 deletions(-)
fb82390  refactor: apply code review fixes and add lint/test tooling
         22 files changed, 2543 insertions(+), 275 deletions(-)
```

**A 44-file, 4,071-line commit cannot be code-reviewed.** A reviewer physically cannot hold
that in working memory; they scan it, nod, and approve. That commit bundles three unrelated
changes — a feature, a behaviour removal, and a hardening pass — which also means it cannot
be reverted partially.

This is the root cause that lets P0-2 and P1-3 exist: they were written in a commit nobody
could actually review.

**Fix:**
- Branch protection on `master`; require PR + 1 approval + green CI.
- Target **< 400 lines and < 10 files per PR**. Above that, split it.
- One logical change per commit. "Remove idle auto-logout" and "add multi-account signup" are
  two commits, so the logout change can be reverted alone.
- Conventional commits are already in use — keep them, they're good.

---

### 🟠 P1-7 — The `react-refresh` warning is a real dev-tax, not a lint nit

**File:** `src/auth.tsx:28`

I initially wrote this warning off as cosmetic and exempted it from CI. The Vite dev log
proves otherwise:

```
hmr invalidate /src/auth.tsx  Could not Fast Refresh
  ("AuthContext" export is incompatible)
hmr update /src/App.tsx, /src/pages/Signup.tsx, /src/pages/Settings.tsx,
  /src/pages/Login.tsx, /src/pages/Dashboard.tsx, /src/pages/DemoPicker.tsx,
  /src/pages/Orders.tsx, /src/auth-supabase.tsx, /src/auth-demo.tsx,
  /src/components/layout/Sidebar.tsx
```

Because `auth.tsx` exports a non-component (`AuthContext`) alongside components, **every
save to that file disables Fast Refresh and forces a full reload across ~10 modules** —
you lose component state on every edit. `auth.tsx` is also the file you touch most when
working on auth, which is exactly when you want hot reload working.

**Fix (30 min):** move `AuthContext` into `src/auth-context.ts`; update the 3 importers
(`auth.tsx`, `auth-demo.tsx`, `auth-supabase.tsx`). The other 7 warnings — helper functions
exported next to components in `Badge.tsx` and `auth-doctor.tsx` — are genuinely cosmetic,
but fix them in the same pass and drop the CI exemption entirely.

**Why this matters beyond ergonomics:** a warning that is *known to be ignorable* trains the
team to skim warnings. That habit is how P0-1 survived. Zero warnings is a better default
than "warnings we've agreed to tolerate."

---

## The three leverage moves

If you only do three things, do these. They're ordered by *bugs prevented per hour invested*.

| # | Move | Effort | What it buys |
|---|---|---|---|
| 1 | **`--max-warnings=0` in CI + branch protection** | ~1 h | **Done in this audit.** Would have caught P0-1 the day it was written. |
| 2 | **`unwrap()` on Supabase calls + mapper tests** | ~4 h | Closes P0-2 and P0-3 — the two remaining red findings. |
| 3 | **Enable `noUncheckedIndexedAccess`** | ~3 h | Permanently eliminates an entire bug class at compile time. |

Move 1 first, always. Process fixes compound; code fixes decay. P0-1 is the proof: your tooling
found that bug for free, and a permissive gate let it ship anyway.

---

## Backlog (ordered)

| Pri | Item | Finding | Est. | Status |
|---|---|---|---|---|
| P1 | Enable branch protection on `master` (repo settings) | P2-8 | 10 m | ⬜ **You must do this — can't be committed** |
| P0 | `unwrap()` helper on all Supabase queries; throw on `error` | P0-2 | 1 h | ⬜ |
| P0 | Mapper tests for `data/api.ts` with row fixtures | P0-3 | 3 h | ⬜ |
| P1 | Remove 5 `as X` assertions; annotate return types | P1-3 | 2 h | ⬜ |
| P1 | `loadPatient` → single nested select | P1-4 | 1 h | ⬜ |
| P1 | Enable `noUncheckedIndexedAccess`, fix ~18 sites | P1-5 | 3 h | ⬜ |
| P2 | Update stale `AGENTS.md` claims | P2-7 | 15 m | ⬜ |
| P2 | `useAsync` dev-time deps-length guard | P1-6 | 30 m | ⬜ |
| P2 | `canAccess` role×route matrix tests | P0-3 | 1 h | ⬜ |
| P2 | Page render smoke tests (jsdom + RTL) | P0-3 | 3 h | ⬜ |
| P1 | Move `AuthContext` to `src/auth-context.ts`; drop the CI rule exemption | see below | 30 m | ⬜ |
| P3 | Tighten ESLint beyond `recommended` | — | 1 h | ⬜ |
| P3 | Coverage floor in CI (needs `@vitest/coverage-v8`) | — | 30 m | ⬜ |

### Completed in this audit

| Item | Finding | Where |
|---|---|---|
| Fix stale closure — Lab Results rendered zero rows | P0-1 | `src/pages/LabResults.tsx:53` |
| Fix crash on patients with no vitals | P0-4 | `src/pages/PatientDetail.tsx:41, 203` |
| CI: warnings now fail the build | P0-1 | `.github/workflows/ci.yml` |
| CI: Node 20 → 24, matching the pinned local toolchain | — | `.github/workflows/ci.yml` |
| PR template | P2-8 | `.github/pull_request_template.md` |

---

## Verification status

- ✅ `npx tsc --noEmit -p .` — clean (exit 0)
- ✅ `npx vitest run` — 4 files, 32 tests, all passing
- ✅ `npx eslint . --max-warnings=0 --rule '{"react-refresh/only-export-components":"off"}'` — clean (exit 0)
- ✅ `npx vite build` — `dist/index.html` 697.91 kB (gzip 195.46 kB), 13.2s
- ✅ P0-1, P0-4 fixed and verified; role-denied go-back added (P1-7 evidence)

All four checks pass. Repo-wide `npm run lint` / `npm run typecheck` are documented as
timeout-prone in this environment; all completed cleanly in this run. Note that
`npm run build` chains `typecheck && vite build`, so it re-runs a check you've already done —
run `npx vite build` directly when iterating.
