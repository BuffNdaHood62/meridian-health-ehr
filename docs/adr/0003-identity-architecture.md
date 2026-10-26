# ADR-0003 — Identity is server-authoritative; GoTrue + TOTP; the doctor code stays a view lock

Date: 2026-10-26
Status: Accepted — client seam implemented; `0008` authored, not applied (2026-10-26)
Relates to: `docs/risk-register.md` R-14, R-17, R-18, R-19; `supabase/migrations/0008_identity_hardening.sql`; `src/auth.tsx`, `src/identity/*`, ADR-0002

## Context

The SPA's auth surface is honest about its demo limits, but three defects made the
backend path weaker than the UI implied. All three were confirmed in the code
before this decision:

1. **Self-service escalation.** `handle_new_user()` copied
   `raw_user_meta_data->>'role'` into `profiles.role` (`0001:211`), so the signup
   form chose its own role. Worse, `profiles_self` was
   `for all using (id = auth.uid())` (`0001:256`): a signed-in user could
   `PATCH /profiles?id=eq.<self>` and set `role='admin'` or move `org_id` to
   another tenant. RLS everywhere else trusts those two columns.
2. **`verified` was UI-only.** The old Supabase provider hid unverified profiles
   from `currentUser`, but `current_org_id()` (`0001:175`) and `is_admin()`
   ignored `verified`. An unverified or revoked account still passed every
   org-bounded policy until the JWT expired.
3. **Step-up had no server counterpart.** `RouteAuthenticationGate` checked an
   8-hour age for `/orders` and then returned `<Outlet />` whenever Supabase was
   configured. In backend mode there was no step-up at all.

The existing controls are otherwise sound for the demo: `RequireAuth`/`canAccess`
are UX guards on top of RLS, and `CodeGate` is explicitly a view lock (ADR-0002).

## Decisions

### 1. Stay on Supabase GoTrue as the identity provider

No custom auth service, no second password store. GoTrue already owns credential
storage, email confirmation, JWT issuance/refresh, TOTP enrolment and the AAL
claim. The app keeps the `useAuth()` contract and the adapter seam below; it does
not learn GoTrue's API outside `src/identity/supabase-adapter.ts`.

The demo provider stays as the zero-backend fallback (ADR-0001). It is never a
production identity path because production mode refuses to boot without a
backend.

### 2. TOTP is the first second factor

TOTP is enabled in GoTrue (Dashboard → Auth → MFA) and gated server-side by
`has_recent_mfa()` in `0008`, which requires `aal='aal2'` plus a recent `totp` (or
`webauthn`) entry in the JWT `amr` array. WebAuthn/passkeys can be added later
without changing the SQL gate: the function already accepts `webauthn`.

Order authoring (`orders` insert/update) and medication administration
(`order_administrations` insert) require step-up when the org setting is on. The
setting defaults to **on**; downgrading it requires step-up and is audited. An org
that has not enrolled TOTP yet must flip it deliberately, which is visible in the
audit trail — that is the intended friction.

### 3. The doctor code survives, but only as a view lock

`CodeGate` remains a per-screen privacy curtain for shared workstations (as
decided in ADR-0002). It is **not** a second factor, not encryption, and no RLS
policy consults it. UI copy must never present it as authentication. MFA is the
factor; the code is the "someone walked up to an unlocked screen" control.

The client-side 5-attempt/15-minute lockout in `auth-doctor.tsx` is a UX
affordance. Failed password attempts never reach this repo's database, so
`auth_events` records successful transitions only and must not be described as a
server-side login lockout. GoTrue's rate limiting is the server control.

## Identity state model (client seam)

`isAuthenticated: boolean` cannot express "password accepted, second factor
pending" or "signed in but step-up needed". The replacement is an explicit state:

| State | Meaning | Allowed UI |
| --- | --- | --- |
| `anonymous` | no session, or it was signed out | `/login` |
| `password_ok` | credentials accepted; second factor pending | `/login/mfa` only |
| `unverified` | authenticated but profile not approved / revoked | `/login/pending`, sign out |
| `active` | verified + MFA satisfied | app |
| `step_up_required` | active but a sensitive route needs a fresher check | `/login/step-up` |
| `expired` | the stored demo session aged out | `/login` with the reason |

`locked` is deliberately not a session state: `CodeGate` is a per-screen view
lock for shared workstations (decision 3), so it cannot be mistaken for MFA.

The seam keeps `useAuth()` stable while adapters own the mechanism:

```ts
type AdapterOutcome =
  | { kind: "anonymous" }
  | { kind: "mfa"; email: string }
  | { kind: "active"; user: WWWUser; email?: string }
  | { kind: "unverified"; email: string; message: string }
  | { kind: "expired"; message: string }
  | { kind: "error"; message: string };

interface IdentityAdapter {
  readonly mode: "demo" | "supabase";
  restore(): Promise<AdapterOutcome>;
  subscribe?(listener: (outcome: AdapterOutcome) => void): () => void;
  signIn(email: string, password: string): Promise<AdapterOutcome>;
  signInAs(userId: string): Promise<AdapterOutcome>;
  verifyMfa(code: string): Promise<AdapterOutcome>;
  stepUp(password: string, code?: string): Promise<AdapterOutcome>;
  signup(input: SignupInput): Promise<AdapterOutcome>;
  signOut(scope?: "local" | "global"): Promise<void>;
  stepUpReason(): Promise<string | null>;
}
```

- `SupabaseIdentityAdapter` (`src/identity/supabase-adapter.ts`) maps the state
  machine onto GoTrue calls and the `profiles` row; it is the production
  adapter.
- `DemoIdentityAdapter` (`src/identity/demo-adapter.ts`) keeps the localStorage
  behaviour and is explicitly labelled a simulation (it never claims MFA
  protection).
- Clinical pages keep consuming `useAuth()`; the adapter is internal to the auth
  module. This is what makes the migration incremental instead of a rewrite.

### Implemented client flow (2026-10-26)

- `src/auth.tsx` owns `useReducer(identityReducer, ANONYMOUS)` and maps every
  `AdapterOutcome` onto the state machine. The hook exposes `ready`, `status`,
  `mode`, `isAuthenticated`, `currentUser`, `pendingEmail`, `reason`, `login`,
  `loginWithEmail`, `verifyMfa`, `stepUp`, `checkStepUp`, `signup`, `logout`.
- `RequireAuth` sends `password_ok` to `/login/mfa` and `unverified` to
  `/login/pending` before it checks roles. An expired session lands on `/login`
  with the reason in router state.
- `RouteAuthenticationGate` no longer branches on `isSupabaseConfigured`. On
  `/orders` it calls `stepUpReason()`; a non-null reason routes to
  `/login/step-up`. The result is keyed to the history entry so orders are not
  painted for a frame before the check.
- Supabase sign-in (`evaluate()`): a missing, disabled or unverified profile is
  signed out immediately and becomes `unverified`, so no token for an
  unapproved account stays in the browser. A verified profile with
  `nextLevel === 'aal2'` and `currentLevel !== 'aal2'` becomes `password_ok`.
- `verifyMfa()` challenges the enrolled TOTP factor and re-evaluates.
- `stepUp()` requires a code; it also requires the password when the session is
  already AAL2 (stale `amr`), but skips re-auth when the session is AAL1 and only
  needs the factor. `stepUpReason()` requires a TOTP/WebAuthn `amr` entry younger
  than 8 hours and fails closed when `amr` is string-only (no timestamp) or the
  AAL query errors.
- `signup()` drops any session GoTrue creates and returns `unverified`; the UI
  routes to `/login/pending` with "confirm your email + admin approval".
- Demo step-up refreshes the session timestamp without checking a credential, and
  the screen states that plainly. Demo never returns `mfa` or `unverified`.
- The provider's `subscribe` handler honours only `SIGNED_OUT`, and only while
  the state is `active` or `step_up_required`, so signing out an unverified
  profile cannot overwrite the pending screen.
- Tests: `src/identity/state.test.ts` covers every transition;
  `src/identity/demo-adapter.test.ts` covers sign-in, signup, the 8-hour step-up
  window, 12-hour expiry, and sign-out.

## What `0008` enforces

- **Signup is a request, not a grant.** The metadata role is stored as
  `profiles.requested_role`; the account starts as `reception` and
  `verified=false`. `approve_profile()` (admin, org-bound, audited) sets the real
  role and verifies. Invitations (`create_invitation` / `accept_invitation`) bind
  a single-use token to the invitee's email and set org + role atomically.
- **Profiles are read-only to clients.** `profiles_self` is replaced by a
  select-only policy; `update_my_profile()` changes the display name and nothing
  else. A `guard_profile_mutation` trigger blocks org moves and non-admin changes
  to role/verification/email even if a future policy regresses.
- **Verification and revocation are server gates.** `current_org_id()`,
  `is_admin()`, `role_can()` and `role_allows()` all require
  `verified and disabled_at is null`. `set_profile_access(..., false)` therefore
  takes effect on the next query without needing to reach into `auth.sessions`
  (which this repo deliberately does not touch).
- **Step-up is in SQL.** `orders_write` / `orders_update` / `admin_write` require
  `has_recent_mfa()` unless the org has explicitly disabled the requirement.
- **The trail is synchronous.** `auth_events` is append-only, RPC-written, and
  readable by the actor or an org admin. Invitations store only a SHA-256 hash.

## Consequences

- A fresh project needs its first admin bootstrapped with a direct SQL update
  (documented in the migration header) because no verified admin exists yet.
- The state machine and adapter seam are implemented, and `/login/mfa`,
  `/login/step-up` and `/login/pending` exist. Signup labels the role as
  **"Requested role"** outside demo mode and routes to `/login/pending`.
- Still missing before a real clinic: no TOTP **enrolment** UI (users can only
  satisfy a factor an administrator enrolled out-of-band), no admin UI for
  `approve_profile` / invitations (SQL only), and the Supabase adapter has not
  been exercised against a live project — only demo mode has been walked through
  in a browser. A `password_ok` session is not restorable after reload: the
  restored session re-presents as `mfa`, which is safe but means the pending
  second factor has to be re-entered.
- In demo mode a signup is auto-approved (`markAccountVerified`) so the demo
  picker and signup flows keep working; demo never produces `mfa` or
  `unverified` outcomes. That difference must stay visible in the UI copy, which
  it is: Signup says the demo adapter grants the role immediately.
- Email confirmation must stay on. A session without a confirmed email is not a
  supported state.
- Applying `0008` without enrolling TOTP blocks order writes. That is deliberate
  and audited; staging must run the assertion block at the foot of the migration.
- `0008` is authored, not executed. No Postgres/Supabase CLI exists in this
  environment; applying it to a staging project remains a human gate.
