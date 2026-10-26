import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { canAccess, type WWWUser } from "./users";
import { isSupabaseConfigured } from "./lib/supabase";
import { createDemoIdentityAdapter } from "./identity/demo-adapter";
import { createSupabaseIdentityAdapter } from "./identity/supabase-adapter";
import type { AdapterOutcome, IdentityAdapter, SignupInput } from "./identity/adapter";
import {
  ANONYMOUS,
  identityReducer,
  isPending,
  isSignedIn,
  type IdentityEvent,
  type IdentityStatus,
} from "./identity/state";

// ============================================================================
// Shared auth surface for the EHR SPA.
// - The state machine (identity/state.ts) is the source of truth for "what can
//   this session do"; adapters own the mechanism (GoTrue or localStorage).
// - Pages keep consuming useAuth(); they never import an adapter.
// - RequireAuth / RouteAuthenticationGate are UX guards. The server (RLS +
//   has_recent_mfa in 0008) remains authoritative.
// ============================================================================

export type AuthNext = "app" | "mfa" | "pending" | "none";

export interface AuthResult {
  error: string;
  next: AuthNext;
}

export interface AuthContextValue {
  /** False while the adapter is rehydrating the session. */
  ready: boolean;
  /** Which mechanism is live; UI copy branches on this, not on env guesses. */
  mode: IdentityAdapter["mode"];
  status: IdentityStatus;
  isAuthenticated: boolean;
  currentUser: WWWUser | null;
  pendingEmail: string | null;
  reason: string | null;
  /** Demo role picker. Resolves to an error message or "". */
  login: (userId: string) => Promise<string>;
  loginWithEmail: (email: string, password: string) => Promise<AuthResult>;
  /** Resolves to an error message or "". */
  verifyMfa: (code: string) => Promise<string>;
  /** Resolves to an error message or "". */
  stepUp: (password: string, code?: string) => Promise<string>;
  /** Resolves to the reason step-up is needed, or null. */
  checkStepUp: () => Promise<string | null>;
  signup: (input: SignupInput) => Promise<AuthResult>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const defaultAdapter: IdentityAdapter = isSupabaseConfigured
  ? createSupabaseIdentityAdapter()
  : createDemoIdentityAdapter();

function outcomeToEvent(outcome: AdapterOutcome): IdentityEvent | null {
  switch (outcome.kind) {
    case "anonymous":
      return { type: "signed_out" };
    case "mfa":
      return { type: "mfa_challenge", email: outcome.email };
    case "active":
      return { type: "signed_in", user: outcome.user, email: outcome.email ?? null };
    case "unverified":
      return { type: "approval_required", email: outcome.email, reason: outcome.message };
    case "expired":
      return { type: "session_expired", reason: outcome.message };
    case "error":
      return null;
  }
}

export function AuthProvider({
  children,
  adapter = defaultAdapter,
}: {
  children: ReactNode;
  adapter?: IdentityAdapter;
}) {
  const [state, dispatch] = useReducer(identityReducer, ANONYMOUS);
  const [ready, setReady] = useState(false);

  // Read by the adapter's push callback without re-subscribing every render.
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  const applyOutcome = useCallback((outcome: AdapterOutcome): AuthResult => {
    const event = outcomeToEvent(outcome);
    if (event) dispatch(event);
    switch (outcome.kind) {
      case "active":
        return { error: "", next: "app" };
      case "mfa":
        return { error: "", next: "mfa" };
      case "unverified":
        return { error: "", next: "pending" };
      case "error":
        return { error: outcome.message, next: "none" };
      case "expired":
        return { error: outcome.message, next: "none" };
      case "anonymous":
        return { error: "", next: "none" };
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setReady(false);
    adapter
      .restore()
      .then((outcome) => {
        if (!alive) return;
        const event = outcomeToEvent(outcome);
        if (event) dispatch(event);
        setReady(true);
      })
      .catch(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [adapter]);

  useEffect(() => {
    if (!adapter.subscribe) return;
    return adapter.subscribe((outcome) => {
      // Only an externally ended session may overwrite UI state. A SIGNED_OUT
      // fired while signing out an unverified profile must not erase the
      // pending screen, so we gate on the current status.
      if (outcome.kind !== "anonymous") return;
      if (statusRef.current === "active" || statusRef.current === "step_up_required") {
        dispatch({ type: "signed_out" });
      }
    });
  }, [adapter]);

  const login = useCallback(
    async (userId: string) => applyOutcome(await adapter.signInAs(userId)).error,
    [adapter, applyOutcome]
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string) =>
      applyOutcome(await adapter.signIn(email.trim(), password)),
    [adapter, applyOutcome]
  );

  const verifyMfa = useCallback(
    async (code: string) => {
      const outcome = await adapter.verifyMfa(code.trim());
      if (outcome.kind === "error") return outcome.message;
      applyOutcome(outcome);
      return outcome.kind === "active" ? "" : "That code was not accepted. Try again.";
    },
    [adapter, applyOutcome]
  );

  const stepUp = useCallback(
    async (password: string, code?: string) => {
      const outcome = await adapter.stepUp(password, code);
      if (outcome.kind === "error") return outcome.message;
      applyOutcome(outcome);
      return outcome.kind === "active" ? "" : "Your session is not fresh yet. Try again.";
    },
    [adapter, applyOutcome]
  );

  const checkStepUp = useCallback(async () => {
    try {
      const reason = await adapter.stepUpReason();
      if (reason) dispatch({ type: "step_up_required", reason });
      return reason;
    } catch {
      const reason = "Could not verify your session. Confirm your credentials to continue.";
      dispatch({ type: "step_up_required", reason });
      return reason;
    }
  }, [adapter]);

  const signup = useCallback(
    async (input: SignupInput) => applyOutcome(await adapter.signup(input)),
    [adapter, applyOutcome]
  );

  const logout = useCallback(() => {
    dispatch({ type: "signed_out" });
    adapter.signOut("local").catch(() => {});
  }, [adapter]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      mode: adapter.mode,
      status: state.status,
      isAuthenticated: isSignedIn(state),
      currentUser: state.user,
      pendingEmail: isPending(state) ? state.email : null,
      reason: state.reason,
      login,
      loginWithEmail,
      verifyMfa,
      stepUp,
      checkStepUp,
      signup,
      logout,
    }),
    [ready, adapter.mode, state, login, loginWithEmail, verifyMfa, stepUp, checkStepUp, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

function RestoringSession({ label = "Restoring your session…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center"
      data-testid="auth-restoring"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

/** Role-aware route guard (RFD §8.2 — server enforces via RLS; this is UX-level) */
export function RequireAuth() {
  const { ready, status, isAuthenticated, currentUser, reason } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!ready) return <RestoringSession />;
  if (status === "password_ok") {
    return <Navigate to="/login/mfa" replace state={{ from: location.pathname }} />;
  }
  if (status === "unverified") {
    return <Navigate to="/login/pending" replace />;
  }
  if (!isAuthenticated || !currentUser) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname, reason: status === "expired" ? reason : undefined }}
      />
    );
  }
  if (!canAccess(currentUser.role, location.pathname)) {
    // ponytail: this renders outside AppLayout, so there is no sidebar to escape
    // through — without these actions a denied user is stranded on a dead-end
    // page. "Go back" returns through history; "dashboard" is the always-safe
    // fallback for direct hits / empty history.
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
          <Lock className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Not available for your role</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your role ({currentUser.role}) does not have access to this page.
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            data-testid="role-denied-back"
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Go back
          </button>
          <Link
            to="/"
            data-testid="role-denied-dashboard"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }
  return <Outlet />;
}

// ============================================================================
// RouteAuthenticationGate — asks the adapter whether a sensitive route needs a
// fresher authentication. Demo: session older than 8h. Supabase: AAL2 with an
// `amr` timestamp older than 8h. The gate never decides on its own; the
// adapter (and SQL in 0008) own the rule.
// ============================================================================

const SENSITIVE_PATHS = ["/orders"];

export function RouteAuthenticationGate() {
  const { checkStepUp } = useAuth();
  const location = useLocation();
  const sensitive = SENSITIVE_PATHS.some((p) => location.pathname.startsWith(p));
  // Tie the result to the history entry that produced it. Otherwise navigating
  // from a safe page to /orders renders one frame of orders before the check
  // runs, and returning to the same pathname could reuse a stale result.
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [needsStepUp, setNeedsStepUp] = useState(false);

  useEffect(() => {
    if (!sensitive) {
      setCheckedKey(null);
      setNeedsStepUp(false);
      return;
    }
    let alive = true;
    setNeedsStepUp(false);
    checkStepUp().then((reason) => {
      if (!alive) return;
      setNeedsStepUp(!!reason);
      setCheckedKey(location.key);
    });
    return () => {
      alive = false;
    };
  }, [sensitive, location.key, location.pathname, checkStepUp]);

  if (sensitive && checkedKey !== location.key) {
    return <RestoringSession label="Checking whether this action needs a fresh sign-in…" />;
  }
  if (needsStepUp) {
    return <Navigate to="/login/step-up" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
