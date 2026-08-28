import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Filter, AlertTriangle, ChevronRight, Users, Siren, BedDouble } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { StatusBadge, AcuityBadge, Badge, type Tone } from "../components/ui/Badge";
import { loadPatients, useAsync } from "../data/api";
import { formatDate, ageFromDob } from "../utils/format";
import { cn } from "../utils/cn";

const statusFilters = ["All", "ICU", "Admitted", "Observation", "Outpatient", "Discharged"] as const;

export default function Patients() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("All");
  const { data: patients, loading } = useAsync(loadPatients, []);

  const filtered = useMemo(() => {
    const list = patients ?? [];
    return list.filter((p) => {
      const matchesQuery =
        !query.trim() ||
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(query.toLowerCase()) ||
        p.mrn.toLowerCase().includes(query.toLowerCase()) ||
        p.department.toLowerCase().includes(query.toLowerCase()) ||
        p.primaryPhysician.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "All" || p.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, status, patients]);

  const stats = {
    total: patients?.length ?? 0,
    scheduled: patients?.filter((p) => ["ICU", "Admitted", "Observation"].includes(p.status)).length ?? 0,
    priority: patients?.filter((p) => p.acuity === "Critical" || p.acuity === "Serious").length ?? 0,
  };

  return (
    <div data-testid="patients-page">
      {loading && (
        <p className="mb-4 text-sm text-slate-500">Loading patients…</p>
      )}
      <PageHeader
        title="WWW Clients"
        subtitle="Search and manage all patients in your care network."
        actions={
          <Badge tone="brand" className="px-3 py-1.5 text-sm">
            {stats.total} WWW clients
          </Badge>
        }
      />

      {/* Summary tiles */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[
          { label: "WWW Clients", value: stats.total, icon: Users, tone: "brand" as Tone },
          { label: "WWW Scheduled Patients", value: stats.scheduled, icon: BedDouble, tone: "blue" as Tone },
          { label: "WWW Priority Clients", value: stats.priority, icon: Siren, tone: "red" as Tone },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-4">
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                s.tone === "brand" && "bg-brand-50 text-brand-600",
                s.tone === "blue" && "bg-sky-50 text-sky-600",
                s.tone === "red" && "bg-rose-50 text-rose-600",
                s.tone === "green" && "bg-emerald-50 text-emerald-600"
              )}
            >
              <s.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Search + filters */}
      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, MRN, department, or physician…"
              data-testid="patient-search"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <Filter className="h-4 w-4 shrink-0 text-slate-500" />
            {statusFilters.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                data-testid={`filter-${s.toLowerCase()}`}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  status === s
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Patient table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-5 py-3 font-medium">Patient</th>
                <th scope="col" className="px-5 py-3 font-medium">MRN / Age</th>
                <th scope="col" className="px-5 py-3 font-medium">Department</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 font-medium">Acuity</th>
                <th scope="col" className="px-5 py-3 font-medium">Allergies</th>
                <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">Last Visit</th>
                <th scope="col" className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((p) => (
                <tr key={p.id} className="group transition-colors hover:bg-brand-50/30" data-testid={`patient-row-${p.id}`}>
                  <td className="px-5 py-3.5">
                    <Link to={`/patients/${p.id}`} className="flex items-center gap-3">
                      <Avatar initials={p.initials} color={p.avatarColor} size="md" />
                      <div>
                        <p className="font-semibold text-slate-900 group-hover:text-brand-700">
                          {p.firstName} {p.lastName}
                        </p>
                        <p className="text-xs text-slate-500">{p.pronouns} · {p.bloodType}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-mono text-xs text-slate-500">{p.mrn}</p>
                    <p className="text-xs text-slate-500">{ageFromDob(p.dateOfBirth)}y · {p.gender}</p>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{p.department}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={p.status} /></td>
                  <td className="px-5 py-3.5"><AcuityBadge acuity={p.acuity} /></td>
                  <td className="px-5 py-3.5">
                    {p.allergies.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> {p.allergies.length}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">None</span>
                    )}
                  </td>
                  <td className="hidden px-5 py-3.5 text-xs text-slate-500 sm:table-cell">{formatDate(p.history[0].date)}</td>
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/patients/${p.id}`}
                      className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-brand-100 hover:text-brand-600"
                      aria-label={`Open ${p.firstName} ${p.lastName}'s chart`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No patients found</p>
            <p className="text-xs text-slate-500">Try adjusting your search or filters.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
