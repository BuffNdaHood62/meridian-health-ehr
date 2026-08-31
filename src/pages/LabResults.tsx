import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, FlaskConical, AlertOctagon, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { loadPatients, useAsync } from "../data/api";
import { cn } from "../utils/cn";

interface FlatLab {
  patientId: string;
  patientName: string;
  initials: string;
  avatarColor: string;
  department: string;
  labId: string;
  name: string;
  value: string;
  unit: string;
  range: string;
  flag: string;
  category: string;
  collected: string;
}

const flagFilters = ["All", "Critical", "Abnormal", "Normal"] as const;

export default function LabResults() {
  const [query, setQuery] = useState("");
  const [flag, setFlag] = useState<string>("All");
  const { data: patients } = useAsync(loadPatients, []);

  const allLabs: FlatLab[] = useMemo(
    () =>
      (patients ?? []).flatMap((p) =>
        p.labs.map((l) => ({
          patientId: p.id,
          patientName: `${p.firstName} ${p.lastName}`,
          initials: p.initials,
          avatarColor: p.avatarColor,
          department: p.department,
          labId: l.id,
          name: l.name,
          value: l.value,
          unit: l.unit,
          range: l.range,
          flag: l.flag,
          category: l.category,
          collected: l.collected,
        }))
      ),
    [patients]
  );

  const filtered = allLabs.filter((l) => {
    const matchesQuery =
      !query.trim() ||
      l.patientName.toLowerCase().includes(query.toLowerCase()) ||
      l.name.toLowerCase().includes(query.toLowerCase());
    const matchesFlag =
      flag === "All" ||
      (flag === "Critical" && l.flag === "Critical") ||
      (flag === "Abnormal" && (l.flag === "High" || l.flag === "Low")) ||
      (flag === "Normal" && l.flag === "Normal");
    return matchesQuery && matchesFlag;
  });

  const stats = {
    total: allLabs.length,
    critical: allLabs.filter((l) => l.flag === "Critical").length,
    abnormal: allLabs.filter((l) => l.flag === "High" || l.flag === "Low").length,
    normal: allLabs.filter((l) => l.flag === "Normal").length,
  };

  return (
    <div data-testid="labs-page">
      <PageHeader
        title="Laboratory Results"
        subtitle="Review and triage lab results across all patients."
        actions={<Badge tone="brand" className="px-3 py-1.5 text-sm">{stats.total} results</Badge>}
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Results", value: stats.total, icon: FlaskConical, tone: "bg-brand-50 text-brand-600" },
          { label: "Critical", value: stats.critical, icon: AlertOctagon, tone: "bg-rose-50 text-rose-600" },
          { label: "Abnormal", value: stats.abnormal, icon: AlertTriangle, tone: "bg-amber-50 text-amber-600" },
          { label: "Normal", value: stats.normal, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-4">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", s.tone)}>
              <s.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by patient or test name…"
              data-testid="lab-search"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex gap-1.5">
            {flagFilters.map((f) => (
              <button
                key={f}
                onClick={() => setFlag(f)}
                data-testid={`lab-filter-${f.toLowerCase()}`}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  flag === f ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-5 py-3 font-medium">Patient</th>
                <th scope="col" className="px-5 py-3 font-medium">Test</th>
                <th scope="col" className="px-5 py-3 font-medium">Result</th>
                <th scope="col" className="px-5 py-3 font-medium">Reference Range</th>
                <th scope="col" className="px-5 py-3 font-medium">Flag</th>
                <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">Collected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((l) => (
                <tr key={`${l.patientId}-${l.labId}`} className={cn("hover:bg-slate-50", l.flag === "Critical" && "bg-rose-50/30")}>
                  <td className="px-5 py-3.5">
                    <Link to={`/patients/${l.patientId}`} className="flex items-center gap-3">
                      <Avatar initials={l.initials} color={l.avatarColor} size="sm" />
                      <div>
                        <p className="font-semibold text-slate-900 hover:text-brand-700">{l.patientName}</p>
                        <p className="text-xs text-slate-500">{l.department}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-800">{l.name}</p>
                    <p className="text-xs text-slate-500">{l.category}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      "text-base font-bold",
                      l.flag === "Critical" && "text-rose-600",
                      (l.flag === "High" || l.flag === "Low") && "text-amber-600",
                      l.flag === "Normal" && "text-slate-800"
                    )}>
                      {l.value} <span className="text-xs font-normal text-slate-500">{l.unit}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{l.range}</td>
                  <td className="px-5 py-3.5">
                    {l.flag === "Critical" ? (
                      <Badge tone="red" dot>Critical</Badge>
                    ) : l.flag === "High" ? (
                      <Badge tone="amber" dot>↑ High</Badge>
                    ) : l.flag === "Low" ? (
                      <Badge tone="amber" dot>↓ Low</Badge>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Normal</span>
                    )}
                  </td>
                  <td className="hidden px-5 py-3.5 text-xs text-slate-500 sm:table-cell"><Clock className="mr-1 inline h-3 w-3" />{l.collected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <FlaskConical className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No lab results match your filters</p>
          </div>
        )}
      </Card>
    </div>
  );
}
