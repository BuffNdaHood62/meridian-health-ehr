import { createClient } from "@supabase/supabase-js";
import { DEMO_DATA_ALLOWED } from "../env";

// Client-safe only: VITE_ variables are public anon key + URL. Never expose the
// service_role key to the browser.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Lazy guard: if env missing we still export a client so imports don't crash in
// DEMO_MODE (where it's never called). Backend paths throw a clear error instead.
export const isSupabaseConfigured = Boolean(url && anon);

export const supabase = isSupabaseConfigured
  ? createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true } })
  : // ponytail: dummy client so types line up; backend calls are gated on isSupabaseConfigured
    (createClient("https://placeholder.supabase.co", "placeholder-anon-key") as ReturnType<typeof createClient>);

export function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env (see .env.example).");
  }
  return supabase;
}

// ============================================================================
// Backend gate (Phase 1: fail closed)
// ============================================================================
//
// The data layer used to answer "no backend? hand back mockData", which means a
// mis-deployed production bundle serves invented patients to real clinicians and
// looks healthy. In production mode that fallback is gone: callers must either
// reach the backend or surface a hard error.

/** Whether the fake-data layer may serve reads/writes at all. */
export function demoDataAllowed(): boolean {
  return DEMO_DATA_ALLOWED;
}

/**
 * Either give me a real client, or throw with an operator-actionable message.
 * `context` names the failing screen/query so the error is diagnosable without
 * leaking PHI into logs.
 */
export function requireBackend(context: string) {
  if (!isSupabaseConfigured) {
    throw new Error(
      `[${context}] No backend configured. This build runs in production mode, so mock data is not served. ` +
        `Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or build the demo artifact with \`npm run build:demo\`.`
    );
  }
  return supabase;
}
