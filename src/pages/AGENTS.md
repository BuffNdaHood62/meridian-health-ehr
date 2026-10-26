# pages/ — route screens

## Purpose
One file per route in `src/App.tsx`. Screens read through `src/data/api.ts`, which resolves the fake record set ONLY in demo mode and throws in a production build with no backend — pages never fetch on their own and must not re-add a mock fallback.

## Ownership
- Screen files may be edited freely; keep one screen = one file.
- Routes are registered ONLY in `src/App.tsx` — don't add routing here.

## Local Contracts
- `Dashboard.tsx` — "Wellness with Writingale" header (`WwwLogo`), subtitle "Good <dayPart>, Doctor". KPI cards WWW Clients / WWW Admitted / WWW Scheduled (mock + locally booked) / WWW Priority Clients. Slots: Demographics (autosaves an editable record via `src/utils/demographics.ts`, incl. address/next-of-kin/parents), Medical Review (vitals incl. Height; on save writes to `src/utils/medicalReviews.ts` **and** `registerReviewAsVisit()` so it lands under Clients; matched client's active orders shown), Schedule an appointment (`src/utils/appointments.ts`). NO reviews list — privacy; reviews surface only on Clients + the access-restricted Medical History.
- `Patients.tsx` (title: **WWW Clients**) — immutable visit-entry registry backed by `src/utils/wwwRecords.ts` (localStorage, seeded on first run). Columns WWW #, Client, Age band, Facility, Status, Complaints, Allergies, Vitals, Weight (vitals include Height). Tap name → full record with demographics block + per-visit Print/Email export; entries are append-only, never edited. New entries copy biography from the demographics record; review-sourced entries show `—` age/facility and a "Review" status badge.
  - **Export contract:** printing calls `printClientRecord` directly; email is two-step (`www-email-<id>` → consent modal `www-email-consent` with an unticked `www-email-ack` → `www-email-confirm`, and `confirmEmail` returns early unless acked). Both land in the `export` audit action, and `exportNotice` (`data-testid="www-export-notice"`) states in-band that the disclosure was recorded — including when the browser blocked the popup. `FragmentRow` takes `onPrint`/`onEmail`; don't call `recordExport` from anywhere else, and never rebuild the old `document.write` sheet.
- `PatientDetail.tsx` (~510 lines) — patient chart: snapshot, vitals trends (`Charts.tsx`), allergies/meds/labs/history/notes tabs. Data from `patients` by `:id`. Chart tabs carry `role="tab"`/`aria-selected`.
- `Orders.tsx` (**WWW Orders**) — order entry calls `runCDS()` from `src/utils/cds.ts` before allowing submit; danger-level findings block the order. Doctors reach it through `<CodeGate pageKey="orders" />`; **non-doctor roles render `<OrdersInner readOnly />`** — no New Order builder or Sign & Submit, but Order History + Administered/recipient stay usable (nurse route in `users.ts`). Order History is a side tab: Signed-by column + per-order Administered cell; persists + audits. Single `cdsByDraft` memo feeds both the block flag and row styling — do not call `runCDS` twice.
- `LabResults.tsx` — gated behind `<CodeGate pageKey="labs" page="Lab Results" />`; "Collected" column hidden on phones. Locally added results (`src/utils/labEntries.ts`, append-only) merge into the table via the Add Result modal.
- `MedicalHistory.tsx` — gated behind `<CodeGate pageKey="history" page="Medical History" />`; merges Dashboard reviews as "Medical Review" timeline events.
  - `CodeGate` is a per-page, per-session **view lock** (SHA-256 of the doctor code in localStorage, unlock audited as `unlock`), not encryption of the underlying data — the record still sits in the client store. Keep gate labels "access-restricted"; after unlock, re-evaluate the route-level gate (`RouteAuthenticationGate`).
- `Messages.tsx` — folder counts derived from message read state; keep empty states rendered. Times via `formatDateTime`. Compose is a modal (`Modal.tsx`); reading a message opens a centered popup (replaces the old side-by-side pane) so mobile stays single-column. Composed messages are `sent: true` and land in the Sent folder.
- `Login.tsx` — email/password form (`loginWithEmail`) plus "Enter Demo Workspace", which routes to `/demo`. `loginWithEmail` resolves to `{error, next}`; `next` is `mfa` (→ `/login/mfa`), `pending` (→ `/login/pending`), or `app`. Demo credentials are checked client-side against `www-accounts` in localStorage (`verifyCredentials` in `users.ts`); with Supabase configured the GoTrue adapter is used instead. Read `useAuth().mode` for copy, not `isSupabaseConfigured`.
  - **Copy rule for this screen and Signup/Settings/Sidebar/CodeGate:** describe only what runs. No "encrypted", "HIPAA", "SOC 2", "HITRUST", "audited", "securely", or invented usage stats (ADR-0002, root AGENTS.md). The `hidden lg:flex` marketing panel is where these survived longest — check it at desktop width.
- `DemoPicker.tsx` — public `/demo`: role radio list (44px rows), access lists derived from `ROLE_ROUTES`, `login(userId)` is async. With a backend configured it shows an amber notice because the Supabase adapter refuses demo role sign-in.
- `LoginMfa.tsx` — `/login/mfa`, only valid in `password_ok` (password accepted, AAL1). Six-digit TOTP → `verifyMfa()`; cancel signs out. Any other state redirects (active → `from`, unverified → `/login/pending`, anonymous → `/login`). Never render the app from this state.
- `LoginStepUp.tsx` — `/login/step-up`, reached from `RouteAuthenticationGate` when `/orders` needs a fresh check. Supabase requires password + TOTP; **demo mode checks neither and says so in the card** (there is no server to check against). On mount it re-asks `checkStepUp()` and navigates back if the check is already fresh, so a refresh cannot strand the user.
- `PendingApproval.tsx` — `/login/pending`, reached from an `unverified` outcome or a pending signup. Shows the adapter's reason and the email, "Back to sign in" (signs out) and "Contact support" (`SUPPORT_EMAIL` from `src/config.ts`, a deploy-time placeholder — do not hardcode an address). Approved users and direct visits with no pending email redirect before the card renders. The Supabase adapter has already signed the profile out, so this screen never holds a token for an unapproved account.
- `Signup.tsx` — name/email/role/password. The field is **"Requested role"**: in demo mode the demo adapter grants it immediately (copy says so), but with Supabase the role is stored as `profiles.requested_role` and the account stays unverified reception until `approve_profile` (0008). `signup()` resolves like sign-in; `next === "pending"` navigates to `/login/pending` with `created: true`. Do not reintroduce copy that promises the role at signup.
- `Settings.tsx` — session/account view. The "Activity Log" card reads real counts from `listAudit()` and says plainly that demo events are browser-local, not a compliance trail; 2FA / biometric / trusted-devices rows render `Not in this build` badges rather than toggles, because a switch that silently does nothing tells a clinician a control protects them.
- `ShareView.tsx` — public route `/share/:token`; one-time token → read-only record sheet; invalid/expired/consumed → "Link unavailable".

## Work Guidance
- Reuse `src/components/ui/*` primitives and `cn()` before writing local markup variants.
- Tone/color mapping for vitals lives in `src/utils/format.ts` (`toneTextClass`) — reuse, don't re-branch per page.
- Mobile: touch targets ≥44px (`.tappable` util or `min-h-[44px]`); bottom nav handles primary nav under `lg`.
- Mark simplifications with `ponytail:` comments.

## Verification
- `npx eslint src/pages/<file>` + targeted `tsc --noEmit` on changed files (repo-wide runs time out here; see root AGENTS.md).
- `npm run test` must stay green.

## Child DOX Index
- None (flat directory).
