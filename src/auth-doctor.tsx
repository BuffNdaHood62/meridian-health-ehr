import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { sha256Hex } from "./utils/crypto";
import { appendAudit } from "./utils/audit";

// ============================================================================
// Doctor-code gate (RFD §5) — session-scoped unlock for the Orders page.
// ponytail: code hash stored in localStorage; server-side auth replaces this
// in production. 5 wrong attempts → 15-minute lockout, per RFD AC-7.
// Idle auto-lock (15m) intentionally removed — sessions stay open until the
// user signs out; re-auth for Orders is handled at the route level instead.
// ============================================================================

const CODE_HASH_KEY = "www-doctor-code-hash";
const UNLOCK_KEY = "www-orders-unlocked";
const LOCK_KEY = "www-orders-lockout";
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

interface DoctorCodeContextValue {
  unlocked: boolean;
  lockedUntil: number | null;
  attemptsLeft: number;
  /** Returns true on success */
  setCode: (code: string) => Promise<boolean>;
  unlock: (code: string) => Promise<boolean>;
  lock: () => void;
}

const Ctx = createContext<DoctorCodeContextValue | null>(null);

function getLock(): number | null {
  const v = localStorage.getItem(LOCK_KEY);
  return v ? Number(v) : null;
}

export function DoctorCodeProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(
    () => localStorage.getItem(UNLOCK_KEY) === "1" && (getLock() ?? 0) < Date.now()
  );
  const [attempts, setAttempts] = useState(0);

  // ponytail: no idle re-lock. Orders re-auth is enforced by
  // RouteAuthenticationGate (route-level step-up), not a timer here.

  const setCode = useCallback(async (code: string) => {
    if (code.length < 8) return false;
    const hash = await sha256Hex(code);
    localStorage.setItem(CODE_HASH_KEY, hash);
    localStorage.setItem(UNLOCK_KEY, "1");
    setUnlocked(true);
    appendAudit("unlock", "DoctorCode", "setup", "initial code set");
    return true;
  }, []);

  const unlock = useCallback(async (code: string) => {
    const lock = getLock();
    if (lock && lock > Date.now()) return false;

    const hash = await sha256Hex(code);
    if (hash === localStorage.getItem(CODE_HASH_KEY)) {
      localStorage.setItem(UNLOCK_KEY, "1");
      setUnlocked(true);
      setAttempts(0);
      appendAudit("unlock", "Orders", "page");
      return true;
    }

    const n = attempts + 1;
    setAttempts(n);
    if (n >= MAX_ATTEMPTS) {
      localStorage.setItem(LOCK_KEY, String(Date.now() + LOCK_MINUTES * 60_000));
      appendAudit("unlock", "Orders", "page", `locked ${LOCK_MINUTES}m after ${MAX_ATTEMPTS} failures`);
      setAttempts(0);
    }
    return false;
  }, [attempts]);

  const lock = useCallback(() => {
    localStorage.removeItem(UNLOCK_KEY);
    setUnlocked(false);
  }, []);

  return (
    <Ctx.Provider value={{ unlocked, lockedUntil: getLock(), attemptsLeft: MAX_ATTEMPTS - attempts, setCode, unlock, lock }}>
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
