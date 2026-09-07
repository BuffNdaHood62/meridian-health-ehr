# 003 — Route-change fade: 0.35s → 0.2s

- **Status**: TODO
- **Commit**: ebd68d9
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file (`src/index.css`), 1 line

## Problem

`.animate-fade-in` runs on **every route change** (the app's most frequent
motion — `src/components/layout/AppLayout.tsx:25` wraps each page) and on
every modal open (`src/components/ui/Modal.tsx:93`):

```css
/* src/index.css:68-70 — current */
.animate-fade-in {
  animation: fade-in 0.35s ease-out both;
}
```

0.35s exceeds the 300ms UI budget and reads sluggish for something hit on
every navigation. Direction of travel is right (6px rise + fade, `ease-out`) —
only the duration is off.

## Target

```css
/* target */
.animate-fade-in {
  animation: fade-in 0.2s ease-out both;
}
```

## Repo conventions to follow

- Easing stays `ease-out` (correct for entering elements per audit spec).
- This class is shared by AppLayout + Modal; one edit fixes both.

## Steps

1. `src/index.css:69` — change `0.35s` to `0.2s`.

## Boundaries

- Do NOT touch `@keyframes fade-in` itself (the 6px offset stays).
- Do NOT add stagger to page content.
- If the file drifted from commit `ebd68d9`, locate by content.

## Verification

- **Mechanical**: `npx tsc --noEmit -p .` passes; `npm run build` succeeds.
- **Feel check**: run `npm run dev`, click through 5–6 sidebar routes quickly:
  - Page swap still eases in (no hard cut) but feels snappy, not floaty.
  - Open the compose modal on `/messages`: entrance is brisk.
- **Done when**: the fade is 200ms and navigation feels crisp.
