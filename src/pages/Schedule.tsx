import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays, Clock, CheckCircle2, CalendarClock, UserX, Video,
  ChevronLeft, ChevronRight, Plus, MapPin,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { StatusBadge, Badge } from "../components/ui/Badge";
import { appointments } from "../data/mockData";
import { cn } from "../utils/cn";

const typeIcon: Record<string, React.ElementType> = {
  Telehealth: Video,
  Procedure: CalendarDays,
  "New Patient": UserX,
};

export default function Schedule() {
  const [statusFilter, setStatusFilter] = useState("All");

  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const monthDay = today.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  const sorted = [...appointments].sort((a, b) => a.time.localeCompare(b.time));
  const filtered = sorted.filter((a) => statusFilter === "All" || a.status === statusFilter);

  const stats = {
    total: appointments.length,
    completed: appointments.filter((a) => a.status === "Completed").length,
    upcoming: appointments.filter((a) => ["Scheduled", "Checked-in", "In Progress"].includes(a.status)).length,
    noshow: appointments.filter((a) => a.status === "No-show").length,
  };

  const morning = filtered.filter((a) => parseInt(a.time) < 12);
  const afternoon = filtered.filter((a) => parseInt(a.time) >= 12);

  const statusOptions = ["All", "Scheduled", "Checked-in", "In Progress", "Completed", "Cancelled"];

  return (
    <div data-testid="schedule-page">
      <PageHeader
        title="Daily Schedule"
        subtitle={`Your appointments and rounds for ${todayLabel}.`}
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Block slot
          </button>
        }
      />

      {/* Date navigator */}
      <Card className="mb-5 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-brand-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Today, {monthDay}</p>
            <p className="text-xs text-slate-500">{stats.total} appointments scheduled</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><ChevronLeft className="h-4 w-4" /></button>
          <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Today</button>
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </Card>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Today", value: stats.total, icon: CalendarClock, tone: "bg-brand-50 text-brand-600" },
          { label: "Completed", value: stats.completed, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
          { label: "Upcoming", value: stats.upcoming, icon: Clock, tone: "bg-sky-50 text-sky-600" },
          { label: "No-shows", value: stats.noshow, icon: UserX, tone: "bg-rose-50 text-rose-600" },
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

      {/* Filter */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {statusOptions.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              statusFilter === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {[
          { label: "Morning", items: morning },
          { label: "Afternoon", items: afternoon },
        ].map((section) =>
          section.items.length > 0 ? (
            <div key={section.label}>
              <div className="mb-3 flex items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-700">{section.label}</h3>
                <span className="text-xs text-slate-400">{section.items.length} appointment(s)</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="space-y-3">
                {section.items.map((ap) => {
                  const Icon = typeIcon[ap.type] ?? CalendarClock;
                  return (
                    <Card key={ap.id} className="overflow-hidden transition-shadow hover:shadow-md">
                      <Link to={`/patients/${ap.patientId}`} className="flex items-stretch">
                        <div className="flex w-20 shrink-0 flex-col items-center justify-center border-r border-slate-100 bg-slate-50/60 px-2 py-4">
                          <p className="text-base font-bold text-slate-900">{ap.time}</p>
                          <p className="text-[11px] text-slate-400">{ap.durationMin} min</p>
                        </div>
                        <div className="flex flex-1 items-center gap-4 p-4">
                          <Avatar initials={ap.patientInitials} color={ap.avatarColor} size="lg" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{ap.patientName}</p>
                              <Badge tone="slate"><Icon className="mr-1 h-3 w-3" />{ap.type}</Badge>
                            </div>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                              <MapPin className="h-3 w-3" />{ap.department}
                            </p>
                            {ap.notes && <p className="mt-1 text-xs text-slate-400">{ap.notes}</p>}
                          </div>
                          <div className="hidden shrink-0 sm:block">
                            <StatusBadge status={ap.status} />
                          </div>
                        </div>
                      </Link>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
