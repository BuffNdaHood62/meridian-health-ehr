import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { canAccess, type Role, type WWWUser } from "./users";
import { isSupabaseConfigured } from "./lib/supabase";
import { DemoAuthProvider } from "./auth-demo";
import { SupabaseAuthProvider } from "./auth-supabase";

// ============================================================================
// Shared auth surface for the EHR SPA.
// - AuthContext + useAuth: single contract used by every page.
// - AuthProvider: picks Supabase (real backend) when configured, else the demo
//   localStorage provider. Callers (App.tsx) import only from here.
// - RequireAuth / RouteAuthenticationGate: UX-level route guards (RFD §8.2). The
//   server remains the source of truth via RLS; these are defense-in-depth.
// ============================================================================

export interface AuthContextValue {
  isAuthenticated: boolean;
  currentUser: WWWUser | null;
  sessions: unknown[];
  /** Demo role-picker login; no-op message in backend mode. */
  login: (userId: string) => string;
  loginWithEmail: (email: string, password: string) => Promise<string>;
  signup: (input: { name: string; email: string; role: Role; password: string }) => Promise<string>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // ponytail: Supabase wins whenever env is present; otherwise the zero-backend
  // demo provider keeps the app runnable. DEMO_MODE (banner) is independent.
  return isSupabaseConfigured ? (
    <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
  ) : (
    <DemoAuthProvider>{children}</DemoAuthProvider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** Role-aware route guard (RFD §8.2 — server enforces via RLS; this is UX-level) */
export function RequireAuth() {
  const { isAuthenticated, currentUser } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!canAccess(currentUser.role, location.pathname)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-lg font-bold text-slate-900">Not available for your role</h1>
        <p className="text-sm text-slate-500">
          Your role ({currentUser.role}) does not have access to this page.
        </p>
      </div>
    );
  }
  return <Outlet />;
}

// ============================================================================
// RouteAuthenticationGate — forces re-auth for sensitive routes when the
// session is older than AUTH_MAX_AGE_MS. ponytail: in demo mode the gate is
// gesture-only; Supabase issues short-lived JWTs (jwt_expiry=3600) and refreshes
// them, so a real refresh failure already bounces the user. The 8h window here
// is an extra step-up signal layered on top of token expiry.
// ============================================================================

const AUTH_MAX_AGE_MS = 8 * 3600_000;
const SENSITIVE_PATHS = ["/orders"];

export function RouteAuthenticationGate() {
  const { currentUser } = useAuth();
  const location = useLocation();

  const sid = (() => {
    try {
      return sessionStorage.getItem("www-session-id");
    } catch {
      return null;
    }
  })();
  const session = useMemo(() => {
    if (!sid) return null;
    try {
      const list = JSON.parse(localStorage.getItem("www-sessions") ?? "[]") as {
        sessionId: string;
        startedAt: string;
      }[];
      return list.find((s) => s.sessionId === sid) ?? null;
    } catch {
      return null;
    }
  }, [sid]);

  if (!currentUser) return <Navigate to="/login" replace />;

  // ponytail: backend session age isn't tracked client-side; rely on Supabase
  // token refresh. Step-up for sensitive routes is enforced server-side by RLS
  // on /orders writes. The demo age check is intentionally skipped when backed.
  if (isSupabaseConfigured) return <Outlet />;

  const needsStepUp =
    session &&
    SENSITIVE_PATHS.some((p) => location.pathname.startsWith(p)) &&
    Date.now() - new Date(session.startedAt).getTime() > AUTH_MAX_AGE_MS;

  if (needsStepUp) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-lg font-bold text-slate-900">Re-authentication required</h1>
        <p className="max-w-sm text-sm text-slate-500">
          Your session is older than 8 hours. For security, sensitive actions require
          recent authentication. Sign out and back in to continue.
        </p>
        <button
          onClick={() => {
            try {
              sessionStorage.removeItem("www-session-id");
            } catch {
              /* ignore */
            }
            window.location.reload();
          }}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Continue
        </button>
      </div>
    );
  }

  return <Outlet />;
}
