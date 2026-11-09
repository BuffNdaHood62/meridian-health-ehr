import type { Role, WWWUser } from "../users";

// ============================================================================
// IdentityAdapter — the only place auth mechanism specifics live.
//
// The UI consumes `useAuth()` (src/auth.tsx), which owns the state machine and
// maps these outcomes onto it. Swapping Supabase for another IdP means writing
// one more adapter, not touching a page. See docs/adr/0003.
// ============================================================================

/** Every adapter method resolves to one of these; errors are values, not throws. */
export type AdapterOutcome =
  | { kind: "anonymous" }
  | { kind: "mfa"; email: string }
  | { kind: "active"; user: WWWUser; email?: string }
  | { kind: "unverified"; email: string; message: string }
  | { kind: "expired"; message: string }
  | { kind: "error"; message: string };

export interface SignupInput {
  name: string;
  email: string;
  role: Role;
  password: string;
}

/** Second-factor state, as the Settings screen needs to report it honestly. */
export interface MfaFactorInfo {
  id: string;
  friendlyName: string;
  type: "totp" | "webauthn" | string;
  verified: boolean;
}

export interface MfaStatus {
  /** False when the mechanism cannot exist here at all (demo mode). */
  available: boolean;
  factors: MfaFactorInfo[];
  /** Current authenticator assurance level, or "unknown" if the check failed. */
  aal: "aal1" | "aal2" | "unknown";
  /**
   * Minutes for which a fresh verification keeps sensitive writes allowed.
   * The server enforces its own window; this is display copy only.
   */
  stepUpWindowMinutes: number;
  error: string;
}

export interface MfaEnrollment {
  factorId: string;
  /** Base32 secret for people who prefer typing a setup key. */
  secret: string;
  /** GoTrue hands back a data: URI — no QR library needed. */
  qrDataUri: string;
  error: string;
}

export interface ActionError {
  error: string;
}

export interface IdentityAdapter {
  /** Which mechanism is live. UI copy branches on this, never on env guesses. */
  readonly mode: "demo" | "supabase";

  /** Rehydrate the current session on app start. */
  restore(): Promise<AdapterOutcome>;

  /**
   * Optional push updates (e.g. GoTrue SIGNED_OUT after a token refresh fails).
   * The provider only honours `anonymous`; everything else comes from an
   * explicit call so a mid-flow event cannot overwrite pending state.
   */
  subscribe?(listener: (outcome: AdapterOutcome) => void): () => void;

  signIn(email: string, password: string): Promise<AdapterOutcome>;

  /** Demo role picker. Backend adapters refuse it. */
  signInAs(userId: string): Promise<AdapterOutcome>;

  /** Complete a second-factor challenge after `signIn` returned `mfa`. */
  verifyMfa(code: string): Promise<AdapterOutcome>;

  /**
   * Re-establish a recent authentication for a sensitive action.
   * `password` is empty only when the adapter can prove the session is already
   * password-authenticated and a TOTP challenge alone is enough.
   */
  stepUp(password: string, code?: string): Promise<AdapterOutcome>;

  signup(input: SignupInput): Promise<AdapterOutcome>;

  signOut(scope?: "local" | "global"): Promise<void>;

  /** Non-null when a sensitive action needs step-up; the string is the reason. */
  stepUpReason(): Promise<string | null>;

  mfaStatus(): Promise<MfaStatus>;

  /** Creates an UNVERIFIED factor; `verifyMfaEnrollment` is what commits it. */
  enrollMfa(friendlyName: string): Promise<MfaEnrollment>;

  verifyMfaEnrollment(factorId: string, code: string): Promise<ActionError>;

  /**
   * Credentials belong to the IdP, so this can fail for reasons the UI cannot
   * inspect (GoTrue requires a recent sign-in). Surface the message, do not
   * paper over it.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<ActionError>;
}
