import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Menu, Search, Command, Plus } from "lucide-react";
import { patients, alerts } from "../../data/mockData";
import { Avatar } from "../ui/Avatar";
import { AcuityBadge } from "../ui/Badge";
import { formatTime } from "../../utils/format";
import { cn } from "../../utils/cn";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  const criticalAlerts = alerts.filter((a) => a.severity === "Critical");
  const topNotifications = [...alerts]
    .sort((a, b) => {
      const rank: Record<string, number> = { Critical: 0, Warning: 1, Info: 2 };
      return (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3);
    })
    .slice(0, 5);

  const results = query.trim()
    ? patients
        .filter(
          (p) =>
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(query.toLowerCase()) ||
            p.mrn.toLowerCase().includes(query.toLowerCase()) ||
            p.department.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 6)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-6">
      <button
        onClick={onMenuClick}
        className="tappable rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search */}
      <div ref={searchRef} className="relative flex-1 max-w-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search patients by name, MRN, or department…"
            data-testid="global-search"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-16 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-500 focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
          <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:flex">
            <Command className="h-3 w-3" /> K
          </kbd>
        </div>

        {open && results.length > 0 && (
          <div className="absolute mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
            <p className="border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {results.length} patient{results.length > 1 ? "s" : ""} found
            </p>
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  navigate(`/patients/${p.id}`);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
              >
                <Avatar initials={p.initials} color={p.avatarColor} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {p.mrn} · {p.department}
                  </p>
                </div>
                <AcuityBadge acuity={p.acuity} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => navigate("/orders")}
          className="hidden items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-colors hover:bg-brand-700 sm:inline-flex"
          data-testid="new-order-button"
        >
          <Plus className="h-4 w-4" /> New Order
        </button>

        {/* Notifications */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="relative rounded-lg p-2.5 text-slate-500 transition-colors hover:bg-slate-100"
            aria-label="Notifications"
            aria-expanded={bellOpen}
            data-testid="notifications-button"
          >
            <Bell className="h-5 w-5" />
            {criticalAlerts.length > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                {criticalAlerts.length}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">Notifications</p>
                <p className="text-xs text-slate-500">
                  {criticalAlerts.length} critical alert{criticalAlerts.length === 1 ? "" : "s"} require review
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {topNotifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      navigate(`/patients/${n.patientId}`);
                      setBellOpen(false);
                    }}
                    className="flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        n.severity === "Critical"
                          ? "bg-rose-500"
                          : n.severity === "Warning"
                          ? "bg-amber-500"
                          : "bg-sky-500"
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {n.type}: {n.patientName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {n.message} · {formatTime(n.time)}
                      </p>
                    </div>
                  </button>
                ))}
                {topNotifications.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
