# Risk register & control map — production transition

Date: 2026-10-09 · Owner: Michael (foundation technical lead) · Review cadence: quarterly, and before any real-PHI go-live.

This is the written risk analysis required before protected health information
can be processed (HIPAA §164.308(a)(1)(ii)(A); NDPA 2023 §19 technical and
organisational measures for sensitive personal data). It is deliberately
repo-specific: every row names the file that makes the risk real.

## Legal frame (read this before citing "HIPAA compliant")

No product is "HIPAA certified" — compliance is the organisation's posture across
people, process and technology. The binding law for WWW Clinic (Uyo, Nigeria) is
the **Nigeria Data Protection Act 2023**, where health data is *sensitive personal
data*: a DPIA is mandatory, consent/processing conditions are stricter, and NIPHIHE
governs exchange formats. HIPAA attaches if the platform ever holds data about US
patients. Strategy: implement the HIPAA Security Rule controls as the engineering
baseline because they are well-specified and satisfy NDPA's technical-measures
duty; keep the legal analysis (DPIA, consent, data-subject rights, breach
notification) on the NDPA track.

## Risk register

| ID | Risk | Where it lives today | Mitigation | Status |
| --- | --- | --- | --- | --- |
| R-01 | A production build with no backend silently serves 12 fake patients as if they were real | `src/data/api.ts` returned `mockData` whenever env was absent | `VITE_APP_MODE` + startup gate + `demoFallback()` throwing in production (ADR-0001) | **Closed** 2026-10-09 |
| R-02 | Same mis-deploy also removes authentication (demo role-picker login) | `src/auth.tsx:31-38` fell back to `DemoAuthProvider` | Production mode cannot boot at all without a backend, so the demo provider is unreachable there | **Closed** 2026-10-09 |
| R-03 | UI claimed pages are "encrypted" when the control is a client-side view lock | `Sidebar.tsx`, `CodeGate.tsx`, `Login.tsx` ("SOC 2 · HITRUST · 256-bit"), `Messages.tsx` ("encrypted end-to-end … per HIPAA policy") | False certification/encryption claims removed and replaced with accurate wording; real confidentiality moves server-side (ADR-0002) | **Closed (copy)**; server-side control = R-04 |
| R-04 | Client records + AES key sit in the same browser storage | `www-*` keys in `localStorage`, `www-dek` in `src/utils/crypto.ts` | `0007_www_registry_and_access_hardening.sql` creates the server-side registry; Phase 2 wires the app to it and purges device stores | **Open** — migration authored, not applied, no client wiring |
| R-05 | Coarse RLS: `role_can()` ignores the action, `for all` policies let any org member update/delete PHI | `0004_role_rls.sql` | `role_allows(entity, action)` + per-action policies + `revoke delete, truncate`; append-only triggers | **Open** — needs staging apply + the RLS matrix test |
| R-06 | Audit trail is client-writable and capped at 500 rows | `src/utils/audit.ts` (`CAP = 500`, localStorage) | DB-side hash-chained `audit_log`, immutability trigger, admin/self-only reads | **Open** — same dependency as R-04 |
| R-07 | Record export puts PHI into email; print sheet had no provenance or trail | `src/utils/recordExport.ts` (was `document.write` + raw `mailto:`) | DOM-built sheet (no markup injection), provenance + demo watermark, explicit recipient authorization step, every export audited | **Mitigated**; Phase 3 replaces mail body with an expiring share link |
| R-08 | WWW numbers 001-999 allocated by a client-side max+1 scan | `src/utils/wwwRecords.ts:111-121` | `register_www_client()` with a locked per-org counter row and a hard exhaustion error | **Open** — server function exists, client path still in use |
| R-09 | `VITE_APP_MODE=demo` against a real project would re-enable fake data | deployment config, not code | Accept while data is fake; require deploy-approval review of env before go-live; add a release checklist item | **Accepted (demo only)** |
| R-10 | Six npm advisories remain, 2 critical, all in the build toolchain (`vitest`/`tinypool`, `vite-plugin-singlefile`) | `package-lock.json` | `npm audit fix` cleared 3; remaining need a **major** vitest 3→5 bump — a human decision. CI now reports audit on every run | **Open**, non-blocking by design |
| R-11 | CDS rules are a hand-written substring matcher, not a drug reference | `src/utils/cds.ts` (`ALLERGY_RULES`, 5 rules) | Fixed the data-source defect (it evaluated mock patients instead of the loaded chart); still needs RxNorm/validated knowledge base + clinical sign-off before real use | **Partially closed** — see R-12 |
| R-12 | CDS now reads the caller-supplied patient, but the ruleset itself is unvalidated | `src/utils/cds.ts` | Provenance, versioning, override-with-reason logging, clinical governance review | **Open** |
| R-13 | PHI residue already on clinic browsers from demo use | Any device that ran the demo | Export → validate → import script, then clear `www-*` stores; document as a migration-window task, not a code change | **Open** |
| R-14 | Shared accounts / no MFA / no idle auto-logoff | `Login.tsx`, `Sidebar.tsx` footer states it plainly | Named accounts + TOTP/WebAuthn + server-side session expiry (Phase 1 remainder) | **Open** |
| R-15 | No backups, no DR runbook, no monitoring, no CSP | infrastructure, none in repo | Phase 3/4: PITR + quarterly restore rehearsal, IaC, PHI-redacting log sink, Sentry, CSP after retiring `vite-plugin-singlefile` | **Open** |
| R-16 | The verification gates did not execute the data layer: `demoFallback()` threw in the *demo* artifact (gated on backend presence, not mode) while tests/typecheck/lint all passed, and unbacked security copy survived on the desktop-only Login panel | `src/data/api.ts`, `src/data/api.test.ts`, root AGENTS.md Verification | Fixed 2026-10-20: gate keys on `DEMO_DATA_ALLOWED`; `api.test.ts` asserts loaders resolve; a standing rule requires loading built `dist/index.html` in a browser before claiming a screen works | **Closed (2026-10-20)** |

## What the app still must not do

Until R-04, R-05, R-06, R-08, R-13 and R-14 are closed, this build must not be
used for real patient records. Demo mode is the only approved use, and the demo
banner plus the print/email watermark exist so that a demo artifact cannot be
mistaken for a clinical document.

## Phase acceptance evidence (2026-10-09)

- `npx vitest run` — 45 passed / 6 files, including `src/env.test.ts` proving the
  fail-closed mode matrix.
- `npx eslint . --max-warnings=0` (react-refresh exempted, as CI does) — exit 0,
  including the new `no-restricted-imports` boundary that keeps `src/utils/**`
  from importing the demo record set.
- `npm run build` (production mode) and `npm run build:demo` — both exit 0;
  single-file output 740 kB / 208 kB gzip.
- `supabase/migrations/0007_*.sql` parsed with libpg_query (`pglast`): 96
  statements, no syntax errors. PL/pgSQL function bodies are not validated by a
  parser and the migration has **not** been executed — no Postgres, Supabase CLI
  or Docker is available in this environment. Applying it to staging is the next
  gate, and the RLS matrix assertions at the foot of the file must run there.

## Phase acceptance evidence (2026-10-20)

- Browser verification of the built demo artifact (`dist/index.html` from
  `npm run build:demo`), which is what R-16 was missing: app boots, demo banner
  renders, dashboard KPIs populate from the fixture, Messages renders, Orders still
  shows the doctor-code gate, Settings shows live audit counts.
- Asserted absent from the rendered DOM: `HIPAA`, `SOC 2`, `audited`, `encrypted`,
  `12,000`, `trusted by`, `3 devices`, the fabricated `10.42.18.6` session IP.
- `npx vitest run` — 48 passed / 7 files (adds `src/data/api.test.ts`).
- `npm run build` (production) still refuses to boot without a backend — the
  behaviour the live site displayed, and the reason `vercel.json` now declares the
  demo mode explicitly instead of leaving it to the default.
