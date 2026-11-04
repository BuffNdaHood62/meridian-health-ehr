# ADR-0005 — Invitation-only provisioning with a single platform owner

Date: 2026-11-03
Status: Accepted — `0011_platform_owner_invite_only.sql` authored, not applied; depends on `0010` (also unapplied)
Relates to: ADR-0003, ADR-0004 (this resolves its open question 4), `docs/risk-register.md` R-14, R-17, R-18, R-19; `supabase/migrations/0011_platform_owner_invite_only.sql`; `src/pages/Signup.tsx`, `src/identity/supabase-adapter.ts`

## Context

The deployed app is now production mode against `zdtaludwhxnjutosrnvi`. Two doors
are still open by design accident rather than decision:

1. **Anyone can sign up.** `/signup` calls `supabase.auth.signUp`, and
   `handle_new_user()` (`0001:193-216`) gives the new profile
   `org_id = (select id from organizations order by created_at limit 1)` with
   `verified = false`. Because `0001:15` declares `org_id not null`, the trigger
   *must* attach every account to a clinic the moment it is created. Tenancy is
   therefore granted before any human approves anything.
2. **Anyone verified can create an organisation.** `0010`'s `create_organization()`
   accepts any verified account. ADR-0004 left that as an open question; it is a
   hole if the answer was never made explicit.

The product decision is that a clinic's access to patient data is not
self-service: it is conferred by the business owner, by name and email.

## Decisions

### 1. One platform owner, as a distinct concept from `role='admin'`

`public.platform` is a single-row registry (`id = 1`) holding
`owner_user_id`. The owner is the sole proprietress — she owns the platform, not
merely a row inside it. `admin` remains an ordinary role that can be delegated
and revoked; ownership is not a role and cannot be granted by an admin.

Two helpers, both `security definer`, both requiring `verified and
disabled_at is null` like every other gate since `0008`:

- `is_platform_owner()` — the only caller allowed to grant the `admin` role,
  change ownership, or designate break-glass.
- `is_break_glass_admin()` — a second, dormant admin retained for lockout
  recovery.

### 2. The owner is a new, dedicated account

Not a handover of `michaelnnamdi62@gmail.com`, which stays a `doctor` member.
Sequencing matters: the account must be created **before** public sign-up is
disabled, or the only way to create it is the Dashboard invite flow. The bootstrap
is the direct-SQL pattern `0008` already documents — insert the `platform` row
while authenticated as the project owner in the SQL editor.

### 3. Single organisation; `create_organization()` is dropped, not gated

The platform *is* one clinic. Removing the function is better than an owner-only
version because there is no legitimate caller: it eliminates the orphaned-org and
"which org is active" questions that `0010`'s multi-org machinery otherwise
introduces for no benefit. The multi-org schema (memberships, role instances,
`active_org_id`) stays, because it is what makes the membership table the single
source of tenancy — that part earns its keep even at one org.

### 4. Provisioning is by owner action only, and it is manual for now

The Edge Function that would let the in-app UI create an invited account with a
service key is **deferred**. Until it exists:

- The owner creates users in **Dashboard → Authentication → Users → Add user
  (invite by email)**. That sends GoTrue's own invite; the recipient sets a
  password and never touches a public signup form.
- Public sign-up is **disabled in GoTrue** for the email provider.
- Roles are then assigned in-app with `invite_member` / `assign_role` against an
  existing role instance.
- `handle_new_user()` no longer attaches an org: `org_id` becomes nullable and
  new profiles arrive with no membership, so `current_org_id()` is NULL and every
  policy fails closed until the owner assigns a slot.

The UI must say "access is invitation-only — ask your administrator", not imply an
in-app provisioning flow that does not exist yet.

### 5. Break-glass admin is retained, with limits

`admin@www.clinic` remains, `disabled_at` set, password replaced by an in-database
random hash nobody holds (done 2026-11-03). `platform.break_glass_user_id` points
at it explicitly so the exception is data, not folklore. Break-glass:

- may invite members and assign **non-admin** roles when re-enabled, because it
  holds the `admin` role instance;
- may **not** grant the admin role, transfer ownership, or designate break-glass —
  those are `is_platform_owner()` only;
- may not be the platform owner (asserted);
- must be usable only via a written recovery procedure: Dashboard → reset the
  password → sign in → hand control back to the owner.

Accepted consequence: a second privileged identity exists, which is a deliberate
trade against "strictly one owner". The single point of failure being bought off
is loss of the owner's mailbox/MFA device.

### 6. Demo mode keeps its self-serve behaviour

`npm run build:demo` keeps local signup, the role picker and auto-approval — the
artefact is a marketing preview with fake data. All lockdown is in the Supabase
adapter and GoTrue settings, never in the demo adapter. Copy rule from ADR-0002
applies: the demo's instant-gratification language must not leak into the
backend-mode screens, and the backend-mode screens must not promise in-app
provisioning that Phase 4 has not built.

## Consequences and ordering

1. **Create the owner account first** (public signup still enabled, or via the
   Dashboard) — before any of the lockdown, while it is still easy.
2. `0010` on staging, then production: memberships, role instances,
   `role_permissions`, invitation lifecycle, org owner column. Its assertion block
   decides whether the apply passed.
3. `0011`: `platform` table + helpers, `org_id` nullable, `handle_new_user` stops
   attaching tenancy, `create_organization` dropped, owner-only grants, ownership
   transfer + break-glass designation RPCs, `platform` write guard, assertions.
4. **Bootstrap the `platform` row** — `0011`'s assertion aborts the transaction if
   it is empty, so an operator cannot silently skip it.
5. Disable public sign-up in GoTrue, then land the client lockdown: `/signup`
   demo-only, `supabase-adapter.signup()` returns the invitation-only error, an
   "awaiting assignment" screen for accounts with no membership, owner-only
   Members/Roles panels in Settings.
6. Enrol TOTP for the owner and require `has_recent_mfa()` on ownership transfer
   and admin grants. Zero factors are enrolled today, so this cannot be skipped —
   it is the same gate already blocking `/orders`.
7. Re-check for accounts that have no membership and would suddenly see nothing:
   `select id, email from profiles where id not in (select user_id from
   org_memberships where status = 'active')`.

## What this does not fix

- No backups, monitoring, DR runbook or CSP (R-15) — and concentrating privilege in
  one owner makes the missing restore rehearsal more relevant, not less.
- R-21 stands: `role_allows()` still lets every role `SELECT` every entity.
- Invitation tokens remain the only emailed secret; there is still no enrolment UI,
  no admin approval UI, and no service-key tier until the deferred Edge Function
  lands.
