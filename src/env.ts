// ============================================================================
// Runtime mode contract (Phase 1: fail closed).
//
// `demo` is a build-time *capability*, not a default that survives a production
// build by accident. Resolution order:
//   1. VITE_APP_MODE, if explicitly set (`.env`, `.env.demo` via `--mode demo`).
//   2. `vite dev`  -> demo (zero-backend development must keep working).
//   3. `vite build` -> production.
// Production mode refuses to render without a configured backend, so a
// mis-deployed bundle cannot silently display fake patients to real clinicians.
// ============================================================================

export type AppMode = "demo" | "production";

const requested = (import.meta.env.VITE_APP_MODE as string | undefined) ?? "";

/** Pure so the fail-closed logic is unit-testable without env juggling. */
export function resolveMode(requested: string, isDev: boolean): AppMode {
  if (requested === "demo" || requested === "production") return requested;
  return isDev ? "demo" : "production";
}

export const APP_MODE: AppMode = resolveMode(requested, import.meta.env.DEV);

/** True when the fake-data layer may be used. False in production mode, always. */
export const DEMO_DATA_ALLOWED = APP_MODE === "demo";

/** Which blocking problems exist for a given mode. Pure predicate. */
export function modeProblems(mode: AppMode, backendConfigured: boolean): string[] {
  if (mode !== "production") return [];
  if (backendConfigured) return [];
  return [
    "Production mode requires a configured backend: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example)."
  ];
}

/**
 * Blocking startup checks. Non-empty means the bundle must not render the app.
 * main.tsx decides how to present the failure.
 */
export function runtimeProblems(backendConfigured: boolean): string[] {
  return modeProblems(APP_MODE, backendConfigured);
}
