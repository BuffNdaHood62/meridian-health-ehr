import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { USERS, type Role, type WWWUser } from "./users";
import { signupAccount, verifyCredentials, accountToUser } from "./users";
import { appendAudit } from "./utils/audit";
import { AuthContext } from "./auth";

// ============================================================================
// Demo AuthProvider — localStorage sessions stand-in for server JWT sessions.
// Used when Supabase is NOT configured (DEMO_MODE). Kept as the fallback so the
// app runs with zero backend. Backend impl: auth-supabase.tsx.
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

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionRecord[]>(loadSessions);

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

  const value = useMemo(
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
