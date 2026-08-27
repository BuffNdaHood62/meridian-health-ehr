import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ShieldCheck, Activity, HeartPulse, Fingerprint, Lock } from "lucide-react";
import { useAuth } from "../auth";
import { USERS } from "../users";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedUser, setSelectedUser] = useState(USERS[0].id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const doDemoLogin = () => {
    setError("");
    const err = login(selectedUser);
    if (err) {
      setError(err);
      return;
    }
    navigate(from, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const err = await loginWithEmail(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand / marketing panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v18M3 12h18" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold leading-tight">Wellness with Writingale</p>
            <p className="text-sm text-brand-100">Electronic Medical Records</p>
          </div>
        </div>

        <div className="relative space-y-8">
          <div>
            <h1 className="text-4xl font-bold leading-tight">
              One unified chart.<br />Better outcomes.
            </h1>
            <p className="mt-4 max-w-md text-brand-100">
              The clinical workspace trusted by 12,000+ providers for patient management,
              physician order entry, and longitudinal medical history.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {[
              { icon: Activity, label: "Real-time vitals & labs" },
              { icon: HeartPulse, label: "CPOE with safety checks" },
              { icon: ShieldCheck, label: "HIPAA-compliant access" },
              { icon: Fingerprint, label: "Role-based security" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur">
                <f.icon className="h-5 w-5 shrink-0 text-brand-100" />
                <span className="text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-sm text-brand-100">
          <ShieldCheck className="h-4 w-4" /> SOC 2 Type II · HITRUST Certified · 256-bit encryption
        </div>
      </div>

      {/* Login form */}
      <div className="flex w-full flex-col items-center justify-center bg-slate-50 px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18M3 12h18" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Wellness with Writingale</p>
              <p className="text-xs text-brand-600">EMR Platform</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to your secure clinical workspace.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" data-testid="login-form">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@clinic.org"
                data-testid="login-email"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                data-testid="login-password"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700" data-testid="login-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              data-testid="login-submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-colors hover:bg-brand-700 disabled:opacity-70"
            >
              Sign in securely
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or use a demo account
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="space-y-1.5" data-testid="login-users">
            {USERS.map((u) => (
              <label
                key={u.id}
                className={
                  "flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition-colors " +
                  (selectedUser === u.id
                    ? "border-brand-300 bg-brand-50 ring-2 ring-brand-100"
                    : "border-slate-200 bg-white hover:bg-slate-50")
                }
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="www-user"
                    value={u.id}
                    checked={selectedUser === u.id}
                    onChange={() => setSelectedUser(u.id)}
                    className="h-4 w-4 accent-[#13726c]"
                  />
                  <span className="font-medium text-slate-800">{u.name}</span>
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {u.role}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={doDemoLogin}
            data-testid="login-demo"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Fingerprint className="h-4 w-4 text-brand-600" /> Enter Demo Workspace
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            Need an account?{" "}
            <Link to="/signup" data-testid="login-to-signup" className="font-semibold text-brand-600 hover:text-brand-700">
              Create one
            </Link>
          </p>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <Lock className="h-3 w-3" /> Authorized personnel only · Sessions open until sign-out · All access logged & audited
          </p>
        </div>
      </div>
    </div>
  );
}
