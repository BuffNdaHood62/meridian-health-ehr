# ADR-0004 — Multi-organisation accounts with role instances

Date: 2026-10-26
Status: Proposed — `0010_org_memberships_roles.sql` authored; run end-to-end against the live project inside a rolled-back transaction (see Evidence), not applied
Relates to: `docs/risk-register.md` R-04, R-05, R-14, R-20, R-21; `supabase/migrations/0007_www_registry_and_access_hardening.sql`, `0008_identity_hardening.sql`, `0010_org_memberships_roles.sql`; `src/identity/*`

## Context

Today one `profiles` row is one `auth.users` account in exactly one organisation
with exactly one role (`profiles.org_id`, `profiles.role`). `0008` hardened that
model: roles are admin-granted, `verified`/`disabled_at` gate every helper, and
every RLS policy resolves tenancy through `current_org_id()` and authorisation
through `role_allows()`.

The product now needs:

1. a **base account** that exists independently of any clinic;
2. an **organisation** owned by a base account, with a shareable organisation ID;
3. **duplicate role instances** per organisation ("Doctor-1", "Doctor-2");
4. **invitations** with a full lifecycle (sent, accepted, declined, expired,
   revoked) into a specific role instance;
5. memberships in **more than one** organisation, without cross-tenant leakage.

The existing shape cannot express 1, 3 or 5 without lying about
`profiles.org_id`, and 4 is a two-state `accepted_at`/`revoked_at` pair.

Two properties of the current implementation make this tractable:

- **All 44 RLS policies call helpers.** The policy text does not mention
  `profiles.role`; only `current_org_id()`, `is_admin()`, `role_allows()` (and
  the unused `role_can()`) read it. Swapping the helper bodies changes the entire
  authorisation surface in one place.
- **Writes are already RPC-only** for identity. There are no INSERT/UPDATE
  policies on `profiles`, and `0008` moves every role change through audited
  `SECURITY DEFINER` functions. Memberships and assignments follow the same rule.

## Decisions

### 1. The organisation is a resource owned by a base account

No shared organisation credentials. `organizations.owner_user_id` points at an
`auth.users` row; the owner reaches org authority through an explicit `admin`
role instance (auto-created at org creation) plus `is_org_owner()` for
ownership-only actions (transfer, archive). This preserves named-account
accountability, which is the point of `0008`.

`organizations.org_code` is the shareable identifier (`ORG-7K4Q`). It is a
*handle*, not a secret, and it is what `request_join` accepts.

### 2. Roles stay a fixed vocabulary; instances are slots

`role_key ∈ {doctor, nurse, reception, admin, lab}` is unchanged. An
`org_role_instances` row is a position in an org: `(org_id, role_key, slot_no,
label)`, unique per `(org_id, role_key, slot_no)` and per lowercased label.
Instances share their role's permission set; slot numbering is never reused, so
"Doctor-2" means one position for the life of the org's audit trail. Retiring an
instance with history sets `status='retired'` rather than deleting it.

### 3. Permissions are data, resolved as a union

`role_permissions (role_key, entity, action)` is seeded **verbatim** from the
`role_allows()` CASE in `0008`, including its wildcard behaviour: `doctor` may
select/insert/update any entity, every role may select any entity, and the
per-entity writes are the current allowlist. `entity = '*'` encodes "any".

`role_allows(entity, action)` becomes "some permission row for one of my active
role keys covers this". The union is scoped **within the active organisation** —
roles are never unioned across orgs.

Keeping the matrix as data rather than a CASE makes the per-role differences
reviewable and lets a future change tighten a role without editing a helper.

### 4. One active organisation per account

`profiles.active_org_id`, changed only by `switch_active_org(org_id)`, which
requires a live membership and an active org. `current_org_id()` validates the
stored value against membership on every call, so a revoked membership or an
archived org yields NULL on the next query — the same fail-closed property
`0008` established for `verified`/`disabled_at`.

This is deliberately per account, not per tab. Two tabs on different orgs will
fight over the value; that is a UI problem, not a tenancy hole.

### 5. Invitation lifecycle is explicit

`invitations.status ∈ {sent, accepted, declined, expired, revoked}` with
matching timestamps and a `CHECK` that terminal states carry theirs. Expiry is
evaluated at redemption (`expires_at <= now()` → status `expired`, raise
`INVITATION_EXPIRED`); `expire_invitations()` exists only so admin lists tell the
truth without a scheduled job. At most one `sent` invitation per
`(org_id, email)`. Tokens remain SHA-256-hashed and are returned once.

`accept_invitation` creates the membership and the assignment; it no longer
writes `profiles.org_id`/`role` as the source of truth (it updates them as a
legacy cache — see 7).

### 6. "Request association" is a join request, not an invitation

`request_join(org_code)` creates a `pending` `org_join_requests` row; an admin
approves it into a specific role instance through the same assignment path as an
invitation acceptance. Nothing auto-joins from a guessed code.

### 7. Backwards compatibility for exactly one release

`profiles.org_id` and `profiles.role` are kept and kept *approximately* correct
(updated by `switch_active_org`, assign and revoke) so that an un-updated client
still renders. They become a cache: no RLS reads them after `0010`, and `0011`
drops them. `profiles.verified` keeps its meaning — "account approved" — and
`accept_invitation` still sets it, so the client's pending state is unchanged.

## Consequences

- The client must learn three things: a role **union** (`currentUser.roles`),
  an **active org** and `switchOrg()`. Nav and `RequireAuth` switch from one role
  to the union; the primary assignment drives display only.
- Two orgs in one account means the step-up check becomes per-org
  (`orders_step_up_required()` already reads the org row, so this is free), but a
  switch between orgs with different settings mid-session should re-run the gate.
- Removing a member's last role leaves a live membership with an empty role set:
  they can sign in and see nothing. That is intentional and diagnosable; deleting
  the membership instead would hide the reason.
- `role_allows()` wildcards mean **`lab` can currently select `notes`** (and any
  other entity), despite the "lab cannot read notes" expectation in the 0007
  assertion comments. `0010` preserves that behaviour because changing it is a
  clinical authorisation decision, not a refactor. Tracked as R-21; the
  tightening is a one-row-per-entity change to `role_permissions` once decided.
- No patient login role is introduced. Patients remain records. A portal needs a
  separate user↔patient mapping with consent.
- `0010` is additive apart from dropping `invitations.role` (that column holds no
  data today). The destructive step — dropping `profiles.org_id`/`role` — is
  deferred to `0011` after a release cycle.

## Evidence (2026-10-26)

`0010` was executed against project `zdtaludwhxnjutosrnvi` inside
`begin; … rollback;`, with eight impersonated probes (JWT claims per role). All
of it was rolled back — the tables, columns and rows do not exist now.

| Probe | Result |
| --- | --- |
| Backfill on the live project | 6 memberships, 6 assignments, 6 slots: `Admin-1, Doctor-1, Doctor-2, Lab-1, Nurse-1, Reception-1`; `role_permissions` seeded 31 rows |
| Admin (`admin@www.clinic`) | `current_org_id` = WWW, roles `{admin}`, `is_admin()` true, `role_allows('patients','select')` true, `('orders','insert')` **false** (unchanged from 0008) |
| Lab | roles `{lab}`, `labs.insert` true, `notes.insert` false, **`notes.select` true** — the R-21 gap, preserved deliberately |
| Reception | roles `{reception}`, `labs.insert` false, `patients.update` true, `www_clients.insert` true, sees both patients |
| Doctor (michael) creates a second org | `create_organization` returns an org with `ORG-6435F9`; active org switches to it; roles there `{admin}` via ownership; patients visible **0** |
| Same user switches back | roles `{doctor}`; patients visible **2**; memberships `2`; organisations visible `dry-run-clinic, www` |
| Invitation | `invite_member` returns a 64-char token; the stored value is a different SHA-256 hash; status `sent` → `revoke_invitation` → `revoked` |

Two defects were found by the probes and fixed before the ADR was finalised:

1. **The org switcher had no read path.** `org_memberships_read` scoped rows to
   the *active* org, so a user could not list their other orgs; and `orgs_member`
   from `0001` did the same for names. Added `is_org_member(org)` (security
   definer) and widened both policies to "my own rows / my orgs", nothing more.
2. **`auth_events` rejected the new event names.** The table's `CHECK` is the
   `0008` vocabulary; `org_created`/`role_assigned`/`ownership_transferred` etc.
   are added in `0010` §4.

Known cosmetic inconsistency: the backfilled admin slot is `Admin-1` (derived
from `initcap(role)`), while `create_role_instance` labels new slots the same
way; `create_organization` now uses `Admin-1` too.
