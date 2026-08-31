# Documentation.md — Change Record

Durable log of meaningful changes and why they were made. Newest first.

---

## 2026-08-31 — Messages: real Compose + popup reading pane

The Messages screen got two senior-level fixes.

### `src/components/ui/Modal.tsx` (new)
A single, accessible popup shell so the app stops hand-rolling overlays.
Handles Escape-to-close, click-outside, body scroll-lock, focus-on-open +
restore, and a lightweight Tab focus-trap. Same visual metrics as the
existing `ShareActions` popup (`bg-slate-900/40 backdrop-blur-sm` overlay,
`rounded-2xl bg-white shadow-xl`, brand-600 actions). `ShareActions` still
uses its own inline copy — candidate to refactor onto this primitive later.

### `src/pages/Messages.tsx`
1. **Compose** — the header "Compose" button now opens a real compose popup
   (To w/ care-team autocomplete, Category, Priority, Subject, Body). Validation
   requires To + Subject + Body; on send it prepends a `sent: true` message and
   jumps to the Sent folder. Reply reuses compose prefilled (`Re:` subject).
2. **Reading as popup** — clicking a message opens it in a centered `Modal`
   instead of the old side-by-side reading pane. Removes the `md:grid-cols-2`
   split that broke the mobile layout; the list now spans its column.

### `src/types.ts`
`Message` gained optional `sent?: boolean` and `to?: string` to model composed
messages and drive the Sent folder honestly (no faked inbox rows).

### `src/pages/AGENTS.md`
Messages line updated: compose is a modal, reading is a popup.

---

## 2026-08-31 — Go-back button on the role-denied page

`src/auth.tsx` — `RequireAuth` rendered the "Not available for your role" block
**outside `AppLayout`**, so a denied user had no sidebar and no way off the page.
Added a "Go back" button (`navigate(-1)`) and a "Go to dashboard" fallback (`/`)
— `data-testid="role-denied-back"` / `role-denied-dashboard`. The dashboard link is
the always-safe path for direct hits / empty history where `back` would no-op.
Imported `useNavigate` + `Link` (react-router-dom) and `Lock` (lucide-react).

---

## 2026-08-31 — Demo role picker moved to its own `/demo` page

The five demo accounts no longer live inline on the login screen. The
"Enter Demo Workspace" button now routes to a dedicated picker.

### `src/pages/DemoPicker.tsx` (new)
Full-page role picker: one card per account with avatar, role badge, a
one-line purpose, and the access list **derived from `ROLE_ROUTES`** so the
copy can never drift from the `canAccess` rule that actually gates nav.
Selecting a card and pressing "Enter workspace" calls the same
`login(userId)` → `startSession(user)` path the inline picker used.

### `src/pages/Login.tsx`
Removed the `USERS` radio list, the `selectedUser` state, and `doDemoLogin`.
The button is now `navigate("/demo", { state: { from } })`, so the
post-login destination survives the extra hop. Email/password sign-in and all
`login-*` testids are unchanged.

### `src/App.tsx`
Added `<Route path="/demo" element={<DemoPicker />} />` — public, outside
`RequireAuth`, alongside `/login` and `/signup`.

### Decisions
- **Pre-selects the first account**, matching the old inline picker, so
  entering the demo is still effectively one click for the common case.
- **Access list is derived, not hardcoded** — a second copy of the permission
  rules would drift.
- **Backend mode shows an amber notice.** `auth-supabase.tsx` returns
  "Use email sign-in in backend mode." for `login()`; surfacing that up front
  avoids a dead-end click. The error still renders if clicked anyway.
- Role colours/blurbs stay in `DemoPicker.tsx` (marked `ponytail:`) — they are
  presentational, not domain data, so `users.ts` is untouched.

---

## 2026-08-27 — Supabase data layer + per-role RLS (mock-data gap closed)

Closed the demo gap: clinical pages now read through one async data layer
(`src/data/api.ts`) that returns the **existing domain types** (page render
code untouched) and swaps mockData → Supabase when `VITE_SUPABASE_*` is set.

- `src/data/api.ts` — `loadPatients/loadPatient/loadMessages/loadOrders/
  loadAlerts/loadAppointments/saveOrder` + `useAsync` hook. Supabase branch
  assembles the nested `Patient` shape from `patients` + child tables; mock
  branch returns `mockData` (zero-backend demo stays seamless).
- Pages converted: Patients, PatientDetail, Orders (read + `saveOrder` on
  sign), Messages, LabResults, MedicalHistory, Dashboard, Topbar. Each keeps
  its exact UI; only the data source became async.
- `supabase/migrations/0004_role_rls.sql` — `role_can(entity, action)` SECURITY
  DEFINER fn; reception = patients+messages only, lab = patients+labs+orders+
  messages, others full. Org boundary (`current_org_id()`) still enforced.
- `supabase/migrations/0005_alerts_appointments.sql` — `alerts`+`appointments`
  tables (referenced by the data layer) + seed alert so the critical banner
  has content. `0004` also added `patients.emergency_contact`/`admit_date`
  columns so the `Patient` shape maps 1:1.
- `audit.ts` `appendAudit` routes to `append_audit` RPC when configured
  (actor captured server-side, can't be spoofed).

Verification: tsc clean · lint 0 errors · vitest 32/32 · `npm run build` ✓.

→ Demo fallback unchanged (no Supabase project needed to run). To go live: set
`.env` `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, run migrations, flip
`DEMO_MODE=false`. Skipped: real PHI seed, per-account RLS locks, Terraform
(self-host only).

---

## 2026-08-27 — Supabase backend (auth + Postgres + RLS)

Full-stack setup task: real backend for the EHR, dropping into the existing
`useAuth`/`appendAudit` contract so no page changed its auth calls.

### `supabase/migrations/`
- `0001_init.sql`: extensions (pgcrypto, pgjwt); `profiles` 1:1 `auth.users`
  (org tenancy + role); `organizations`; `patients` + clinical children
  (allergies/medications/labs/vitals/history/notes/orders/messages); `audit_log`
  (append-only); `shares` (one-time). FKs, indexes, RLS on every table. Helpers
  `current_org_id()`, `is_admin()`, `handle_new_user` trigger (auto-profile on
  signup), `append_audit` (SECURITY DEFINER).
- `0002_rpc.sql`: `redeem_share(token)` (anon EXECUTE, one-time, minimal PHI
  projection) for `/share/:token`; `verify_profile` (admin).
- `0003_seed.sql`: demo org + 5 staff (doctor/nurse/reception/admin/lab) + 2
  patients. Seed password hash is a placeholder — replace before non-local use.
- `config.toml`: local CLI (email confirmations on, Email OTP on).

### `src/lib/supabase.ts` (new)
Anon client from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` +
`isSupabaseConfigured` guard + `requireSupabase()`.

### `src/auth.tsx` / `src/auth-demo.tsx` / `src/auth-supabase.tsx`
`auth.tsx` now holds the shared `AuthContext` + `useAuth` + `RequireAuth` +
`RouteAuthenticationGate` and a selector `AuthProvider` that uses Supabase when
env is set, else the demo provider. Demo impl moved to `auth-demo.tsx`;
backend impl in `auth-supabase.tsx` (signInWithPassword / signUp / signOut,
`currentUser` projected from `profiles`). App.tsx unchanged.

### `src/utils/audit.ts`
`appendAudit` routes to `append_audit` RPC when configured (captures real actor
server-side); localStorage fallback for demo.

### `src/vite-env.d.ts` (new)
Typed `VITE_SUPABASE_*` for strict tsc.

### `.env.example` + `.gitignore`
Documented anon keys only; `.env` ignored. Bootstrap: `scripts/bootstrap-supabase.mjs`.

### Verification
lint 0 errors (8 pre-existing react-refresh warnings) · tsc clean · vitest
32/32 · `npm run build` ✓ (688 kB). Full RLS/seed verification checklist in
`supabase/README.md`.

### Skipped (deliberate, documented)
- Real patient data migration from mockData to Supabase (pages still read mock
  data; only auth + audit are backend-backed this pass).
- Per-role RLS granularity (org boundary is the floor; role-scoped policies are
  an extension).
- Terraform: Supabase is managed; `config.toml` + Studio cover IaC. Add TF only
  if self-hosting on a VM/container.

---

## 2026-08-27 — Production-readiness hardening (no backend)

Goal: make the frontend artifact deliverable as a *labeled demo* and impossible
to ship broken. The repo is a client-only single-file SPA (vite-plugin-singlefile)
with mock data and no server; a real backend remains the gating delivery item
(see earlier "Backend migration plan" entry).

### `package.json`
`build` now runs `npm run typecheck && vite build` — the bundle fails closed if
`tsc` finds a type error (previously build skipped typecheck, so broken types
could ship).

### `.github/workflows/ci.yml` (new)
CI on push/PR: `npm ci → lint → typecheck → test → build`. This is the delivery
gate — a commit that breaks any check cannot be merged/delivered.

### `src/config.ts` (new)
`DEMO_MODE` flag (single source of truth) + `APP_NAME`. Flip `DEMO_MODE=false`
and wire the backend (per migration plan) before any non-demo go-live.

### `src/components/layout/AppLayout.tsx`
Sticky amber banner shown when `DEMO_MODE` is true: "DEMO BUILD — synthetic data,
no real backend or PHI. Not for clinical use." Prevents the artifact being
mistaken for a live EHR (real HIPAA liability).

### `src/pages/Orders.tsx` (bug fix surfaced by lint gate)
`submitOrders` was calling `useAuth()` inside a non-component function — a
react-hooks/rules-of-hooks violation. Hoisted `useAuth()` to `OrdersInner` and
reused `liveUser` inside `submitOrders`. `orderedBy` still resolves the real
signed-in user.

### Verification
lint 0 errors (6 pre-existing react-refresh warnings) · tsc clean · vitest
32/32 · `npm run build` pending.

---

## 2026-08-27 — Remove 15m idle auto-logout; route-level step-up re-auth

Task: remove the automatic 15-minute inactivity logout while preserving
security for sensitive actions, and fix the multi-account identity wiring
flagged earlier.

### `src/auth-doctor.tsx`
Removed the idle re-lock `useEffect` (mousemove/keydown/click listeners +
15m `setTimeout` that cleared `www-orders-unlocked`). `IDLE_MINUTES` dropped.
Doctor-code unlock now persists for the session. Security preserved by the
route-level step-up below — Orders still requires a fresh recent session.

### `src/auth.tsx`
- Added `RouteAuthenticationGate`: wraps app routes; for sensitive paths
  (`/orders`) it forces re-authentication when the session is older than
  `AUTH_MAX_AGE_MS` (8h). Demo step-up is gesture-only (server would prompt
  for credentials). This is age-based step-up, NOT idle-kill, so the 15m
  auto-logout is gone without weakening sensitive-action protection.
- `currentUser` already exposed correctly; no change to login/logout.

### `src/App.tsx`
Inserted `<RouteAuthenticationGate />` between `RequireAuth` and `AppLayout`.

### `src/pages/Settings.tsx` (was-disconnected identity fix)
Profile now reads the real signed-in user via `useAuth().currentUser`
(fallback to mockData demo meta). "Auto-lock session" row now shows
`Disabled`/"Sessions stay open until you sign out". "Sign out of all devices"
relabeled "Sign out" — `logout()` only clears this tab's session by design
(multi-tab = multi-account).

### `src/components/layout/Sidebar.tsx`, `src/pages/Dashboard.tsx`
Footer/sidebar/profile now show the live `currentUser` (name/id/initials)
instead of the static mockData `Dr. Sarah Chen`. Copy updated: "Auto-lock 15m"
→ "no idle auto-lock".

### `src/pages/Orders.tsx`
`orderedBy` now uses the live `currentUser` name (was hardcoded Sarah Chen).
CodeGate `recheck()` pings sessionStorage so the route step-up re-evaluates
after unlock.

### `src/utils/audit.ts`
`currentUserRef()` now derives `actorId` from the live session
(`www-sessions` + `www-session-id`) instead of hardcoding `PHY-0142`.

### `src/pages/Login.tsx`
Footer copy corrected: "Sessions open until sign-out". Removed false
auto-lock implication.

### Verification
`tsc --noEmit` clean · vitest 23/23 · `vite build` passes (459 kB).

---

## 2026-08-27 — Multi-account signup (demo, client-only) + account switching

Task: remove hardcoded-only access by adding a real signup flow; keep the
existing demo role-picker for quick evaluation. Repo has no backend/DB, so
this is a localStorage stand-in that mirrors the server shape for a storage-only
swap.

### `src/users.ts`
- Added `Account` interface + localStorage store (`www-accounts`).
- `signupAccount({name,email,role,password})`: validates name ≥2, RFC-5322-lite
  email, password ≥10, rejects a small common-password set, rejects duplicate
  email (case-insensitive), stores `sha256Hex(password)` (reuses `utils/crypto`).
- `verifyCredentials(email,password)`, `findAccountByEmail(email)`,
  `accountToUser(acc)` (maps Account → WWWUser for the session layer).
- Hardcoded `USERS` directory retained for the demo login picker.

### `src/auth.tsx`
- Extracted `startSession(user)` (shared by all login paths).
- Added `loginWithEmail(email,password)` and `signup({...})` to the context;
  both route through `startSession`. Demo auto-verifies email on first
  successful login (no mail backend); auto-logs-in after signup.

### `src/pages/Login.tsx`
Rewritten: email + password form (primary) above a divider + the demo
role-picker + an "Enter Demo Workspace" button. Link to `/signup`.

### `src/pages/Signup.tsx` (new)
Signup form: name, work email, role select (shows granted routes from
`ROLE_ROUTES`), password (≥10, with live hint) + confirm. On success → `/`.

### `src/App.tsx`
Added `<Route path="/signup" element={<Signup />} />` (outside auth gate).

### `src/components/layout/Sidebar.tsx`
Added "Switch account" button → signs out this tab and returns to `/login`.
Multi-account model = one account per browser tab (concurrent sessions cap 5).

### `src/users.test.ts` (new)
9 tests: signup validation (short pw, bad email, weak pw, duplicate),
credential verify (ok / wrong pw / unknown), case-insensitive lookup.
All green (32/32).

### Security notes (demo ceilings, server upgrade paths)
- Passwords hashed with SHA-256 only. `ponytail`: stands in for Argon2id;
  server must use a memory-hard KDF + per-user salt.
- No rate limiting / lockout on signup or login attempts here. Server must add
  per-IP + per-account throttling (the doctor-code 5-strike/15m lockout exists
  separately for Orders).
- No email verification mail is sent (demo auto-verifies). Server sends a link
  and gates `verified` before `startSession`.
- `localStorage` is readable by any script on the origin; fine for a demo, never
  for real credentials. Server auth replaces the whole store.

### §Backend migration plan (real multi-account / multi-tenant)
Data model (Postgres sketch):
```
orgs(id, name, slug, created_at)
members(id, org_id, email, pw_hash_argon2, full_name, verified, created_at)
member_roles(id, member_id, role)            -- role ∈ {doctor,nurse,reception,admin,lab}
sessions(id, member_id, token_hash, ip, ua, created_at, expires_at)
```
- `accounts` table ≡ `members`; `www-accounts` localStorage blob is dropped.
- `signupAccount` → `POST /signup` (creates member + sends verify email; never
  returns the hash). `verifyCredentials` → `POST /login` (Argon2id verify +
  rate limit; sets `sessions` row; returns httpOnly JWT cookie).
- `startSession` becomes server-issued JWT; `RouteAuthenticationGate` keeps the
  8h step-up but validates the token server-side.
- Switching accounts = `/logout` this session then `/login`; a true in-app
  account switcher adds `sessions.member_id` selection (future).
- Rollback: the client `Account`/`signupAccount` paths are isolated behind
  `useAuth().signup`/`loginWithEmail`; swap those two impls to call the API and
  delete `www-accounts` reads. No route/component changes needed (same contract).

### Verification
`tsc --noEmit` clean · vitest 32/32 · `vite build` pending.

---

## 2026-08-24 — RFD Phase 4: multi-user login, roles, session cap

Implements RFD §2.2/§2.3 (roles, ≤5 concurrent users) and §8.2 UX-level route gating.

### New `src/users.ts`
User directory (5 seeded: doctor/nurse/reception/admin/lab), `ROLE_ROUTES` access map,
`canAccess()` helper. Passwords not checked — demo ceiling marked for server auth.

### `src/auth.tsx` rewritten
- Session records (`sessionId`, user, device label, startedAt) persisted per browser;
  current tab binds via sessionStorage. Ghost sessions >12 h pruned on login.
- **6th concurrent login rejected** with visible `SESSIONS_EXHAUSTED` message (AC-11);
  rejection audited.
- Login/logout audited with user + role.
- `RequireAuth` now also enforces role-route access; unauthorized roles see an inline
  "Not available for your role" panel instead of the page.

### `src/pages/Login.tsx`
Username/password fields replaced by a role-tagged user picker (radio list, 44px rows,
role badge per row). Errors render in a dedicated alert region. Demo-workspace button signs
in the selected user.

### Verification
`tsc --noEmit` clean · eslint 0 errors · vitest 23/23 · build passes (458 kB).

---

## 2026-08-24 — RFD Phase 3: print & secure share

Implements RFD §4.5 / §8.5 (print, PDF, secure mail to external recipients).

### New `src/components/ui/ShareActions.tsx`
Print + Share buttons on the client chart header. Share dialog: recipient email validation,
one-time token link (72 h TTL), mailto: hand-off with prefilled subject/body; every share
audited (`create → Share`).

### New `src/utils/share.ts`
ShareRecord registry (localStorage stand-in for server-signed URLs — ceiling marked):
token, expiry, one-time `consumeShare()` semantics per RFD §8.5.

### New `src/pages/ShareView.tsx` + route `/share/:token` (`App.tsx`)
External-recipient read-only record sheet (demographics, allergies, recent history).
Invalid/expired/consumed tokens get a clear "Link unavailable" screen; valid tokens are
consumed on open and cannot be reused.

### Print stylesheet — `src/index.css`
`@media print`: hides all app chrome (header/sidebar/nav/buttons), strips padding, injects
branded "Wellness with Writingale EMR — Client Record" header with print date
(`data-print-date` set on `<main>` in AppLayout), avoids mid-record page breaks.
PDF = browser print-to-PDF; server-side generation noted as future fidelity upgrade.

### Verification
`tsc --noEmit` clean · eslint 0 errors · vitest 23/23 · build passes (455 kB).

---

## 2026-08-24 — RFD Phase 2: encryption, doctor-code gate, audit trail

Implements RFD §5 (orders gate + administration), §8.1/§8.3 (crypto + audit scaffolding).

### New `src/utils/crypto.ts`
Browser-native AES-256-GCM `encryptString`/`decryptString` (iv:ct base64) + `sha256Hex`.
`ponytail:` ceiling documented — device-stored DEK is obfuscation until the server-side KMS
implementation lands; call-site API mirrors the future backend contract.

### New `src/utils/audit.ts` — append-only AuditLog
`appendAudit(action, entity, entityId, detail)` + `listAudit()`; localStorage-backed, capped
at 500 entries. Actions: create/update/delete/unlock/sign/administer.

### New `src/auth-doctor.tsx` — DoctorCodeProvider (RFD §5)
First visit sets a personal doctor code (min 8 chars, SHA-256-hashed — Argon2id noted as
server-side replacement); unlock is session-scoped with 15-min idle re-lock; 5 wrong attempts
→ 15-minute lockout (RFD AC-7). Wired app-wide in `App.tsx`.

### Orders page (`src/pages/Orders.tsx`)
- Content now gated behind `<CodeGate />` until unlocked.
- **Order History moved to a side tab** (2-col grid): Signed-by column always visible;
  per-order **Administered** cell (Pending / Administered / Not Administered) with recipient
  name capture; persisted in localStorage, audited on every set.
- **Audit Trail panel** beside history shows the live log (sign/unlock/administer events).

### Types — `src/types.ts`
`AdministrationStatus` enum added to OrderItem (`administered?`, `recipientName?`).

### Verification
`tsc --noEmit` clean · eslint 0 errors · vitest 23/23 · build passes (447 kB).

---

## 2026-08-24 — RFD Phase 1: rename & structuring (docs/RFD-WWW-wellness-emr.md)

Implements §2.1, §3, §4.1, §7 of the Wellness with Writingale EMR RFD.

### Branding — `index.html`, `Sidebar.tsx`, `Login.tsx`, `Settings.tsx`
- Product renamed **Wellness with Writingale EMR** everywhere (title, meta, login panels,
  sidebar brand). No "Meridian" strings remain (grep-verified).

### Dashboard — `src/pages/Dashboard.tsx` (rewritten)
- KPI renames: Active Patients → **WWW Clients**; Bed Occupancy → **WWW Admitted Clients**
  (absolute census replaces % gauge); Today's Appointments → **WWW Scheduled Appointments**;
  Critical Alerts retained.
- Removed per RFD §3.3: critical-alerts banner, Today's Schedule card, Patient Snapshot card,
  Department Census card, Admissions & Discharges chart, Patients Requiring Attention table.
  Unused imports/derived values deleted.
- New **Demographics slot**: quick-intake form (first/last name*, DOB, gender, phone) that
  auto-saves to localStorage 800 ms after last keystroke with "Saved ✓" indicator
  (`ponytail:` comment marks the Phase-2 PATCH /patients/:id upgrade path).
- New **Medical Review slot**: client name (autocomplete over WWW clients), diagnosis*,
  history of events*, vital-signs fieldset (Temp °C, SpO₂, BP sys/dia, pulse, resp, weight)
  with inline range validation per RFD §4.4; on save → persisted entry listed under Recent
  Medical Reviews. Phase 2 wires these into encrypted MedicalHistory records.

### WWW Clients — `src/pages/Patients.tsx`
- Page title → **WWW Clients**; tiles now: WWW Clients / WWW Scheduled Patients /
  **WWW Priority Clients** (acuity Critical|Serious). Duplicate Outpatient + Critical Care
  tiles removed (RFD §4.1 dedup).

### Schedule removed — `App.tsx`, `nav.ts`, `BottomNav.tsx`, deleted `pages/Schedule.tsx`
- Route `/schedule` now redirects to `/`; sidebar item deleted; bottom-nav tab replaced with
  History. Appointments data stays (dashboard tile reads it).

### Orders — `src/pages/Orders.tsx`
- Page title → **WWW Orders**.

### Verification
`tsc --noEmit` clean · eslint 0 errors · vitest 23/23 · build passes · no "Schedule"/"Meridian"
strings remain in src.

Follows the front-end performance/UX plan delivered in chat. CSS-only responsiveness — no new
dependencies, no JS layout code.

### Foundation — `src/index.css` (append-only)
- `.min-h-screen` → `100dvh`: stops iOS Safari URL-bar clipping/jump.
- Safe-area padding on `header.sticky` via `env(safe-area-inset-top)` (notch devices).
- `.tappable` utility: 44×44px minimum hit area, flex-centered.
- Global `:focus-visible` ring (brand-600, 2px offset): consistent keyboard visibility.
- `img/video { max-width:100%; height:auto }`: media can never overflow containers.
- `Inter-fallback` @font-face with size-adjust/ascent-override: font swap without CLS.

### Touch targets ≥44px
- Topbar hamburger + bell → `.tappable` (was p-2/p-2.5 ≈ 36–40px).
- Sidebar close X → `.tappable`.
- Orders cart remove → `.tappable`; quick-add chips → `min-h-[44px] py-2.5`;
  priority selector → `min-h-[44px] py-2.5`.
- PatientDetail chart tabs → `min-h-[44px]`; medication filter chips → `min-h-[44px] py-2`.

### Contrast (AA)
- All meaningful `text-slate-400` body/metadata text → `text-slate-500` (66 occurrences across
  10 files; decorative icon strokes untouched).

### Keyboard/UX
- Sidebar drawer now closes on Escape (`useEffect` keydown listener).
- Bell already had `aria-expanded`; tabs/filters carry ARIA from previous pass.

### Verification
`tsc --noEmit` clean · eslint 0 errors · vitest 23/23 · `npm run build` passes (single-file dist).

### Deliberately skipped (per plan P2)
Tablet-portrait persistent sidebar (drawer stays — 288px sidebar eats 768px screens).

---

## 2026-08-24 — P2 pass: bottom nav + phone table columns

### BottomNav — new `src/components/layout/BottomNav.tsx`, wired in `AppLayout.tsx`
- Fixed 5-tab thumb bar, `lg:hidden` (Dash / Patients / Schedule / Messages / Orders), 48px
  targets, safe-area bottom padding. Content wrapper gains `pb-16 lg:pb-0` so the bar never
  covers page content. NavLink `isActive` handles highlighting; `end` on "/" only.

### Phone table column hiding — `hidden sm:table-cell` on th+td pairs
- Patients: "Last Visit" hidden on phones.
- LabResults: "Collected" hidden on phones.
- Orders history: "By" (prescriber) hidden on phones.
- Dashboard attention table: "Primary Dx" hidden on phones.
Rationale: each is the lowest-value column per table; identity/status/acuity always stay visible.
Horizontal scroll remains as fallback for mid sizes.

### Verification
`tsc --noEmit` clean · eslint 0 errors · vitest 23/23 · `npm run build` passes.

---

## 2026-08-24 — Audit remediation pass (findings #2–#19)

Source: full codebase review (see chat transcript). Finding numbers below match the review.

### #2 CDS allergy matching rewritten as data-driven rules — `src/utils/cds.ts`
**Why:** substring conditionals produced false negatives ("PCN G", "Augmentin" passed a severe
penicillin allergy) and inconsistent matching (exact vs substring per branch). Replaced with an
`ALLERGY_RULES` table (allergy → trigger tokens) + token-based `matchesTrigger()`; metformin renal
check now regex-matches any renal lab name (`/creatinine|egfr|gfr/i`) instead of only a lab literally
named "Creatinine". Ceiling marked: mock knowledge base, upgrade path = RxNorm-class data behind the
same `runCDS()` signature. Adversarial tests added in `cds.test.ts` (PCN G, Augmentin, sulfamethoxazole).

### #3 Guarded runtime lookups + root ErrorBoundary — `src/pages/Orders.tsx`, new `src/ErrorBoundary.tsx`, wired in `src/main.tsx`
**Why:** non-null assertions (`patients.find(...)!`) and unguarded `vitals[length-1]` dereferences
white-screen the whole SPA on one bad mock record (no boundary existed). Orders now early-returns;
a single root ErrorBoundary catches render throws. Per-route boundaries deliberately skipped (YAGNI).

### #4 `patientId` added to `OrderItem` — `src/types.ts`, `src/data/mockData.ts`, `src/pages/Orders.tsx`
**Why:** orders had no patient attribution; Order History showed a global stream regardless of the
selected patient. Seed orders attributed to clinically consistent patients (sepsis orders → P-1001,
DKA insulin → P-1004, stroke neuro checks/PT referral → P-1006). New orders stamp `patientId`;
history table filters by the patient selected in the CPOE form.

### #5 Unified vitals tone map — `src/utils/format.ts`, `src/pages/Dashboard.tsx`, `src/pages/PatientDetail.tsx`
**Why:** identical good/warn/bad→color maps were duplicated per page. Single exported
`toneTextClass` next to the threshold helpers; both page copies deleted.

### #6 Derived `age` from DOB — `src/types.ts`, `src/data/mockData.ts`, `src/utils/format.ts`, Dashboard/Patients/PatientDetail
**Why:** stored `age` beside `dateOfBirth` guaranteed drift. Field deleted from type + all records;
new `ageFromDob()` helper renders age at display time. Unit-tested in `format.test.ts`.

### #7 ISO timestamps for all stored datetimes — `src/data/mockData.ts`
**Why:** `"2026-01-10 06:00"` (space-separated) is not ISO 8601 and parses engine-dependently
(Safari risk); masked by `formatDate`'s echo fallback. All lab/note/order/message/alert datetimes
now use `T`. Appointment times intentionally remain clock strings (`"08:30"`) — Schedule displays
them directly and sorts lexically, which is correct there.

### #8 Test coverage for highest-risk behaviors — extended `format.test.ts`, `cds.test.ts`
**Why:** the two behaviors the app demonstrates (CDS blocking) had zero adversarial coverage.
Added beta-lactam/sulfa block tests, lookalike-word guard, `ageFromDob` cases. Component-level RTL
tests (auth redirect, sign-button disable) still open — noted as future work, not silently skipped.

### #9 Accessibility attributes on interactive controls — PatientDetail tabs/filters, Orders priority selector, Topbar bell
**Why:** stateless buttons announced wrong to screen readers. Added `role="tablist"/tab` +
`aria-selected` on chart tabs, `aria-pressed` on segmented toggles, `aria-expanded` on the
notifications bell, and `scope="col"` on every `<th>` (43 across 5 tables).

### #10 Single CDS evaluation per draft — `src/pages/Orders.tsx`
**Why:** `runCDS` ran twice per cart item (memo + inline row call), risking divergence between the
global block flag and per-row styling. One `cdsByDraft` Map memo feeds both.

### #11 Dependency audit dispositioned — `package.json`, lockfile
**Why:** 2 vulnerabilities (1 high: vite NTLMv2 hash disclosure / fs.deny bypass on Windows).
Upgraded vite ^7.3.2 → ^7.3.6, ran `npm audit fix`; **0 vulnerabilities remain**. Tests re-run green.

### #12 Alert/message times stored ISO, formatted at render — types unchanged (`string`), `mockData.ts`, Topbar/Messages
**Why:** `"Yesterday"`/`"07:42"` display strings can't be sorted or filtered. Now ISO; Topbar shows
`formatTime(n.time)`, Messages uses `formatDateTime()`. Sorting remains severity-based by design.

### #13 Time-aware greeting — `src/pages/Dashboard.tsx`
Good morning/afternoon/evening derived from local hour.

### #14 Removed identity ternary — `src/pages/Dashboard.tsx`
`statusTone(d.acuity === "Critical" ? "Critical" : …)` collapsed to `statusTone(d.acuity)`.

### #15 UUIDs for drafts/orders — `src/pages/Orders.tsx`
`Date.now()`-based ids replaced with `crypto.randomUUID()` (native, collision-free).

### #16 Login delay kept — deliberate demo theater (fake "Authenticating…" state). Not removed.

### #17 Cross-tab auth sync skipped — cosmetic in a single-user demo; `storage` listener would be the fix if wanted.

### #18 Copy-on-write over shared seed arrays — `Orders.tsx`, existing pattern in `Messages.tsx`
`useState([...initialOrders])` prevents accidental mutation of module-scope mock data. Marked with
`ponytail:` comment.

### #19 Dead nullable-prop scaffolding removed — `src/pages/PatientDetail.tsx`
Tab components typed as `Patient` directly; dropped the unreachable `if (!p)` branch and five
`NonNullable<ReturnType<typeof getPatientById>>` annotations.

### Excluded by user request
- #1 (decorative auth): left as-is per instruction. It remains demo-grade — see AGENTS.md warning.

### Verification at close of pass
`npx vitest run` 23/23 · `npx tsc --noEmit` clean · `npx eslint src` 0 errors (4 pre-existing
react-refresh warnings) · `npm run build` passes (single-file dist) · `npm audit` clean.
