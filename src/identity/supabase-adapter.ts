import type { Session } from "@supabase/supabase-js";
import { requireSupabase } from "../lib/supabase";
import type { Role, WWWUser } from "../users";
import type { AdapterOutcome, IdentityAdapter, SignupInput } from "./adapter";

// ============================================================================
// SupabaseIdentityAdapter — GoTrue credentials + TOTP, projected onto the
// app's profile row.
//
// Trust boundaries:
// - The client decides which screen to show; the server enforces access. RLS
//   helpers in 0008 fail closed for unverified/revoked profiles, and order
//   writes require a recent AAL2 `amr` entry.
// - An unverified or revoked profile is signed out immediately so this browser
//   never holds a token that predates the gate (0008 also neuters it server-side).
// ============================================================================

/** Mirrors the SQL `has_recent_mfa(p_max_age_seconds => 28800)` window. */
const STEP_UP_MAX_AGE_MS = 8 * 3600_000;
const MFA_METHODS = new Set(["totp", "webauthn"]);

const PENDING_MESSAGE =
  "Your account is waiting for administrator approval. You can sign in once access is granted.";
const REVOKED_MESSAGE = "Account access has been revoked. Contact an administrator.";
const NO_PROFILE_MESSAGE =
  "No staff profile is linked to this account. Contact an administrator.";
const SIGNUP_MESSAGE =
  "Check your email to confirm the address. An administrator must also approve access before you can sign in.";

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: Role;
  verified: boolean;
  disabled_at: string | null;
}

function toUser(profile: ProfileRow, email: string): WWWUser {
  const name = profile.full_name?.trim() || email || "Staff member";
  return {
    id: profile.id,
    name,
    role: profile.role,
    initials:
      name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || email.slice(0, 2).toUpperCase(),
  };
}

async function loadProfile(
  userId: string
): Promise<{ profile: ProfileRow | null; error: string | null }> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, role, verified, disabled_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { profile: null, error: error.message };
  return { profile: (data as ProfileRow | null) ?? null, error: null };
}

async function evaluate(session: Session | null): Promise<AdapterOutcome> {
  if (!session?.user) return { kind: "anonymous" };
  const client = requireSupabase();
  const email = session.user.email ?? "";

  const { profile, error } = await loadProfile(session.user.id);
  if (error) {
    return { kind: "error", message: `Could not load your staff profile: ${error}` };
  }
  if (!profile) {
    await client.auth.signOut({ scope: "local" });
    return { kind: "unverified", email, message: NO_PROFILE_MESSAGE };
  }
  if (profile.disabled_at) {
    await client.auth.signOut({ scope: "local" });
    return { kind: "unverified", email, message: REVOKED_MESSAGE };
  }
  if (!profile.verified) {
    await client.auth.signOut({ scope: "local" });
    return { kind: "unverified", email, message: PENDING_MESSAGE };
  }

  const { data: aal, error: aalError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) {
    return { kind: "error", message: `Could not read your second-factor status: ${aalError.message}` };
  }
  // `nextLevel === 'aal2'` means a verified factor exists. GoTrue promotes the
  // session only after verifyMfa().
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    return { kind: "mfa", email };
  }
  return { kind: "active", user: toUser(profile, email), email };
}

async function restore(): Promise<AdapterOutcome> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    return { kind: "expired", message: "Your session could not be restored. Sign in again." };
  }
  return evaluate(data.session);
}

async function signIn(email: string, password: string): Promise<AdapterOutcome> {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { kind: "error", message: error.message };
  return evaluate(data.session);
}

async function signInAs(): Promise<AdapterOutcome> {
  return {
    kind: "error",
    message: "Demo role sign-in is unavailable when a backend is configured. Use your email and password.",
  };
}

async function verifyMfa(code: string): Promise<AdapterOutcome> {
  const client = requireSupabase();
  const { data: factors, error } = await client.auth.mfa.listFactors();
  if (error) return { kind: "error", message: error.message };

  const factor = factors?.totp?.[0];
  if (!factor) {
    return { kind: "error", message: "No authenticator is enrolled for this account. Contact an administrator." };
  }

  const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) return { kind: "error", message: challenge.error.message };

  const verified = await client.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (verified.error) {
    return { kind: "error", message: "That code was not accepted. Wait for the next code and try again." };
  }

  const { data } = await client.auth.getSession();
  return evaluate(data.session);
}

async function stepUp(password: string, code?: string): Promise<AdapterOutcome> {
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  const session = data.session;
  if (!session?.user.email) return { kind: "anonymous" };
  if (!code?.trim()) {
    return { kind: "error", message: "Enter the 6-digit code from your authenticator app." };
  }

  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const alreadyVerified = aal?.currentLevel === "aal2";

  // A stale AAL2 session needs a fresh password + factor; an AAL1 session is
  // already password-authenticated and only needs the factor.
  if (alreadyVerified && !password) {
    return { kind: "error", message: "Enter your password to re-authenticate." };
  }
  if (password) {
    const { error } = await client.auth.signInWithPassword({
      email: session.user.email,
      password,
    });
    if (error) {
      return { kind: "error", message: "Your password was not accepted. Sign out if you have forgotten it." };
    }
  }

  return verifyMfa(code);
}

async function stepUpReason(): Promise<string | null> {
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  if (!data.session) return null;

  const { data: aal, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return "Could not verify your second-factor status. Sign in again.";
  if (!aal || aal.nextLevel !== "aal2") return null;
  if (aal.currentLevel !== "aal2") {
    return "Enter your authenticator code to continue.";
  }

  const latest = latestMfaTimestamp(aal.currentAuthenticationMethods ?? []);
  if (latest === null) {
    return "Could not confirm when your second factor was last used. Sign in again.";
  }
  if (Date.now() - latest * 1000 > STEP_UP_MAX_AGE_MS) {
    return "Your second-factor check is more than 8 hours old. Confirm it again to continue.";
  }
  return null;
}

/**
 * `amr` arrives either as RFC-8176 strings or as `{ method, timestamp }`
 * entries. Without a timestamp we cannot prove recency, so we fail closed and
 * ask for a fresh check rather than treating the method name as sufficient.
 */
function latestMfaTimestamp(methods: { method: string; timestamp: number }[] | string[]): number | null {
  let latest: number | null = null;
  for (const entry of methods) {
    if (typeof entry === "string") {
      if (MFA_METHODS.has(entry)) return null;
      continue;
    }
    if (!MFA_METHODS.has(entry.method)) continue;
    if (typeof entry.timestamp !== "number" || !Number.isFinite(entry.timestamp)) return null;
    latest = latest === null ? entry.timestamp : Math.max(latest, entry.timestamp);
  }
  return latest;
}

async function signup(input: SignupInput): Promise<AdapterOutcome> {
  const client = requireSupabase();
  const email = input.email.trim();
  const { error } = await client.auth.signUp({
    email,
    password: input.password,
    options: { data: { full_name: input.name.trim(), role: input.role } },
  });
  if (error) return { kind: "error", message: error.message };

  // The submitted role is a *request* (profiles.requested_role, 0008); the
  // account starts unverified. Drop any session GoTrue created so the browser
  // does not hold a token for an unapproved profile.
  await client.auth.signOut({ scope: "local" });
  return { kind: "unverified", email: email.toLowerCase(), message: SIGNUP_MESSAGE };
}

async function signOut(scope: "local" | "global" = "local"): Promise<void> {
  try {
    await requireSupabase().auth.signOut({ scope });
  } catch {
    /* network failure: the UI already dropped its state */
  }
}

export function createSupabaseIdentityAdapter(): IdentityAdapter {
  return {
    mode: "supabase",
    restore,
    subscribe(listener) {
      const { data } = requireSupabase().auth.onAuthStateChange((event) => {
        // Only SIGNED_OUT is pushed; the provider ignores it unless it is
        // currently in an active state, so pending/MFA flows are not clobbered.
        if (event === "SIGNED_OUT") listener({ kind: "anonymous" });
      });
      return () => data.subscription.unsubscribe();
    },
    signIn,
    signInAs,
    verifyMfa,
    stepUp,
    signup,
    signOut,
    stepUpReason,
  };
}
