# meridian-health-ehr — EHR front-end SPA (demo mode today, production-gated)

Tech stack pins: React 19, Vite 7 (+ vite-plugin-singlefile), TypeScript 5.9, Tailwind CSS 4 (via @tailwindcss/vite), react-router-dom v7 (HashRouter), Vitest 3, ESLint 9 flat config, Node 24.

## Local Environment
- Windows / git-bash host. Use absolute paths (`/c/Users/Michael/meridian-health-ehr`).
- Repo-wide `npm run lint` and `npm run typecheck` can time out in this GUI environment; when they do, fall back to targeted checks on changed files (`npx eslint --ext tsx <file>`, `npx tsc --noEmit -p .`) and report the timeout as the blocker.
- Flat-config ESLint rejects old flags; use `npx eslint <file>` style invocations.
- No Postgres or Docker here. The Supabase CLI works through `npx supabase` against the linked project (`migration list`, `db push`, `db query` all ran without a password prompt), so migrations CAN be applied and verified from this machine — but `db dump` needs `pg_dump`, which is not installed, so take a restore point from the Dashboard or accept that the seed is reproducible. `supabase login` cannot run in this non-TTY shell; the user runs it in a real terminal.
- Build outputs a single self-contained HTML file (`vite-plugin-singlefile`).

## Run Modes (read before touching data code)
- `src/env.ts` resolves `VITE_APP_MODE`: explicit value wins, else `vite dev` → `demo`, `vite build` → `production`.
- `npm run build` = **production mode**: no backend env ⇒ the app refuses to boot (`StartupBlocked`) and `src/data/api.ts` throws rather than serving `mockData`. Never "fix" that by re-adding a mock fallback.
- `npm run build:demo` = demo artifact (fake data + banner + watermarked prints). This is what clinics preview.
- `.env.demo` is committed on purpose (no secrets); `.env.example` is the real contract.
- Gates key on the **mode**, never on "is a backend configured" — a demo build has no backend either. `demoFallback()` in `src/data/api.ts` is the canonical shape; `src/data/api.test.ts` is the regression guard for it.
- `vercel.json` builds the **production** artifact (`npm run build`), not the demo bundle. The Vercel project must have `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set at build time (and `0007`/`0008` applied); without them the deployment boots to `StartupBlocked` by design. Never set `VITE_APP_MODE=demo` in the Vercel project. Clinics preview the demo with `npm run build:demo` locally or via `.env.demo`.

## Identity (read before touching auth, profiles or RLS helpers)
- Supabase GoTrue is the identity provider. TOTP (AAL2) is the second factor. `CodeGate` is a per-screen view lock, never a factor (ADR-0002, ADR-0003).
- The client has an explicit identity state machine: `anonymous | password_ok | unverified | active | step_up_required | expired` (`src/identity/state.ts`). Adapters (`src/identity/demo-adapter.ts`, `src/identity/supabase-adapter.ts`) own the mechanism; pages only consume `useAuth()`. Do not collapse this back into `isAuthenticated: boolean` — that is what hid MFA and pending states.
- `profiles` is read-only to clients. Role, verification and org writes go through RPCs (`0008`, then `assign_role`/`claim_invitation` after `0010`/`0011`); never add an UPDATE/INSERT policy to `profiles`, and never honor a role from signup metadata.
- Any helper that answers "who is this?" (`current_org_id`, `is_admin`, `role_allows`, `role_can`) must require `verified and disabled_at is null`. `current_org_id()` returning null is the fail-closed floor every policy relies on.
- Server-side step-up = `has_recent_mfa()` (AAL2 + recent totp/webauthn amr). Live on the cloud project since 2026-10-26, with `require_step_up_for_orders = true` and **zero TOTP factors enrolled** — so order authoring from a real session is blocked until a factor is enrolled (no enrolment UI exists yet). The client's doctor-code lockout is UX only; do not describe `auth_events` as covering failed password attempts.
- An unverified/revoked Supabase profile is signed out by the adapter on sight; `/login/pending` is reached from an `unverified` outcome, never by keeping a token for an unapproved profile.
- Target provisioning model (ADR-0005, **not yet live**): platform ownership is a SET —
  `public.platform_owners` (wellnesswithwritingale@gmail.com, michaelnnamdi62@gmail.com) —
  never a role, never grantable by an admin, never equal to the break-glass identity, and
  the last owner cannot be removed. Access begins with an owner's email invite:
  `supabase/functions/invite` (the only holder of the service key) sends a GoTrue invite
  link, the person sets their **own** password, and `claim_invitation()` attaches membership
  + role on their next sign-in. Never generate a password and mail it. Single organisation,
  so `create_organization()` is dropped. Today `handle_new_user()` still attaches every
  self-signup to the first clinic because `profiles.org_id` is `not null` (R-22), so do not
  describe invite-only access as current behaviour in any UI copy.

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
- `supabase/migrations/` — schema + RLS source of truth. **0001–0010 are applied to project `zdtaludwhxnjutosrnvi` (0007–0009 on 2026-10-26, 0010 on 2026-11-05)**; the gate checks in `supabase/GO-LIVE-RUNBOOK.md` §6 passed. `0008` requires `0007`; `0009` is a required forward fix, not optional — 0007/0008 call `digest()`/`gen_random_bytes()` under `search_path = public`, and hosted pgcrypto lives in `extensions`, so without it every audit write fails. `0010` (memberships, role instances, `role_permissions`, invitation lifecycle — ADR-0004) is **applied**: tenancy and authorisation now resolve through `org_memberships`/`role_assignments`, and `profiles.org_id`/`role` survive only as a cache written by `sync_legacy_profile()`. `0011_platform_owners_invite_only.sql` (two platform owners, invite-only provisioning — ADR-0005) is **authored and aborts on purpose** until the owner set is bootstrapped: `PLATFORM_OWNERS_BOOTSTRAP_REQUIRED`. The second owner account (`wellnesswithwritingale@gmail.com`) does not exist yet. A self-signup now lands with no membership and reads 0 rows (R-22 mitigated, not closed). For any other project, run `supabase migration list` before assuming what is applied — never improvise the procedure.
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
