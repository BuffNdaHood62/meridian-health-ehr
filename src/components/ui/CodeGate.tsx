import { useState } from "react";
import { LockKeyhole, ShieldX } from "lucide-react";
import { Card } from "./Card";
import { useDoctorCode, hasDoctorCode } from "../../auth-doctor";
import { useAuth } from "../../auth";

// Shared doctor-code unlock screen (extracted from Orders, RFD §5). `pageKey`
// is the per-page unlock slot; `page` names the gated screen in copy and test ids.
export function CodeGate({ pageKey, page, testId }: { pageKey: string; page: string; testId: string }) {
  const { currentUser } = useAuth();
  const { unlock, setCode, attemptsLeft, lockedUntil } = useDoctorCode();
  const [code, setLocal] = useState("");
  const [error, setError] = useState("");
  const locked = lockedUntil != null && lockedUntil > Date.now();

  // Fail closed: only doctors may provision or enter the code. Without this a
  // non-doctor reaching the gate before any code exists could set one themselves.
  if ((currentUser?.role ?? "doctor") !== "doctor") {
    return (
      <div className="mx-auto mt-16 max-w-sm" data-testid={testId}>
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <ShieldX className="h-5 w-5 text-rose-600" />
            <h2 className="text-base font-bold text-slate-900">Doctor access only</h2>
          </div>
          <p className="text-xs text-slate-500">
            {page} is encrypted and can only be opened with a doctor's personal code. Ask a doctor to review it with you.
          </p>
        </Card>
      </div>
    );
  }

  // ponytail: re-evaluate after unlock so the route-level step-up gate
  // (RouteAuthenticationGate) re-evaluates on next render/navigation.
  const recheck = () => {
    try { sessionStorage.setItem("www-stepup-recheck", String(Date.now())); } catch { /* ignore */ }
  };

  const submit = async () => {
    setError("");
    if (!hasDoctorCode()) {
      const ok = await setCode(code, pageKey);
      if (!ok) { setError("Code must be at least 8 characters."); return; }
      recheck();
      return;
    }
    const ok = await unlock(code, pageKey);
    if (!ok) {
      setError(locked ? "Locked — try again later." : `Incorrect code. ${attemptsLeft - 1} attempt(s) left.`);
      return;
    }
    recheck();
  };

  return (
    <div className="mx-auto mt-16 max-w-sm" data-testid={testId}>
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-brand-600" />
          <h2 className="text-base font-bold text-slate-900">Doctor code required</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          {hasDoctorCode()
            ? `Enter your personal doctor code to open ${page}. 5 wrong attempts lock this page for 15 minutes.`
            : "First time here: set a personal doctor code (min 8 characters). You will be asked for it next visit."}
        </p>
        <input
          type="password"
          value={code}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Doctor code"
          data-testid="doctor-code-input"
          aria-label="Doctor code"
          aria-invalid={!!error}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
        />
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        <button
          onClick={submit}
          disabled={!code}
          data-testid="doctor-code-submit"
          className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:bg-slate-300"
        >
          {hasDoctorCode() ? `Unlock ${page}` : "Set code & continue"}
        </button>
      </Card>
    </div>
  );
}
