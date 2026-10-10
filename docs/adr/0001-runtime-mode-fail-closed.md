# ADR-0001 — Runtime mode is explicit, and production fails closed

Date: 2026-10-09
Status: Accepted
Relates to: `docs/risk-register.md` R-01, R-02; `src/env.ts`

## Context

The SPA answered every data call with `isSupabaseConfigured ? backend : mockData`.
That is correct for a demo and dangerous for a clinic: a production bundle built
without env vars renders 12 invented patients, an empty audit trail, and a normal
looking UI. Nobody can tell the difference from the outside — including the
person who is supposed to notice, the clinician.

Two related fail-opens were in the same family:

- `DemoAuthProvider` (role-picker login, no credentials) mounted whenever env was
  absent, so the same mis-deploy also removed authentication.
- `DEMO_MODE` was a hand-edited literal in `src/config.ts`, so the banner that
  warns "this is fake" could disagree with the data actually being served.

## Decision

`VITE_APP_MODE` is the single contract, resolved in `src/env.ts`:

| Input | Mode | Behaviour |
| --- | --- | --- |
| `VITE_APP_MODE=demo` (`.env.demo`, via `npm run build:demo`) | demo | mock data + demo provider + banner, by design |
| `VITE_APP_MODE=production` or unset in a build | production | backend required |
| unset in `vite dev` | demo | zero-backend development keeps working |

In production mode with no backend, `src/main.tsx` renders `StartupBlocked` and
never mounts the clinical UI; `src/data/api.ts` routes every fake-data branch
through `demoFallback()`, which throws instead of returning mock rows. Two
independent layers: the app does not boot, and if some call path were reached
anyway it would still refuse.

`DEMO_MODE` is now derived from the resolved mode rather than written by hand.

## Consequences

- **Breaking for existing habits:** `npm run build` no longer produces a
  shareable demo. The demo command is `npm run build:demo`, and CI builds both.
- Mock data becomes a test/dev fixture with a boundary, not a fallback that can
  ship.
- The failure mode is loud and operator-facing by design: a mis-configured
  deploy shows a red "Application not started" panel instead of a fake clinic.
- Not yet done (deliberately out of scope here): production still permits the
  demo provider if someone sets `VITE_APP_MODE=demo` against a real project —
  which is a deployment-approval issue, tracked as R-09.
