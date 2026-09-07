# 002 — ProgressRing: make the draw-in animation actually run

- **Status**: TODO
- **Commit**: ebd68d9
- **Severity**: HIGH
- **Category**: Missed purpose (dead animation)
- **Estimated scope**: 1 file (`src/components/charts/Charts.tsx`), ~15 lines

## Problem

The ProgressRing component declares a draw-in transition that **never fires**:

```tsx
// src/components/charts/Charts.tsx:261-272 — current
<circle
  cx={size / 2}
  cy={size / 2}
  r={r}
  fill="none"
  stroke={color}
  strokeWidth={stroke}
  strokeDasharray={c}
  strokeDashoffset={offset}
  strokeLinecap="round"
  style={{ transition: "stroke-dashoffset 0.6s ease" }}
/>
```

`strokeDashoffset` is set to its final value on first render and never changes,
so there is nothing to transition — the ring renders static. The declared
animation is dead code, and its easing (`ease`) is too weak for a deliberate
reveal anyway.

## Target

On mount, start from a full circle (`strokeDashoffset = c` = empty ring), then
on the next frame settle to the target offset with a strong ease-out curve.
Honor reduced motion by skipping the draw.

Full replacement for the component body's render logic (keep the existing
props, `r`, `c`, `offset` math unchanged):

```tsx
// target — add near the top of the component, after `offset` is computed:
const [drawn, setDrawn] = useState(
  () => typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
);
useEffect(() => {
  if (drawn) return;
  const raf = requestAnimationFrame(() => setDrawn(true));
  return () => cancelAnimationFrame(raf);
}, [drawn]);

// and change the animated circle to:
<circle
  cx={size / 2}
  cy={size / 2}
  r={r}
  fill="none"
  stroke={color}
  strokeWidth={stroke}
  strokeDasharray={c}
  strokeDashoffset={drawn ? offset : c}
  strokeLinecap="round"
  style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.23, 1, 0.32, 1)" }}
/>
```

Imports: `Charts.tsx` currently does not import hooks — add
`import { useEffect, useState } from "react";` at the top.

## Repo conventions to follow

- Hand-rolled SVG charts, no chart library (`src/components/charts/Charts.tsx`
  header comment). Keep it that way — no Framer Motion, no CSS-in-JS.
- Strong ease-out curve per audit spec: `cubic-bezier(0.23, 1, 0.32, 1)`.

## Steps

1. Add the `useEffect, useState` import at the top of `src/components/charts/Charts.tsx`.
2. In the `ProgressRing` component (the one containing lines 261-272), add the
   `drawn` state + effect exactly as in the target block.
3. Change the circle's `strokeDashoffset` to `drawn ? offset : c` and the
   inline `style.transition` to the target string.

## Boundaries

- Do NOT touch other chart components in the file (Sparkline, etc.).
- Do NOT animate the percentage `<span>` counter.
- Do NOT change component props or markup structure.
- If the excerpt doesn't match (drift since `ebd68d9`), STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit -p .` passes; `npm run build` succeeds;
  `npm run test` stays 32/32.
- **Feel check**: open the Dashboard (ProgressRing usage):
  - Ring sweeps from empty to its value once on load, ~600ms, decelerating
    smoothly (no bounce, no linear feel).
  - DevTools → Animations panel at 10% speed: sweep starts at 0% and ends at
    the exact value; no jump or flicker.
  - Emulate `prefers-reduced-motion: reduce`: ring renders at final value
    immediately, no sweep.
- **Done when**: the ring visibly draws itself once per mount and respects
  reduced motion.
