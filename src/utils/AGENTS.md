# utils/ — pure logic, no data ownership

## Purpose
Deterministic helpers: clinical decision support, record export, demo localStorage stores, auditing, formatting. No component markup, no route knowledge.

## Ownership
- Files here are leaf modules — pages import them, nothing in `utils/` imports a page.
- **`src/utils/**` may not import `src/data/mockData`** (enforced by `eslint.config.js` `no-restricted-imports`; test files are exempt). Logic takes data from its caller. `runCDS` used to read the mock chart directly, which meant orders were screened against invented patients instead of the loaded one.

## Local Contracts
- `cds.ts` — `runCDS(patient: CdsPatientContext | null | undefined, draft: DraftOrder): CDSFinding[]`. `CdsPatientContext = Pick<Patient, "allergies" | "medications" | "labs">`, so the caller supplies the chart. `null`/`undefined` ⇒ `[]` (no findings, not a crash). Findings carry a danger level; `Orders.tsx` blocks submit on any danger finding and feeds both the block flag and row styling from ONE `cdsByDraft` memo — never call `runCDS` twice per render. Rule changes need clinician sign-off (risk register R-11).
- `recordExport.ts` — `printClientRecord(e)` / `emailClientRecord(e)`. Builds the sheet through `dom.ts` (`textContent` only, never `innerHTML` — PHI from a client record must not become markup). Both write an `export` audit entry and prefix provenance; in demo mode prints are watermarked `*** DEMO DATA ***`. Email goes through a `mailto:` that keeps PHI in the body, and the page must show a consent modal before calling it.
- `dom.ts` — `node(doc, tag, text, style)`: the only DOM-construction primitive; safe by construction.
- `audit.ts` — `action: "create" | "update" | "delete" | "unlock" | "sign" | "administer" | "export" | "read"`. Exports are `export`, not `read`; don't fold new actions into existing ones.
- `crypto.ts` — SHA-256 over the doctor code for the per-page view lock. It is a hash for lookup, **not** encryption of content (ADR-0002); no wording here or in UI may claim otherwise.
- Demo stores (`wwwRecords.ts`, `demographics.ts`, `medicalReviews.ts`, `appointments.ts`, `labEntries.ts`) — localStorage-backed, seeded from mock fixtures, append-only where the record is clinical. These hold PHI-shaped data on the device; the server-side registry (migration 0007 + its RPCs) is the target, and the client must be purged after capture (R-04/R-13).
- `format.ts` — date/number formatting and `toneTextClass` (vitals tone → Tailwind classes). Pages reuse, never re-branch.
- `cn.ts` — class merge primitive.
- `share.ts` — one-time/expiring share tokens; the redeem path runs as `anon`, so migration 0007 deliberately keeps anon `USAGE` on the schema.

## Work Guidance
- `tsconfig.json` includes all of `src`, so bare `src/utils/*.ts` files ARE in `npx tsc --noEmit -p .` scope — unlike the repo-wide lint/typecheck runs (which time out here, see root AGENTS.md), this one is the gate. Vitest runs in a node environment: a util used only by a page still needs its logic covered by `.test.ts`, not by browser wiring.
- Keep functions pure and testable; side effects (localStorage, `window.print`, `mailto:`) live at the edge of the module and return something the caller can report on (`printClientRecord` returns `false` when the popup was blocked).
- Mark simplifications with `ponytail:` comments naming ceiling + upgrade path.

## Verification
- `npm run test` must stay green (here: cds / cn / format / wwwRecords; `env.test.ts` and `users.test.ts` live at `src/`).
- `npx eslint src/utils/<file>` plus `npx tsc --noEmit -p .` on changed files.

## Child DOX Index
- None (flat directory).
