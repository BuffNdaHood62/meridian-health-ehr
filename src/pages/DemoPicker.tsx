import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Fingerprint, Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth";
import { USERS, ROLE_ROUTES, type Role, type WWWUser } from "../users";
import { isSupabaseConfigured } from "../lib/supabase";
import { Avatar } from "../components/ui/Avatar";
import { Badge, type Tone } from "../components/ui/Badge";
import { cn } from "../utils/cn";

// ============================================================================
// Demo role picker — reached from Login's "Enter Demo Workspace" button.
// Selecting a role calls the same `login(userId)` the inline picker used, so
// behaviour is unchanged: it starts a demo session and returns to `from`.
// ============================================================================

// ponytail: presentational metadata only. Colours + blurbs live here rather than
// in users.ts because they are UI concerns, not domain data — promote them onto
// WWWUser the day the directory becomes server-driven.
const ROLE_META: Record<Role, { color: string; tone: Tone; blurb: string }> = {
  doctor: {
    color: "#13726c",
    tone: "brand",
    blurb: "Full chart access, order entry, and clinical review.",
  },
  nurse: {
    color: "#2563eb",
    tone: "blue",
    blurb: "Vitals, medication administration, and monitoring.",
  },
  reception: {
    color: "#7c3aed",
    tone: "violet",
    blurb: "Patient registry, scheduling, and the front desk.",
  },
  admin: {
    color: "#b45309",
    tone: "amber",
    blurb: "Facility oversight, staff messaging, and settings.",
  },
  lab: {
    color: "#0f766e",
    tone: "green",
    blurb: "Specimen results, critical flags, and reporting.",
  },
};

// Derived from ROLE_ROUTES so the copy can never drift from the authz rule
// that actually gates navigation (users.ts canAccess).
function accessList(role: Role): string {
  return ROLE_ROUTES[role]
    .filter((r) => r !== "/")
    .map((r) => r.slice(1))
    .join(", ");
}

export default function DemoPicker() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // ponytail: pre-selects the first account, matching the old inline picker, so
  // entering the demo stays a single click for the common case.
  const [selected, setSelected] = useState<WWWUser["id"]>(USERS[0]?.id ?? "");
  const [error, setError] = useState("");

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const enterWorkspace = () => {
    setError("");
    const err = login(selected);
    if (err) {
      setError(err);
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/login"
          data-testid="demo-back"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="mb-1 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Fingerprint className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Choose a demo role</h2>
          </div>
          <p className="mb-5 text-sm text-slate-500">
            Each role sees a different workspace. Pick one to explore with sample patient data.
          </p>

          {isSupabaseConfigured && (
            <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200" data-testid="demo-backend-notice">
              A backend is configured, so these demo accounts are disabled. Sign in with an email
              and password instead.
            </p>
          )}

          <div className="space-y-2" role="radiogroup" aria-label="Demo accounts" data-testid="demo-users">
            {USERS.map((u, i) => {
              const meta = ROLE_META[u.role];
              const isSelected = selected === u.id;
              return (
                <label
                  key={u.id}
                  data-testid={`demo-user-${u.id}`}
                  className={cn(
                    "animate-fade-in flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all duration-200",
                    isSelected
                      ? "border-brand-300 bg-brand-50 ring-2 ring-brand-100"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  )}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <input
                    type="radio"
                    name="demo-account"
                    value={u.id}
                    checked={isSelected}
                    onChange={() => setSelected(u.id)}
                    className="sr-only"
                  />
                  <Avatar initials={u.initials} color={meta.color} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{u.name}</span>
                      <Badge tone={meta.tone}>{u.role}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{meta.blurb}</span>
                    <span className="mt-1.5 block text-[11px] uppercase tracking-wide text-slate-400">
                      Access · {accessList(u.role)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {error && (
            <p
              className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
              data-testid="demo-error"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={enterWorkspace}
            disabled={!selected}
            data-testid="demo-submit"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-colors hover:bg-brand-700 disabled:opacity-70"
          >
            <Fingerprint className="h-4 w-4" /> Enter workspace
          </button>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <Lock className="h-3 w-3" /> <ShieldCheck className="h-3 w-3" /> Sample data only ·
          No real patient information
        </p>
      </div>
    </div>
  );
}
