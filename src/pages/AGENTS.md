# pages/ — route screens

## Purpose
One file per route in `src/App.tsx`. Each screen renders entirely from `src/data/mockData.ts` — no fetching, no local state beyond UI toggles.

## Ownership
- Screen files may be edited freely; keep one screen = one file.
- Routes are registered ONLY in `src/App.tsx` — don't add routing here.

## Local Contracts
- `Dashboard.tsx` — "Wellness with Writingale" header (`WwwLogo`), subtitle "Good <dayPart>, Doctor". KPI cards WWW Clients / WWW Admitted / WWW Scheduled (mock + locally booked) / WWW Priority Clients. Slots: Demographics (autosaves an editable record via `src/utils/demographics.ts`, incl. address/next-of-kin/parents), Medical Review (vitals incl. Height; on save writes to `src/utils/medicalReviews.ts` **and** `registerReviewAsVisit()` so it lands under Clients; matched client's active orders shown), Schedule an appointment (`src/utils/appointments.ts`). NO reviews list — privacy; reviews surface only on Clients + encrypted Medical History.
- `Patients.tsx` (title: **WWW Clients**) — immutable visit-entry registry backed by `src/utils/wwwRecords.ts` (localStorage, seeded on first run). Columns WWW #, Client, Age band, Facility, Status, Complaints, Allergies, Vitals, Weight (vitals include Height). Tap name → full record with demographics block + per-visit Print/Email export; entries are append-only, never edited. New entries copy biography from the demographics record; review-sourced entries show `—` age/facility and a "Review" status badge.
- `PatientDetail.tsx` (~510 lines) — patient chart: snapshot, vitals trends (`Charts.tsx`), allergies/meds/labs/history/notes tabs. Data from `patients` by `:id`. Chart tabs carry `role="tab"`/`aria-selected`.
- `Orders.tsx` (**WWW Orders**) — order entry calls `runCDS()` from `src/utils/cds.ts` before allowing submit; danger-level findings block the order. Doctors reach it through `<CodeGate pageKey="orders" />`; **non-doctor roles render `<OrdersInner readOnly />`** — no New Order builder or Sign & Submit, but Order History + Administered/recipient stay usable (nurse route in `users.ts`). Order History is a side tab: Signed-by column + per-order Administered cell; persists + audits. Single `cdsByDraft` memo feeds both the block flag and row styling — do not call `runCDS` twice.
- `LabResults.tsx` — gated behind `<CodeGate pageKey="labs" page="Lab Results" />`; "Collected" column hidden on phones. Locally added results (`src/utils/labEntries.ts`, append-only) merge into the table via the Add Result modal.
- `MedicalHistory.tsx` — gated behind `<CodeGate pageKey="history" page="Medical History" />`; merges Dashboard reviews as "Medical Review" timeline events.
- `Messages.tsx` — folder counts derived from message read state; keep empty states rendered. Times via `formatDateTime`. Compose is a modal (`Modal.tsx`); reading a message opens a centered popup (replaces the old side-by-side pane) so mobile stays single-column. Composed messages are `sent: true` and land in the Sent folder.
- `Login.tsx` — role-tagged user picker (radio list, 44px rows); calls `useAuth().login()`. No password check (demo).
- `Settings.tsx` — session/account view.
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
