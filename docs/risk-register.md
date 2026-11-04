# Risk register & control map — production transition

Date: 2026-10-09 · Owner: Michael (foundation technical lead) · Review cadence: quarterly, and before any real-PHI go-live.

This is the written risk analysis required before protected health information
can be processed (HIPAA §164.308(a)(1)(ii)(A); NDPA 2023 §19 technical and
organisational measures for sensitive personal data). It is deliberately
repo-specific: every row names the file that makes the risk real.

## Legal frame (read this before citing "HIPAA compliant")

No product is "HIPAA certified" — compliance is the organisation's posture across
people, process and technology. The binding law for WWW Clinic (Uyo, Nigeria) is
the **Nigeria Data Protection Act 2023**, where health data is *sensitive personal
data*: a DPIA is mandatory, consent/processing conditions are stricter, and NIPHIHE
governs exchange formats. HIPAA attaches if the platform ever holds data about US
patients. Strategy: implement the HIPAA Security Rule controls as the engineering
baseline because they are well-specified and satisfy NDPA's technical-measures
duty; keep the legal analysis (DPIA, consent, data-subject rights, breach
notification) on the NDPA track.

## Risk register

| ID | Risk | Where it lives today | Mitigation | Status |
| --- | --- | --- | --- | --- |
| R-01 | A production build with no backend silently serves 12 fake patients as if they were real | `src/data/api.ts` returned `mockData` whenever env was absent | `VITE_APP_MODE` + startup gate + `demoFallback()` throwing in production (ADR-0001) | **Closed** 2026-10-09 |
| R-02 | Same mis-deploy also removes authentication (demo role-picker login) | `src/auth.tsx:69-71` picks `DemoIdentityAdapter` only when no backend is configured | Production mode cannot boot at all without a backend (`StartupBlocked`), so the demo adapter is unreachable there | **Closed** 2026-10-09 |
| R-03 | UI claimed pages are "encrypted" when the control is a client-side view lock | `Sidebar.tsx`, `CodeGate.tsx`, `Login.tsx` ("SOC 2 · HITRUST · 256-bit"), `Messages.tsx` ("encrypted end-to-end … per HIPAA policy") | False certification/encryption claims removed and replaced with accurate wording; real confidentiality moves server-side (ADR-0002) | **Closed (copy)**; server-side control = R-04 |
| R-04 | Client records + AES key sit in the same browser storage | `www-*` keys in `localStorage`, `www-dek` in `src/utils/crypto.ts` | `0007` created the server-side registry (applied 2026-10-26); Phase 2 wires the app to it and purges device stores | **Open** — tables live, no client wiring yet |
| R-05 | Coarse RLS: `role_can()` ignored the action, `for all` policies let any org member update/delete PHI | `0004_role_rls.sql` (replaced) | `role_allows(entity, action)` + per-action policies + `revoke delete, truncate, references` from `anon`/`authenticated` | **Closed** — `0007` applied to `zdtaludwhxnjutosrnvi` 2026-10-26; 23 tables now carry per-action policies |
| R-06 | Audit trail is client-writable and capped at 500 rows | `src/utils/audit.ts` (`CAP = 500`, localStorage) — demo mode only | DB-side hash-chained `audit_log`, immutability trigger, admin/self-only reads; the R-20 search-path defect that made every hosted audit write fail is fixed by `0009` | **Partially closed** — server trail works and is verified on the hosted project; the demo store is browser-local by design |
| R-07 | Record export puts PHI into email; print sheet had no provenance or trail | `src/utils/recordExport.ts` (was `document.write` + raw `mailto:`) | DOM-built sheet (no markup injection), provenance + demo watermark, explicit recipient authorization step, every export audited | **Mitigated**; Phase 3 replaces mail body with an expiring share link |
| R-08 | WWW numbers 001-999 allocated by a client-side max+1 scan | `src/utils/wwwRecords.ts:111-121` | `register_www_client()` with a locked per-org counter row and a hard exhaustion error | **Open** — server function exists, client path still in use |
| R-09 | `VITE_APP_MODE=demo` against a real project would re-enable fake data | deployment config, not code | `vercel.json` now builds production mode (`npm run build`), so the deployed artifact refuses to boot without a backend. Remaining exposure is someone setting `VITE_APP_MODE=demo` in the Vercel project — a release-checklist item to verify before each deploy | **Mitigated (2026-10-26)** — env review still manual |
| R-10 | Six npm advisories remain, 2 critical, all in the build toolchain (`vitest`/`tinypool`, `vite-plugin-singlefile`) | `package-lock.json` | `npm audit fix` cleared 3; remaining need a **major** vitest 3→5 bump — a human decision. CI now reports audit on every run | **Open**, non-blocking by design |
| R-11 | CDS rules are a hand-written substring matcher, not a drug reference | `src/utils/cds.ts` (`ALLERGY_RULES`, 5 rules) | Fixed the data-source defect (it evaluated mock patients instead of the loaded chart); still needs RxNorm/validated knowledge base + clinical sign-off before real use | **Partially closed** — see R-12 |
| R-12 | CDS now reads the caller-supplied patient, but the ruleset itself is unvalidated | `src/utils/cds.ts` | Provenance, versioning, override-with-reason logging, clinical governance review | **Open** |
| R-13 | PHI residue already on clinic browsers from demo use | Any device that ran the demo | Export → validate → import script, then clear `www-*` stores; document as a migration-window task, not a code change | **Open** |
| R-14 | Shared accounts / no MFA / no idle auto-logoff | `Login.tsx`, `LoginMfa.tsx`, `LoginStepUp.tsx`, `Sidebar.tsx` footer states it plainly | `0008` gates order writes on GoTrue AAL2/TOTP and adds `set_profile_access` revocation (applied 2026-10-26); challenge and step-up screens exist (`/login/mfa`, `/login/step-up`). **The five seeded staff accounts were closed on the live project 2026-11-03**: four revoked via `disabled_at`, `admin@www.clinic` kept as break-glass with its password replaced by a value nobody holds | **Partially mitigated** — shared-credential exposure closed; TOTP **enrolment** UI, admin approval/invitation UI, named-account policy and idle auto-logoff remain (0 factors enrolled today) |
| R-15 | No backups, no DR runbook, no monitoring, no CSP | infrastructure, none in repo | Phase 3/4: PITR + quarterly restore rehearsal, IaC, PHI-redacting log sink, Sentry, CSP after retiring `vite-plugin-singlefile` | **Open** |
| R-16 | The verification gates did not execute the data layer: `demoFallback()` threw in the *demo* artifact (gated on backend presence, not mode) while tests/typecheck/lint all passed, and unbacked security copy survived on the desktop-only Login panel | `src/data/api.ts`, `src/data/api.test.ts`, root AGENTS.md Verification | Fixed 2026-10-20: gate keys on `DEMO_DATA_ALLOWED`; `api.test.ts` asserts loaders resolve; a standing rule requires loading built `dist/index.html` in a browser before claiming a screen works | **Closed (2026-10-20)** |
| R-17 | Any signed-in user could make themselves an admin: signup role came from client metadata (`0001:211`) and `profiles_self` allowed `UPDATE` of the whole row (`0001:256`) | `supabase/migrations/0001_init.sql`, signup in `src/identity/supabase-adapter.ts` | `0008` stores `requested_role` only, starts accounts as reception + unverified, replaces the policy with select-only, moves role changes to audited admin RPCs, and adds a column-guard trigger. The adapter drops the session `signUp` creates and reports `unverified` | **Closed** — applied 2026-10-26; probe as `authenticated`: `update profiles set role='admin' where id=auth.uid()` → `42501 permission denied for table profiles`. The legitimate half also now works: `approve_profile` ran as the seeded admin and flipped a pending account to `doctor verified=true` (R-20 fixed the audit write it depends on) |
| R-18 | `verified`/revocation were not enforced by RLS: `current_org_id()` and `is_admin()` ignored them, so an unapproved or revoked profile kept reading PHI until JWT expiry | `supabase/migrations/0001_init.sql:175`, `evaluate()` in `src/identity/supabase-adapter.ts` | `0008` folds `verified and disabled_at is null` into every helper; `set_profile_access(..., false)` takes effect on the next query (no `auth.sessions` surgery); the adapter signs out a disabled/unverified profile and distinguishes revoked from pending in the message | **Closed** — applied 2026-10-26; probes as `authenticated`: unverified → `count(*) from patients` = **0**, `current_org_id()` = NULL; same account with `disabled_at` set → **0**, while a verified doctor still sees its org's 2 rows |
| R-19 | Step-up was demo-only: `RouteAuthenticationGate` returned `<Outlet/>` whenever Supabase was configured, so backend mode had no recent-auth check on `/orders` | `RouteAuthenticationGate` in `src/auth.tsx`, `stepUpReason()` in `src/identity/supabase-adapter.ts` | The gate now calls `stepUpReason()` in every mode and routes to `/login/step-up`; `0008` requires GoTrue AAL2 + recent TOTP `amr` for order authoring/administration; org switch defaults on and downgrades require step-up + audit | **Closed** — applied 2026-10-26; order insert at `aal1` → `42501 new row violates row-level security policy`, same insert with `aal2` + a fresh `totp` `amr` entry → succeeds |
| R-20 | Every `audit_log` write fails on the hosted project, so `append_audit()` — and with it `approve_profile`, `set_profile_access`, `set_profile_role`, `update_my_profile`, invitation creation/redemption and the audited app actions — error out | `chain_audit_hash()` in `0007`, `create_invitation`/`accept_invitation` in `0008`; Supabase installs pgcrypto in the `extensions` schema while these pin `set search_path = public` | Found 2026-10-26 by dry-running `approve_profile` (`42883 function digest(text, unknown) does not exist`). `0009_crypto_search_path_fix.sql` widens those three functions to `public, extensions` without touching their bodies; the longer-term shape is the built-in `sha256()` on PG 17 and no pgcrypto at all | **Closed** — `0009` applied 2026-10-26; `approve_profile` then wrote its audit row on the hosted project (`action=approve`, `actor=admin`, `row_hash` computed). Longer-term shape is still the built-in `sha256()` with no pgcrypto dependency |
| R-21 | Role wildcards grant **read access to every entity** to every role: `role_allows()` returns true for `select` regardless of entity, so `lab` and `reception` can read `notes` (and `history`, `medications`, …). The "lab cannot read notes" expectation in the `0007` assertion comments is not what the code does | `role_allows()` CASE in `0008:197`, consumed by `notes_read`/`history_read`/`medications_read` in `0007:480-486` | `role_permissions` in `0010` makes the matrix one row per `(role, entity, action)`, so tightening is a data change, not a helper rewrite. Preserved verbatim in `0010` because narrowing clinical read access is a clinical decision | **Open** — documented, behaviour unchanged; needs sign-off on which roles may read notes/history/medications |
| R-22 | Open self-registration auto-grants **tenancy**: anyone can call `/signup`, and the trigger attaches the new profile to the first organisation because `profiles.org_id` is `not null`. Verification gates the *role*, not the *org*, so an unapproved stranger is already inside a clinic's tenant boundary | `0001:15` (`org_id not null`), `handle_new_user()` at `0001:204-213`, `src/pages/Signup.tsx`, `signup()` in `src/identity/supabase-adapter.ts` | ADR-0005: create accounts only by owner action, disable public sign-up in GoTrue, and let `0011` make `org_id` nullable so `handle_new_user` attaches nothing — no membership means `current_org_id()` is NULL and every policy fails closed. `create_organization()` dropped | **Open** — `0011` authored and dry-run verified (rolled back), not applied. Until then the live project still admits self-signups |

## What the app still must not do

The identity and access defects (R-05, R-17, R-18, R-19, R-20) are now enforced
and verified by the live database. They are not the remaining blockers. Until
**R-04, R-06, R-08, R-12, R-13, R-14, R-15, R-21 and R-22** are closed this build must
not hold real patient records: clinical records still live in browser storage, the
WWW-number and record-migration paths are unwired, the CDS ruleset is
unvalidated, anyone can still sign up and be attached to the clinic, no TOTP
factor is enrolled, there are no backups/monitoring/CSP, and every role can
currently read every entity including clinical notes.

Demo mode remains the only approved use, and the demo banner plus the print/email
watermark exist so that a demo artifact cannot be mistaken for a clinical
document.

## Phase acceptance evidence (2026-10-09)

- `npx vitest run` — 45 passed / 6 files, including `src/env.test.ts` proving the
  fail-closed mode matrix.
- `npx eslint . --max-warnings=0` (react-refresh exempted, as CI does) — exit 0,
  including the new `no-restricted-imports` boundary that keeps `src/utils/**`
  from importing the demo record set.
- `npm run build` (production mode) and `npm run build:demo` — both exit 0;
  single-file output 740 kB / 208 kB gzip.
- `supabase/migrations/0007_*.sql` parsed with libpg_query (`pglast`): 96
  statements, no syntax errors. PL/pgSQL function bodies are not validated by a
  parser and the migration has **not** been executed — no Postgres, Supabase CLI
  or Docker is available in this environment. Applying it to staging is the next
  gate, and the RLS matrix assertions at the foot of the file must run there.

## Phase acceptance evidence (2026-10-20)

- Browser verification of the built demo artifact (`dist/index.html` from
  `npm run build:demo`), which is what R-16 was missing: app boots, demo banner
  renders, dashboard KPIs populate from the fixture, Messages renders, Orders still
  shows the doctor-code gate, Settings shows live audit counts.
- Asserted absent from the rendered DOM: `HIPAA`, `SOC 2`, `audited`, `encrypted`,
  `12,000`, `trusted by`, `3 devices`, the fabricated `10.42.18.6` session IP.
- `npx vitest run` — 48 passed / 7 files (adds `src/data/api.test.ts`).
- `npm run build` (production) still refuses to boot without a backend — the
  behaviour the live site displayed. (At the time, `vercel.json` pinned the demo
  build; it now builds production mode — see R-09 and the 2026-10-26 entry in
  `Documentation.md`.)

## Identity hardening evidence (2026-10-26)

- `supabase/migrations/0008_identity_hardening.sql` parsed with libpg_query
  (`pglast`): 82 statements, no syntax errors. PL/pgSQL bodies are opaque to a
  parser, so this was evidence only up to 2026-10-26, when `0008` was applied to
  the cloud project and its behaviour was probed directly — see "0007 + 0008
  applied to the cloud project" below.
- Client seam implemented in `src/identity/` (`state.ts`, `adapter.ts`,
  `demo-adapter.ts`, `supabase-adapter.ts`), with `src/auth.tsx` owning the
  reducer and `RouteAuthenticationGate` calling `stepUpReason()` in every mode.
  `/login/mfa`, `/login/step-up` and `/login/pending` exist; `auth-supabase.tsx`
  and `auth-demo.tsx` are gone. 64/64 Vitest across 9 files, `tsc --noEmit`, the
  CI-equivalent ESLint command and both builds pass.
- Browser walkthrough of the built demo artifact: demo picker → dashboard,
  `/orders` step-up gate, aged session → `/login/step-up` → orders, direct visits
  to `/login/mfa` and `/login/pending` redirecting, signup → sign-in, wrong
  password, reception role denial, no console errors. **Demo mode only** — the
  Supabase adapter has not run in a browser against a backend-configured build;
  the server half was verified directly instead (see the apply section below).
- Screens not yet built: TOTP enrolment, admin approval, invitations (clients
  must be enrolled/approved out-of-band via SQL).
- Staging apply plus the assertion block at the foot of `0008` were the gate. The
  four checks that decide it: an unverified account reads 0 patients; a self
  update of `profiles.role` is denied; an order insert fails at `aal1` and
  succeeds with a fresh `totp` entry in `amr`; a revoked profile reads 0 rows on
  its next query without a new token. **All four ran green — see the next
  section.**

## 0007 + 0008 applied to the cloud project (2026-10-26)

Project `zdtaludwhxnjutosrnvi` (BuffNdaHood62's Project, West EU). Procedure:
`supabase/GO-LIVE-RUNBOOK.md`.

- `supabase migration list` first: remote history already recorded 0001–0006, so
  `migration repair` was not needed and `db push` applied exactly 0007 and 0008.
  CLI 2.122.0 over `npx`, no Docker, no `pg_dump`, no password prompt.
- Restore point: `db dump` needs a local `pg_dump`, which is not installed, so
  instead of a dump there is a DDL **manifest** of the pre-push state in
  `supabase/db/pre-0007-manifest.txt` (gitignored): the 16 `*_rbac`/`_org`
  policies, 0001–0006 functions, 15 tables, zero triggers on
  `profiles`/`audit_log`. That is the drift check, not a backup. The data itself
  is fake and reproducible from `0003_seed.sql`; recovering the schema means
  re-applying 0001–0006 onto an empty `public` schema.
- Post-apply state: migrations 0001–0008 recorded; `profiles` now has
  `requested_role`/`disabled_at`; `profiles_self` replaced by
  `profiles_self_read` + `profiles_admin_read`; `orders` carries
  `orders_read`/`orders_write`/`orders_update`; `www_clients`,
  `www_client_visits`, `www_client_demographics`, `medical_reviews`,
  `order_administrations`, `www_number_counters`, `invitations`, `auth_events`
  exist; 12 triggers live (`audit_hash_chain`, `audit_immutable`,
  `auth_events_immutable`, three registry immutability triggers,
  `orders_content_immutable`, `profiles_guard`, the org security-setting guard and
  audit, `www_demographics_audit`); 23 tables have policies; `delete`/`truncate`
  revoked from `anon`/`authenticated`.
- Gate checks, run as `set local role authenticated` inside rolled-back
  transactions with injected `request.jwt.claims` (`supabase/db/check-*.sql`):
  | Check | Result |
  | --- | --- |
  | unverified account, `patients` | **0 rows**, `current_org_id()` NULL |
  | verified doctor, `patients` | 2 rows, correct org — RLS is not over-blocking |
  | `update profiles set role='admin' where id=auth.uid()` | denied `42501` |
  | order insert at `aal1` | denied `42501` (RLS) |
  | order insert at `aal2` + `totp` `amr` 5s old | **inserted** |
  | doctor with `disabled_at = now()` | **0 rows**, `current_org_id()` NULL |
- The `aal2` row is a claim injection through the postgres role, not a real
  second-factor session. It proves the SQL gate reads `amr` correctly; it does not
  prove the GoTrue → `stepUpReason()` → `/login/step-up` path end to end. That
  still needs a browser against a backend-configured build.
- Rollback verified clean afterwards: probe order absent, `disabled_at` NULL
  again, `audit_log` still 0 rows.
- Open now: `require_step_up_for_orders = true` with **0 rows in
  `auth.mfa_factors`** — nobody can author orders from a real session until a
  factor is enrolled. GoTrue MFA has not been confirmed enabled in the Dashboard
  from here. `michaelnnamdi62@gmail.com` has since been approved (see below).
- **R-20 found, fixed and verified the same day.** Dry-running `approve_profile`
  (inside a transaction, rolled back, nothing written) hit
  `42883 function digest(text, unknown) does not exist` in `chain_audit_hash()`.
  pgcrypto is in the `extensions` schema on this project while the 0007/0008
  functions pin `search_path = public`, so `digest()` and `gen_random_bytes()` do
  not resolve — and since `chain_audit_hash()` is the BEFORE trigger on every
  `audit_log` insert, all audit writes failed. `0009_crypto_search_path_fix.sql`
  widens those three functions to `public, extensions` (3 statements, `pglast`
  clean); applied 2026-10-26 and `proconfig` confirmed on all three.
- Approval then ran for real: as the seeded admin (`7b2ec287-…`),
  `approve_profile('0cf4097a-…','doctor')` left `michaelnnamdi62@gmail.com` at
  `doctor verified=true disabled=null`, with one `auth_events` row
  (`profile_approved`) and one `audit_log` row (`approve profile`, actor = the
  admin, `row_hash` computed, `prev_hash` NULL as the first link). The same
  transaction, re-run as the approved user, returned
  `current_org_id() = 11111111-…` and **2 patients** — the pending→approved
  transition works in SQL end to end.
- Sequence detail: the two rolled-back attempts consumed `auth_events` ids 1–2,
  so the committed row is id 3. A rollback does not reuse a `nextval` — correct
  behaviour, not a gap.

## Seeded demo credentials closed on the live project (2026-11-03)

The site has been serving production mode since `vercel.json` flipped, which made
`0003_seed.sql`'s own warning live: five staff accounts on a public clinical URL
sharing the password printed in this repo. Confirmed before acting — all five had
the identical hash `$2b$10$eXdWw…`, i.e. exactly the committed hash for
`DemoPassw0rd!`.

Action taken (`supabase/db/revoke-seeded-accounts.sql`, one transaction):

- `disabled_at = now()` on `doctor@`, `nurse@`, `lab@`, `reception@www.clinic`.
  Access revocation, not deletion: the rows and their clinical history stay, and
  `current_org_id()` now resolves NULL for them.
- `admin@www.clinic` kept as break-glass, but its password was replaced in-place
  with `crypt(gen_random_bytes(24), gen_salt('bf',10))` — generated inside the
  statement, so no one holds it, including this agent. To use that account again,
  set a new password in Dashboard → Authentication → Users.
- Five `auth_events` rows (`access_changed`) and five `audit_log` rows written;
  all six audit rows carry `row_hash`, so the 0009 fix held for direct inserts too.

Verified by impersonation probes (`supabase/db/probe-revoked.sql`):

| Probe | Result |
| --- | --- |
| revoked doctor | `current_org_id()` NULL, `role_allows('patients','select')` false, patients **0** |
| your account | org resolves, patients **2**, `role_allows('orders','insert')` true |

Remaining exposure on this project: no TOTP factor is enrolled, so order writes
still fail closed for real sessions, and the break-glass admin cannot be used
until its password is reset.

## Invite-only model drafted and dry-run verified (2026-11-03)

ADR-0005 (decisions: new dedicated owner account, single organisation, Edge
Function deferred, break-glass admin retained) and
`supabase/migrations/0011_platform_owner_invite_only.sql` are authored. Neither is
applied. `0010` is still unapplied too, so `0011` was exercised as a chain:
`begin; 0010; 0011; …; rollback;`.

Two runs, both rolled back:

1. **Guard fires.** 0010 + 0011 with no `platform` row aborted exactly as intended:
   `PLATFORM_BOOTSTRAP_REQUIRED: expected exactly 1 platform row, found 0. Run the
   insert from this file's header step 3, then re-apply.` The whole 0010 body and
   0011 §1–§7 executed before that point, so nothing is a syntax-only pass.
2. **Behaviour probes** with a stand-in owner and break-glass row inserted, all as
   `authenticated` with injected claims:

   | Probe | Result |
   | --- | --- |
   | `profiles.org_id` after `0011` | nullable — self-signup can no longer be force-attached |
   | owner `is_platform_owner()` | true; reads its org's 2 patients |
   | owner `transfer_platform_ownership()` at `aal1` | `STEP_UP_REQUIRED` |
   | `create_organization('Sneak Clinic')` | `function … does not exist` (dropped) |
   | break-glass `is_break_glass_admin()` / `is_admin()` | true / true |
   | break-glass `invite_member(email,'admin')` | `ADMIN_GRANT_OWNER_ONLY` |
   | break-glass `assign_role(user, admin slot)` | `ADMIN_GRANT_OWNER_ONLY` |
   | break-glass `invite_member(email,'nurse')` | ok, 64-char token |

Post-rollback check: no `platform`, no `org_memberships`, `org_id` NOT NULL again,
`profiles` still 6 rows.

Not yet done for R-22: applying `0010`→`0011`, creating the owner account **while
public sign-up still works**, bootstrapping the `platform` row, disabling sign-up
in GoTrue, and the client-side lockdown (`/signup` demo-only, `signup()` returning
the invitation-only error, an "awaiting assignment" screen for membership-less
accounts).
