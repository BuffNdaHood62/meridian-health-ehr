# 006 — Delete dead pulse-ring animation

- **Status**: TODO
- **Commit**: ebd68d9
- **Severity**: LOW
- **Category**: Dead code / cohesion
- **Estimated scope**: 1 file (`src/index.css`), −15 lines

## Problem

`src/index.css:72-86` defines `@keyframes pulse-ring` and `.animate-pulse-ring`:

```css
/* src/index.css:72-86 — current */
@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(220, 38, 38, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0);
  }
}

.animate-pulse-ring {
  animation: pulse-ring 2s infinite;
}
```

A repo-wide search for `pulse-ring` in `src/**/*.tsx` returns **zero usages** —
the class is orphaned (likely left over from the alerts work). It also animates
`box-shadow` (paint, not GPU) on an infinite loop — nothing should ship unused.

## Target

Both blocks deleted. No replacement.

## Repo conventions to follow

- `src/index.css` holds only live global styles; the only other custom
  keyframe (`fade-in`) is used by `Modal.tsx:93` and `AppLayout.tsx:25`.

## Steps

1. Open `src/index.css`, delete lines 72–86 (the `@keyframes pulse-ring`
   block and the `.animate-pulse-ring` rule), plus the blank line between
   them and `.animate-fade-in`'s section if it leaves a double blank line.

## Boundaries

- Do NOT touch `@keyframes fade-in` / `.animate-fade-in` (live code).
- Do NOT search for "other places to use pulse-ring" — deletion is the fix.
- If line numbers drift from commit `ebd68d9`, locate the blocks by content.

## Verification

- **Mechanical**: `rg -n "pulse-ring" src` returns no matches.
  `npm run build` succeeds.
- **Feel check**: n/a — pure deletion.
- **Done when**: `rg "pulse-ring" src` is empty and the build passes.

**Note**: execute this plan BEFORE plan 001 (001's media query references
`.animate-pulse-ring`; running 006 first makes 001 simpler).
