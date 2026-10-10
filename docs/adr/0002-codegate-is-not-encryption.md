# ADR-0002 — The doctor-code gate is access control, not encryption

Date: 2026-10-09
Status: Accepted
Relates to: `docs/risk-register.md` R-03, R-04; `src/auth-doctor.tsx`, `src/utils/crypto.ts`

## Context

Orders, Lab Results and Medical History sit behind a per-page "doctor code"
(`CodeGate`), and the UI described those screens as *encrypted*. The code makes a
hash of the code and stores the unlock state in `localStorage`:

- `www-doctor-code-hash` — unsalted SHA-256 of the code, on the device.
- `www-page-unlocks` — `{ sessionId, pages[] }`, on the device.
- `www-dek` — the AES-GCM key used by `src/utils/crypto.ts`, **stored in the same
  `localStorage` as the data it is supposed to protect**.

Anyone with the device — or any browser extension, or any script on the origin —
reads the client records in plaintext and can flip the unlock entry. The gate
controls a *view*, not the *data*. The existing `ponytail:` comments in
`crypto.ts` already said this; the UI copy contradicted them.

Two concrete harms followed: the false "encrypted" claim in the interface, and
claims of certification that were never earned (`SOC 2 Type II · HITRUST
Certified · 256-bit encryption` on the login screen, "encrypted end-to-end and
audited per HIPAA policy" in Messages).

## Decision

1. Keep `CodeGate` as a UX/step-up control (shoulder-surfing and shared-desk
   protection have real value) and describe it as such. Copy changed to
   "access-restricted … opens only with a doctor's personal code"; the login and
   messages claims are gone; the sidebar says "Restricted views · Doctor code per
   screen".
2. Real confidentiality moves server-side in Phase 1/2 (ADR-0004 will cover it):
   authorization in RLS, `www_*` tables that never exist on the device, and
   field encryption with KMS-wrapped keys. `crypto.ts` keeps its API shape so
   call sites survive the move; the DEK does not stay in the browser.
3. Attempt throttling and lockout move out of the client: a 5-attempt/15-minute
   counter held in `localStorage` is a courtesy, not a control — it is deleted by
   clearing site data.

## Consequences

- No user-facing feature is lost: gates still lock, still fail closed for
  non-doctor roles, still bind to the session.
- Marketing/consent language must be reviewed before any real deployment; this
  ADR is the evidence trail for what was true on which date.
- The device still holds `www-*` records in demo mode. That is acceptable only
  while demo mode carries fake data, which ADR-0001 now enforces at build time.
