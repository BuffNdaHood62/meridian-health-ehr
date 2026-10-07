import { useEffect, useState } from "react";
import {
  Users, BedDouble, CalendarClock, Siren, Stethoscope, UserRound, CalendarPlus,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Card, CardHeader } from "../components/ui/Card";
import { ErrorNote } from "../components/ui/ErrorNote";
import { WwwLogo } from "../components/ui/WwwLogo";
import { departmentStats } from "../data/mockData";
import { loadPatients, loadAppointments as loadMockAppointments, loadOrders, useAsync } from "../data/api";
import type { Patient, MedicalReviewEntry } from "../types";
import { addMedicalReview } from "../utils/medicalReviews";
import { registerReviewAsVisit } from "../utils/wwwRecords";
import {
  loadDemographics, saveDemographics, findDemographics, ageBandFromDob,
  EMPTY_DEMOGRAPHICS, type Demographics,
} from "../utils/demographics";
import {
  loadAppointments, addAppointment, cancelAppointment, todayIso, type WwwAppointment,
} from "../utils/appointments";
import { cn } from "../utils/cn";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100";

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function Field({
  label, value, onChange, placeholder, type = "text", testId,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; testId?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className={inputCls}
      />
    </label>
  );
}

// RFD §3.2 — Demographics intake. Autosaves 800ms after the last keystroke into
// the client's demographics record, which the Clients registry reads on save.
// Re-typing a known client name loads the stored record so it stays editable.
function DemographicsSlot() {
  const [form, setForm] = useState<Demographics>(() => {
    try {
      const draft = localStorage.getItem("www-demographics-draft");
      return draft ? { ...EMPTY_DEMOGRAPHICS, ...JSON.parse(draft) } : EMPTY_DEMOGRAPHICS;
    } catch {
      return EMPTY_DEMOGRAPHICS;
    }
  });
  const [saved, setSaved] = useState(false);

  const fullName = `${form.firstName} ${form.lastName}`.trim();
  const bioEmpty = !form.address && !form.dob && !form.phone && !form.nextOfKin && !form.motherName && !form.fatherName;

  // Hydrate on a known client name so previously captured biography can be edited.
  useEffect(() => {
    if (!fullName || !bioEmpty) return;
    const stored = findDemographics(fullName);
    if (stored) setForm(stored);
  }, [fullName, bioEmpty]);

  useEffect(() => {
    if (!form.firstName || !form.lastName) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem("www-demographics-draft", JSON.stringify(form));
        saveDemographics(form);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch {
        /* storage unavailable */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [form]);

  const set = (patch: Partial<Demographics>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Card>
      <CardHeader
        title="Demographics"
        subtitle={fullName
          ? `Auto-saves to ${fullName}'s client record — edit any field, it overwrites the same record`
          : "Auto-saves to the client record as you type"}
        icon={<UserRound className="h-[18px] w-[18px]" />}
        action={saved ? <span className="text-xs font-semibold text-emerald-600" data-testid="demo-saved">Saved ✓</span> : undefined}
      />
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <Field label="First name *" value={form.firstName} onChange={(v) => set({ firstName: v })} testId="demo-first-name" />
        <Field label="Last name *" value={form.lastName} onChange={(v) => set({ lastName: v })} testId="demo-last-name" />
        <Field label="Date of birth" type="date" value={form.dob} onChange={(v) => set({ dob: v })} />
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-slate-500">Gender</span>
          <select value={form.gender} onChange={(e) => set({ gender: e.target.value })} className={inputCls}>
            {["Male", "Female", "Non-binary"].map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <Field label="Phone" type="tel" value={form.phone} onChange={(v) => set({ phone: v })} />
        <div className="sm:col-span-2">
          <Field label="Address" value={form.address} onChange={(v) => set({ address: v })} placeholder="House, street, city" />
        </div>

        <p className="sm:col-span-2 mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Next of kin</p>
        <Field label="Name" value={form.nextOfKin} onChange={(v) => set({ nextOfKin: v })} testId="demo-nok-name" />
        <Field label="Phone" type="tel" value={form.nextOfKinPhone} onChange={(v) => set({ nextOfKinPhone: v })} />

        <p className="sm:col-span-2 mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Parents</p>
        <Field label="Mother's name" value={form.motherName} onChange={(v) => set({ motherName: v })} testId="demo-mother-name" />
        <Field label="Mother's phone" type="tel" value={form.motherPhone} onChange={(v) => set({ motherPhone: v })} />
        <Field label="Father's name" value={form.fatherName} onChange={(v) => set({ fatherName: v })} testId="demo-father-name" />
        <Field label="Father's phone" type="tel" value={form.fatherPhone} onChange={(v) => set({ fatherPhone: v })} />

        {form.dob && (
          <p className="sm:col-span-2 text-xs text-slate-500">
            Age band from date of birth: <span className="font-semibold text-slate-700">{ageBandFromDob(form.dob) || "—"}</span>
          </p>
        )}
      </div>
    </Card>
  );
}

// RFD §3.2 — Medical Review. On save it registers into Medical History AND as a
// new visit entry under Clients (spec: "can it go directly to the patients section?").
// Deliberately NOT listed on the dashboard — privacy (spec 2026-09-28).
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
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");

  const valid = clientName.trim() !== "" && diagnosis.trim() !== "" && events.trim() !== "";

  // Show the matched client's active orders alongside the review (spec §1).
  const matched = patients.find((p) => `${p.firstName} ${p.lastName}` === clientName.trim());
  const { data: clientOrders } = useAsync(() => loadOrders(matched?.id ?? ""), [matched?.id]);
  const activeOrders = (clientOrders ?? []).filter((o) => o.status !== "Cancelled");

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
        heightCm: numOrNull(height), weightKg: numOrNull(weight),
      },
      savedAt: new Date().toISOString(),
    });
    setClientName(""); setDiagnosis(""); setEvents("");
    setTemp(""); setSpo2(""); setBpSys(""); setBpDia(""); setPulse(""); setResp(""); setHeight(""); setWeight("");
  };

  return (
    <Card>
      <CardHeader
        title="Medical Review"
        subtitle="Saves to the client's card under Clients and to Medical History"
        icon={<Stethoscope className="h-[18px] w-[18px]" />}
      />
      <div className="space-y-3 p-5">
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name *" data-testid="mr-client" className={inputCls} list="www-clients" />
        <datalist id="www-clients">
          {[...patients]
            .sort((a, b) => a.mrn.localeCompare(b.mrn))
            .map((p) => <option key={p.id} value={`${p.firstName} ${p.lastName}`} />)}
        </datalist>
        <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Diagnosis *" data-testid="mr-diagnosis" className={inputCls} />
        <textarea value={events} onChange={(e) => setEvents(e.target.value)} placeholder="History of events *" rows={2} className={inputCls} />
        {matched && (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Active orders — {matched.firstName} {matched.lastName}</p>
            {activeOrders.length === 0 ? (
              <p className="text-xs text-slate-500">No orders on record for this client.</p>
            ) : (
              <ul className="space-y-1">
                {activeOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                    <span>{o.name} <span className="text-slate-400">({o.type})</span></span>
                    <span className="font-medium text-slate-500">{o.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Vital signs</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <VitalInput label="Temp °C" value={temp} onChange={setTemp} min={30} max={45} step="0.1" />
            <VitalInput label="SpO₂ %" value={spo2} onChange={setSpo2} min={50} max={100} />
            <VitalInput label="BP sys" value={bpSys} onChange={setBpSys} min={60} max={260} />
            <VitalInput label="BP dia" value={bpDia} onChange={setBpDia} min={30} max={180} />
            <VitalInput label="Pulse" value={pulse} onChange={setPulse} min={30} max={250} />
            <VitalInput label="Resp" value={resp} onChange={setResp} min={6} max={60} />
            <VitalInput label="Height cm" value={height} onChange={setHeight} min={20} max={260} step="0.1" />
            <VitalInput label="Weight kg" value={weight} onChange={setWeight} min={0.3} max={400} step="0.1" />
          </div>
        </fieldset>
        <button
          onClick={submit}
          disabled={!valid}
          data-testid="mr-save"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save Review
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

// Spec 2026-09-28 — scheduling was removed as a page; appointments are booked
// here and feed the WWW Scheduled Appointments KPI.
function AppointmentSlot({ clientNames, onChanged }: { clientNames: string[]; onChanged: () => void }) {
  const [list, setList] = useState<WwwAppointment[]>(loadAppointments);
  const [clientName, setClientName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const canBook = clientName.trim() !== "" && date !== "" && time !== "";

  const book = () => {
    if (!canBook) return;
    const next = addAppointment({
      id: `ap-${crypto.randomUUID()}`,
      clientName: clientName.trim(),
      date, time,
      reason: reason.trim(),
      createdAt: new Date().toISOString(),
    });
    setList(next);
    onChanged();
    setClientName(""); setReason("");
  };

  return (
    <Card>
      <CardHeader
        title="Schedule an appointment"
        subtitle={list.length > 0 ? `${list.length} booked · soonest ${list[0].date} ${list[0].time}` : "Booked appointments appear in the KPI above"}
        icon={<CalendarPlus className="h-[18px] w-[18px]" />}
      />
      <div className="space-y-3 p-5">
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Client name *"
          data-testid="appt-client"
          className={inputCls}
          list="www-appt-clients"
        />
        <datalist id="www-appt-clients">{clientNames.map((n) => <option key={n} value={n} />)}</datalist>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date *" type="date" value={date} onChange={setDate} testId="appt-date" />
          <Field label="Time *" type="time" value={time} onChange={setTime} testId="appt-time" />
        </div>
        <Field label="Reason" value={reason} onChange={setReason} placeholder="Follow-up, review, lab…" />
        <button
          onClick={book}
          disabled={!canBook}
          data-testid="appt-book"
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Book appointment
        </button>
        {list.length > 0 && (
          <ul className="divide-y divide-slate-50">
            {list.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="font-medium text-slate-700">{a.clientName} · {a.date} {a.time}</span>
                <button
                  onClick={() => { setList(cancelAppointment(a.id)); onChanged(); }}
                  data-testid={`appt-cancel-${a.id}`}
                  className="tappable text-rose-600 hover:underline"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: patients, error: patientsError } = useAsync(loadPatients, []);
  const { data: appointments, error: apptsError } = useAsync(loadMockAppointments, []);
  const active = (patients ?? []).filter((p) => ["ICU", "Admitted", "Observation"].includes(p.status));
  const priorityClients = (patients ?? []).filter((p) => p.acuity === "Critical" || p.acuity === "Serious");

  const [booked, setBooked] = useState<WwwAppointment[]>(loadAppointments);
  const todayAppts = (appointments ?? []).filter((a) => a.status !== "Cancelled").length
    + booked.filter((a) => a.date >= todayIso()).length;

  const usedBeds = departmentStats.reduce((s, d) => s + d.census, 0);

  const hour = new Date().getHours();
  const dayPart = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Saving a review writes it to Medical History and to the Clients registry.
  const saveReview = (r: MedicalReviewEntry) => {
    addMedicalReview(r);
    registerReviewAsVisit(r);
  };

  const clientNames = Array.from(new Set([
    ...(patients ?? []).map((p) => `${p.firstName} ${p.lastName}`),
    ...Object.values(loadDemographics()).map((d) => `${d.firstName} ${d.lastName}`.trim()),
  ])).sort((a, b) => a.localeCompare(b));

  return (
    <div data-testid="dashboard-page">
      {patientsError && <ErrorNote message={patientsError} testId="dashboard-patients-error" />}
      {apptsError && <ErrorNote message={apptsError} testId="dashboard-appts-error" />}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <WwwLogo className="h-9 w-9" iconClassName="h-5 w-5" />
            Wellness with Writingale
          </span>
        }
        subtitle={`Good ${dayPart}, Doctor — clinical overview for ${todayLabel}.`}
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
        <StatCard label="WWW Scheduled Appointments" value={todayAppts} icon={<CalendarClock className="h-5 w-5" />} tone="violet" hint="Book below or from the mock schedule" />
        <StatCard label="WWW Priority Clients" value={priorityClients.length} icon={<Siren className="h-5 w-5" />} tone="red" hint="Critical & serious acuity" />
      </div>

      {/* RFD §3.2 intake slots */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <DemographicsSlot />
        <div className="space-y-6">
          <MedicalReviewSlot patients={patients ?? []} onSaved={saveReview} />
          <AppointmentSlot clientNames={clientNames} onChanged={() => setBooked(loadAppointments())} />
        </div>
      </div>
    </div>
  );
}
