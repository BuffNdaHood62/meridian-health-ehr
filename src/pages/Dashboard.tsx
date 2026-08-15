import { Link } from "react-router-dom";
import {
  Users,
  BedDouble,
  CalendarClock,
  Siren,
  ClipboardList,
  ArrowRight,
  Activity,
  TrendingUp,
  Stethoscope,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Card, CardHeader } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { StatusBadge, AcuityBadge, Badge, statusTone } from "../components/ui/Badge";
import { GroupedBarChart, RadialGauge, TrendChart } from "../components/charts/Charts";
import { bpTone, hrTone, spo2Tone, tempTone } from "../utils/format";
import { cn } from "../utils/cn";
import {
  patients,
  appointments,
  alerts,
  departmentStats,
  weeklyAdmissions,
  currentUser,
} from "../data/mockData";

export default function Dashboard() {
  const active = patients.filter((p) => ["ICU", "Admitted", "Observation"].includes(p.status));
  const criticalAlerts = alerts.filter((a) => a.severity === "Critical");
  const todayAppts = appointments.filter((a) => a.status !== "Cancelled");
  const totalBeds = departmentStats.reduce((s, d) => s + d.capacity, 0);
  const usedBeds = departmentStats.reduce((s, d) => s + d.census, 0);
  const occupancy = Math.round((usedBeds / totalBeds) * 100);

  const snapshotPatient = patients.find((p) => p.status === "ICU") ?? patients[0];
  const latestVitals = snapshotPatient.vitals[snapshotPatient.vitals.length - 1];

  const toneClass: Record<"good" | "warn" | "bad", string> = {
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  const hrStatus = hrTone(latestVitals.hr);
  const hrLabel = hrStatus === "good" ? "Normal" : hrStatus === "warn" ? "Elevated" : "Critical";
  const hrToneClass = toneClass[hrStatus];

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const nameParts = currentUser.name.split(" ");
  const greetingName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}` : currentUser.name;

  return (
    <div data-testid="dashboard-page">
      <PageHeader
        title={`Good morning, ${greetingName}`}
        subtitle={`Here's your clinical overview for today, ${todayLabel}.`}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Stethoscope className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-slate-700">{active.length} patients under your care</span>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active Patients" value={active.length} icon={<Users className="h-5 w-5" />} tone="brand" trend="up" trendLabel="+3" hint="ICU, Admitted & Observation" />
        <StatCard label="Bed Occupancy" value={`${occupancy}%`} icon={<BedDouble className="h-5 w-5" />} tone="blue" hint={`${usedBeds} of ${totalBeds} beds in use`} />
        <StatCard label="Today's Appointments" value={todayAppts.length} icon={<CalendarClock className="h-5 w-5" />} tone="violet" trend="up" trendLabel="2 left" hint="3 completed" />
        <StatCard label="Critical Alerts" value={criticalAlerts.length} icon={<Siren className="h-5 w-5" />} tone="red" hint="Require acknowledgment" />
      </div>

      {/* Critical alerts banner */}
      <Card className="mt-6 overflow-hidden border-rose-200 bg-gradient-to-r from-rose-50 to-white">
        <div className="flex items-start gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
            <Siren className="h-5 w-5 animate-pulse-ring rounded-full" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-rose-900">{criticalAlerts.length} critical results awaiting review</h3>
              <Badge tone="red" dot>Priority</Badge>
            </div>
            <p className="mt-0.5 text-sm text-rose-700/80">
              The following patients require immediate clinical attention.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {criticalAlerts.map((a) => (
                <Link
                  key={a.id}
                  to={`/patients/${a.patientId}`}
                  className="flex items-center gap-3 rounded-xl border border-rose-100 bg-white px-3 py-2.5 transition-colors hover:border-rose-200 hover:bg-rose-50/50"
                >
                  <Avatar initials={a.initials} color={a.avatarColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{a.patientName}</p>
                    <p className="truncate text-xs text-slate-500">{a.message}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-rose-400" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Main grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Today's schedule */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Today's Schedule"
            subtitle="Appointments & rounds"
            icon={<CalendarClock className="h-[18px] w-[18px]" />}
            action={
              <Link to="/schedule" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                View all
              </Link>
            }
          />
          <div className="divide-y divide-slate-50">
            {todayAppts.slice(0, 5).map((ap) => (
              <Link
                key={ap.id}
                to={`/patients/${ap.patientId}`}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
              >
                <div className="w-14 shrink-0 text-center">
                  <p className="text-sm font-bold text-slate-900">{ap.time}</p>
                  <p className="text-[11px] text-slate-400">{ap.durationMin}m</p>
                </div>
                <Avatar initials={ap.patientInitials} color={ap.avatarColor} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{ap.patientName}</p>
                  <p className="truncate text-xs text-slate-500">{ap.type} · {ap.department}</p>
                </div>
                <StatusBadge status={ap.status} />
              </Link>
            ))}
          </div>
        </Card>

        {/* Patient at a glance — vitals */}
        <Card>
          <CardHeader
            title="Patient Snapshot"
            subtitle={`${snapshotPatient.firstName[0]}. ${snapshotPatient.lastName}${snapshotPatient.room ? ` · ${snapshotPatient.room}` : ""}`}
            icon={<Activity className="h-[18px] w-[18px]" />}
            action={
              <Link to={`/patients/${snapshotPatient.id}`} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Open chart
              </Link>
            }
          />
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Heart Rate (bpm)</span>
              <span className={cn("flex items-center gap-1 text-xs font-semibold", hrToneClass)}>
                <TrendingUp className="h-3 w-3" /> {hrLabel}
              </span>
            </div>
            <TrendChart data={snapshotPatient.vitals.map((v) => v.hr)} color="#e11d48" unit="bpm" height={110} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { l: "BP", v: `${latestVitals.bpSys}/${latestVitals.bpDia}`, t: toneClass[bpTone(latestVitals.bpSys)] },
                { l: "SpO₂", v: `${latestVitals.spo2}%`, t: toneClass[spo2Tone(latestVitals.spo2)] },
                { l: "Temp", v: `${latestVitals.temp}°`, t: toneClass[tempTone(latestVitals.temp)] },
              ].map((s) => (
                <div key={s.l} className="rounded-xl bg-slate-50 py-2.5">
                  <p className={cn("text-sm font-bold", s.t)}>{s.v}</p>
                  <p className="text-[11px] text-slate-400">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Department census */}
        <Card className="lg:col-span-2">
          <CardHeader title="Department Census" subtitle="Real-time bed utilization" icon={<BedDouble className="h-[18px] w-[18px]" />} />
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {departmentStats.map((d) => {
              const pct = Math.round((d.census / d.capacity) * 100);
              const color = pct >= 90 ? "#e11d48" : pct >= 75 ? "#f59e0b" : "#13726c";
              return (
                <div key={d.department} className="flex items-center gap-4 rounded-xl border border-slate-100 p-3">
                  <RadialGauge value={pct} size={56} stroke={6} color={color} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{d.department}</p>
                    <p className="text-xs text-slate-500">{d.census}/{d.capacity} beds</p>
                    <Badge tone={statusTone(d.acuity === "Critical" ? "Critical" : d.acuity === "Serious" ? "Serious" : "Stable")} className="mt-1">
                      {d.acuity}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Weekly admissions chart */}
        <Card>
          <CardHeader title="Admissions & Discharges" subtitle="Past 7 days" icon={<TrendingUp className="h-[18px] w-[18px]" />} />
          <div className="p-5">
            <GroupedBarChart data={weeklyAdmissions} height={180} />
            <div className="mt-3 flex items-center justify-center gap-6 text-xs">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Admitted</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Discharged</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Patients needing attention */}
      <Card className="mt-6">
        <CardHeader
          title="Patients Requiring Attention"
          subtitle="Sorted by acuity — critical & serious cases"
          icon={<ClipboardList className="h-[18px] w-[18px]" />}
          action={
            <Link to="/patients" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              All patients
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Patient</th>
                <th className="px-5 py-3 font-medium">MRN</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Acuity</th>
                <th className="px-5 py-3 font-medium">Primary Dx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {active
                .slice()
                .sort((a, b) => {
                  const rank: Record<string, number> = { Critical: 0, Serious: 1, Stable: 2, Fair: 3 };
                  return (rank[a.acuity] ?? 9) - (rank[b.acuity] ?? 9);
                })
                .map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link to={`/patients/${p.id}`} className="flex items-center gap-3">
                        <Avatar initials={p.initials} color={p.avatarColor} size="sm" />
                        <div>
                          <p className="font-semibold text-slate-900">{p.firstName} {p.lastName}</p>
                          <p className="text-xs text-slate-400">{p.age}y · {p.gender}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.mrn}</td>
                    <td className="px-5 py-3 text-slate-600">{p.department}</td>
                    <td className="px-5 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-5 py-3"><AcuityBadge acuity={p.acuity} /></td>
                    <td className="px-5 py-3 text-slate-600">{p.history[0].title}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
