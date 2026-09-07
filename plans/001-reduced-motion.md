# 001 — Add prefers-reduced-motion support (repo-wide)

- **Status**: TODO
- **Commit**: ebd68d9
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: 1 file (`src/index.css`), ~20 lines

## Problem

The app has **zero** `prefers-reduced-motion` handling. Movement animations that
run today:

- `src/index.css:57-70` — `@keyframes fade-in` moves `translateY(6px)`; applied
  via `.animate-fade-in` on **every route change** (`src/components/layout/AppLayout.tsx:25`)
  and every modal (`src/components/ui/Modal.tsx:93`).
- `src/index.css:72-86` — `.animate-pulse-ring`, an infinite 2s loop (dead code
  today — see plan 006 — but must be covered if ever wired up).
- `src/components/layout/Sidebar.tsx:39,48` — mobile drawer slides via
  `transition-opacity` / `transition-transform`.

Users with vestibular sensitivity get full movement. Target behavior per the
audit spec: reduced motion means **gentler, not zero** — keep opacity/color
feedback, drop position changes.

## Target

Append this block to `src/index.css` (after the `.animate-fade-in` rule,
before the print section):

```css
/* Accessibility: honor prefers-reduced-motion.
   Keep opacity/color feedback; drop movement (elements snap instead). */
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in {
    animation: fade-in-soft 0.2s ease both;
  }
  .animate-pulse-ring {
    animation: none;
  }
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    transition-property: opacity, color, background-color, border-color !important;
  }
}

@keyframes fade-in-soft {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

What this does: `.animate-fade-in` keeps a gentle opacity-only fade; the
`transition-property` override makes transform transitions (drawer slide,
chart draw) snap instantly while hover color transitions still ease.

## Repo conventions to follow

- All global CSS lives in `src/index.css` — keyframes at the top-level (see
  `@keyframes fade-in` at `src/index.css:57`), utility classes directly below.
- No CSS preprocessor, no CSS modules. Tailwind 4 via `@import "tailwindcss"`.

## Steps

1. Open `src/index.css`.
2. If plan 006 already deleted `.animate-pulse-ring`, skip that one rule inside
   the media query (the rest is unchanged).
3. Append the target CSS block above after the `.animate-fade-in` rule
   (currently `src/index.css:68-70`), before the mobile/print sections.

## Boundaries

- Do NOT touch any `.tsx` files — this is CSS-only.
- Do NOT remove the existing `fade-in` keyframes or change their timing
  (plan 003 owns duration changes).
- Do NOT add `animation: none` to everything — the fade must remain (opacity
  only), per the spec.
- If `src/index.css` doesn't match the excerpts above (drift since commit
  `ebd68d9`), STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit -p .` passes; `npm run build` succeeds.
- **Feel check**: run `npm run dev`, open DevTools → Rendering → emulate
  `prefers-reduced-motion: reduce`, then:
  - Navigate between routes: content fades in with **no upward slide**.
  - Open a message in the reading pane / compose modal: fades, no movement.
  - Toggle sidebar drawer (mobile viewport): it opens/closes instantly, no slide.
  - Hover buttons: color transitions still feel smooth (not instant).
  - Turn the emulation off: the 6px slide returns.
- **Done when**: emulation on = no transform movement anywhere, opacity fades
  and color hovers intact; emulation off = behavior identical to before.
