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
}
