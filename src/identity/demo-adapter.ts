import {
  USERS,
  accountToUser,
  markAccountVerified,
  signupAccount,
  verifyCredentials,
  type WWWUser,
} from "../users";
import { appendAudit } from "../utils/audit";
import type { AdapterOutcome, IdentityAdapter, SignupInput } from "./adapter";

// ============================================================================
// DemoIdentityAdapter — localStorage stand-in for GoTrue.
//
// Same responsibilities as the Supabase adapter: session lifecycle, an 8-hour
// step-up window, and an explicit account→user projection. What it does NOT do
// is verify passwords or second factors for step-up; that is why every UI
// surface reached from here says so (ADR-0003). Production mode never selects
// this adapter because it refuses to boot without a backend.
// ============================================================================

const SESSIONS_KEY = "www-sessions";
const SESSION_ID_KEY = "www-session-id";
export const MAX_CONCURRENT_SESSIONS = 5;
/** Sensitive routes need a check younger than this. Mirrors the SQL window. */
export const STEP_UP_MAX_AGE_MS = 8 * 3600_000;
/** Sessions older than this are dropped on the next sign-in. */
const SESSION_RETENTION_MS = 12 * 3600_000;

export interface SessionRecord {
  sessionId: string;
  user: WWWUser;
  email?: string;
  deviceLabel: string;
  startedAt: string;
}

function localStore(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

function loadSessions(): SessionRecord[] {
  try {
    return JSON.parse(localStore()?.getItem(SESSIONS_KEY) ?? "[]") as SessionRecord[];
  } catch {
    return [];
  }
}

function saveSessions(list: SessionRecord[]): void {
  try {
    localStore()?.setItem(SESSIONS_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

function currentSessionId(): string | null {
  try {
    return sessionStore()?.getItem(SESSION_ID_KEY) ?? null;
  } catch {
    return null;
  }
}

function currentSession(): SessionRecord | null {
  const sid = currentSessionId();
  if (!sid) return null;
  const rec = loadSessions().find((s) => s.sessionId === sid) ?? null;
  if (!rec) {
    try {
      sessionStore()?.removeItem(SESSION_ID_KEY);
    } catch {
      /* ignore */
    }
  }
  return rec;
}

function deviceLabel(): string {
  try {
    return typeof navigator !== "undefined" && navigator.userAgent.includes("Mobile")
      ? "Mobile device"
      : "Workstation";
  } catch {
    return "Workstation";
  }
}

function active(rec: SessionRecord): AdapterOutcome {
  return { kind: "active", user: rec.user, email: rec.email };
}

function startSession(user: WWWUser, email?: string): AdapterOutcome {
  if (!localStore() || !sessionStore()) {
    return { kind: "error", message: "Browser storage is unavailable, so a demo session cannot start." };
  }
  let list = loadSessions();
  const cutoff = Date.now() - SESSION_RETENTION_MS;
  list = list.filter((s) => new Date(s.startedAt).getTime() > cutoff);

  if (list.length >= MAX_CONCURRENT_SESSIONS && !currentSessionId()) {
    appendAudit("unlock", "Session", user.id, "rejected — sessions exhausted");
    return {
      kind: "error",
      message: `SESSIONS_EXHAUSTED — ${MAX_CONCURRENT_SESSIONS} users already signed in.`,
    };
  }

  const rec: SessionRecord = {
    sessionId: crypto.randomUUID(),
    user,
    email,
    deviceLabel: deviceLabel(),
    startedAt: new Date().toISOString(),
  };
  list.push(rec);
  saveSessions(list);
  try {
    sessionStore()?.setItem(SESSION_ID_KEY, rec.sessionId);
  } catch {
    /* ignore */
  }
  appendAudit("unlock", "Session", user.id, `${user.name} (${user.role})`);
  return active(rec);
}

function endSession(rec: SessionRecord, detail: string): void {
  appendAudit("delete", "Session", rec.user.id, `${rec.user.name} — ${detail}`);
  saveSessions(loadSessions().filter((s) => s.sessionId !== rec.sessionId));
  try {
    if (currentSessionId() === rec.sessionId) sessionStore()?.removeItem(SESSION_ID_KEY);
  } catch {
    /* ignore */
  }
}

async function restore(): Promise<AdapterOutcome> {
  const rec = currentSession();
  if (!rec) return { kind: "anonymous" };
  if (Date.now() - new Date(rec.startedAt).getTime() > SESSION_RETENTION_MS) {
    endSession(rec, "expired");
    return { kind: "expired", message: "Your demo session expired. Sign in again." };
  }
  return active(rec);
}

async function signIn(email: string, password: string): Promise<AdapterOutcome> {
  const account = await verifyCredentials(email, password);
  if (!account) return { kind: "error", message: "Invalid email or password." };
  // Demo accounts are auto-approved on first successful sign-in; the backend
  // path requires an admin approval (0008).
  markAccountVerified(account.id);
  return startSession(accountToUser(account), account.email);
}

async function signInAs(userId: string): Promise<AdapterOutcome> {
  const user = USERS.find((u) => u.id === userId);
  if (!user) return { kind: "error", message: "Unknown demo account." };
  return startSession(user);
}

async function verifyMfa(): Promise<AdapterOutcome> {
  return {
    kind: "error",
    message: "Demo mode has no second factor enrolled, so this screen is unavailable.",
  };
}

async function stepUp(_password: string, _code?: string): Promise<AdapterOutcome> {
  const rec = currentSession();
  if (!rec) return { kind: "expired", message: "Your demo session ended. Sign in again." };
  const next = loadSessions().map((s) =>
    s.sessionId === rec.sessionId ? { ...s, startedAt: new Date().toISOString() } : s
  );
  saveSessions(next);
  appendAudit("unlock", "Session", rec.user.id, "step-up acknowledged (demo: no credential checked)");
  return active(rec);
}

async function stepUpReason(): Promise<string | null> {
  const rec = currentSession();
  if (!rec) return null;
  if (Date.now() - new Date(rec.startedAt).getTime() > STEP_UP_MAX_AGE_MS) {
    return "Your demo session is more than 8 hours old. Sensitive actions need a fresh check.";
  }
  return null;
}

async function signup(input: SignupInput): Promise<AdapterOutcome> {
  const result = await signupAccount(input);
  if (!result.ok || !result.account) {
    return { kind: "error", message: result.error ?? "Signup failed." };
  }
  markAccountVerified(result.account.id);
  return startSession(accountToUser(result.account), result.account.email);
}

async function signOut(_scope?: "local" | "global"): Promise<void> {
  // Demo has no server-side sessions, so local and global are the same thing.
  const rec = currentSession();
  if (rec) {
    endSession(rec, "signed out");
    return;
  }
  try {
    sessionStore()?.removeItem(SESSION_ID_KEY);
  } catch {
    /* ignore */
  }
}

export function createDemoIdentityAdapter(): IdentityAdapter {
  return {
    mode: "demo",
    restore,
    signIn,
    signInAs,
    verifyMfa,
    stepUp,
    signup,
    signOut,
    stepUpReason,
  };
}
