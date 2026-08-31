# Code Quality Engagement — Overview

**Date:** 2026-08-31 · **Scope:** full audit of `src/` (6,286 LOC) + `supabase/` + config + git history

## Start here

| Read this | If you are |
|---|---|
| [`docs/code-quality-audit.md`](./docs/code-quality-audit.md) | A lead or engineer — findings, severity, fixes, backlog |
| [`docs/engineering-standards.md`](./docs/engineering-standards.md) | Setting up the ongoing gates and review process |

## Headline

This codebase is **above average** — don't flatten what's working in a push for "quality".
`strict: true`, one `any` in 6,286 LOC, zero `console.*`, RLS on all 15 tables, and a genuinely
good `ponytail:` convention for marking deliberate simplifications.

But **two live bugs were found, and both were already being reported by your own tooling.**
That's the real story: the tooling works, the gate didn't.

## Bugs found and fixed

| Bug | Impact | Status |
|---|---|---|
| `LabResults.tsx:53` — `useMemo` over `patients` with `[]` deps | Lab Results page rendered **zero rows, permanently** | ✅ Fixed |
| `PatientDetail.tsx:41,203` — unguarded `vitals[len-1]` | Empty vitals white-screened the patient chart | ✅ Fixed |
| `.github/workflows/ci.yml` — warnings didn't fail CI | Let the first bug ship for weeks | ✅ Fixed |
| `.github/workflows/ci.yml` — Node 20 vs the Node 24 pin | CI/local drift | ✅ Fixed |

The Lab Results bug is the important one: **ESLint flagged it**, `npm run lint` passed, and a
whole page stayed broken. It was buried among 8 benign `react-refresh` HMR warnings.
CI now runs `--max-warnings=0` with only that HMR rule exempted.

## Still open (ordered)

1. **Enable branch protection on `master`** — 10 min, repo settings, can't be committed. Blocks everything else.
2. **P0-2** — every Supabase query in `src/data/api.ts` drops `error` → silent empty lists. In a clinical app, an empty medication list is a safety issue.
3. **P0-3** — zero tests on `data/api.ts`, the highest-risk file. Coverage ~3.7%, all in `utils/`. Test effort is currently inverted relative to risk.
4. **P1-3** — five `as X` assertions disable type checking at the mapping seam.
5. **P2-7** — `AGENTS.md` is materially stale (claims "no backend anywhere").

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | ✅ exit 0 |
| `npx eslint . --max-warnings=0 …` | ✅ exit 0 |
| `npx vitest run` | ✅ 32/32 |
| `npx vite build` | ✅ 1,903 modules, 693.68 kB |
