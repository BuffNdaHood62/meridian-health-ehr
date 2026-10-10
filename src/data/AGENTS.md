# data/ — record set + read assembly

## Purpose
`mockData.ts` is the fake clinical record set (demo/test fixture). `api.ts` is the read layer the pages consume: Supabase when configured, the fixture **only in demo mode**.

## Ownership
- New domain content → `mockData.ts`. New query/assembly → `api.ts`.
- Domain types live ONLY in `src/types.ts`; don't widen a type by adding fields to the fixture.
- Nothing outside `src/` may import `mockData`; `src/utils/**` may not import it at all (ESLint boundary in `eslint.config.js`) — pure logic receives its data from the caller.

## Local Contracts
- `mockData.ts` — invented patients, orders, messages, alerts, appointments, WWW entries. Every name/MRN/lab value is fictional. **Never put real PHI here**, including in a branch or a test fixture; that rule outvants any convenience argument.
- `api.ts` — every `return mock…` branch must be guarded by `demoFallback(context)`:
  ```ts
  function demoFallback(context: string): boolean {
    if (isSupabaseConfigured) return false;
    requireBackend(context); // throws in production mode
    return true;
  }
  ```
  A production build with no backend is a mis-deploy, and answering its clinical screens with invented patients is a patient-safety failure — so it throws, and `main.tsx` refuses to mount. Do not soften this into a graceful fallback.
- Query errors propagate. `ensure(error, what)` throws; a failed read must never resolve to `data ?? []`, because an empty list on a clinical screen is indistinguishable from "no records exist".
- Assembly keeps the existing `Patient` shape (child rows → nested arrays) so page render code stays backend-agnostic.

## Work Guidance
- Add a loader and its gate in the same edit; grep for `mock` in `api.ts` before claiming a path is covered.
- Preserve error propagation through hooks — a rejected load must reach the page's `ErrorNote`, not become a quiet `[]`.
- Mark simplifications with `ponytail:` comments naming ceiling + upgrade path.

## Verification
- `npx eslint src/data/api.ts`, `npx tsc --noEmit -p .`.
- `npm run build` must produce an artifact that shows `StartupBlocked` without backend env; `npm run build:demo` must still render the fixture.

## Child DOX Index
- None (two files).
