# 005 — Modal: add a fast exit transition

- **Status**: TODO
- **Commit**: ebd68d9
- **Severity**: MEDIUM
- **Category**: Interruptibility & timing
- **Estimated scope**: 1 file (`src/components/ui/Modal.tsx`), ~25 lines

## Problem

The modal enters with a fade+slide (`.animate-fade-in`, `Modal.tsx:93`) but
closes by **instant unmount** (`Modal.tsx:78` `if (!open) return null;` —
invoked synchronously from backdrop click `:83`, the X button `:105`, and the
Escape handler `:52`). The entry/exit asymmetry is correct in principle
(deliberate open, snappy close) — but an instant disappear-and-snap is jarring
rather than deliberate. The backdrop also vanishes with no transition.

## Target

A **150ms** closing fade driven by a React state: dialog fades to `opacity-0`
with a 2% scale-down, backdrop fades to `opacity-0`, then unmount after the
timeout. Exit is faster than entry (entry is 200ms after plan 003) — the
system snaps, the user's action doesn't linger.

## Repo conventions to follow

- The Modal is the single popup shell for the whole app (see header comment,
  `Modal.tsx:5-11`) — one edit fixes every popup (compose, reading pane,
  share, orders).
- Tailwind utilities only; `transition-opacity` / `transition-[opacity,transform]`
  match the GPU-only rule. `ease-out` for the exit.

## Steps

1. In `src/components/ui/Modal.tsx`, add a closing state + timer ref next to
   the existing ref:

   ```tsx
   const [closing, setClosing] = useState(false);
   const closeTimer = useRef<number | undefined>(undefined);

   const requestClose = () => {
     if (closing) return;
     setClosing(true);
     closeTimer.current = window.setTimeout(() => {
       setClosing(false);
       onClose();
     }, 150);
   };

   useEffect(() => () => window.clearTimeout(closeTimer.current), []);
   ```

   Import `useState` alongside `useEffect, useRef`.

2. Route ALL close paths through `requestClose`:
   - Escape keydown (`Modal.tsx:52-55`): replace `onClose()` with `requestClose()`.
   - Backdrop `onClick={onClose}` (`Modal.tsx:83`): → `onClick={requestClose}`.
   - X button `onClick={onClose}` (`Modal.tsx:105`): → `onClick={requestClose}`.

3. Add transition classes to the backdrop div (`Modal.tsx:82`):

   ```tsx
   className={cn(
     "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm transition-opacity duration-150 ease-out",
     closing ? "opacity-0" : "opacity-100"
   )}
   ```

4. Add transition classes to the dialog div (`Modal.tsx:92-96`), keeping
   `animate-fade-in` for entry:

   ```tsx
   className={cn(
     "flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl outline-none animate-fade-in",
     "transition-[opacity,transform] duration-150 ease-out",
     closing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100",
     sizeClass[size],
     className
   )}
   ```

## Boundaries

- Do NOT change focus-trap, scroll-lock, or aria logic.
- Do NOT touch `animate-fade-in` (entry stays CSS-driven; plan 003 tunes it).
- Do NOT animate `max-h`, `width`, or any layout property.
- Do NOT change other components that use `<Modal>`.
- If `Modal.tsx` doesn't match the cited lines (drift since `ebd68d9`),
  STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit -p .` passes; `npm run build` succeeds;
  `npm run test` stays 32/32.
- **Feel check**: open `/messages`, open the compose modal, then:
  - Close via X, backdrop, and Escape — each closes with a quick, even fade
    (~150ms); the dialog shrinks almost imperceptibly; no double-click ghost
    (rapid Escape spam never re-opens or flickers — `closing` guard).
  - Interaction during the 150ms exit is irrelevant (pointer-events effectively
    gone with opacity-0 backdrop) — confirm nothing errors if you click fast.
  - DevTools Animations at 10%: exit is opacity-only + 2% scale; no layout shift.
- **Done when**: every modal in the app closes with the same fast fade and
  focus restoration still works.
