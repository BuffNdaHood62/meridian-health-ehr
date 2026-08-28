import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured, requireSupabase } from "./lib/supabase";
import { canAccess, type Role, type WWWUser } from "./users";
import { AuthContext } from "./auth";

// ============================================================================
// Supabase-backed AuthProvider. Same public contract as the demo provider
// (useAuth / RequireAuth / canAccess keep working unchanged). auth.users +
// profiles handle credentials server-side (Argon2id, email confirmation); RLS
// enforces tenancy. currentUser is projected from the profiles row.
// ============================================================================

async function profileToUser(session: Session | null): Promise<WWWUser | null> {
  if (!session?.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", session.user.id)
    .maybeSingle();
  if (!data) return null;
  const name = data.full_name as string;
  return {
    id: data.id as string,
    name,
    role: data.role as Role,
    initials:
      name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") ||
      (session.user.email ?? "??").slice(0, 2).toUpperCase(),
  };
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<WWWUser | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      setCurrentUser(await profileToUser(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setCurrentUser(await profileToUser(s));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const c = requireSupabase();
    const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
    return error?.message ?? "";
  }, []);

  const signup = useCallback(
    async (input: { name: string; email: string; role: Role; password: string }) => {
      const c = requireSupabase();
      const { error } = await c.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: { data: { full_name: input.name.trim(), role: input.role } },
      });
      // ponytail: Supabase sends a verification email; the DB trigger creates the
      // profile. We do NOT auto-login — caller stays on /login until confirmed.
      return error?.message ?? "";
    },
    []
  );

  const logout = useCallback(() => {
    supabase.auth.signOut().catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated: !!session,
      currentUser,
      sessions: [],
      login: () => "Use email sign-in in backend mode.",
      loginWithEmail,
      signup,
      logout,
    }),
    [session, currentUser, loginWithEmail, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Re-exported so callers that imported canAccess from ./auth still resolve it
// through the backend module if needed.
export { canAccess };
