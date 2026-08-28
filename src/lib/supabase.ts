import { createClient } from "@supabase/supabase-js";

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
