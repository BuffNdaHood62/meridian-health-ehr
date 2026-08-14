import { useMemo, useState } from "react";
import {
  Pill, FlaskConical, ScanLine, Stethoscope, ClipboardList, Plus, Trash2,
  AlertTriangle, ShieldCheck, Zap, Clock, CheckCircle2, Send, Activity, Bed,
  FileWarning,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { patients, orders as initialOrders, currentUser } from "../data/mockData";
import type { OrderItem, OrderType } from "../types";
import { cn } from "../utils/cn";

const orderTypes: { type: OrderType; label: string; icon: React.ElementType }[] = [
  { type: "Medication", label: "Medication", icon: Pill },
  { type: "Laboratory", label: "Laboratory", icon: FlaskConical },
  { type: "Imaging", label: "Imaging", icon: ScanLine },
  { type: "Referral", label: "Referral", icon: Stethoscope },
  { type: "Nursing", label: "Nursing", icon: Bed },
];

// Quick-add order catalog
const catalog: Record<OrderType, string[]> = {
  Medication: ["Acetaminophen 650mg PO Q6H PRN", "Ceftriaxone 1g IV Q24H", "Metformin 1000mg PO BID", "Insulin Glargine 24u SC QD", "Ondansetron 4mg IV Q8H PRN", "Heparin 5000u SC Q8H"],
  Laboratory: ["CBC with Differential", "Comprehensive Metabolic Panel", "Blood Cultures x2", "Troponin I (serial)", "Lactate Level", "Coagulation Panel (PT/INR)", "Urine Analysis"],
  Imaging: ["Chest X-Ray (PA/Lateral)", "CT Head without Contrast", "CT Abdomen/Pelvis with Contrast", "Echocardiogram", "Ultrasound (Lower Extremity)", "MRI Brain"],
  Referral: ["Physical Therapy Consult", "Cardiology Consult", "Neurology Consult", "Nutrition Consult", "Wound Care", "Palliative Care"],
  Nursing: ["Neuro Checks Q1H", "Strict Intake & Output", "Fall Precautions", "Sequential Compression Devices", "Foley Catheter Care", "NPO After Midnight"],
};

interface DraftOrder {
  id: string;
  type: OrderType;
  name: string;
  detail: string;
  priority: "Routine" | "STAT" | "Urgent";
}

// Clinical Decision Support — flags risks for the selected patient
function runCDS(patientId: string, draft: DraftOrder): { level: "danger" | "warning" | "ok"; message: string }[] {
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return [];
  const findings: { level: "danger" | "warning" | "ok"; message: string }[] = [];
  const name = draft.name.toLowerCase();

  // Allergy check
  patient.allergies.forEach((a) => {
    const sub = a.substance.toLowerCase();
    if (
      (sub.includes("penicillin") && (name.includes("penicillin") || name.includes("amoxicillin") || name.includes("ampicillin"))) ||
      (sub.includes("sulfa") && name.includes("sulfa")) ||
      (sub === "aspirin" && name.includes("aspirin")) ||
      (sub.includes("peanut") && false)
    ) {
      findings.push({ level: "danger", message: `Allergy conflict: ${a.substance} (${a.severity}). Order blocked — alternative required.` });
    }
  });

  // Drug interaction / class warnings
  if (name.includes("metformin") && patient.labs.some((l) => l.name.includes("Creatinine") && l.flag !== "Normal")) {
    findings.push({ level: "warning", message: "Metformin caution: elevated creatinine detected. Reassess renal function." });
  }
  if (name.includes("heparin") && patient.medications.some((m) => m.class.includes("Antiplatelet"))) {
    findings.push({ level: "warning", message: "Bleeding risk: concurrent antiplatelet therapy detected." });
  }
  if ((name.includes("ct") || name.includes("contrast")) && patient.allergies.some((a) => a.substance.toLowerCase().includes("iodine"))) {
    findings.push({ level: "danger", message: "Iodine contrast allergy documented. Premedication required or use alternative." });
  }

  if (findings.length === 0) {
    findings.push({ level: "ok", message: "No contraindications detected. Safe to order." });
  }
  return findings;
}

export default function Orders() {
  const [patientId, setPatientId] = useState(patients[0].id);
  const [type, setType] = useState<OrderType>("Medication");
  const [selectedName, setSelectedName] = useState("");
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState<"Routine" | "STAT" | "Urgent">("Routine");
  const [cart, setCart] = useState<DraftOrder[]>([]);
  const [submitted, setSubmitted] = useState<OrderItem[]>(initialOrders);

  const patient = patients.find((p) => p.id === patientId)!;

  const cdsResults = useMemo(() => cart.flatMap((d) => runCDS(patientId, d)), [cart, patientId]);
  const hasBlock = cdsResults.some((r) => r.level === "danger");

  const addToCart = () => {
    if (!selectedName) return;
    setCart((c) => [...c, { id: `draft-${Date.now()}`, type, name: selectedName, detail: detail || "—", priority }]);
    setSelectedName("");
    setDetail("");
  };

  const removeFromCart = (id: string) => setCart((c) => c.filter((d) => d.id !== id));

  const submitOrders = () => {
    if (hasBlock) return;
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    const newOrders: OrderItem[] = cart.map((d) => ({
      id: `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: d.type,
      name: d.name,
      detail: d.detail,
      priority: d.priority,
      status: "Pending",
      ordered: now,
      orderedBy: currentUser.name,
    }));
    setSubmitted((s) => [...newOrders, ...s]);
    setCart([]);
  };

  return (
    <div data-testid="orders-page">
      <PageHeader
        title="Computerized Provider Order Entry"
        subtitle="Place medication, lab, imaging, and care orders with built-in safety checks."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium text-slate-600">CDS active</span>
          </div>
        }
      />

      {/* Patient selector */}
      <Card className="mb-6 p-4">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Ordering for</label>
        <div className="flex flex-wrap gap-2">
          {patients.filter((p) => p.status !== "Outpatient" && p.status !== "Discharged").map((p) => (
            <button
              key={p.id}
              onClick={() => setPatientId(p.id)}
              data-testid={`cpoe-patient-${p.id}`}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
                patientId === p.id
                  ? "border-brand-300 bg-brand-50 ring-2 ring-brand-100"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <Avatar initials={p.initials} color={p.avatarColor} size="xs" />
              <span className="font-medium text-slate-800">{p.firstName} {p.lastName}</span>
              <span className="font-mono text-[10px] text-slate-400">{p.mrn}</span>
            </button>
          ))}
        </div>
        {patient.allergies.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-800">Known allergies:</span>
            {patient.allergies.map((a) => (
              <Badge key={a.id} tone={a.severity === "Severe" ? "red" : "amber"}>{a.substance}</Badge>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Order builder */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader title="New Order" subtitle={`Building order set for ${patient.firstName} ${patient.lastName}`} icon={<ClipboardList className="h-[18px] w-[18px]" />} />

            {/* Type tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
              {orderTypes.map((ot) => (
                <button
                  key={ot.type}
                  onClick={() => { setType(ot.type); setSelectedName(""); }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                    type === ot.type ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <ot.icon className="h-4 w-4" /> {ot.label}
                </button>
              ))}
            </div>

            <div className="space-y-4 p-5">
              {/* Quick catalog */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Quick add — {type}</p>
                <div className="flex flex-wrap gap-2">
                  {catalog[type].map((item) => (
                    <button
                      key={item}
                      onClick={() => setSelectedName(item)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        selectedName === item ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-brand-200 hover:bg-brand-50/50"
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual entry */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">{type} order</label>
                  <input
                    value={selectedName}
                    onChange={(e) => setSelectedName(e.target.value)}
                    placeholder={`Search or enter ${type.toLowerCase()} order…`}
                    data-testid="order-name-input"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">Additional instructions</label>
                  <input
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    placeholder="e.g. trough before 4th dose"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">Priority</label>
                  <div className="flex gap-2">
                    {(["Routine", "Urgent", "STAT"] as const).map((pr) => (
                      <button
                        key={pr}
                        onClick={() => setPriority(pr)}
                        className={cn(
                          "flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
                          priority === pr
                            ? pr === "STAT" ? "border-rose-300 bg-rose-50 text-rose-700" : pr === "Urgent" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-brand-300 bg-brand-50 text-brand-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {pr === "STAT" && <Zap className="mr-1 inline h-3 w-3" />}{pr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={addToCart}
                disabled={!selectedName}
                data-testid="add-to-cart"
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Add to Order Set
              </button>
            </div>
          </Card>
        </div>

        {/* Cart + CDS */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Order Set" subtitle={`${cart.length} order(s) pending sign`} icon={<ClipboardList className="h-[18px] w-[18px]" />} />
            <div className="p-4">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <ClipboardList className="mb-2 h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-400">No orders in this set yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((d) => {
                    const cds = runCDS(patientId, d);
                    const blocked = cds.some((r) => r.level === "danger");
                    return (
                      <div key={d.id} className={cn("rounded-xl border p-3", blocked ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-slate-50/60")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge tone="brand">{d.type}</Badge>
                              {d.priority === "STAT" && <Badge tone="red" dot><Zap className="h-2.5 w-2.5" />STAT</Badge>}
                              {d.priority === "Urgent" && <Badge tone="amber" dot>Urgent</Badge>}
                            </div>
                            <p className="mt-1.5 text-sm font-semibold text-slate-900">{d.name}</p>
                            <p className="text-xs text-slate-500">{d.detail}</p>
                          </div>
                          <button onClick={() => removeFromCart(d.id)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600" aria-label="Remove order">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* CDS findings */}
              {cdsResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Clinical Decision Support</p>
                  {cdsResults.map((r, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-2 rounded-lg p-2.5 text-xs",
                        r.level === "danger" && "bg-rose-50 text-rose-700",
                        r.level === "warning" && "bg-amber-50 text-amber-700",
                        r.level === "ok" && "bg-emerald-50 text-emerald-700"
                      )}
                    >
                      {r.level === "danger" ? <FileWarning className="mt-0.5 h-4 w-4 shrink-0" /> : r.level === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                      {r.message}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={submitOrders}
                disabled={cart.length === 0 || hasBlock}
                data-testid="sign-orders"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Send className="h-4 w-4" /> Sign & Submit {cart.length > 0 && `(${cart.length})`}
              </button>
              {hasBlock && <p className="mt-2 text-center text-xs text-rose-600">Resolve blocking alerts before signing.</p>}
            </div>
          </Card>
        </div>
      </div>

      {/* Existing orders */}
      <Card className="mt-6">
        <CardHeader title="Order History" subtitle="Active and recent orders" icon={<Activity className="h-[18px] w-[18px]" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Ordered</th>
                <th className="px-5 py-3 font-medium">By</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {submitted.slice(0, 10).map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">{o.name}</p>
                    <p className="text-xs text-slate-400">{o.detail}</p>
                  </td>
                  <td className="px-5 py-3"><Badge tone="slate">{o.type}</Badge></td>
                  <td className="px-5 py-3">
                    {o.priority === "STAT" ? <Badge tone="red" dot><Zap className="h-2.5 w-2.5" />STAT</Badge> : o.priority === "Urgent" ? <Badge tone="amber" dot>Urgent</Badge> : <span className="text-slate-500">Routine</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500"><Clock className="mr-1 inline h-3 w-3" />{o.ordered}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{o.orderedBy}</td>
                  <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
