import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ShieldCheck, Lock, User, Activity, HeartPulse, Fingerprint } from "lucide-react";
import { useAuth } from "../auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("s.chen");
  const [password, setPassword] = useState("••••••••••");
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      login();
      navigate(from, { replace: true });
    }, 600);
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
            <p className="text-lg font-bold leading-tight">Meridian Health</p>
            <p className="text-sm text-brand-100">Electronic Health Records</p>
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
          <ShieldCheck className="h-4 w-4" />
          SOC 2 Type II · HITRUST Certified · 256-bit encryption
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
              <p className="text-base font-bold text-slate-900">Meridian Health</p>
              <p className="text-xs text-brand-600">EHR Platform</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to your secure clinical workspace.</p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4" data-testid="login-form">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Username / Provider ID</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  data-testid="login-username"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200" />
              This is a trusted device
            </label>

            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-colors hover:bg-brand-700 disabled:opacity-70"
            >
              {loading ? "Authenticating…" : "Sign in securely"}
            </button>

            <button
              type="button"
              onClick={() => {
                login();
                navigate("/");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Fingerprint className="h-4 w-4 text-brand-600" />
              Enter Demo Workspace
            </button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <Lock className="h-3 w-3" /> Authorized personnel only · All access is logged & audited
          </p>
        </div>
      </div>
    </div>
  );
}
