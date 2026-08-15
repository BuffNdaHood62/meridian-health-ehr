import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Phone, Mail, MapPin, Droplet, Ruler, Weight, ShieldAlert, Pill,
  Activity, HeartPulse, Thermometer, Wind, Gauge, CalendarPlus,
  ClipboardList, FileText, Stethoscope, ArrowLeft, Syringe, Heart,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge, StatusBadge, AcuityBadge, flagTone, severityTone, type Tone } from "../components/ui/Badge";
import { TrendChart, Sparkline } from "../components/charts/Charts";
import { getPatientById } from "../data/mockData";
import { bmi, bmiCategory, formatDate, formatDateTime, bpTone, hrTone, spo2Tone, tempTone } from "../utils/format";
import { cn } from "../utils/cn";

const tabs = ["Overview", "Vitals", "Medications", "Labs", "History", "Notes"] as const;
type Tab = (typeof tabs)[number];

const toneText: Record<string, string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600",
};

export default function PatientDetail() {
  const { id } = useParams();
  const patient = getPatientById(id || "");
  const [tab, setTab] = useState<Tab>("Overview");

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-slate-700">Patient not found</p>
        <Link to="/patients" className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Back to patient registry
        </Link>
      </div>
    );
  }

  const latest = patient.vitals[patient.vitals.length - 1];
  const p = patient;

  return (
    <div data-testid={`patient-detail-${p.id}`}>
      <PageHeader
        title="Patient Chart"
        breadcrumbs={[
          { label: "Patients", to: "/patients" },
          { label: `${p.firstName} ${p.lastName}` },
        ]}
        actions={
          <>
            <Link
              to="/patients"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <Link
              to="/orders"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              data-testid="chart-new-order"
            >
              <ClipboardList className="h-4 w-4" /> New Order
            </Link>
          </>
        }
      />

      {/* Patient header */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar initials={p.initials} color={p.avatarColor} size="xl" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">{p.firstName} {p.lastName}</h2>
                <StatusBadge status={p.status} />
                <AcuityBadge acuity={p.acuity} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {p.age}y · {p.gender} · {p.pronouns} · <span className="font-mono">{p.mrn}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="slate">Blood: {p.bloodType}</Badge>
                <Badge tone={p.codeStatus === "Full Code" ? "green" : "amber"}>Code: {p.codeStatus}</Badge>
                {p.room && <Badge tone="blue">{p.room}</Badge>}
                <Badge tone="slate">{p.department}</Badge>
              </div>
            </div>
          </div>

          {/* Latest vitals inline */}
          <div className="grid grid-cols-4 gap-2 lg:gap-3">
            {[
              { label: "BP", value: `${latest.bpSys}/${latest.bpDia}`, icon: HeartPulse },
              { label: "HR", value: `${latest.hr}`, icon: Activity },
              { label: "SpO₂", value: `${latest.spo2}%`, icon: Wind },
              { label: "Temp", value: `${latest.temp}°`, icon: Thermometer },
            ].map((v) => (
              <div key={v.label} className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                <v.icon className="mx-auto mb-0.5 h-3.5 w-3.5 text-slate-400" />
                <p className="text-sm font-bold text-slate-900">{v.value}</p>
                <p className="text-[10px] text-slate-400">{v.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Allergy banner */}
        {p.allergies.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-amber-100 bg-amber-50 px-5 py-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
              <ShieldAlert className="h-4 w-4" /> ALLERGIES
            </span>
            {p.allergies.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 text-xs text-amber-800">
                <strong>{a.substance}</strong>
                <span className="text-amber-600">({a.reaction})</span>
                <Badge tone={severityTone(a.severity)} className="ml-0.5">{a.severity}</Badge>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`tab-${t.toLowerCase()}`}
            className={cn(
              "relative shrink-0 px-4 py-3 text-sm font-medium transition-colors",
              tab === t ? "text-brand-700" : "text-slate-500 hover:text-slate-800"
            )}
          >
            {t}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Overview" && <OverviewTab p={p} />}
      {tab === "Vitals" && <VitalsTab p={p} />}
      {tab === "Medications" && <MedicationsTab p={p} />}
      {tab === "Labs" && <LabsTab p={p} />}
      {tab === "History" && <HistoryTab p={p} />}
      {tab === "Notes" && <NotesTab p={p} />}
    </div>
  );
}

// ---- Demographics grid (shared) --------------------------------------------
function Demographics({ p }: { p: ReturnType<typeof getPatientById> }) {
  if (!p) return null;
  const items = [
    { icon: CalendarPlus, label: "Date of Birth", value: `${formatDate(p.dateOfBirth)} (${p.age}y)` },
    { icon: Droplet, label: "Blood Type", value: p.bloodType },
    { icon: Ruler, label: "Height", value: `${p.heightCm} cm` },
    { icon: Weight, label: "Weight", value: `${p.weightKg} kg` },
    { icon: Heart, label: "BMI", value: `${bmiVal(p)} (${bmiCategory(bmiVal(p))})` },
    { icon: Phone, label: "Phone", value: p.phone },
    { icon: Mail, label: "Email", value: p.email },
    { icon: MapPin, label: "Address", value: p.address },
    { icon: Stethoscope, label: "Primary Physician", value: p.primaryPhysician },
    { icon: ShieldAlert, label: "Insurance", value: p.insurance },
  ];
  return (
    <Card>
      <CardHeader title="Demographics" subtitle="Patient information & identifiers" icon={<FileText className="h-[18px] w-[18px]" />} />
      <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
              <it.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{it.label}</p>
              <p className="text-sm font-medium text-slate-800">{it.value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Emergency Contact</p>
        <p className="mt-1 text-sm font-medium text-slate-800">
          {p.emergencyContact.name} <span className="text-slate-400">({p.emergencyContact.relation})</span> · {p.emergencyContact.phone}
        </p>
      </div>
    </Card>
  );
}
const bmiVal = (p: NonNullable<ReturnType<typeof getPatientById>>) => bmi(p.weightKg, p.heightCm);

// ---- Overview tab -----------------------------------------------------------
function OverviewTab({ p }: { p: NonNullable<ReturnType<typeof getPatientById>> }) {
  const latest = p.vitals[p.vitals.length - 1];
  const hrSeries = p.vitals.map((v) => v.hr);
  const problems = p.history.filter((h) => h.type === "Diagnosis" || h.type === "Visit").slice(0, 4);

  const vitals = [
    { label: "Blood Pressure", value: `${latest.bpSys}/${latest.bpDia}`, unit: "mmHg", series: p.vitals.map((v) => v.bpSys), color: "#13726c" },
    { label: "Heart Rate", value: `${latest.hr}`, unit: "bpm", series: hrSeries, color: "#e11d48" },
    { label: "Oxygen Sat.", value: `${latest.spo2}`, unit: "%", series: p.vitals.map((v) => v.spo2), color: "#2563eb" },
    { label: "Temperature", value: `${latest.temp}`, unit: "°F", series: p.vitals.map((v) => v.temp), color: "#ea580c" },
    { label: "Respiratory", value: `${latest.rr}`, unit: "/min", series: p.vitals.map((v) => v.rr), color: "#7c3aed" },
    { label: "Pain Score", value: `${latest.pain}`, unit: "/10", series: p.vitals.map((v) => v.pain), color: "#0891b2" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="Vital Signs" subtitle="Latest readings with trend" icon={<Activity className="h-[18px] w-[18px]" />} />
          <div className="grid gap-px overflow-hidden rounded-b-2xl bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
            {vitals.map((v) => (
              <div key={v.label} className="bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">{v.label}</p>
                  <Sparkline data={v.series} color={v.color} />
                </div>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {v.value} <span className="text-sm font-medium text-slate-400">{v.unit}</span>
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Problem List" subtitle="Active conditions" icon={<ClipboardList className="h-[18px] w-[18px]" />} />
          <div className="divide-y divide-slate-50">
            {problems.map((h) => (
              <div key={h.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                  <HeartPulse className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{h.title}</p>
                  <p className="text-xs text-slate-500">{h.description}</p>
                </div>
                <Badge tone="slate">{formatDate(h.date, { year: "2-digit", month: "short" })}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Demographics p={p} />
      </div>
    </div>
  );
}

// ---- Vitals tab -------------------------------------------------------------
function VitalsTab({ p }: { p: NonNullable<ReturnType<typeof getPatientById>> }) {
  const charts = [
    { label: "Heart Rate", unit: "bpm", series: p.vitals.map((v) => v.hr), color: "#e11d48" },
    { label: "Systolic BP", unit: "mmHg", series: p.vitals.map((v) => v.bpSys), color: "#13726c" },
    { label: "Temperature", unit: "°F", series: p.vitals.map((v) => v.temp), color: "#ea580c" },
    { label: "Oxygen Saturation", unit: "%", series: p.vitals.map((v) => v.spo2), color: "#2563eb" },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {charts.map((c) => (
          <Card key={c.label}>
            <CardHeader title={c.label} subtitle={`${c.series[c.series.length - 1]} ${c.unit} · latest`} icon={<Gauge className="h-[18px] w-[18px]" />} />
            <div className="p-5">
              <TrendChart data={c.series} color={c.color} unit={c.unit} height={150} />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Vital Signs Log" subtitle="Complete recorded measurements" icon={<Activity className="h-[18px] w-[18px]" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Temp</th>
                <th className="px-5 py-3 font-medium">HR</th>
                <th className="px-5 py-3 font-medium">BP</th>
                <th className="px-5 py-3 font-medium">RR</th>
                <th className="px-5 py-3 font-medium">SpO₂</th>
                <th className="px-5 py-3 font-medium">Pain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...p.vitals].reverse().map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(v.timestamp)}</td>
                  <td className={cn("px-5 py-3 font-medium", toneText[tempTone(v.temp)])}>{v.temp}°</td>
                  <td className={cn("px-5 py-3 font-medium", toneText[hrTone(v.hr)])}>{v.hr}</td>
                  <td className={cn("px-5 py-3 font-medium", toneText[bpTone(v.bpSys)])}>{v.bpSys}/{v.bpDia}</td>
                  <td className="px-5 py-3 text-slate-600">{v.rr}</td>
                  <td className={cn("px-5 py-3 font-medium", toneText[spo2Tone(v.spo2)])}>{v.spo2}%</td>
                  <td className="px-5 py-3 text-slate-600">{v.pain}/10</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---- Medications tab --------------------------------------------------------
function MedicationsTab({ p }: { p: NonNullable<ReturnType<typeof getPatientById>> }) {
  const [filter, setFilter] = useState("All");
  const meds = p.medications.filter((m) => filter === "All" || m.status === filter);
  const statusTone: Record<string, Tone> = { Active: "green", Hold: "amber", Discontinued: "slate" };
  return (
    <Card>
      <CardHeader
        title="Medication List"
        subtitle={`${p.medications.filter((m) => m.status === "Active").length} active medications`}
        icon={<Pill className="h-[18px] w-[18px]" />}
        action={
          <div className="flex gap-1">
            {["All", "Active", "Hold", "Discontinued"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                  filter === f ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3 font-medium">Medication</th>
              <th className="px-5 py-3 font-medium">Dose / Route</th>
              <th className="px-5 py-3 font-medium">Frequency</th>
              <th className="px-5 py-3 font-medium">Class</th>
              <th className="px-5 py-3 font-medium">Prescriber</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {meds.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Pill className="h-4 w-4" />
                    </span>
                    <span className="font-semibold text-slate-900">{m.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-slate-600">{m.dose} <span className="text-slate-400">· {m.route}</span></td>
                <td className="px-5 py-3.5"><span className="font-mono text-xs font-medium text-slate-700">{m.frequency}</span></td>
                <td className="px-5 py-3.5 text-slate-600">{m.class}</td>
                <td className="px-5 py-3.5 text-xs text-slate-500">{m.prescribedBy}</td>
                <td className="px-5 py-3.5"><Badge tone={statusTone[m.status]} dot>{m.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---- Labs tab ---------------------------------------------------------------
function LabsTab({ p }: { p: NonNullable<ReturnType<typeof getPatientById>> }) {
  const categories = [...new Set(p.labs.map((l) => l.category))];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Laboratory Results" subtitle={`Collected ${p.labs[0]?.collected}`} icon={<Syringe className="h-[18px] w-[18px]" />} />
        <div className="space-y-6 p-5">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{cat}</p>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2 font-medium">Test</th>
                      <th className="px-4 py-2 font-medium">Result</th>
                      <th className="px-4 py-2 font-medium">Reference</th>
                      <th className="px-4 py-2 font-medium">Flag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {p.labs.filter((l) => l.category === cat).map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-700">{l.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn(
                            "font-bold",
                            l.flag === "Critical" && "text-rose-600",
                            l.flag === "High" && "text-amber-600",
                            l.flag === "Low" && "text-amber-600",
                            l.flag === "Normal" && "text-slate-800"
                          )}>
                            {l.value} <span className="text-xs font-normal text-slate-400">{l.unit}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{l.range}</td>
                        <td className="px-4 py-2.5">
                          {l.flag === "Normal" ? (
                            <span className="text-xs font-medium text-emerald-600">● Normal</span>
                          ) : (
                            <Badge tone={flagTone(l.flag)} dot>{l.flag === "High" ? "↑ High" : l.flag === "Low" ? "↓ Low" : l.flag}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---- History tab (timeline) -------------------------------------------------
const typeIcon: Record<string, React.ElementType> = {
  Diagnosis: HeartPulse,
  Surgery: Stethoscope,
  Imaging: Activity,
  Procedure: Syringe,
  Visit: FileText,
  Vaccination: Droplet,
  Allergy: ShieldAlert,
};
const typeTone: Record<string, Tone> = {
  Diagnosis: "red", Surgery: "violet", Imaging: "blue", Procedure: "violet",
  Visit: "slate", Vaccination: "green", Allergy: "amber",
};

function HistoryTab({ p }: { p: NonNullable<ReturnType<typeof getPatientById>> }) {
  return (
    <Card>
      <CardHeader title="Medical History" subtitle="Chronological clinical events" icon={<FileText className="h-[18px] w-[18px]" />} />
      <div className="p-5">
        <ol className="relative space-y-6 border-l-2 border-slate-100 pl-6">
          {[...p.history].reverse().map((h) => {
            const Icon = typeIcon[h.type] ?? FileText;
            return (
              <li key={h.id} className="relative">
                <span className="absolute -left-[34px] flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm ring-1 ring-slate-100">
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <Icon className="h-4 w-4" />
                  </span>
                </span>
                <div className="rounded-xl border border-slate-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">{h.title}</h4>
                    <Badge tone={typeTone[h.type]}>{h.type}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{h.description}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatDate(h.date)} · {h.provider}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

// ---- Notes tab --------------------------------------------------------------
function NotesTab({ p }: { p: NonNullable<ReturnType<typeof getPatientById>> }) {
  const noteTone: Record<string, Tone> = {
    Progress: "blue", Admission: "amber", Discharge: "green", Nursing: "violet", Consult: "slate",
  };
  return (
    <div className="space-y-4">
      {p.notes.map((n) => (
        <Card key={n.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar initials={n.author.split(" ").map((w) => w[0]).join("").slice(0, 2)} color="#13726c" size="md" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{n.author}</p>
                <p className="text-xs text-slate-500">{n.role} · {formatDateTime(n.date)}</p>
              </div>
            </div>
            <Badge tone={noteTone[n.type]}>{n.type} Note</Badge>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{n.content}</p>
        </Card>
      ))}
    </div>
  );
}
