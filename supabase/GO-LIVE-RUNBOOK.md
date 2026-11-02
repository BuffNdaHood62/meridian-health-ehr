# Go-live runbook — apply 0007/0008 and switch the deployment to real auth

Date: 2026-10-26 · Owner: Michael · Read `docs/risk-register.md` first. The
identity and RLS defects (R-05, R-17, R-18, R-19) are closed and verified on the
cloud project; R-04, R-06, R-08, R-12, R-13, R-14 and R-15 are the reasons this
still must not hold real patient records.

## Status on the cloud project (2026-10-26)

Sections 1–3 and 6 are **done** on `zdtaludwhxnjutosrnvi`: `db push` applied 0007
then 0008, the schema is confirmed, and all six gate probes ran green (evidence
table in `docs/risk-register.md`). Sections 4, 5 and 7 are **not done**, and they
are what actually stands between this project and a working clinical sign-in:

- [x] **Blocker cleared — `0009` applied.** Dry-running `approve_profile` (§5) hit
      `42883 function digest(text, unknown) does not exist` in
      `chain_audit_hash()`: pgcrypto lives in the `extensions` schema here, while
      the 0007/0008 functions pin `search_path = public`. Every `audit_log` insert
      failed, which took down `append_audit()` and with it `approve_profile`,
      `set_profile_access`, `set_profile_role`, `update_my_profile`,
      `create_invitation`/`accept_invitation` and the audited app actions (R-20).
      Applied 2026-10-26; the audit write now succeeds.
- [ ] §4 GoTrue: confirm **Confirm email = ON** and **TOTP = ON** in the
      Dashboard. Not verified from here — the CLI does not report auth settings.
- [ ] §5 First admin bootstrap + one enrolled TOTP factor. `auth.mfa_factors`
      currently has **0 rows** while `require_step_up_for_orders = true`, so no
      real session can author an order until a factor exists.
- [x] §5 Approved the pending account: run as a verified admin,
      `select public.approve_profile('0cf4097a-8f37-406e-a984-bfb372e1fc9b','doctor')`
      — done 2026-10-26 for `michaelnnamdi62@gmail.com`. Impersonating the admin
      session with `set local role authenticated` + injected claims works, but note
      the actor recorded in `auth_events`/`audit_log` is whoever the claims name, so
      a real approval should come from a real admin session once the app can sign
      in.
- [ ] §7 Vercel env vars, then push `vercel.json`, then the browser pass on the
      deployed URL.

Two corrections to the procedure as written, learned by running it:

- `supabase db dump` is not usable here — it shells out to a local `pg_dump`,
  which is not installed. Take the restore point from the Dashboard, or install
  the Postgres client tools, and treat §0's "dump exists" as unmet.
- `supabase db query --linked` is the practical way to run §6's probes without a
  psql client. It connects through the Management API using the login token, so
  no database password is needed. `supabase/db/check-*.sql` are the scripts that
  ran; they are gitignored scratch files, so re-create them from this section.


Everything here runs against a **Supabase project**, not the browser. Nothing in
this repo can do it for you: there is no Postgres, Supabase CLI or Docker in the
development environment, so `0007` and `0008` have only ever been parser-checked.

## 0. Preconditions

- [ ] You know the project ref (Dashboard → Project Settings → Reference ID).
- [ ] The data in that project is **fake or staging data**. `0007`/`0008` are not
      written to be reversible in place; there is no down-migration.
- [ ] A restore path exists: `npx supabase db dump -f backups/pre-0007.sql`
      (needs `pg_dump`), or the accepted fallback — the seeded dataset is
      reproducible from `0003_seed.sql`.
- [ ] Nobody is mid-deploy on Vercel: `vercel.json` already builds production
      mode, so a push before section 7 is configured serves `StartupBlocked`.

## 1. Apply with the CLI (preferred — it records migration history)

Docker is only needed for `supabase start` / `db reset` (the local stack).
`link` and `db push` talk to the hosted project directly.

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase migration list
```

**Read `migration list` before pushing.** If 0001–0006 show as local-only — likely,
because this project was originally set up by pasting SQL into the Dashboard editor
— `db push` will re-run `0001` and abort on `create policy ... already exists`.
Mark them applied first:

```bash
npx supabase migration repair --status applied 0001..0006
npx supabase db push
```

Expected: `Applying migration 0007_www_registry_and_access_hardening`, then `0008`,
then ` Successfully type-checking` / `Finished supabase db push` with no errors.

## 2. Apply without the CLI (Dashboard → SQL Editor)

Run `migrations/0007_www_registry_and_access_hardening.sql` whole, then
`0008_identity_hardening.sql` whole, **in that order** (0008 depends on
`role_allows`, `forbid_mutation` and the registry tables from 0007). The
assertion blocks at the foot of both files are commented out, so pasting them
does not run any test SQL.

Then record the versions, or the next `db push` re-applies them:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('0007','0007_www_registry_and_access_hardening'),
       ('0008','0008_identity_hardening')
on conflict (version) do nothing;
```

## 3. Confirm the schema landed

```sql
select column_name from information_schema.columns
 where table_schema='public' and table_name='profiles'
 order by column_name;
-- expect: disabled_at, requested_role, verified, role, org_id, ...

select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and proname in
   ('has_recent_mfa','approve_profile','set_profile_access','register_www_client',
    'role_allows','accept_invitation');   -- expect 6 rows
```

## 4. GoTrue settings (Dashboard, not SQL)

- [ ] Authentication → Providers → Email: **Confirm email = ON**. A session
      without a confirmed email is not a supported state (ADR-0003).
- [ ] Authentication → Multi-Factor Auth: TOTP ON, issue `aal2` on verify.
- [ ] Rate limiting left at GoTrue defaults. The client's doctor-code lockout is
      UX only — do not describe `auth_events` as a server-side login lockout.

## 5. Bootstrap the first admin, then one TOTP factor

No verified admin exists yet, so the first grant must be direct SQL (from the
`0008` header). After that, roles go through `approve_profile()`.

```sql
update public.profiles set role='admin', verified=true
 where id = (select id from auth.users where email='<admin email>');
```

Then, as that admin in the browser (signed in at AAL1), enrol a factor — there is
**no enrolment UI in the app yet**, so this is a one-off in the page console:

```js
const { data, error } = await supabase.auth.mfa.enroll({ issuer: 'WWW EMR' });
// scan data.totp.qr_code with an authenticator, then:
const ch = await supabase.auth.mfa.challenge({ factorId: data.id });
await supabase.auth.mfa.verify({ factorId: data.id, code: '123456' });
```

Do not skip this. `require_step_up_for_orders` defaults ON, so an org with no
enrolled factor cannot author orders. The escape hatch is deliberately narrow:

```sql
-- SQL editor only: the guard passes when auth.uid() is null, and client roles
-- cannot write this column without a recent MFA entry.
update public.organizations set require_step_up_for_orders = false where slug='www';
```

Using it re-opens R-19; record that in `docs/risk-register.md`.

## 6. Gate checks — these four decide whether the apply passed

Supabase's SQL editor runs as `postgres` and bypasses RLS, so impersonate the app
role inside a transaction. Repeat per case:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated","aud":"authenticated","aal":"aal1"}';
select count(*) from public.patients;
reset role; rollback;
```

| # | Check | Expected |
| --- | --- | --- |
| 1 | Unverified account (`verified=false`), or after `select public.set_profile_access('<uuid>', false)` | `select count(*) from patients` → **0**, no error. Fail-closed means filtered, not denied |
| 2 | As that user: `update public.profiles set role='admin' where id=auth.uid()` | `42501` — select-only policy, and the `guard_profile_mutation` trigger blocks it even under a future policy |
| 3 | Order insert at `aal1` vs a fresh TOTP session (`aal2` + recent `totp` in `amr`) | insert fails `42501` at `aal1`; succeeds at `aal2` |
| 4 | `select public.current_org_id()` for a member of org A, then read patients | only org A rows; `current_org_id()` is null for unverified/disabled |

The `aal2` case cannot be reached with a plain `set local request.jwt.claims`,
because the timestamp has to be current — build the claims with `set_config`:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','<uuid>','role','authenticated','aud','authenticated',
    'aal','aal2','amr', json_build_array(json_build_object(
      'method','totp','timestamp', floor(extract(epoch from now())))))::text, true);
insert into public.orders (patient_id,name,type,detail,priority,status,ordered_at)
 values ((select id from public.patients limit 1),'Runbook probe','Laboratory',
         'aal2 step-up check','Routine','Pending',now())
 returning id, name;
rollback;
```

Note the column values: `orders.type` is constrained to
`Medication|Laboratory|Imaging|Referral|Nursing` and `priority` to
`Routine|STAT|Urgent` — a probe that violates a CHECK constraint looks like a
pass for the wrong reason. RLS violations surface as `42501`.

Also run the RLS-matrix recipes at the foot of each migration (nurse cannot insert
an order, lab cannot read notes, reception cannot read labs, no role may delete a
visit, `anon` sees nothing), plus:

```sql
insert into public.audit_log (org_id, action) values (null,'x');  -- permission denied: RPC only
select public.redeem_share('bogus');                              -- throws INVALID_SHARE
```

## 7. Point the deployment at the project

Order matters: env **before** push.

1. Vercel → project → Settings → Environment Variables (Production):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (**anon only — never
   service_role**), `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_PHONE`. Do not set
   `VITE_APP_MODE` (unset resolves `vite build` to production).
2. Push `vercel.json` (`buildCommand: npm run build`, already set locally).
3. Load the deployed URL: it must show the real sign-in screen, **not**
   `Application not started` and **not** the demo banner. Then sign up an account
   and confirm the email — the app must land on `/login/pending`, and after
   `approve_profile` the same credentials must reach the dashboard.

A `StartupBlocked` page after step 3 means the env vars were missing at *build*
time — Vite inlines them, so a redeploy is required, not a restart.

## 8. If something fails halfway

There is no down-migration. `0007`/`0008` replace policies, triggers and
`handle_new_user`, so a partially applied state is not a state anyone should
debug under time pressure. Restore the section 0 dump, or forward-fix in the
project that has only fake data. Do not hand-edit the applied SQL to "undo" a
policy — re-apply from the file.
