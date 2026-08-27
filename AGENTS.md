# meridian-health-ehr — mock EHR front-end demo (React SPA)

Tech stack pins: React 19, Vite 7 (+ vite-plugin-singlefile), TypeScript 5.9, Tailwind CSS 4 (via @tailwindcss/vite), react-router-dom v7 (HashRouter), Vitest 3, ESLint 9 flat config, Node 24.

## Local Environment
- Windows / git-bash host. Use absolute paths (`/c/Users/Michael/meridian-health-ehr`).
- Repo-wide `npm run lint` and `npm run typecheck` can time out in this GUI environment; when they do, fall back to targeted checks on changed files (`npx eslint --ext tsx <file>`, `npx tsc --noEmit -p .`) and report the timeout as the blocker.
- Flat-config ESLint rejects old flags; use `npx eslint <file>` style invocations.
- Build outputs a single self-contained HTML file (`vite-plugin-singlefile`). No backend anywhere — everything renders from `src/data/mockData.ts`.

## Global Work Rules
- Shortest working diff wins. No speculative abstractions.
- Bug fix = root cause, not symptom; grep callers before editing shared helpers.
- Mark deliberate simplifications with `ponytail:` comments naming ceiling + upgrade path.
- Durable change records → `Documentation.md`.
- This is a demo with fake data: never add real PHI to any file.

## Verification
- `npm run test` — Vitest unit tests (cds/cn/format). Fast, primary gate.
- `npm run lint`, `npm run typecheck` — see Local Environment caveats.
- `npm run build` — must pass before shipping; single-file output lands in `dist/`.

## Architecture (high level)
- `src/App.tsx` — all routes, HashRouter, `RequireAuth` wraps the app layout.
- `src/auth.tsx` — AuthProvider/useAuth/RequireAuth; localStorage flag `meridian-auth`. Demo-grade auth only — no credentials checked.
- `src/pages/` — one file per route screen (child DOX).
- `src/components/layout/` — AppLayout/Sidebar/Topbar/nav (nav.ts is the sidebar source of truth).
- `src/components/ui/` — presentational primitives (Avatar, Badge, Card, PageHeader, StatCard).
- `src/components/charts/Charts.tsx` — hand-rolled SVG charts (no chart lib).
- `src/data/` — ALL clinical/demo content lives here (child DOX).
- `src/utils/` — pure logic: cds.ts (clinical decision support), cn.ts (class merge), format.ts (date/format helpers); each with colocated `.test.ts`.
- `src/types.ts` — every domain type. Change types here first, nowhere else.

## Child DOX Index
- `src/pages/AGENTS.md` — route screens
- `src/data/AGENTS.md` — mock data source of truth
- `src/utils/AGENTS.md` — pure logic + CDS rules
- (No child docs for `components/` or config files — scaffolding-level.)
