# pages/ — route screens

## Purpose
One file per route in `src/App.tsx`. Each screen renders entirely from `src/data/mockData.ts` — no fetching, no local state beyond UI toggles.

## Ownership
- Screen files may be edited freely; keep one screen = one file.
- Routes are registered ONLY in `src/App.tsx` — don't add routing here.

## Local Contracts
- `Dashboard.tsx` — WWW-branded KPIs (WWW Clients / Admitted / Scheduled / Critical Alerts). Dates derived at render time. Has a quick-intake + medical-review slot (Phase 1); review persistence is localStorage-only until Phase 2 wires it to encrypted MedicalHistory.
- `Patients.tsx` (title: **WWW Clients**) — table with phone-column hiding (`hidden sm:table-cell` on Last Visit). Rows link to `/patients/:id`.
- `PatientDetail.tsx` (~510 lines) — patient chart: snapshot, vitals trends (`Charts.tsx`), allergies/meds/labs/history/notes tabs. Data from `patients` by `:id`. Chart tabs carry `role="tab"`/`aria-selected`.
- `Orders.tsx` (**WWW Orders**) — order entry calls `runCDS()` from `src/utils/cds.ts` before allowing submit; danger-level findings block the order. Whole page gated behind `<CodeGate />` (doctor-code, `auth-doctor.tsx`). Order History is a side tab: Signed-by column + per-order Administered cell; persists + audits. Single `cdsByDraft` memo feeds both the block flag and row styling — do not call `runCDS` twice.
- `LabResults.tsx` — table; "Collected" column hidden on phones.
- `MedicalHistory.tsx` — history timeline; Phase 2 target for encrypted records.
- `Messages.tsx` — folder counts derived from message read state; keep empty states rendered. Times via `formatDateTime`.
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
