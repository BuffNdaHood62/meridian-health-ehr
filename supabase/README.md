# Supabase backend — Wellness with Writingale EMR

Postgres schema, RLS and identity hardening for the EHR SPA. No backend was in
the repo before; this is the storage swap the demo `useAuth`/`appendAudit` were
written to accept. **0001–0009 are applied to project `zdtaludwhxnjutosrnvi`**
(0001–0006 earlier; 0007, 0008 and the 0009 crypto fix on 2026-10-26, with the
gate checks in `GO-LIVE-RUNBOOK.md` passing). `0010` — multi-organisation
memberships, role instances and the permission matrix (ADR-0004) — is authored
and verified in a rolled-back transaction but **not applied**. For any other
project, start from `supabase migration list` — do not assume.

## What's here

- `migrations/0001_init.sql` — extensions, `profiles`/`organizations`/`patients`
  + clinical child tables, `audit_log`, `shares`; RLS; helper fns
  (`current_org_id`, `is_admin`, `handle_new_user` trigger, `append_audit`).
- `migrations/0002_rpc.sql` — `redeem_share(token)` (public, SECURITY DEFINER)
  for the external `/share/:token` route; `verify_profile` (admin).
- `migrations/0003_seed.sql` — demo org + 5 staff accounts + 2 patients.
- `migrations/0004_role_rls.sql` — first per-role policies (superseded by 0007).
- `migrations/0005_alerts_appointments.sql`, `0006_messages_sent.sql` — later tables.
- `migrations/0007_www_registry_and_access_hardening.sql` — server-side WWW
  registry, action-scoped RLS, append-only triggers, hash-chained audit.
- `migrations/0008_identity_hardening.sql` — server-authoritative identity:
  admin-approved roles, invitations, `auth_events`, profile write lockdown,
  verified/revoked gates in every helper, AAL2 step-up for order writes.
  Requires 0007. **Both applied to `zdtaludwhxnjutosrnvi` on 2026-10-26.**
- `migrations/0009_crypto_search_path_fix.sql` — required forward fix: hosted
  pgcrypto lives in `extensions`, so the audit-hash functions needed
  `search_path = public, extensions` or every audit write failed (R-20).
- `migrations/0010_org_memberships_roles.sql` — base accounts, organisations
  with an owner and shareable code, role instances, `role_permissions`,
  memberships, and the invitation/join-request lifecycle (ADR-0004). **Authored,
  not applied.**
- `config.toml` — local Supabase CLI config (email confirmations on, OTP on).
- `../scripts/bootstrap-supabase.mjs` — bootstrap (local or `--cloud`).

## Data model (one-org-per-deployment, multi-tenant ready)

```
auth.users ──1:1── profiles(id, org_id, full_name, email, role, verified,
                             requested_role, disabled_at)
organizations(id, name, slug, require_step_up_for_orders)
patients(id, org_id, mrn UNIQUE(org), … PHI …)
  ├─ allergies / medications / labs / vitals / history / notes  (FK patient_id)
  └─ orders(id, patient_id, ordered_by→profiles, administered)
messages(org_id, …)
audit_log(org_id, actor_id→auth.users, action, entity, entity_id)  -- append-only
shares(id, patient_id, token UNIQUE, expires_at, consumed)
invitations(org_id, email, role, token_hash, expires_at, accepted_at) -- 0008
auth_events(org_id, user_id, event, session_id, user_agent, detail)  -- 0008
```
Indexes: `patients(org_id,status)`, `orders(patient_id)`, `labs(patient_id)`,
`audit_log(created_at, entity)`, `shares(token)`.

## RLS summary

- All tables `enable row level security`.
- Every clinical row is scoped to the caller's org via `current_org_id()`
  (a SECURITY DEFINER fn reading `profiles.org_id` from `auth.uid()`).
- `audit_log` has **no client INSERT policy** — writes go only through the
  `append_audit` SECURITY DEFINER fn, so the actor can't be spoofed. Clients
  can only `SELECT` their org's rows.
- `shares` external redemption goes through `redeem_share()` (anon EXECUTE),
  which validates + consumes + returns a minimal projection (no full PHI).
- `current_org_id()`, `is_admin()`, `role_can()` and `role_allows()` all require
  `verified and disabled_at is null` (0008). An unapproved or revoked account
  resolves to a null org and reads nothing, without needing token revocation.
- `profiles` has **no client write policy** (0008). Role/verification/org changes
  go through `approve_profile`, `set_profile_role`, `set_profile_access`, and
  `accept_invitation`; `update_my_profile` only changes the display name.

## Setup (local)

```bash
cp .env.example .env                 # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY after start
node scripts/bootstrap-supabase.mjs  # npx supabase start + db reset
# Studio: http://127.0.0.1:54323
```

## Setup (Supabase Cloud)

**Read `GO-LIVE-RUNBOOK.md` before running this against a project that already
has 0001–0006 applied.** The script just calls `db push`, and if the CLI's
migration history is empty it re-applies `0001` and aborts on a duplicate policy.

```bash
npx supabase login
SUPABASE_PROJECT_REF=xxxx node scripts/bootstrap-supabase.mjs --cloud
# Copy URL + anon key from Dashboard → .env
```

## Front-end integration

`src/lib/supabase.ts` exposes the anon client. `src/auth.tsx` selects an
`IdentityAdapter` at module load: `createSupabaseIdentityAdapter()` when
`VITE_SUPABASE_*` are set, `createDemoIdentityAdapter()` otherwise. Both live in
`src/identity/` and both drive the same state machine
(`anonymous | password_ok | unverified | active | step_up_required | expired`).
Pages keep using `useAuth()` and the hook contract is unchanged in shape — read
`useAuth().mode` for copy, never `isSupabaseConfigured`. `appendAudit()` routes
to the `append_audit` RPC when configured.

Sign-in (email/password): `useAuth().loginWithEmail(email, pw)` resolves to
`{ error, next }`; `next` is `"app"` (route to `from`), `"mfa"` (→
`/login/mfa`), `"pending"` (→ `/login/pending`) or `"none"` on error.
`verifyMfa(code)` challenges the enrolled TOTP factor. `stepUp(password, code?)`
backs `/login/step-up`; `checkStepUp()` is what `RouteAuthenticationGate` calls
on `/orders` and resolves to a reason or null.

Sign-up: `useAuth().signup({name, email, role, password})` → Supabase sends a
verification email; profile auto-created by the trigger. The submitted role is a
**request** (`profiles.requested_role`): the account starts as `reception` and
`verified=false`. The adapter signs that session out and returns `unverified`, so
`/login/pending` is the landing screen. An admin calls
`approve_profile(user_id, role)` (or the invitee redeems a token via
`accept_invitation(token)`) before the account can read anything. Passwordless:
enable Email OTP in Studio and call `supabase.auth.signInWithOtp({ email })`.

TOTP is the second factor. It is enforced server-side by `has_recent_mfa()`
(AAL2 + a recent `totp`/`webauthn` `amr` entry) on order authoring and medication
administration. The client has challenge/step-up screens (`/login/mfa`,
`/login/step-up`) but **no enrolment UI** — factors must be enrolled out-of-band
(e.g. Studio or a one-off script), and there is no admin approval/invitation UI
either (ADR-0003).

## Verification checklist

Server-side, run on 2026-10-26 against `zdtaludwhxnjutosrnvi` (see
`GO-LIVE-RUNBOOK.md` §6 for the exact SQL):

- [x] 0001–0008 applied; `supabase migration list` shows all eight on the remote.
- [x] Unverified profile reads **0** patients and `current_org_id()` is NULL,
      while a verified doctor sees its org's rows (2 — this project has one org,
      so it demonstrates the fail-closed floor, not cross-tenant separation).
- [x] `update profiles set role='admin' where id=auth.uid()` → `42501`.
- [x] Order insert at `aal1` → `42501`; the same insert with `aal2` and a
      `totp` `amr` entry 5 seconds old → succeeds. The `aal2` case used injected
      JWT claims as the postgres role, not a real factor.
- [x] A profile with `disabled_at` set reads 0 rows on its next query, with no
      token change. Set directly inside a rolled-back transaction; the
      `set_profile_access()` RPC path itself is still untested.

- [x] `0009` applied: an `audit_log` insert through `append_audit()` succeeds on
      the hosted project and stores a `row_hash`. Until it landed, **no audit
      write could succeed** and every admin RPC that logs errored (R-20).
- [x] `approve_profile('<uuid>','doctor')` as the seeded admin flips a pending
      account to `verified=true`, writes `auth_events` + `audit_log`, and the
      account reads its org's 2 patients on the next query.

Still open — none of these can pass until the app runs against a backend:

- [ ] `npm run build` green with `VITE_SUPABASE_*` set (production boot, not
      `StartupBlocked`).
- [ ] Enrol a TOTP factor for a verified account → sign-in lands on `/login/mfa`
      → wrong code shows an error, correct code reaches the app. Zero factors are
      enrolled today, so order authoring from a real session is blocked.
- [ ] `/orders` at AAL1 shows the step-up screen and never paints the table.
- [ ] Sign up → confirm email → `/login/pending` → `approve_profile` → dashboard.
- [ ] Compose a message in `/messages` → row lands with `sent=true`; reload
      shows it under Sent.
- [ ] `insert into audit_log` as the anon client → permission denied (RPC only).
- [ ] `redeem_share('bogus')` → throws; valid token returns minimal JSON, a 2nd
      call → ALREADY_CONSUMED.
- [ ] Moving `org_id` fails even under a future policy (column-guard trigger).

## Common pitfalls

- Putting the **service_role** key in `VITE_` — never; anon key only.
- **Seeded auth.users must not have NULL token columns.** Hosted GoTrue's login
  query fails with "Database error querying schema" for any found user whose
  `confirmation_token` is NULL (it must be `''`). `0003_seed.sql` normalizes
  token columns + `raw_app_meta_data` on every seeded row; keep that when
  editing the seed.
- `auth.identities.provider_id` is NOT NULL on hosted projects — set it to the
  user id (the identity's `sub`).
- `messages.org_id` is NOT NULL and RLS `with check` compares it to the
  sender's org — client inserts must resolve `org_id` from the caller's profile
  first (`sendMessage` in `src/data/api.ts` does).
- RLS subqueries: PG forbids `JOIN` in a policy `USING`; we key child tables off
  `(select org_id from patients …)` instead.
- Seed password hash is a real bcrypt hash of the documented demo credential
  `DemoPassw0rd!` (safe to commit for a demo — but never reuse these accounts
  for real data, and rotate/disable them before any non-demo deployment).
- Client `audit_log` writes MUST go through the RPC, not `.insert()` — RLS blocks
  direct inserts by design.
- Never re-add an UPDATE policy on `profiles`. Role, verification and org moves
  are RPC-only for a reason: `0001`'s `profiles_self for all` is what allowed
  self-escalation to admin (R-17).
- `0008` makes order writes require TOTP. An org without an enrolled factor
  cannot author orders until `require_step_up_for_orders` is explicitly
  disabled — and that downgrade itself needs step-up and is audited. Treat it as
  an incident, not a configuration convenience.
- A fresh project has no verified admin, so `approve_profile` has no caller at
  first. Bootstrap the initial admin with direct SQL (header of `0008`).

## Optional extensions

- **Activity / analytics:** add `activity_events` table + `append_activity` RPC
  (same SECURITY DEFINER pattern); stream to a warehouse via Supabase
  `pg_cron` + `wrapper`, or pipe `audit_log` changes with Supabase Realtime.
- **Storage:** patient docs → `storage` bucket with RLS keyed on `org_id`.
