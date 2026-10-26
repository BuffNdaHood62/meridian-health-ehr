import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth";

// ============================================================================
// /login/mfa — reached when the password was accepted but GoTrue reports a
// verified TOTP factor and an AAL1 session. The state machine sends the user
// here from any protected route, so a refresh cannot skip the factor.
// ============================================================================

export default function LoginMfa() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ready, status, pendingEmail, verifyMfa, logout } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  useEffect(() => {
    if (!ready) return;
    if (status === "active" || status === "step_up_required") {
      navigate(from, { replace: true });
    } else if (status === "unverified") {
      navigate("/login/pending", { replace: true });
    } else if (status !== "password_ok") {
      navigate("/login", { replace: true });
    }
  }, [ready, status, from, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const message = await verifyMfa(code);
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

  if (!ready || status !== "password_ok") return <div className="min-h-screen bg-slate-50" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-bold text-slate-900">Two-factor check</h1>
            <p className="text-xs text-brand-600">Wellness with Writingale EMR</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          data-testid="mfa-form"
        >
          <p className="text-sm text-slate-600">
            Enter the 6-digit code from your authenticator app
            {pendingEmail ? (
              <>
                {" "}
                for <span className="font-semibold text-slate-800">{pendingEmail}</span>.
              </>
            ) : (
              "."
            )}
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="mfa-code">
              Authentication code
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              data-testid="mfa-code"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {error && (
            <p
              className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
              data-testid="mfa-error"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || code.length !== 6}
            data-testid="mfa-submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-colors hover:bg-brand-700 disabled:opacity-70"
          >
            <ShieldCheck className="h-4 w-4" /> Verify
          </button>

          <button
            type="button"
            onClick={cancel}
            data-testid="mfa-cancel"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cancel and sign out
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          The backend refuses clinical access until this factor is verified.
        </p>
      </div>
    </div>
  );
}
