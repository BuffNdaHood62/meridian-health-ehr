# ADR-0005 — Invitation-only provisioning with a single platform owner

Date: 2026-11-03
Status: Accepted, amended 2026-11-05 — `0010` applied; `0011_platform_owners_invite_only.sql` re-authored for **two** owners, dry-run verified, not applied
Relates to: ADR-0003, ADR-0004 (this resolves its open question 4), `docs/risk-register.md` R-14, R-17, R-18, R-19; `supabase/migrations/0011_platform_owners_invite_only.sql`; `src/pages/Signup.tsx`, `src/identity/supabase-adapter.ts`

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

### 1. Platform ownership is a set, and a distinct concept from `role='admin'`

> **Amended 2026-11-05:** the platform has two owners —
> `wellnesswithwritingale@gmail.com` and `michaelnnamdi62@gmail.com`. Ownership lives in
> `public.platform_owners` (one row per owner), not in a `platform.owner_user_id`
> column. Everything below that says "the owner" means "an owner".

`public.platform` is a single-row registry holding platform-wide settings
(including `break_glass_user_id`); `public.platform_owners` is the set of owners.
Ownership is not a role and cannot be granted by an admin. `admin` remains an ordinary role that can be delegated
and revoked; ownership is not a role and cannot be granted by an admin.

Two helpers, both `security definer`, both requiring `verified and
disabled_at is null` like every other gate since `0008`:

- `is_platform_owner()` — the only caller allowed to grant the `admin` role,
  change the owner set, or designate break-glass.
- `grant_platform_owner()` / `revoke_platform_owner()` — an owner may add or remove
  owners; removal requires step-up, and a guard trigger refuses to remove the last
  owner so the platform cannot become ownerless.
- `is_break_glass_admin()` — a second, dormant admin retained for lockout
  recovery.

### 2. Two owner accounts, both pre-existing

`wellnesswithwritingale@gmail.com` (the proprietress, **not yet created**) and
`michaelnnamdi62@gmail.com`, who keeps his `doctor` role instance — ownership is
orthogonal to role, so being an owner does not remove his clinical access.
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

### 4. Provisioning: owner invites by email, the invitee sets their own password

Amended 2026-11-05. Two facts forced this:

- **No public sign-up, and no self-chosen role.** Access begins when an owner
  invites an address.
- **A generated password mailed to a clinician is the wrong credential.** It sits
  in an inbox that persists and syncs, it proves nothing about who owns the mailbox
  (`email_confirmed_at` would be asserted by us rather than earned), and this repo
  already treats email as an unsafe channel for records (R-07). It would also
  require a forced-rotation screen, an expiry, a change-password screen and a
  forgot-password flow — none of which exist today: there is no `updatePassword`,
  `resetPasswordForEmail` or any password UI anywhere in `src/`.

So the flow is GoTrue's native invite:

1. An owner calls the `invite` Edge Function with `email`, `full_name`, `role_key`
   and optionally a specific role instance.
2. The function authenticates the **caller** as a platform owner through an SQL
   RPC (`assert_can_invite()`), so RLS and the owner set — not the function's own
   opinion — decide who may invite. Only then does it use the service key.
3. `admin.generateLink({ type: 'invite' })` produces the link; the function stores
   only its SHA-256 in `invitations.token_hash` (the same discipline as `0008`) and
   either sends it (`delivery='auto_email'`) or returns it once for the owner to
   deliver (`delivery='manual_link'`).
4. The invitee opens the link and **sets their own password**. The click is what
   proves mailbox control.
5. On their next sign-in the app calls `claim_invitation()`. It matches the signed-in
   user's email against a `sent`, unexpired invitation and only then creates the
   membership and the role assignment. No bearer token is needed in the app, because
   GoTrue already proved the address.

The service-key tier is therefore **no longer deferred** — that supersedes the
"manual for now" version of this decision. The rejected alternative was a
`SECURITY DEFINER` RPC inserting into `auth.users`/`auth.identities` the way
`0003_seed.sql` does; it avoids a deploy pipeline but hand-writes GoTrue's internal
tables, and for credential issuance that is the wrong trade.

### 5. Break-glass admin is retained, with limits

`admin@www.clinic` remains, `disabled_at` set, password replaced by an in-database
random hash nobody holds (done 2026-11-03). `platform.break_glass_user_id` points
at it explicitly so the exception is data, not folklore. Break-glass:

- may invite members and assign **non-admin** roles when re-enabled, because it
  holds the `admin` role instance;
- may **not** grant the admin role, transfer ownership, or designate break-glass —
  those are `is_platform_owner()` only;
- may never be an owner — enforced by `guard_platform_owners()` on insert and by
  `set_break_glass_admin()`, so the emergency identity cannot merge with normal
  authority;
- must be usable only via a written recovery procedure: Dashboard → reset the
  password → sign in → hand control back to the owner.

Accepted consequence: there are now three privileged identities with different
lives (two owners who can act, one dormant break-glass that cannot be an owner).
The point of keeping break-glass alongside two owners is that its password is
unknown to both of them — it is the escape hatch if both mailboxes are lost.

### 6a. Client work the invite flow requires (none of it exists yet)

- **Invite-link landing.** `main.tsx`/`auth.tsx` must complete the code exchange
  (`?code=` → `exchangeCodeForSession`) before deciding session state; with
  HashRouter + `vite-plugin-singlefile` the query lands on the *path*, not the hash,
  so this needs verifying on the deployed origin, not just locally.
- **`claim_invitation()` call** on sign-in when the profile has no membership.
- **Owner UI**: Settings members/roles/invitations panel that calls the function and
  renders a returned link exactly once.
- A "no membership yet" screen for an account that exists but has not been claimed.

### 6. Demo mode keeps its self-serve behaviour

`npm run build:demo` keeps local signup, the role picker and auto-approval — the
artefact is a marketing preview with fake data. All lockdown is in the Supabase
adapter and GoTrue settings, never in the demo adapter. Copy rule from ADR-0002
applies: the demo's instant-gratification language must not leak into the
backend-mode screens, and the backend-mode screens must not promise in-app
provisioning that Phase 4 has not built.

## Consequences and ordering

1. **Create the second owner account first** (`wellnesswithwritingale@gmail.com`)
   while public sign-up still works — after step 5 only the Dashboard can create
   accounts. `michaelnnamdi62@gmail.com` already exists.
2. `0010` on staging, then production: memberships, role instances,
   `role_permissions`, invitation lifecycle, org owner column. Its assertion block
   decides whether the apply passed.
3. `0011_platform_owners_invite_only.sql`: `platform` + `platform_owners`, the owner
   helpers, guard triggers (immutability, no last-owner removal, break-glass cannot
   be an owner), `org_id` nullable, `handle_new_user` stops attaching tenancy,
   `create_organization` dropped, owner-only admin grants, `grant/revoke_platform_owner`,
   `set_break_glass_admin`, and assertions that abort if no owner was bootstrapped.
4. **Bootstrap the owner set** — `0011`'s assertion aborts the transaction if
   `platform_owners` is empty, so an operator cannot silently skip it. Inserts use
   `granted_by null` under `app.identity_privileged = on`, which is the only path
   that permits a chicken-and-egg first grant.
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

- No backups, monitoring, DR runbook or CSP (R-15) — and concentrating provisioning
  in two owner accounts makes the missing restore rehearsal more relevant, not less.
- The `invite` Edge Function becomes the only place the service key exists. It must
  never be reachable unauthenticated, and its caller authorization lives in SQL
  (`assert_can_invite()`), not in a hand-written role check inside the function.
- R-21 stands: `role_allows()` still lets every role `SELECT` every entity.
- Invitation tokens remain the only emailed secret; there is still no enrolment UI,
  no admin approval UI, and no service-key tier until the deferred Edge Function
  lands.
