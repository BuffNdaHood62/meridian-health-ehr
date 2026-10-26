import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth";

// ============================================================================
// /login/step-up — a sensitive route (/orders) asked for a fresher check.
//
// The adapter decides what "fresh" means:
// - Supabase: AAL2 plus a TOTP/WebAuthn `amr` entry younger than 8h. A stale
//   AAL2 session needs password + code; an AAL1 session only needs the code.
// - Demo: no credential is checked (there is no server to check it against).
//   The screen says so; it does not pretend to be MFA.
// ============================================================================

export default function LoginStepUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ready, mode, status, isAuthenticated, reason, stepUp, checkStepUp, logout } = useAuth();
  const [showForm, setShowForm] = useState(status === "step_up_required");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  useEffect(() => {
    if (!ready) return;
    if (status === "password_ok") {
      navigate("/login/mfa", { replace: true, state: { from } });
      return;
    }
    if (status === "unverified") {
      navigate("/login/pending", { replace: true });
      return;
    }
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }
    if (status === "step_up_required") {
      setShowForm(true);
      return;
    }

    let alive = true;
    checkStepUp().then((reason) => {
      if (!alive) return;
      if (reason) {
        setShowForm(true);
      } else {
        navigate(from, { replace: true });
      }
    });
    return () => {
      alive = false;
    };
  }, [ready, status, isAuthenticated, checkStepUp, navigate, from]);

  const complete = async (passwordValue: string, codeValue: string) => {
    setError("");
    setBusy(true);
    const message = await stepUp(passwordValue, codeValue);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    navigate(from, { replace: true });
  };

  const cancel = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (!ready || !showForm) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <p className="text-sm text-slate-500">Checking your session…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-bold text-slate-900">Confirm it&apos;s still you</h1>
            <p className="text-xs text-brand-600">Sensitive action</p>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600" data-testid="step-up-reason">
            {reason ?? "This action needs a recent authentication."}
          </p>

          {mode === "demo" ? (
            <>
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                Demo mode does not check a password or a second factor at this step. In a
                configured deployment this screen requires both.
              </p>
              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700" data-testid="step-up-error">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => complete("", "")}
                data-testid="step-up-demo-continue"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-colors hover:bg-brand-700 disabled:opacity-70"
              >
                <ShieldCheck className="h-4 w-4" /> Continue
              </button>
            </>
          ) : (
            <form
              className="space-y-4"
              data-testid="step-up-form"
              onSubmit={(event) => {
                event.preventDefault();
                void complete(password, code);
              }}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="step-up-password">
                  Password
                </label>
                <input
                  id="step-up-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  data-testid="step-up-password"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="step-up-code">
                  Authentication code
                </label>
                <input
                  id="step-up-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  data-testid="step-up-code"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700" data-testid="step-up-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !password || code.length !== 6}
                data-testid="step-up-submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-colors hover:bg-brand-700 disabled:opacity-70"
              >
                <ShieldCheck className="h-4 w-4" /> Continue
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={cancel}
            data-testid="step-up-cancel"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cancel and sign out
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          {mode === "demo"
            ? "Demo session · no real credentials are checked here"
            : "Order writes are also refused server-side without a recent second factor."}
        </p>
      </div>
    </div>
  );
}
