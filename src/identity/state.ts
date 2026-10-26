import type { WWWUser } from "../users";

// ============================================================================
// Identity states — one explicit model instead of an isAuthenticated boolean.
// "password accepted but MFA pending" and "signed in but step-up required" are
// real states; collapsing them into booleans is what let the old client show a
// half-signed-in UI. Pure reducer so every transition is testable without React
// or a backend. Adapters (demo / Supabase) decide *which* event happened; this
// file decides what that event means.
// ============================================================================

export type IdentityStatus =
  | "anonymous"
  | "password_ok"
  | "unverified"
  | "active"
  | "step_up_required"
  | "expired";

export interface IdentitySnapshot {
  status: IdentityStatus;
  user: WWWUser | null;
  /** Email awaiting a second factor or approval; null once active. */
  email: string | null;
  /** Why the account is unverified/expired, or why step-up is required. */
  reason: string | null;
}

export const ANONYMOUS: IdentitySnapshot = {
  status: "anonymous",
  user: null,
  email: null,
  reason: null,
};

export type IdentityEvent =
  | { type: "mfa_challenge"; email: string }
  | { type: "signed_in"; user: WWWUser; email: string | null }
  | { type: "approval_required"; email: string; reason?: string | null }
  | { type: "step_up_required"; reason: string }
  | { type: "session_expired"; reason: string }
  | { type: "signed_out" };

export function identityReducer(state: IdentitySnapshot, event: IdentityEvent): IdentitySnapshot {
  switch (event.type) {
    case "mfa_challenge":
      return { status: "password_ok", user: null, email: event.email, reason: null };

    case "signed_in":
      return { status: "active", user: event.user, email: event.email, reason: null };

    case "approval_required":
      return { status: "unverified", user: null, email: event.email, reason: event.reason ?? null };

    case "step_up_required":
      // Step-up only makes sense for a signed-in session; anything else ignores
      // a late/duplicate gate check instead of resurrecting a dead session.
      if (state.status !== "active" && state.status !== "step_up_required") return state;
      return { ...state, status: "step_up_required", reason: event.reason };

    case "session_expired":
      return { status: "expired", user: null, email: state.email, reason: event.reason };

    case "signed_out":
      return ANONYMOUS;
  }
}

/** Is there a session whose user may see the app shell? */
export function isSignedIn(snapshot: IdentitySnapshot): boolean {
  return snapshot.status === "active" || snapshot.status === "step_up_required";
}

/** Is the user mid-flow (second factor or approval) rather than signed out? */
export function isPending(snapshot: IdentitySnapshot): boolean {
  return snapshot.status === "password_ok" || snapshot.status === "unverified";
}
