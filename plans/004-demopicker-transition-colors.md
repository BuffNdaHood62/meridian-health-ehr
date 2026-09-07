# 004 — DemoPicker: replace transition-all with transition-colors

- **Status**: TODO
- **Commit**: ebd68d9
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 file (`src/pages/DemoPicker.tsx`), 1 token

## Problem

`src/pages/DemoPicker.tsx:117` uses `transition-all` on the role cards:

```tsx
// src/pages/DemoPicker.tsx:117 — current
"animate-fade-in flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all duration-200",
```

`transition-all` is unbounded: any property the browser changes on these cards
(border, shadow, layout) becomes animated, including non-GPU properties. The
cards' interactive feedback is color-only (border/background on hover+select),
so the fix is strictly narrowing.

## Target

```tsx
// target
"animate-fade-in flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors duration-200",
```

## Repo conventions to follow

- Every other interactive surface in the app already uses
  `transition-colors` (e.g. `src/pages/Messages.tsx:162`,
  `src/components/layout/Sidebar.tsx:90`). This edit makes DemoPicker match.

## Steps

1. `src/pages/DemoPicker.tsx:117` — replace `transition-all` with
   `transition-colors` in the className string.

## Boundaries

- Do NOT change any other class, markup, or the `animate-fade-in` on this line.
- Do NOT touch other pages.
- If line 117 doesn't match (drift since `ebd68d9`), locate by content.

## Verification

- **Mechanical**: `rg -n "transition-all" src` returns no matches.
  `npx tsc --noEmit -p .` passes; `npm run build` succeeds.
- **Feel check**: on the `/demo` role picker, hover and select cards — border
  and background still ease over 200ms; nothing else animates.
- **Done when**: no `transition-all` remains in `src/` and the picker feels
  identical.
