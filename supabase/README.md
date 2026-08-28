# Supabase backend — Wellness with Writingale EMR

Production-grade auth + Postgres + RLS for the EHR SPA. No backend was in the
repo before; this is the storage swap the demo `useAuth`/`appendAudit` were
written to accept.

## What's here

- `migrations/0001_init.sql` — extensions, `profiles`/`organizations`/`patients`
  + clinical child tables, `audit_log`, `shares`; RLS; helper fns
  (`current_org_id`, `is_admin`, `handle_new_user` trigger, `append_audit`).
- `migrations/0002_rpc.sql` — `redeem_share(token)` (public, SECURITY DEFINER)
  for the external `/share/:token` route; `verify_profile` (admin).
- `migrations/0003_seed.sql` — demo org + 5 staff accounts + 2 patients.
- `config.toml` — local Supabase CLI config (email confirmations on, OTP on).
- `../scripts/bootstrap-supabase.mjs` — bootstrap (local or `--cloud`).

## Data model (one-org-per-deployment, multi-tenant ready)

```
auth.users ──1:1── profiles(id, org_id, full_name, email, role, verified)
organizations(id, name, slug)
patients(id, org_id, mrn UNIQUE(org), … PHI …)
  ├─ allergies / medications / labs / vitals / history / notes  (FK patient_id)
  └─ orders(id, patient_id, ordered_by→profiles, administered)
messages(org_id, …)
audit_log(org_id, actor_id→auth.users, action, entity, entity_id)  -- append-only
shares(id, patient_id, token UNIQUE, expires_at, consumed)
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

`src/lib/supabase.ts` exposes the anon client. `src/auth.tsx` `AuthProvider`
selects the Supabase provider automatically when `VITE_SUPABASE_*` are set; the
demo localStorage provider is the fallback. Pages keep using `useAuth()` —
unchanged. `appendAudit()` routes to the `append_audit` RPC when configured.

Sign-in (email/password): `useAuth().loginWithEmail(email, pw)`.
Sign-up: `useAuth().signup({name, email, role, password})` → Supabase sends a
verification email; profile auto-created by the trigger. Passwordless: enable
Email OTP in Studio and call `supabase.auth.signInWithOtp({ email })`.

## Verification checklist

- [ ] `npm run build` green (typecheck gates it).
- [ ] `npx supabase db reset` applies all 3 migrations with no errors.
- [ ] Sign up a user → confirm email → profile row exists, `verified=false`.
- [ ] As that user, `select * from patients` returns ONLY your org's rows.
- [ ] `insert into audit_log` as anon client → permission denied (RPC only).
- [ ] `redeem_share('bogus')` → throws; valid token returns minimal JSON, 2nd call → ALREADY_CONSUMED.

## Common pitfalls

- Putting the **service_role** key in `VITE_*` — never; anon key only.
- Forgetting email confirmation → profiles stay `verified=false`; gate UI on it.
- RLS subqueries: PG forbids `JOIN` in a policy `USING`; we key child tables off
  `(select org_id from patients …)` instead.
- Seed password hash is a placeholder — generate a real bcrypt hash for
  `DemoPassw0rd!` before any non-local use, or create users via the Dashboard.
- Client `audit_log` writes MUST go through the RPC, not `.insert()` — RLS blocks
  direct inserts by design.

## Optional extensions

- **Activity / analytics:** add `activity_events` table + `append_activity` RPC
  (same SECURITY DEFINER pattern); stream to a warehouse via Supabase
  `pg_cron` + `wrapper`, or pipe `audit_log` changes with Supabase Realtime.
- **Role-scoped RLS:** add a `role_can_read(entity)` fn for fine-grained access
  (e.g. reception can't read `notes`).
- **Storage:** patient docs → `storage` bucket with RLS keyed on `org_id`.
