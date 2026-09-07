# 007 — Sidebar drawer: iOS-like curve + drawer duration

- **Status**: TODO
- **Commit**: ebd68d9
- **Severity**: LOW
- **Category**: Easing & physicality
- **Estimated scope**: 1 file (`src/components/layout/Sidebar.tsx`), 2 lines
  (+1 token in `src/index.css`)

## Problem

The mobile drawer (`src/components/layout/Sidebar.tsx:39,48`) uses Tailwind's
default curve (an ease-in-out-ish `cubic-bezier(0.4, 0, 0.2, 1)`) and default
150ms duration:

```tsx
// src/components/layout/Sidebar.tsx:39 — current
"fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden",

// src/components/layout/Sidebar.tsx:48 — current
"fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0",
```

An entering panel should lead with ease-out. Drawers get a 200–500ms budget;
150ms makes the 288px panel feel abrupt, and the default curve stalls at the
start of the slide.

## Target

- Panel: `duration-300` with the iOS-like drawer curve
  `cubic-bezier(0.32, 0.72, 0, 1)` (audit spec's `--ease-drawer`).
- Backdrop: `duration-200` with `ease-out`.

```css
/* src/index.css — add inside the existing `:root` block at line 20-24 */
:root {
  /* ...existing font vars... */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```

```tsx
// src/components/layout/Sidebar.tsx:39 — target
"fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 ease-out lg:hidden",

// src/components/layout/Sidebar.tsx:48 — target
"fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-300 ease-[var(--ease-drawer)] lg:translate-x-0",
```

## Repo conventions to follow

- Global tokens live in `src/index.css` `:root` (see font vars at lines 20-24).
- Tailwind 4 arbitrary value syntax `ease-[var(--ease-drawer)]` — no config
  file changes needed.

## Steps

1. `src/index.css` — add `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);` to
   the `:root` block (line 20-24).
2. `src/components/layout/Sidebar.tsx:39` — append
   `duration-200 ease-out` to the backdrop's className string.
3. `src/components/layout/Sidebar.tsx:48` — append
   `duration-300 ease-[var(--ease-drawer)]` to the panel's className string.

## Boundaries

- Do NOT touch the desktop (`lg:`) behavior — the drawer is mobile-only motion.
- Do NOT change translate values or the open/close logic in `AppLayout`.
- If excerpts don't match (drift since `ebd68d9`), STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit -p .` passes; `npm run build` succeeds.
- **Feel check**: at a mobile viewport (DevTools device mode), tap the
  hamburger:
  - Panel glides out over ~300ms, fast at the start, settling gently — no
    stall at the start, no abrupt stop.
  - Backdrop fades slightly quicker than the panel moves.
  - Closing feels the same speed (300ms is symmetric here — correct for a
    dismissible drawer, not a press-and-release interaction).
- **Done when**: the drawer reads as a smooth sheet, not a snap.
