# Supabase backend — Wellness with Writingale EMR

Postgres schema, RLS and identity hardening for the EHR SPA. No backend was in
the repo before; this is the storage swap the demo `useAuth`/`appendAudit` were
written to accept. 0001-0006 were applied upstream; 0007 and 0008 are authored
but not applied anywhere.

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
  Requires 0007. **Both 0007 and 0008 are authored, not applied.**
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

- [ ] `npm run build` green (typecheck gates it).
- [ ] `npx supabase db reset` applies all 8 migrations with no errors. 0008 must
      run after 0007; run its assertion block before trusting the result.
- [ ] Compose a message in /messages → row lands in `messages` with `sent=true`; reload shows it under Sent.
- Sign up a user → confirm email → profile row exists with `role='reception'`,
  `verified=false`, `requested_role` set → the app lands on `/login/pending`
  with "Account pending verification", the session is already signed out, and a
  direct token still reads 0 patients. An admin
  runs `select approve_profile('<user-id>', 'doctor')` to grant access.
  The 5 seeded staff accounts are pre-verified by `0003_seed.sql`.
- [ ] Enrol a TOTP factor for a verified account → sign-in lands on `/login/mfa`
  → wrong code shows an error, correct code reaches the app; reloading at
  `password_ok` re-presents `/login/mfa` rather than skipping the factor.
- [ ] As that user, `update profiles set role='admin' where id=auth.uid()` fails
      (no update policy) and moving `org_id` fails even with a future policy
      (column-guard trigger).
- [ ] With a TOTP-enrolled account, open `/orders` at AAL1 (or after the 8-hour
      `amr` window) → the step-up screen appears and the orders table is never
      painted; completing password + TOTP returns to `/orders`.
- [ ] Order insert at `aal1` fails (`42501`); with a fresh TOTP `amr` entry and
      `aal2` it succeeds. `set_profile_access('<user-id>', false)` makes the next
      read return 0 rows without a new token.
- [ ] As that user, `select * from patients` returns ONLY your org's rows.
- [ ] `insert into audit_log` as anon client → permission denied (RPC only).
- [ ] `redeem_share('bogus')` → throws; valid token returns minimal JSON, 2nd call → ALREADY_CONSUMED.

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
