// ============================================================================
// User directory + roles (RFD §2.2)
// ============================================================================

import { sha256Hex } from "./utils/crypto";
export type Role = "doctor" | "nurse" | "reception" | "admin" | "lab";

export interface WWWUser {
  id: string;
  name: string;
  role: Role;
  initials: string;
}

// ponytail: hardcoded directory until backend identity exists; passwords not
// checked (demo). Server auth replaces this wholesale.
export const USERS: WWWUser[] = [
  { id: "PHY-0142", name: "Dr. Sarah Chen", role: "doctor", initials: "SC" },
  { id: "NUR-0307", name: "Nurse Patel", role: "nurse", initials: "NP" },
  { id: "RCP-0101", name: "Ana Reyes", role: "reception", initials: "AR" },
  { id: "ADM-0001", name: "Facility Admin", role: "admin", initials: "FA" },
  { id: "LAB-0022", name: "Lab Tech Osei", role: "lab", initials: "LO" },
];

/** Which nav destinations each role may see (RFD §2.2 access levels) */
export const ROLE_ROUTES: Record<Role, string[]> = {
  doctor: ["/", "/patients", "/orders", "/labs", "/history", "/messages", "/settings"],
  nurse: ["/", "/patients", "/labs", "/history", "/messages", "/settings"],
  reception: ["/", "/patients", "/messages", "/settings"],
  admin: ["/", "/messages", "/settings"],
  lab: ["/", "/labs", "/messages", "/settings"],
};

export function canAccess(role: Role, pathname: string): boolean {
  const allowed = ROLE_ROUTES[role];
  if (pathname === "/") return true;
  return allowed.some((r) => r !== "/" && pathname.startsWith(r));
}

// ============================================================================
// Multi-account signup (demo, client-only).
// ponytail: no backend/DB in this repo. Accounts live in localStorage with a
// SHA-256 password hash (reuses sha256Hex from utils/crypto — mirrors the
// server shape so the swap is storage-only). Existing hardcoded USERS remain
// as the role directory for the demo login picker. Production model (org/
// members/roles) is documented in Documentation.md §Backend migration.
// ============================================================================

const ACCOUNTS_KEY = "www-accounts";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  pwHash: string;
  verified: boolean;
  createdAt: string;
}

function loadAccounts(): Account[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as Account[];
  } catch {
    return [];
  }
}

function saveAccounts(list: Account[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export function findAccountByEmail(email: string): Account | undefined {
  const norm = email.trim().toLowerCase();
  return loadAccounts().find((a) => a.email.toLowerCase() === norm);
}

export interface SignupResult {
  ok: boolean;
  error?: string;
  account?: Account;
}

// RFC-5322-lite: non-empty local@domain.tld
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signupAccount(input: {
  name: string;
  email: string;
  role: Role;
  password: string;
}): Promise<SignupResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const { role, password } = input;

  if (name.length < 2) return { ok: false, error: "Name is too short." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (password.length < 10) {
    return { ok: false, error: "Password must be at least 10 characters." };
  }
  // ponytail: basic weakness gate (no dependency). Server adds breached-password
  // check + Argon2id + full policy.
  const weak = /^(?:password|1234567890|qwerty|abcdefghij)$/i.test(password);
  if (weak) return { ok: false, error: "Choose a less common password." };
  if (findAccountByEmail(email)) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const account: Account = {
    id: `ACC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    name,
    email,
    role,
    pwHash: await sha256Hex(password),
    verified: false,
    createdAt: new Date().toISOString(),
  };
  const list = loadAccounts();
  list.push(account);
  saveAccounts(list);
  return { ok: true, account };
}

export async function verifyCredentials(email: string, password: string): Promise<Account | null> {
  const acc = findAccountByEmail(email);
  if (!acc) return null;
  const hash = await sha256Hex(password);
  return hash === acc.pwHash ? acc : null;
}

// Build a WWWUser from a signed-up account for the session layer.
export function accountToUser(acc: Account): WWWUser {
  return {
    id: acc.id,
    name: acc.name,
    role: acc.role,
    initials: acc.name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || acc.email.slice(0, 2).toUpperCase(),
  };
}
