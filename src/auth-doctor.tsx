import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { sha256Hex } from "./utils/crypto";
import { appendAudit } from "./utils/audit";

// ============================================================================
// Doctor-code gate (RFD §5) — per-page, session-scoped unlock for sensitive
// screens (Orders, Lab Results, Medical History). Unlocking one page does NOT
// open the others (spec 2026-09-28: "the lab results page is not encrypted").
// ponytail: code hash stored in localStorage; server-side auth replaces this
// in production. 5 wrong attempts → 15-minute lockout, per RFD AC-7.
// Idle auto-lock (15m) intentionally removed — sessions stay open until the
// user signs out; re-auth for Orders is handled at the route level instead.
// ============================================================================

const CODE_HASH_KEY = "www-doctor-code-hash";
const UNLOCK_KEY = "www-page-unlocks"; // { sessionId, pages[] } — unlocks are per signed-in session
const LOCK_KEY = "www-orders-lockout";
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

interface DoctorCodeContextValue {
  isUnlocked: (page: string) => boolean;
  lockedUntil: number | null;
  attemptsLeft: number;
  /** Returns true on success */
  setCode: (code: string, page: string) => Promise<boolean>;
  unlock: (code: string, page: string) => Promise<boolean>;
  lock: (page: string) => void;
}

const Ctx = createContext<DoctorCodeContextValue | null>(null);

function getLock(): number | null {
  const v = localStorage.getItem(LOCK_KEY);
  return v ? Number(v) : null;
}

// Unlocks are bound to the active session so a doctor's unlock is not inherited
// by the next person who signs in on the same workstation.
function activeSessionId(): string {
  try {
    return sessionStorage.getItem("www-session-id") ?? "session";
  } catch {
    return "session";
  }
}

function getUnlocks(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(UNLOCK_KEY) ?? "null") as
      | { sessionId: string; pages: string[] }
      | null;
    return raw && raw.sessionId === activeSessionId() ? raw.pages : [];
  } catch {
    return [];
  }
}

function setUnlocks(pages: string[]): void {
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify({ sessionId: activeSessionId(), pages }));
  } catch {
    /* storage unavailable */
  }
}

export function DoctorCodeProvider({ children }: { children: ReactNode }) {
  const [unlockedPages, setUnlockedPages] = useState<string[]>(() =>
    (getLock() ?? 0) < Date.now() ? getUnlocks() : []
  );
  const [attempts, setAttempts] = useState(0);

  // ponytail: no idle re-lock. Orders re-auth is enforced by
  // RouteAuthenticationGate (route-level step-up), not a timer here.

  const setCode = useCallback(async (code: string, page: string) => {
    if (code.length < 8) return false;
    const hash = await sha256Hex(code);
    localStorage.setItem(CODE_HASH_KEY, hash);
    setUnlockedPages((cur) => {
      const next = [...new Set([...cur, page])];
      setUnlocks(next);
      return next;
    });
    appendAudit("unlock", "DoctorCode", "setup", `initial code set (${page})`);
    return true;
  }, []);

  const unlock = useCallback(async (code: string, page: string) => {
    const lock = getLock();
    if (lock && lock > Date.now()) return false;

    const hash = await sha256Hex(code);
    if (hash === localStorage.getItem(CODE_HASH_KEY)) {
      setUnlockedPages((cur) => {
        const next = [...new Set([...cur, page])];
        setUnlocks(next);
        return next;
      });
      setAttempts(0);
      appendAudit("unlock", page, "page");
      return true;
    }

    const n = attempts + 1;
    setAttempts(n);
    if (n >= MAX_ATTEMPTS) {
      localStorage.setItem(LOCK_KEY, String(Date.now() + LOCK_MINUTES * 60_000));
      appendAudit("unlock", page, "page", `locked ${LOCK_MINUTES}m after ${MAX_ATTEMPTS} failures`);
      setAttempts(0);
    }
    return false;
  }, [attempts]);

  const lock = useCallback((page: string) => {
    setUnlockedPages((cur) => {
      const next = cur.filter((p) => p !== page);
      setUnlocks(next);
      return next;
    });
  }, []);

  const isUnlocked = useCallback((page: string) => unlockedPages.includes(page), [unlockedPages]);

  return (
    <Ctx.Provider value={{ isUnlocked, lockedUntil: getLock(), attemptsLeft: MAX_ATTEMPTS - attempts, setCode, unlock, lock }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDoctorCode(): DoctorCodeContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDoctorCode must be used within DoctorCodeProvider");
  return ctx;
}

/** True when a doctor code has been provisioned at all */
export function hasDoctorCode(): boolean {
  try {
    return !!localStorage.getItem(CODE_HASH_KEY);
  } catch {
    return false;
  }
}
