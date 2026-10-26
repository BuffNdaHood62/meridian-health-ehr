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
- Gates key on the **mode**, never on "is a backend configured" — a demo build has no backend either. `demoFallback()` in `src/data/api.ts` is the canonical shape; `src/data/api.test.ts` is the regression guard for it.
- `vercel.json` pins the deployed site to `npm run build:demo`. At go-live, change or delete it — a pinned demo build serves fake data on a real clinical URL, and the fail-closed default in `npm run build` is what protects a production deploy.

## Identity (read before touching auth, profiles or RLS helpers)
- Supabase GoTrue is the identity provider. TOTP (AAL2) is the second factor. `CodeGate` is a per-screen view lock, never a factor (ADR-0002, ADR-0003).
- The client has an explicit identity state machine: `anonymous | password_ok | unverified | active | step_up_required | expired` (`src/identity/state.ts`). Adapters (`src/identity/demo-adapter.ts`, `src/identity/supabase-adapter.ts`) own the mechanism; pages only consume `useAuth()`. Do not collapse this back into `isAuthenticated: boolean` — that is what hid MFA and pending states.
- `profiles` is read-only to clients. Role, verification and org writes go through the `0008` RPCs; never add an UPDATE/INSERT policy to `profiles`, and never honor a role from signup metadata.
- Any helper that answers "who is this?" (`current_org_id`, `is_admin`, `role_allows`, `role_can`) must require `verified and disabled_at is null`. `current_org_id()` returning null is the fail-closed floor every policy relies on.
- Server-side step-up = `has_recent_mfa()` (AAL2 + recent totp/webauthn amr). The client's doctor-code lockout is UX only; do not describe `auth_events` as covering failed password attempts.
- An unverified/revoked Supabase profile is signed out by the adapter on sight; `/login/pending` is reached from an `unverified` outcome, never by keeping a token for an unapproved profile.

## Global Work Rules
- Shortest working diff wins. No speculative abstractions.
- Bug fix = root cause, not symptom; grep callers before editing shared helpers.
- Mark deliberate simplifications with `ponytail:` comments naming ceiling + upgrade path.
- Durable change records → `Documentation.md`. Decisions → `docs/adr/`. Open risks → `docs/risk-register.md` (keep R-IDs current; it is the required risk analysis for any real-PHI go-live).
- This is a demo with fake data: never add real PHI to any file. Never claim a control the code doesn't implement (no "encrypted", "HIPAA", "SOC 2", "HITRUST", "audited" in UI copy unless the mechanism exists).
- `src/utils/**` may not import `src/data/mockData` (ESLint boundary) — pure logic takes data from its caller. `runCDS` lost a real patient-safety bug this way.

## Verification
- `npm run test` — Vitest unit tests (env/cds/cn/format/wwwRecords/users/identity). Fast, primary gate.
- `npm run lint`, `npm run typecheck` — see Local Environment caveats.
- `npm run build` AND `npm run build:demo` — both must pass before shipping (CI runs both).
- `npm run audit` — dependency advisories (6 open, 2 critical, all build-toolchain; see risk register R-10).
- **Before claiming a data-layer or screen-level change works, load `dist/index.html` in a browser and look at the dashboard.** Tests, `tsc` and lint do not execute `src/data/api.ts` — the broken demo fallback passed all three. Check the built artifact, not the dev server: only `dist/` carries the mode resolution.

## Architecture (high level)
- `src/App.tsx` — all routes, HashRouter, `RequireAuth` wraps the app layout.
- `src/main.tsx` — startup gate; mounts `StartupBlocked` instead of the app in production mode with no backend.
- `src/env.ts` / `src/config.ts` — mode contract + derived flags (`DEMO_MODE`, support contacts).
- `src/auth.tsx` — AuthProvider/useAuth/RequireAuth/RouteAuthenticationGate. The state machine is `src/identity/state.ts`; `src/identity/{demo,supabase}-adapter.ts` sit behind `src/identity/adapter.ts`, so pages never see GoTrue or localStorage. UI branches on `useAuth().mode`, not env guesses. `auth-doctor.tsx` = per-page, per-session doctor-code view gate (a UX control, not encryption — see ADR-0002).
- `src/lib/supabase.ts` / `src/data/api.ts` — the backend path (`requireBackend`, `demoFallback`) and Patient assembly; `src/data/mockData.ts` is a demo/test fixture, not a fallback.
- `supabase/migrations/` — schema + RLS source of truth (0001-0006 applied upstream, **0007 + 0008 authored not applied**). `0008` requires `0007` and its header lists GoTrue settings + the first-admin bootstrap.
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
