import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth";
import { SUPPORT_EMAIL } from "../config";

// ============================================================================
// /login/pending — the password was correct, but the profile is not approved
// (or access was revoked). The adapter has already dropped any Supabase token;
// this screen never grants access, it only explains the next step.
// ============================================================================

export default function PendingApproval() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ready, isAuthenticated, pendingEmail, reason, logout } = useAuth();

  const state = (location.state ?? {}) as { email?: string; created?: boolean };
  const email = pendingEmail ?? state.email ?? null;
  const hasPending = Boolean(email);

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated) {
      navigate("/", { replace: true });
    } else if (!hasPending) {
      navigate("/login", { replace: true });
    }
  }, [ready, isAuthenticated, hasPending, navigate]);

  const backToSignIn = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Render nothing while redirecting: an approved user or a direct visit with no
  // pending session must never see this card, even for a frame.
  if (!ready || isAuthenticated || !hasPending) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="pending-approval">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-bold text-slate-900">
              {state.created ? "Account created" : "Awaiting approval"}
            </h1>
          </div>

          <p className="text-sm text-slate-600" data-testid="pending-reason">
            {reason ?? "An administrator must approve your account before you can sign in."}
          </p>

          {email && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              Account: <span className="font-semibold text-slate-800" data-testid="pending-email">{email}</span>
            </p>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Once you have been approved, sign in again. Approval is handled by your facility administrator.
          </p>

          <button
            type="button"
            onClick={backToSignIn}
            data-testid="pending-signin"
            className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-colors hover:bg-brand-700"
          >
            <ShieldCheck className="h-4 w-4" /> Back to sign in
          </button>

          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            data-testid="pending-support"
            className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Mail className="h-4 w-4" /> Contact support
          </a>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <Lock className="h-3 w-3" /> No clinical data is accessible until approval.
        </p>
      </div>
    </div>
  );
}
