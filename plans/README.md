# Animation Plans — README

Plans produced by the improve-animations audit of commit `ebd68d9`
(2026-09-07). Executed in full on 2026-09-07; all verified (32/32 tests,
`tsc --noEmit`, production build clean).

## Plan index

| # | Plan | Severity | Status |
|---|------|----------|--------|
| 001 | [Add prefers-reduced-motion support](001-reduced-motion.md) | HIGH | DONE |
| 002 | [ProgressRing: make the draw-in actually run](002-progress-ring-draw.md) | HIGH | DONE |
| 003 | [Route-change fade: 0.35s → 0.2s](003-route-fade-duration.md) | MEDIUM | DONE |
| 004 | [DemoPicker: transition-all → transition-colors](004-demopicker-transition-colors.md) | MEDIUM | DONE |
| 005 | [Modal: add a fast exit transition](005-modal-exit.md) | MEDIUM | DONE |
| 006 | [Delete dead pulse-ring animation](006-delete-pulse-ring.md) | LOW | DONE |
| 007 | [Sidebar drawer: iOS-like curve + duration](007-drawer-curve.md) | LOW | DONE |
| 008 | [Gate hover styles to pointer:fine devices](008-hover-gating.md) | LOW | DONE |

### Execution notes (deviations from the written plans)

- **001**: the `.animate-pulse-ring { animation: none }` rule was omitted
  because 006 deleted the class first (as sequenced).
- **002**: the `useEffect/useState` import step was unnecessary —
  `Charts.tsx` already imported both hooks.
- **005**: added a `closingRef` guard alongside the `closing` state (the
  Escape keydown effect captures stale state) and wrapped `requestClose` in
  `useCallback` to satisfy `react-hooks/exhaustive-deps`.
- **008**: the one-line `@custom-variant hover (@media (hover: hover) { &:hover });`
  form made lightningcss emit 38 malformed-CSS warnings in the build. The
  canonical `@slot` block form compiles cleanly — use that form in Tailwind 4.

## Backlog (missed opportunities — not planned yet)

Additive polish identified in the audit, awaiting a decision before plans:

1. Settings toggle: animate the track color with the thumb
   (`src/pages/Settings.tsx:26-30`).
2. Messages: 30–80ms stagger/fade when opening the reading pane.
3. PatientDetail: 120–150ms crossfade between tab panels.
4. StatCard shimmer for loading states (if async loading becomes visible once
   real Supabase latency lands).
