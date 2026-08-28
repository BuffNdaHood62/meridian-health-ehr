import { useEffect, useState } from "react";
import {
  Users, BedDouble, CalendarClock, Siren, ClipboardList,
  Stethoscope, UserRound,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Card, CardHeader } from "../components/ui/Card";
import { StatusBadge } from "../components/ui/Badge";
import { departmentStats, currentUser } from "../data/mockData";
import { loadPatients, loadAlerts, loadAppointments, useAsync } from "../data/api";
import { useAuth } from "../auth";
import type { Patient } from "../types";
import { cn } from "../utils/cn";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100";

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export interface MedicalReviewEntry {
  id: string;
  clientName: string;
  diagnosis: string;
  historyOfEvents: string;
  vitals: Record<string, number | null>;
  savedAt: string;
}

// RFD §3.2 — Demographics quick-intake; auto-saves 800ms after last keystroke
function DemographicsSlot() {
  const [form, setForm] = useState({ firstName: "", lastName: "", dob: "", gender: "Male", phone: "" });
  const [saved, setSaved] = useState(false);

  // ponytail: demo autosave to localStorage (no backend); Phase 2 swaps to PATCH /patients/:id
  useEffect(() => {
    if (!form.firstName || !form.lastName) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem("www-demographics-draft", JSON.stringify(form));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch {
        /* storage unavailable */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [form]);

  return (
    <Card>
      <CardHeader
        title="Demographics"
        subtitle="Auto-saves to client info as you type"
        icon={<UserRound className="h-[18px] w-[18px]" />}
        action={
          saved ? (
            <span className="text-xs font-semibold text-emerald-600" data-testid="demo-saved">Saved ✓</span>
          ) : undefined
        }
      />
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <input
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          placeholder="First name *"
          data-testid="demo-first-name"
          className={inputCls}
        />
        <input
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          placeholder="Last name *"
          data-testid="demo-last-name"
          className={inputCls}
        />
        <input
          type="date"
          value={form.dob}
          onChange={(e) => setForm({ ...form, dob: e.target.value })}
          aria-label="Date of birth"
          className={inputCls}
        />
        <select
          value={form.gender}
          onChange={(e) => setForm({ ...form, gender: e.target.value })}
          aria-label="Gender"
          className={inputCls}
        >
          {["Male", "Female", "Non-binary"].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="Phone"
          type="tel"
          className={`${inputCls} sm:col-span-2`}
        />
      </div>
    </Card>
  );
}

// RFD §3.2 — Medical Review entry; registered into Medical History on submit
function MedicalReviewSlot({ patients, onSaved }: { patients: Patient[]; onSaved: (r: MedicalReviewEntry) => void }) {
  const [clientName, setClientName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [events, setEvents] = useState("");
  const [temp, setTemp] = useState("");
  const [spo2, setSpo2] = useState("");
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");
  const [pulse, setPulse] = useState("");
  const [resp, setResp] = useState("");
  const [weight, setWeight] = useState("");

  const valid = clientName.trim() !== "" && diagnosis.trim() !== "" && events.trim() !== "";

  const submit = () => {
    if (!valid) return;
    onSaved({
      id: `mr-${crypto.randomUUID()}`,
      clientName,
      diagnosis,
      historyOfEvents: events,
      vitals: {
        temperatureC: numOrNull(temp), spo2Pct: numOrNull(spo2),
        bpSystolic: numOrNull(bpSys), bpDiastolic: numOrNull(bpDia),
        pulseBpm: numOrNull(pulse), respirationRate: numOrNull(resp),
        weightKg: numOrNull(weight),
      },
      savedAt: new Date().toISOString(),
    });
    setClientName(""); setDiagnosis(""); setEvents("");
    setTemp(""); setSpo2(""); setBpSys(""); setBpDia(""); setPulse(""); setResp(""); setWeight("");
  };

  return (
    <Card>
      <CardHeader
        title="Medical Review"
        subtitle="Registered to Medical History on save"
        icon={<Stethoscope className="h-[18px] w-[18px]" />}
      />
      <div className="space-y-3 p-5">
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name *" data-testid="mr-client" className={inputCls} list="www-clients" />
        <datalist id="www-clients">
          {patients.map((p) => (
            <option key={p.id} value={`${p.firstName} ${p.lastName}`} />
          ))}
        </datalist>
        <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Diagnosis *" data-testid="mr-diagnosis" className={inputCls} />
        <textarea value={events} onChange={(e) => setEvents(e.target.value)} placeholder="History of events *" rows={2} className={inputCls} />
        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Vital signs</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <VitalInput label="Temp °C" value={temp} onChange={setTemp} min={30} max={45} step="0.1" />
            <VitalInput label="SpO₂ %" value={spo2} onChange={setSpo2} min={50} max={100} />
            <VitalInput label="BP sys" value={bpSys} onChange={setBpSys} min={60} max={260} />
            <VitalInput label="BP dia" value={bpDia} onChange={setBpDia} min={30} max={180} />
            <VitalInput label="Pulse" value={pulse} onChange={setPulse} min={30} max={250} />
            <VitalInput label="Resp" value={resp} onChange={setResp} min={6} max={60} />
            <VitalInput label="Weight kg" value={weight} onChange={setWeight} min={0.3} max={400} step="0.1" />
          </div>
        </fieldset>
        <button
          onClick={submit}
          disabled={!valid}
          data-testid="mr-save"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save Review to History
        </button>
      </div>
    </Card>
  );
}

function VitalInput({
  label, value, onChange, min, max, step,
}: { label: string; value: string; onChange: (v: string) => void; min: number; max: number; step?: string }) {
  const n = Number(value);
  const bad = value !== "" && (isNaN(n) || n < min || n > max);
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? "1"}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={bad}
        className={cn(inputCls, bad && "border-rose-300 bg-rose-50 focus:border-rose-400 focus:ring-rose-100")}
      />
      {bad && <span className="text-[10px] font-medium text-rose-600">Range {min}–{max}</span>}
    </label>
  );
}

export default function Dashboard() {
  const { currentUser: liveUser } = useAuth();
  const displayName = liveUser?.name ?? currentUser.name;
  const { data: patients } = useAsync(loadPatients, []);
  const { data: alerts } = useAsync(loadAlerts, []);
  const { data: appointments } = useAsync(loadAppointments, []);
  const active = (patients ?? []).filter((p) => ["ICU", "Admitted", "Observation"].includes(p.status));
  const criticalAlerts = (alerts ?? []).filter((a) => a.severity === "Critical");
  const todayAppts = (appointments ?? []).filter((a) => a.status !== "Cancelled");

  const usedBeds = departmentStats.reduce((s, d) => s + d.census, 0);

  const hour = new Date().getHours();
  const dayPart = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const nameParts = displayName.split(" ");
  const greetingName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}` : displayName;

  // RFD §3.2: Medical Review entries persist to localStorage until backend exists
  const [reviews, setReviews] = useState<MedicalReviewEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("www-medical-reviews") ?? "[]") as MedicalReviewEntry[];
    } catch {
      return [];
    }
  });
  const saveReview = (r: MedicalReviewEntry) => {
    const next = [r, ...reviews];
    setReviews(next);
    try {
      localStorage.setItem("www-medical-reviews", JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div data-testid="dashboard-page">
      <PageHeader
        title={`Good ${dayPart}, ${greetingName}`}
        subtitle={`Here's your clinical overview for today, ${todayLabel}.`}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Users className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-slate-700">{active.length} WWW clients under your care</span>
          </div>
        }
      />

      {/* KPI cards — RFD §3.1 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="WWW Clients" value={active.length} icon={<Users className="h-5 w-5" />} tone="brand" trend="up" trendLabel="+3" hint="Admitted & observation clients" />
        <StatCard label="WWW Admitted Clients" value={usedBeds} icon={<BedDouble className="h-5 w-5" />} tone="blue" hint={`across ${departmentStats.length} departments`} />
        <StatCard label="WWW Scheduled Appointments" value={todayAppts.length} icon={<CalendarClock className="h-5 w-5" />} tone="violet" trend="up" trendLabel="2 left" hint="3 completed" />
        <StatCard label="Critical Alerts" value={criticalAlerts.length} icon={<Siren className="h-5 w-5" />} tone="red" hint="Require acknowledgment" />
      </div>

      {/* RFD §3.2 new slots — removed panels replaced */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <DemographicsSlot />

        <div className="space-y-6">
          <MedicalReviewSlot patients={patients ?? []} onSaved={saveReview} />

          {reviews.length > 0 && (
            <Card>
              <CardHeader title="Recent Medical Reviews" subtitle={`${reviews.length} saved`} icon={<ClipboardList className="h-[18px] w-[18px]" />} />
              <ul className="divide-y divide-slate-50">
                {reviews.slice(0, 4).map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{r.clientName} — {r.diagnosis}</p>
                      <p className="truncate text-xs text-slate-500">{r.historyOfEvents}</p>
                    </div>
                    <StatusBadge status="Completed" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
