import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search, HeartPulse, Stethoscope, Activity, Syringe, FileText, Droplet,
  ShieldAlert, Filter,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge, type Tone } from "../components/ui/Badge";
import { loadPatients, useAsync } from "../data/api";
import { formatDate } from "../utils/format";
import { cn } from "../utils/cn";

interface FlatEvent {
  patientId: string;
  patientName: string;
  initials: string;
  avatarColor: string;
  eventId: string;
  date: string;
  title: string;
  type: string;
  description: string;
  provider: string;
}

const typeIcon: Record<string, React.ElementType> = {
  Diagnosis: HeartPulse, Surgery: Stethoscope, Imaging: Activity, Procedure: Syringe,
  Visit: FileText, Vaccination: Droplet, Allergy: ShieldAlert,
};
const typeTone: Record<string, Tone> = {
  Diagnosis: "red", Surgery: "violet", Imaging: "blue", Procedure: "violet",
  Visit: "slate", Vaccination: "green", Allergy: "amber",
};
const allTypes = ["All", "Diagnosis", "Surgery", "Imaging", "Procedure", "Visit", "Vaccination", "Allergy"];

export default function MedicalHistory() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const { data: patients } = useAsync(loadPatients, []);

  const events = useMemo<FlatEvent[]>(
    () =>
      (patients ?? [])
        .flatMap((p) =>
          p.history.map((h) => ({
            patientId: p.id,
            patientName: `${p.firstName} ${p.lastName}`,
            initials: p.initials,
            avatarColor: p.avatarColor,
            eventId: `${p.id}-${h.id}`,
            date: h.date,
            title: h.title,
            type: h.type,
            description: h.description,
            provider: h.provider,
          }))
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [patients]
  );

  const filtered = events.filter((e) => {
    const matchesQuery =
      !query.trim() ||
      e.patientName.toLowerCase().includes(query.toLowerCase()) ||
      e.title.toLowerCase().includes(query.toLowerCase()) ||
      e.description.toLowerCase().includes(query.toLowerCase());
    const matchesType = type === "All" || e.type === type;
    return matchesQuery && matchesType;
  });

  // Group by year-month
  const groups = useMemo(() => {
    const map = new Map<string, FlatEvent[]>();
    filtered.forEach((e) => {
      const key = new Date(e.date).toLocaleDateString("en-US", { year: "numeric", month: "long" });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div data-testid="history-page">
      <PageHeader
        title="Medical History Registry"
        subtitle="A longitudinal, cross-patient record of clinical events."
        actions={<Badge tone="brand" className="px-3 py-1.5 text-sm">{events.length} events</Badge>}
      />

      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, diagnoses, procedures…"
              data-testid="history-search"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <Filter className="h-4 w-4 shrink-0 text-slate-500" />
            {allTypes.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  type === t ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        {groups.map(([month, evs]) => (
          <Card key={month}>
            <CardHeader title={month} subtitle={`${evs.length} event(s)`} icon={<Activity className="h-[18px] w-[18px]" />} />
            <div className="p-5">
              <ol className="relative space-y-5 border-l-2 border-slate-100 pl-6">
                {evs.map((e) => {
                  const Icon = typeIcon[e.type] ?? FileText;
                  return (
                    <li key={e.eventId} className="relative">
                      <span className="absolute -left-[34px] flex h-8 w-8 items-center justify-center rounded-full border-2 border-white ring-1 ring-slate-100">
                        <span className="flex h-full w-full items-center justify-center rounded-full bg-brand-50 text-brand-600">
                          <Icon className="h-4 w-4" />
                        </span>
                      </span>
                      <div className="rounded-xl border border-slate-100 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <Avatar initials={e.initials} color={e.avatarColor} size="sm" />
                            <div>
                              <Link to={`/patients/${e.patientId}`} className="text-sm font-semibold text-slate-900 hover:text-brand-700">
                                {e.title}
                              </Link>
                              <p className="text-xs text-slate-500">{e.patientName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge tone={typeTone[e.type]}>{e.type}</Badge>
                            <span className="text-xs text-slate-500">{formatDate(e.date)}</span>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{e.description}</p>
                        <p className="mt-2 text-xs text-slate-500">Provider: {e.provider}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="flex flex-col items-center py-16 text-center">
          <Search className="mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No events match your filters</p>
        </Card>
      )}
    </div>
  );
}
