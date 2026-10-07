import { useMemo, useState } from "react";
import { Search, Users, BedDouble, ClipboardList, Printer, Mail, Plus, LockKeyhole } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { ErrorNote } from "../components/ui/ErrorNote";
import { WWW_AGE_BANDS, type WwwAgeBand, type WwwStatus, type WwwVisitEntry } from "../types";
import { ensureSeeded, addEntry, groupClients, nextWwwNumber, wwwNumberForClient, clientRecordText } from "../utils/wwwRecords";
import { findDemographics, ageBandFromDob } from "../utils/demographics";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100";

const numOrNull = (v: string): number | null => (v.trim() === "" ? null : isNaN(Number(v)) ? null : Number(v));

const n = (v: number | null, suffix = "") => (v == null ? "—" : `${v}${suffix}`);

function vitalLine(e: WwwVisitEntry): string {
  const v = e.vitals;
  return `${n(v.tempC, "°C")} · ${n(v.spo2Pct, "%")} · ${n(v.bpSys)}/${n(v.bpDia)} · ${n(v.pulseBpm)}bpm · ${n(v.respRate)}/min`;
}

function visitDate(e: WwwVisitEntry): string {
  return new Date(e.visitAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Open a plain print sheet for one immutable visit record.
function printRecord(e: WwwVisitEntry) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><title>WWW ${esc(e.wwwNumber)} — ${esc(e.clientName)}</title></head>` +
    `<body style="font-family:system-ui,sans-serif;padding:32px">` +
    `<h2 style="margin:0 0 4px">Wellness with Writingale EMR — Client Record</h2>` +
    `<p style="margin:0 0 16px;color:#555">Generated ${esc(new Date().toLocaleString())}</p>` +
    `<pre style="white-space:pre-wrap;font:14px/1.6 system-ui,sans-serif">${esc(clientRecordText(e))}</pre>` +
    `</body></html>`
  );
  w.document.close();
  w.focus();
  w.print();
}

function emailRecord(e: WwwVisitEntry) {
  const body = encodeURIComponent(`${clientRecordText(e)}\n\n— Sent from Wellness with Writingale EMR`);
  window.location.href = `mailto:?subject=${encodeURIComponent(`WWW client record ${e.wwwNumber} — ${e.clientName}`)}&body=${body}`;
}

interface DraftState {
  clientName: string;
  ageBand: WwwAgeBand | "";
  facility: string;
  status: WwwStatus;
  complaints: string;
  allergies: string;
  temp: string; spo2: string; bpSys: string; bpDia: string; pulse: string; resp: string; height: string; weight: string;
}

const emptyDraft: DraftState = {
  clientName: "", ageBand: "", facility: "", status: "Not admitted",
  complaints: "", allergies: "",
  temp: "", spo2: "", bpSys: "", bpDia: "", pulse: "", resp: "", height: "", weight: "",
};

function EntryForm({
  initial,
  assignedNumber,
  onSave,
  onCancel,
}: {
  initial: DraftState;
  assignedNumber: string;
  onSave: (d: DraftState) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<DraftState>(initial);
  const set = (patch: Partial<DraftState>) => setD((cur) => ({ ...cur, ...patch }));
  const valid = d.clientName.trim() !== "" && d.ageBand !== "" && d.facility.trim() !== "" && d.complaints.trim() !== "";

  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="www-entry-form">
      <p className="sm:col-span-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
        <LockKeyhole className="mr-1 inline h-3.5 w-3.5" />
        This entry will be saved as <strong>WWW {assignedNumber}</strong> and <strong>cannot be edited after saving</strong>. Each visit creates a new entry.
      </p>
      <label className="block sm:col-span-2">
        <span className="mb-0.5 block text-[11px] font-medium text-slate-500">Client name *</span>
        <input value={d.clientName} onChange={(e) => set({ clientName: e.target.value })} data-testid="www-form-name" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-slate-500">Age *</span>
        <select value={d.ageBand} onChange={(e) => set({ ageBand: e.target.value as WwwAgeBand })} data-testid="www-form-age" className={inputCls}>
          <option value="">Select age band…</option>
          {WWW_AGE_BANDS.map((b) => <option key={b}>{b}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-slate-500">Facility *</span>
        <input value={d.facility} onChange={(e) => set({ facility: e.target.value })} data-testid="www-form-facility" className={inputCls} placeholder="e.g. WWW Clinic Uyo" />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-slate-500">Status *</span>
        <select value={d.status} onChange={(e) => set({ status: e.target.value as WwwStatus })} data-testid="www-form-status" className={inputCls}>
          {["Admitted", "Not admitted"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-slate-500">Allergies (subjective)</span>
        <input value={d.allergies} onChange={(e) => set({ allergies: e.target.value })} data-testid="www-form-allergies" className={inputCls} placeholder="Client's own account" />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-0.5 block text-[11px] font-medium text-slate-500">Complaints *</span>
        <textarea value={d.complaints} onChange={(e) => set({ complaints: e.target.value })} data-testid="www-form-complaints" rows={2} className={inputCls} />
      </label>
      <fieldset className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Vital signs</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ["Temp °C", "temp", 30, 45], ["SpO₂ %", "spo2", 50, 100],
            ["BP sys", "bpSys", 60, 260], ["BP dia", "bpDia", 30, 180],
            ["Pulse", "pulse", 30, 250], ["Resp", "resp", 6, 60],
            ["Height cm", "height", 20, 260], ["Weight kg", "weight", 0.3, 400],
          ] as const).map(([label, key, min, max]) => {
            const value = d[key];
            const num = Number(value);
            const bad = value !== "" && (isNaN(num) || num < min || num > max);
            return (
              <label key={key} className="block">
                <span className="mb-0.5 block text-[11px] font-medium text-slate-500">{label}</span>
                <input
                  type="number"
                  value={value}
                  min={min}
                  max={max}
                  step="0.1"
                  onChange={(e) => set({ [key]: e.target.value } as Partial<DraftState>)}
                  aria-invalid={bad}
                  className={`${inputCls} ${bad ? "border-rose-300 bg-rose-50" : ""}`}
                />
                {bad && <span className="text-[10px] font-medium text-rose-600">Range {min}–{max}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex gap-2 sm:col-span-2">
        <button
          onClick={() => onSave(d)}
          disabled={!valid}
          data-testid="www-form-save"
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save Entry (permanent)
        </button>
        <button onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Patients() {
  const [entries, setEntries] = useState<WwwVisitEntry[]>(ensureSeeded);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [prefill, setPrefill] = useState<DraftState>(emptyDraft);
  const [formError, setFormError] = useState("");

  const clients = useMemo(() => groupClients(entries), [entries]);
  const admitted = clients.filter((c) => c.latest.status === "Admitted").length;
  const totalVisits = entries.length;

  const filtered = clients.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || c.clientName.toLowerCase().includes(q) || c.wwwNumber.includes(q) || c.latest.facility.toLowerCase().includes(q);
  });

  // The number a new entry for this name would receive (existing client keeps theirs).
  const draftNumber = (() => {
    const name = prefill.clientName.trim();
    if (name) return wwwNumberForClient(entries, name);
    try {
      return nextWwwNumber(entries);
    } catch {
      return "pool full";
    }
  })();

  const saveEntry = (d: DraftState) => {
    const name = d.clientName.trim();
    const bio = findDemographics(name);
    let entry: WwwVisitEntry;
    try {
      entry = {
        id: `w-${crypto.randomUUID()}`,
        wwwNumber: wwwNumberForClient(entries, name),
        clientName: name,
        ageBand: (d.ageBand || (bio ? ageBandFromDob(bio.dob) : "")) as WwwAgeBand | "",
        facility: d.facility.trim(),
        status: d.status,
        complaints: d.complaints.trim(),
        allergies: d.allergies.trim(),
        address: bio?.address,
        nextOfKin: bio?.nextOfKin,
        nextOfKinPhone: bio?.nextOfKinPhone,
        motherName: bio?.motherName,
        motherPhone: bio?.motherPhone,
        fatherName: bio?.fatherName,
        fatherPhone: bio?.fatherPhone,
        vitals: {
          tempC: numOrNull(d.temp), spo2Pct: numOrNull(d.spo2), bpSys: numOrNull(d.bpSys),
          bpDia: numOrNull(d.bpDia), pulseBpm: numOrNull(d.pulse), respRate: numOrNull(d.resp),
          heightCm: numOrNull(d.height), weightKg: numOrNull(d.weight),
        },
        visitAt: new Date().toISOString(),
        savedAt: new Date().toISOString(),
      };
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not assign a WWW number.");
      return;
    }
    setEntries(addEntry(entry));
    setFormError("");
    setShowForm(false);
    setPrefill(emptyDraft);
    setExpanded(entry.wwwNumber);
  };

  const openVisitFor = (clientName: string) => {
    const c = clients.find((x) => x.clientName === clientName);
    const bio = findDemographics(clientName);
    const bandFromDob = bio ? (ageBandFromDob(bio.dob) as WwwAgeBand) : "";
    setPrefill(c
      ? { ...emptyDraft, clientName: c.clientName, ageBand: c.latest.ageBand || bandFromDob, facility: c.latest.facility }
      : { ...emptyDraft, clientName, ageBand: bandFromDob });
    setShowForm(true);
  };

  return (
    <div data-testid="patients-page">
      <PageHeader
        title="WWW Clients"
        subtitle="Search and manage all clients in your care network."
        actions={
          <>
            <button
              onClick={() => { setPrefill(emptyDraft); setShowForm(true); }}
              data-testid="www-add-entry"
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> New Client Entry
            </button>
            <Badge tone="brand" className="px-3 py-1.5 text-sm">{clients.length} WWW clients</Badge>
          </>
        }
      />

      {/* Summary tiles — spec §2 naming */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[
          { label: "WWW Clients", value: clients.length, icon: Users },
          { label: "WWW Scheduled Patients", value: admitted, icon: BedDouble },
          { label: "Visits Recorded", value: totalVisits, icon: ClipboardList },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by client name, WWW number, or facility…"
            data-testid="patients-search"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-3 font-medium">WWW #</th>
                <th scope="col" className="px-4 py-3 font-medium">Client</th>
                <th scope="col" className="px-4 py-3 font-medium">Age</th>
                <th scope="col" className="px-4 py-3 font-medium">Facility</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Complaints</th>
                <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Allergies</th>
                <th scope="col" className="hidden px-4 py-3 font-medium xl:table-cell">Vitals</th>
                <th scope="col" className="px-4 py-3 font-medium">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((c) => (
                <FragmentRow
                  key={c.wwwNumber}
                  client={c}
                  entries={entries}
                  expanded={expanded === c.wwwNumber}
                  onToggle={() => setExpanded((v) => (v === c.wwwNumber ? null : c.wwwNumber))}
                  onNewVisit={() => openVisitFor(c.clientName)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <Users className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No clients match your search</p>
          </div>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New WWW Client Entry" description="One record per visit. Saving is permanent.">
        {formError && <ErrorNote message={formError} testId="www-form-error" />}
        <EntryForm initial={prefill} assignedNumber={draftNumber} onSave={saveEntry} onCancel={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function FragmentRow({
  client, entries, expanded, onToggle, onNewVisit,
}: {
  client: { wwwNumber: string; clientName: string; latest: WwwVisitEntry; visits: number };
  entries: WwwVisitEntry[];
  expanded: boolean;
  onToggle: () => void;
  onNewVisit: () => void;
}) {
  const visits = entries
    .filter((e) => e.wwwNumber === client.wwwNumber)
    .sort((a, b) => b.visitAt.localeCompare(a.visitAt));
  const l = client.latest;
  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3.5 font-mono text-xs font-semibold text-brand-700">{l.wwwNumber}</td>
        <td className="px-4 py-3.5">
          <button onClick={onToggle} data-testid={`www-row-${l.wwwNumber}`} className="text-left font-semibold text-slate-900 hover:text-brand-700">
            {l.clientName}
          </button>
          <p className="text-xs text-slate-500">{client.visits} visit{client.visits > 1 ? "s" : ""}</p>
        </td>
        <td className="px-4 py-3.5 text-xs text-slate-600">{l.ageBand || "—"}</td>
        <td className="px-4 py-3.5 text-xs text-slate-600">{l.facility || "—"}</td>
        <td className="px-4 py-3.5">
          {l.status === "Admitted" ? <Badge tone="red" dot>Admitted</Badge>
            : l.status === "Not admitted" ? <Badge tone="slate">Not admitted</Badge>
            : <Badge tone="slate">Review</Badge>}
        </td>
        <td className="hidden max-w-[180px] truncate px-4 py-3.5 text-xs text-slate-600 md:table-cell">{l.complaints}</td>
        <td className="hidden max-w-[180px] truncate px-4 py-3.5 text-xs text-slate-600 lg:table-cell">{l.allergies || "—"}</td>
        <td className="hidden max-w-[260px] px-4 py-3.5 text-[11px] text-slate-500 xl:table-cell">{vitalLine(l)}</td>
        <td className="px-4 py-3.5 text-xs font-medium text-slate-700">{n(l.vitals.weightKg, " kg")}</td>
      </tr>
      {expanded && (
        <tr data-testid={`www-detail-${l.wwwNumber}`}>
          <td colSpan={9} className="bg-slate-50/60 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full record — every visit, newest first</p>
              <button onClick={onNewVisit} data-testid={`www-new-visit-${l.wwwNumber}`} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                <Plus className="h-3.5 w-3.5" /> New visit entry
              </button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {visits.map((v) => (
                <div key={v.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Visit · {visitDate(v)}</p>
                    <div className="flex gap-1.5">
                      <button onClick={() => printRecord(v)} data-testid={`www-print-${v.id}`} aria-label="Print record" className="tappable rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                        <Printer className="h-4 w-4" />
                      </button>
                      <button onClick={() => emailRecord(v)} data-testid={`www-email-${v.id}`} aria-label="Send by email" className="tappable rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                        <Mail className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600"><span className="font-medium">Age:</span> {v.ageBand || "—"} · <span className="font-medium">Facility:</span> {v.facility || "—"} · <span className="font-medium">Status:</span> {v.status || "Review"}</p>
                  {v.diagnosis && <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Diagnosis:</span> {v.diagnosis}</p>}
                  <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Complaints:</span> {v.complaints}</p>
                  <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Allergies (subjective):</span> {v.allergies || "—"}</p>
                  <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Vitals:</span> Temp {n(v.vitals.tempC, " °C")} · SpO₂ {n(v.vitals.spo2Pct, " %")} · BP {n(v.vitals.bpSys)}/{n(v.vitals.bpDia)} · Pulse {n(v.vitals.pulseBpm)} · Resp {n(v.vitals.respRate)} · Height {n(v.vitals.heightCm, " cm")} · Weight {n(v.vitals.weightKg, " kg")}</p>
                  {(v.address || v.nextOfKin || v.motherName || v.fatherName) && (
                    <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                      <p className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Demographics</p>
                      {v.address && <p><span className="font-medium">Address:</span> {v.address}</p>}
                      {v.nextOfKin && <p><span className="font-medium">Next of kin:</span> {v.nextOfKin}{v.nextOfKinPhone ? ` (${v.nextOfKinPhone})` : ""}</p>}
                      {v.motherName && <p><span className="font-medium">Mother:</span> {v.motherName}{v.motherPhone ? ` (${v.motherPhone})` : ""}</p>}
                      {v.fatherName && <p><span className="font-medium">Father:</span> {v.fatherName}{v.fatherPhone ? ` (${v.fatherPhone})` : ""}</p>}
                    </div>
                  )}
                  <p className="mt-2 text-[10px] italic text-slate-400">Locked record — entries cannot be edited after saving.</p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
