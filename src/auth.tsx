import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { USERS, canAccess, type WWWUser, type Role } from "./users";
import { signupAccount, verifyCredentials, accountToUser } from "./users";
import { appendAudit } from "./utils/audit";

// ============================================================================
// Multi-user auth with role gating + concurrent session cap (RFD §2.3).
// ponytail: localStorage sessions = demo stand-in for server JWT sessions.
// Same shapes (SessionRecord) so the backend swap is storage-only.
// No idle logout: sessions are manual-only (see Removal of 15m auto-lock).
// ============================================================================

const SESSIONS_KEY = "www-sessions";
export const MAX_CONCURRENT_SESSIONS = 5;

export interface SessionRecord {
  sessionId: string;
  user: WWWUser;
  deviceLabel: string;
  startedAt: string;
}

function loadSessions(): SessionRecord[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]") as SessionRecord[];
  } catch {
    return [];
  }
}

function saveSessions(list: SessionRecord[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

function currentSessionId(): string | null {
  try {
    return sessionStorage.getItem("www-session-id");
  } catch {
    return null;
  }
}

interface AuthContextValue {
  isAuthenticated: boolean;
  currentUser: WWWUser | null;
  sessions: SessionRecord[];
  /** Returns error string or "" on success (demo role-picker login) */
  login: (userId: string) => string;
  /** Email + password login for signed-up accounts. Returns error string or "". */
  loginWithEmail: (email: string, password: string) => Promise<string>;
  /** Create a new account. Returns error string or "". */
  signup: (input: {
    name: string;
    email: string;
    role: Role;
    password: string;
  }) => Promise<string>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionRecord[]>(loadSessions);

  // Keep only live sessions for this browser tab
  useEffect(() => {
    const sid = currentSessionId();
    if (!sid) return;
    if (!loadSessions().some((s) => s.sessionId === sid)) {
      sessionStorage.removeItem("www-session-id");
    }
  }, []);

  const mine = useMemo(
    () => sessions.find((s) => s.sessionId === currentSessionId()) ?? null,
    [sessions]
  );

  const startSession = useCallback((user: WWWUser): string => {
    let list = loadSessions();
    const cutoff = Date.now() - 12 * 3600_000;
    list = list.filter((s) => new Date(s.startedAt).getTime() > cutoff);

    if (list.length >= MAX_CONCURRENT_SESSIONS && !currentSessionId()) {
      appendAudit("unlock", "Session", user.id, "rejected — sessions exhausted");
      return `SESSIONS_EXHAUSTED — ${MAX_CONCURRENT_SESSIONS} users already signed in.`;
    }
    const rec: SessionRecord = {
      sessionId: crypto.randomUUID(),
      user,
      deviceLabel: navigator.userAgent.includes("Mobile") ? "Mobile device" : "Workstation",
      startedAt: new Date().toISOString(),
    };
    list.push(rec);
    saveSessions(list);
    setSessions(list);
    try {
      sessionStorage.setItem("www-session-id", rec.sessionId);
    } catch {
      /* ignore */
    }
    appendAudit("unlock", "Session", user.id, `${user.name} (${user.role})`);
    return "";
  }, []);

  const login = useCallback((userId: string): string => {
    const user = USERS.find((u) => u.id === userId);
    if (!user) return "Unknown user.";
    return startSession(user);
  }, [startSession]);

  const loginWithEmail = useCallback(
    async (email: string, password: string): Promise<string> => {
      const acc = await verifyCredentials(email, password);
      if (!acc) return "Invalid email or password.";
      const err = startSession(accountToUser(acc));
      if (err) return err;
      if (!acc.verified) {
        // ponytail: demo auto-verifies after first successful login (no mail
        // backend). Server sends a verification link and gates here until
        // clicked.
        const list = (JSON.parse(localStorage.getItem("www-accounts") ?? "[]") as {
          id: string;
          verified: boolean;
        }[]).map((a) => (a.id === acc.id ? { ...a, verified: true } : a));
        try {
          localStorage.setItem("www-accounts", JSON.stringify(list));
        } catch {
          /* ignore */
        }
      }
      return "";
    },
    [startSession]
  );

  const signup = useCallback(
    async (input: { name: string; email: string; role: Role; password: string }): Promise<string> => {
      const res = await signupAccount(input);
      if (!res.ok) return res.error ?? "Signup failed.";
      // ponytail: auto-login after demo signup; server would require email
      // verification first.
      return startSession(accountToUser(res.account!));
    },
    [startSession]
  );

  const logout = useCallback(() => {
    const sid = currentSessionId();
    if (sid) {
      const rec = loadSessions().find((s) => s.sessionId === sid);
      if (rec) appendAudit("delete", "Session", rec.user.id, `${rec.user.name} signed out`);
      const next = loadSessions().filter((s) => s.sessionId !== sid);
      saveSessions(next);
      setSessions(next);
    }
    try {
      sessionStorage.removeItem("www-session-id");
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: !!mine,
      currentUser: mine?.user ?? null,
      sessions,
      login,
      loginWithEmail,
      signup,
      logout,
    }),
    [mine, sessions, login, loginWithEmail, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** Role-aware route guard (RFD §8.2 — server enforces; this is UX-level) */
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
// RouteAuthenticationGate — wraps RequireAuth children; forces re-auth for
// sensitive routes when the session is older than AUTH_MAX_AGE_MS.
// ponytail: demo re-auth = gesture-only (no password); server impl prompts for
// credentials. Age-based step-up, not idle-kill, preserves UX per removal of
// the 15m auto-lock.
// ============================================================================

const AUTH_MAX_AGE_MS = 8 * 3600_000; // 8h session lifetime before step-up
const SENSITIVE_PATHS = ["/orders"];

export function RouteAuthenticationGate() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const sid = currentSessionId();
  const session = useMemo(
    () => (sid ? loadSessions().find((s) => s.sessionId === sid) ?? null : null),
    [sid]
  );

  if (!currentUser) return <Navigate to="/login" replace />;

  const needsStepUp =
    session && SENSITIVE_PATHS.some((p) => location.pathname.startsWith(p)) &&
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
            // ponytail: demo step-up = clear this tab's binding; server would
            // prompt for credentials without dropping the session.
            try { sessionStorage.removeItem("www-session-id"); } catch { /* ignore */ }
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
