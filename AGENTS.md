# meridian-health-ehr — EHR front-end SPA (demo mode today, production-gated)

Tech stack pins: React 19, Vite 7 (+ vite-plugin-singlefile), TypeScript 5.9, Tailwind CSS 4 (via @tailwindcss/vite), react-router-dom v7 (HashRouter), Vitest 3, ESLint 9 flat config, Node 24.

## Local Environment
- Windows / git-bash host. Use absolute paths (`/c/Users/Michael/meridian-health-ehr`).
- Repo-wide `npm run lint` and `npm run typecheck` can time out in this GUI environment; when they do, fall back to targeted checks on changed files (`npx eslint --ext tsx <file>`, `npx tsc --noEmit -p .`) and report the timeout as the blocker.
- Flat-config ESLint rejects old flags; use `npx eslint <file>` style invocations.
- No Postgres, Supabase CLI or Docker here: SQL migrations can be parser-checked (`pglast`) but NOT executed — say so when reporting on them.
- Build outputs a single self-contained HTML file (`vite-plugin-singlefile`).

## Run Modes (read before touching data code)
- `src/env.ts` resolves `VITE_APP_MODE`: explicit value wins, else `vite dev` → `demo`, `vite build` → `production`.
- `npm run build` = **production mode**: no backend env ⇒ the app refuses to boot (`StartupBlocked`) and `src/data/api.ts` throws rather than serving `mockData`. Never "fix" that by re-adding a mock fallback.
- `npm run build:demo` = demo artifact (fake data + banner + watermarked prints). This is what clinics preview.
- `.env.demo` is committed on purpose (no secrets); `.env.example` is the real contract.

## Global Work Rules
- Shortest working diff wins. No speculative abstractions.
- Bug fix = root cause, not symptom; grep callers before editing shared helpers.
- Mark deliberate simplifications with `ponytail:` comments naming ceiling + upgrade path.
- Durable change records → `Documentation.md`. Decisions → `docs/adr/`. Open risks → `docs/risk-register.md` (keep R-IDs current; it is the required risk analysis for any real-PHI go-live).
- This is a demo with fake data: never add real PHI to any file. Never claim a control the code doesn't implement (no "encrypted", "HIPAA", "SOC 2", "HITRUST", "audited" in UI copy unless the mechanism exists).
- `src/utils/**` may not import `src/data/mockData` (ESLint boundary) — pure logic takes data from its caller. `runCDS` lost a real patient-safety bug this way.

## Verification
- `npm run test` — Vitest unit tests (env/cds/cn/format/wwwRecords/users). Fast, primary gate.
- `npm run lint`, `npm run typecheck` — see Local Environment caveats.
- `npm run build` AND `npm run build:demo` — both must pass before shipping (CI runs both).
- `npm run audit` — dependency advisories (6 open, 2 critical, all build-toolchain; see risk register R-10).

## Architecture (high level)
- `src/App.tsx` — all routes, HashRouter, `RequireAuth` wraps the app layout.
- `src/main.tsx` — startup gate; mounts `StartupBlocked` instead of the app in production mode with no backend.
- `src/env.ts` / `src/config.ts` — mode contract + derived flags (`DEMO_MODE`, support contacts).
- `src/auth.tsx` — AuthProvider/useAuth/RequireAuth; picks `auth-supabase.tsx` (GoTrue) when configured, else `auth-demo.tsx` (localStorage role picker, no credentials). `auth-doctor.tsx` = per-page, per-session doctor-code view gate (a UX control, not encryption — see ADR-0002).
- `src/lib/supabase.ts` / `src/data/api.ts` — the backend path (`requireBackend`, `demoFallback`) and Patient assembly; `src/data/mockData.ts` is a demo/test fixture, not a fallback.
- `supabase/migrations/` — schema + RLS source of truth (0001-0006 applied upstream, **0007 authored not applied**).
- `src/pages/` — one file per route screen (child DOX).
- `src/components/layout/` — AppLayout/Sidebar/Topbar/nav (nav.ts is the sidebar source of truth).
- `src/components/ui/` — presentational primitives (Avatar, Badge, Card, PageHeader, StatCard, CodeGate, ErrorNote, Modal).
- `src/components/charts/Charts.tsx` — hand-rolled SVG charts (no chart lib).
- `src/utils/` — pure logic: cds.ts (clinical decision support), recordExport.ts (print/email of a client record — DOM-built + audited), wwwRecords/demographics/appointments/labEntries/medicalReviews (demo localStorage stores), audit.ts, crypto.ts, format.ts, cn.ts; colocated `.test.ts` where logic matters.
- `src/types.ts` — every domain type. Change types here first, nowhere else.

## Child DOX Index
- `src/pages/AGENTS.md` — route screens
- `src/data/AGENTS.md` — mock data source of truth
- `src/utils/AGENTS.md` — pure logic + CDS rules
- (No child docs for `components/` or config files — scaffolding-level.)
