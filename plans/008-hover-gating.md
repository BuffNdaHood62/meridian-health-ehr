# 008 — Gate hover styles to pointer:fine devices

- **Status**: TODO
- **Commit**: ebd68d9
- **Severity**: LOW
- **Category**: Accessibility
- **Estimated scope**: 1 file (`src/index.css`), 3 lines

## Problem

~40 `hover:` variants across `src/` are ungated. On touch devices a tap can
leave a **sticky hover state** (the last-tapped button keeps its hover
background). This app ships a mobile bottom nav
(`src/components/layout/BottomNav.tsx`) and 44px touch targets, so touch is a
first-class surface.

## Target

Tailwind 4's documented way to make **all** `hover:` variants fire only on
devices that truly support hover — one variant override in `src/index.css`:

```css
/* src/index.css — add directly after `@import "tailwindcss";` (line 1) */
@custom-variant hover (@media (hover: hover) { &:hover });
```

No component changes — every existing `hover:bg-slate-50`,
`hover:text-brand-600`, etc. becomes pointer-fine-only automatically.

## Repo conventions to follow

- Tailwind 4 via `@import "tailwindcss"` (`src/index.css:1`); no
  `tailwind.config.js` — v4 customization lives in CSS, exactly like this.

## Steps

1. `src/index.css` — insert the `@custom-variant hover` line immediately
   after `@import "tailwindcss";`.

## Boundaries

- Do NOT remove or edit any `hover:` class in components.
- Do NOT touch `focus-visible` or `active` styles.
- Do NOT add `@media (hover: none)` rules — absence of hover is enough.
- If `src/index.css:1` doesn't read `@import "tailwindcss";` (drift since
  `ebd68d9`), STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit -p .` passes; `npm run build` succeeds
  (this validates the `@custom-variant` syntax against Tailwind 4).
- **Feel check**:
  - Desktop: hover styles behave exactly as before (sidebar rows, buttons,
    table rows).
  - DevTools device mode (touch): tap a sidebar nav row — after tapping
    elsewhere, no row stays "stuck" highlighted.
- **Done when**: desktop is unchanged and touch taps leave no sticky hover.
