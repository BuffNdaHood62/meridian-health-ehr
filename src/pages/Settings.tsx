import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Shield, Bell, Sliders, LogOut, Smartphone, KeyRound, Fingerprint,
  Moon, Stethoscope, Mail, MessageSquare, Siren, QrCode,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { ErrorNote } from "../components/ui/ErrorNote";
import { currentUser } from "../data/mockData";
import { useAuth } from "../auth";
import { cn } from "../utils/cn";
import { listAudit, type AuditEntry } from "../utils/audit";
import { formatDateTime } from "../utils/format";
import { passwordProblem } from "../users";
import { CHART_TAB_NAMES, getDefaultChartTab, saveDefaultChartTab } from "../utils/preferences";
import { DEMO_MODE } from "../config";
import type { MfaEnrollment, MfaStatus } from "../identity/adapter";

// ponytail: live account identity comes from useAuth (the real signed-in user),
// not the static mockData demo profile. mockData supplies only demo-only meta
// (npi/credentials/department/email) until the backend provisions them.

function SettingRow({ icon: Icon, title, desc, children }: { icon: React.ElementType; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const {
    logout, currentUser: liveUser, mode, checkMfa, enrollMfa, verifyMfaEnrollment, changePassword,
  } = useAuth();
  const name = liveUser?.name ?? currentUser.name;
  const role = liveUser?.role ?? currentUser.role;
  const id = liveUser?.id ?? currentUser.id;
  const initials = liveUser?.initials ?? currentUser.initials;
  const auditStats = useMemo(() => {
    const log = listAudit();
    const at = (a: AuditEntry["action"]) => log.filter((e) => e.action === a).length;
    const oldest = log.length ? formatDateTime(log[log.length - 1].at) : "";
    return { total: log.length, reads: at("read"), signs: at("sign"), exports: at("export"), oldest };
  }, []);
  const [chartTab, setChartTab] = useState<string>(() => {
    const stored = getDefaultChartTab();
    return stored && (CHART_TAB_NAMES as readonly string[]).includes(stored) ? stored : "Overview";
  });
  const [chartTabNote, setChartTabNote] = useState("");

  const pickChartTab = (next: string) => {
    setChartTab(next);
    setChartTabNote(
      saveDefaultChartTab(next)
        ? `Saved on this device — client charts now open on ${next}.`
        : "This browser refused to store the preference, so it is gone when the page reloads."
    );
  };

  // ---- second factor ------------------------------------------------------
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfa, setMfa] = useState<MfaStatus | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState("");
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => {
    if (!mfaOpen) return;
    let alive = true;
    checkMfa().then((status) => {
      if (alive) setMfa(status);
    });
    return () => {
      alive = false;
    };
  }, [mfaOpen, checkMfa]);

  const startEnrolment = async () => {
    setMfaBusy(true);
    setMfaError("");
    setSetupDone(false);
    const result = await enrollMfa("Authenticator app");
    setMfaBusy(false);
    if (result.error) {
      setMfaError(result.error);
      return;
    }
    setEnrollment(result);
  };

  const confirmEnrolment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollment) return;
    setMfaBusy(true);
    setMfaError("");
    const result = await verifyMfaEnrollment(enrollment.factorId, setupCode);
    setMfaBusy(false);
    if (result.error) {
      setMfaError(result.error);
      return;
    }
    setEnrollment(null);
    setSetupCode("");
    setSetupDone(true);
    setMfa(await checkMfa());
  };

  const verifiedFactors = (mfa?.factors ?? []).filter((f) => f.verified);
  const pendingFactors = (mfa?.factors ?? []).filter((f) => !f.verified);

  // ---- password -----------------------------------------------------------
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwDone, setPwDone] = useState("");

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPwError("");
    setPwDone("");
    const problem = passwordProblem(pw.next);
    if (problem) {
      setPwError(problem);
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError("The two new passwords do not match.");
      return;
    }
    setPwBusy(true);
    const result = await changePassword(pw.current, pw.next);
    setPwBusy(false);
    if (result.error) {
      setPwError(result.error);
      return;
    }
    setPw({ current: "", next: "", confirm: "" });
    setPwDone("Password changed.");
  };

  return (
    <div data-testid="settings-page">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, security, and clinical preferences. Every control here saves itself — there is nothing left unsaved on this page."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Profile */}
          <Card>
            <CardHeader title="Profile" subtitle="Your provider information" icon={<User className="h-[18px] w-[18px]" />} />
            <div className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <Avatar initials={initials} color="#13726c" size="xl" />
                <div>
                  <p className="text-base font-bold text-slate-900">{name}</p>
                  <p className="text-sm text-slate-500">{role}</p>
                  <p className="mt-1 text-xs text-slate-400">Photo upload is not in this build.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full Name" value={name} />
                <Field label="Provider ID" value={id} />
                <Field label="NPI Number" value={currentUser.npi} />
                <Field label="Credentials" value={currentUser.credentials} />
                <Field label="Department" value={currentUser.department} />
                <Field label="Email" value="s.chen@meridianhealth.org" />
              </div>
            </div>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader title="Security & Privacy" subtitle="Authentication and access controls" icon={<Shield className="h-[18px] w-[18px]" />} />
            <div className="divide-y divide-slate-50 px-5">
              <SettingRow
                icon={KeyRound}
                title="Two-factor authentication"
                desc={
                  mode === "demo"
                    ? "Demo mode has no second factor"
                    : verifiedFactors.length
                      ? `${verifiedFactors.length} authenticator${verifiedFactors.length > 1 ? "s" : ""} verified`
                      : "Adds a code at sign-in for sensitive actions"
                }
              >
                {verifiedFactors.length ? (
                  <Badge tone="green" dot>On</Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setMfaOpen((v) => !v); setMfaError(""); }}
                    data-testid="settings-mfa-toggle"
                    className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {mfaOpen ? "Close" : "Set up"}
                  </button>
                )}
              </SettingRow>

              {mfaOpen && !verifiedFactors.length && (
                <div className="py-4" data-testid="settings-mfa-panel">
                  {mode === "demo" ? (
                    <p className="text-sm text-slate-600" data-testid="settings-mfa-demo-note">
                      {mfa?.error || "Demo mode has no second factor. There is no server to verify one, so TOTP cannot be required or enrolled here."}
                    </p>
                  ) : enrollment ? (
                    <form onSubmit={confirmEnrolment} className="space-y-3">
                      <p className="text-sm font-medium text-slate-800">Scan this with your authenticator app</p>
                      {enrollment.qrDataUri ? (
                        <img
                          src={enrollment.qrDataUri}
                          alt="QR code for TOTP enrolment"
                          className="h-40 w-40 rounded-xl border border-slate-200 bg-white p-2"
                          data-testid="settings-mfa-qr"
                        />
                      ) : (
                        <p className="text-sm text-slate-600">
                          No QR image was returned — enter this key manually in your app.
                        </p>
                      )}
                      {enrollment.secret && (
                        <Field label="Setup key" value={enrollment.secret} testId="settings-mfa-secret" />
                      )}
                      {pendingFactors.length > 0 && (
                        <p className="text-xs text-slate-500">
                          A factor was started but not confirmed. Confirming this code replaces it;
                          an unconfirmed factor grants no access.
                        </p>
                      )}
                      {mfaError && <ErrorNote message={mfaError} testId="settings-mfa-error" />}
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[10rem] flex-1">
                          <label className="mb-1 block text-xs font-medium text-slate-500">6-digit code</label>
                          <input
                            value={setupCode}
                            onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="123456"
                            data-testid="settings-mfa-code"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tracking-widest text-slate-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={mfaBusy || setupCode.length !== 6}
                          data-testid="settings-mfa-confirm"
                          className="min-h-[44px] rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          {mfaBusy ? "Checking…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEnrollment(null); setSetupCode(""); setMfaError(""); }}
                          className="min-h-[44px] rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-3">
                      {setupDone && (
                        <p className="text-sm font-medium text-emerald-700" data-testid="settings-mfa-done">
                          Two-factor is on for this account.
                        </p>
                      )}
                      {!setupDone && mfaError && <ErrorNote message={mfaError} testId="settings-mfa-error" />}
                      <p className="text-sm text-slate-600">
                        GoTrue does not issue recovery codes for TOTP. If you lose your authenticator,
                        an administrator has to reset your password — treat the enrolment as permanent
                        on this device.
                      </p>
                      {mfa && !mfa.available && mfa.error ? (
                        <p className="text-sm text-slate-500" data-testid="settings-mfa-error">{mfa.error}</p>
                      ) : (
                        <button
                          type="button"
                          onClick={startEnrolment}
                          disabled={mfaBusy}
                          data-testid="settings-mfa-start"
                          className="flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          <QrCode className="h-4 w-4" /> {mfaBusy ? "Starting…" : "Start enrolment"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <SettingRow icon={Shield} title="Change password" desc="Your credentials live in the identity provider, not in this browser">
                <button
                  type="button"
                  onClick={() => { setPwError(""); setPwDone(""); setPwOpen((v) => !v); }}
                  data-testid="settings-password-toggle"
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {pwOpen ? "Close" : "Change"}
                </button>
              </SettingRow>

              {pwOpen && (
                <form onSubmit={submitPassword} className="space-y-3 py-4" data-testid="settings-password-panel">
                  {pwError && <ErrorNote message={pwError} testId="settings-password-error" />}
                  {pwDone && (
                    <p className="text-sm font-medium text-emerald-700" data-testid="settings-password-done">{pwDone}</p>
                  )}
                  <Field label="Current password" type="password" value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} testId="settings-password-current" />
                  <Field label="New password" type="password" value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} testId="settings-password-next" />
                  <Field label="Confirm new password" type="password" value={pw.confirm} onChange={(v) => setPw((p) => ({ ...p, confirm: v }))} testId="settings-password-confirm" />
                  <p className="text-xs text-slate-500">
                    {mode === "demo"
                      ? "Demo mode stores accounts in this browser only, so this changes the local record — it is not a server credential."
                      : "Changing your password signs the session back in with the password alone, so a sensitive route will ask for your authenticator code again."}
                  </p>
                  <button
                    type="submit"
                    disabled={pwBusy}
                    data-testid="settings-password-submit"
                    className="min-h-[44px] rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {pwBusy ? "Saving…" : "Save password"}
                  </button>
                </form>
              )}

              {/* On the roadmap, not in the build. A toggle that silently does
                  nothing tells a clinician a control protects them. */}
              <SettingRow icon={Fingerprint} title="Biometric login" desc="Fingerprint or face recognition on supported devices">
                <Badge tone="slate" dot>Not in this build</Badge>
              </SettingRow>
              <SettingRow icon={Smartphone} title="Trusted devices" desc="Per-device authorization and revocation">
                <Badge tone="slate" dot>Not in this build</Badge>
              </SettingRow>
              <SettingRow icon={Shield} title="Auto-lock session" desc="Sessions stay open until you sign out">
                <Badge tone="slate" dot>Disabled</Badge>
              </SettingRow>
            </div>
          </Card>

          {/* Clinical preferences */}
          <Card>
            <CardHeader title="Clinical Preferences" subtitle="Chart display and workflow defaults" icon={<Sliders className="h-[18px] w-[18px]" />} />
            <div className="divide-y divide-slate-50 px-5">
              {/* There is no high-contrast stylesheet in this build, so a switch
                  here would have nothing to turn on. */}
              <SettingRow icon={Moon} title="High-contrast chart mode" desc="Improve readability in low-light environments">
                <Badge tone="slate" dot>Not in this build</Badge>
              </SettingRow>
              <SettingRow icon={Stethoscope} title="Default chart tab" desc="Which tab opens first on a client chart">
                <select
                  value={chartTab}
                  onChange={(e) => pickChartTab(e.target.value)}
                  aria-label="Default chart tab"
                  data-testid="settings-chart-tab"
                  className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-300"
                >
                  {CHART_TAB_NAMES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </SettingRow>
            </div>
            <p className="px-5 pb-5 text-xs text-slate-500" data-testid="settings-chart-tab-note">
              {chartTabNote || "Preferences are saved on this device only — they do not follow your account to another browser."}
            </p>
          </Card>
        </div>

        {/* Notifications sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Notifications" subtitle="No alert delivery exists in this build yet" icon={<Bell className="h-[18px] w-[18px]" />} />
            <div className="divide-y divide-slate-50 px-5">
              {/* Nothing sends an email, push or in-app alert here. A switch that
                  silently does nothing tells a clinician alerts reached them. */}
              <SettingRow icon={Siren} title="Critical results" desc="Push for critical labs & vitals">
                <Badge tone="slate" dot>Not in this build</Badge>
              </SettingRow>
              <SettingRow icon={MessageSquare} title="Secure messages" desc="In-app + push for new messages">
                <Badge tone="slate" dot>Not in this build</Badge>
              </SettingRow>
              <SettingRow icon={Mail} title="Email digest" desc="Daily summary at 7:00 AM">
                <Badge tone="slate" dot>Not in this build</Badge>
              </SettingRow>
              <SettingRow icon={Shield} title="Critical alerts in the top bar" desc="The bell you see after signing in lists critical labs and vitals">
                <Badge tone="green" dot>Working</Badge>
              </SettingRow>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <p className="text-sm font-semibold">Activity Log</p>
              </div>
              <p className="mt-2 text-xs text-brand-100">
                {DEMO_MODE
                  ? "Demo mode: events are recorded in this browser only (most recent 500) and are not a compliance audit trail."
                  : "Chart views, orders and record disclosures are recorded to the audit log."}
              </p>
            </div>
            <div className="space-y-2 p-5">
              {[
                { label: "Events recorded", value: String(auditStats.total) },
                { label: "Records viewed", value: String(auditStats.reads) },
                { label: "Orders signed", value: String(auditStats.signs) },
                { label: "Records disclosed", value: String(auditStats.exports) },
                { label: "Oldest entry", value: auditStats.oldest || "None yet" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{r.label}</span>
                  <span className="font-medium text-slate-700">{r.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-100"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, type = "text", onChange, testId,
}: {
  label: string;
  value: string;
  type?: string;
  /** Omitted means display-only: the profile fields are not editable here. */
  onChange?: (next: string) => void;
  testId?: string;
}) {
  const editable = Boolean(onChange);
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <input
        type={type}
        value={editable ? value : undefined}
        defaultValue={editable ? undefined : value}
        readOnly={!editable}
        data-testid={testId}
        {...(onChange ? { onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : {})}
        className={cn(
          "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100",
          editable ? "bg-white" : "bg-slate-50"
        )}
      />
    </div>
  );
}
