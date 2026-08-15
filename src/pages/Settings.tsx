import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Shield, Bell, Sliders, LogOut, Smartphone, KeyRound, Fingerprint,
  Moon, Stethoscope, Mail, MessageSquare, Siren, Save,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { currentUser } from "../data/mockData";
import { useAuth } from "../auth";
import { cn } from "../utils/cn";

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={on}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-brand-600" : "bg-slate-300"
      )}
    >
      <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", on ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

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
  const { logout } = useAuth();
  const [twoFA, setTwoFA] = useState(true);
  const [biometric, setBiometric] = useState(false);
  const [darkChart, setDarkChart] = useState(false);
  const [emailNotif, setEmailNotif] = useState(true);
  const [msgNotif, setMsgNotif] = useState(true);
  const [criticalPush, setCriticalPush] = useState(true);

  return (
    <div data-testid="settings-page">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, security, and clinical preferences."
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Save className="h-4 w-4" /> Save changes
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Profile */}
          <Card>
            <CardHeader title="Profile" subtitle="Your provider information" icon={<User className="h-[18px] w-[18px]" />} />
            <div className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <Avatar initials={currentUser.initials} color="#13726c" size="xl" />
                <div>
                  <p className="text-base font-bold text-slate-900">{currentUser.name}</p>
                  <p className="text-sm text-slate-500">{currentUser.role}</p>
                  <button className="mt-1 text-xs font-semibold text-brand-600 hover:text-brand-700">Change photo</button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full Name" value={currentUser.name} />
                <Field label="Provider ID" value={currentUser.id} />
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
              <SettingRow icon={KeyRound} title="Two-factor authentication" desc="Require a code at every sign-in">
                <Toggle on={twoFA} onChange={() => setTwoFA((v) => !v)} />
              </SettingRow>
              <SettingRow icon={Fingerprint} title="Biometric login" desc="Use fingerprint or face recognition on supported devices">
                <Toggle on={biometric} onChange={() => setBiometric((v) => !v)} />
              </SettingRow>
              <SettingRow icon={Smartphone} title="Trusted devices" desc="3 devices currently authorized">
                <button className="text-xs font-semibold text-brand-600 hover:text-brand-700">Manage</button>
              </SettingRow>
              <SettingRow icon={Shield} title="Auto-lock session" desc="Sign out after 15 minutes of inactivity">
                <Badge tone="green" dot>Enabled</Badge>
              </SettingRow>
            </div>
          </Card>

          {/* Clinical preferences */}
          <Card>
            <CardHeader title="Clinical Preferences" subtitle="Chart display and workflow defaults" icon={<Sliders className="h-[18px] w-[18px]" />} />
            <div className="divide-y divide-slate-50 px-5">
              <SettingRow icon={Moon} title="High-contrast chart mode" desc="Improve readability in low-light environments">
                <Toggle on={darkChart} onChange={() => setDarkChart((v) => !v)} />
              </SettingRow>
              <SettingRow icon={Stethoscope} title="Default chart tab" desc="Which tab opens first on a patient chart">
                <select className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-300">
                  <option>Overview</option>
                  <option>Vitals</option>
                  <option>Medications</option>
                  <option>Labs</option>
                </select>
              </SettingRow>
            </div>
          </Card>
        </div>

        {/* Notifications sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Notifications" subtitle="How you receive alerts" icon={<Bell className="h-[18px] w-[18px]" />} />
            <div className="divide-y divide-slate-50 px-5">
              <SettingRow icon={Siren} title="Critical results" desc="Push for critical labs & vitals">
                <Toggle on={criticalPush} onChange={() => setCriticalPush((v) => !v)} />
              </SettingRow>
              <SettingRow icon={MessageSquare} title="Secure messages" desc="In-app + push for new messages">
                <Toggle on={msgNotif} onChange={() => setMsgNotif((v) => !v)} />
              </SettingRow>
              <SettingRow icon={Mail} title="Email digest" desc="Daily summary at 7:00 AM">
                <Toggle on={emailNotif} onChange={() => setEmailNotif((v) => !v)} />
              </SettingRow>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <p className="text-sm font-semibold">Compliance & Audit</p>
              </div>
              <p className="mt-2 text-xs text-brand-100">
                Your access to patient records is logged in accordance with HIPAA. All chart views and orders are attributable and auditable.
              </p>
            </div>
            <div className="space-y-2 p-5">
              {[
                { label: "Last sign-in", value: "Today, 07:12 AM" },
                { label: "Session IP", value: "10.42.18.6 (Meridian LAN)" },
                { label: "Records viewed (24h)", value: "47" },
                { label: "Orders signed (24h)", value: "12" },
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
            <LogOut className="h-4 w-4" /> Sign out of all devices
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <input
        defaultValue={value}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}
