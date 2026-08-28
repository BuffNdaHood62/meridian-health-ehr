import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { patients as mockPatients, messages as mockMessages, orders as mockOrders, alerts as mockAlerts, appointments as mockAppointments } from "./mockData";
import type { Patient, Message, OrderItem, Alert, Appointment } from "../types";

// ============================================================================
// Async data layer. Returns the EXISTING domain types so page render code is
// untouched. When Supabase is configured we query + assemble; otherwise we
// resolve the mock arrays (so the app runs with zero backend). One swap point.
// ============================================================================

// ---- assembly: child rows -> nested arrays on the Patient shape ----
// ponytail: column shapes mirror supabase/migrations/0001+0004; widen if schema grows.
interface PatientRow {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  date_of_birth: string;
  gender: string;
  pronouns?: string;
  blood_type?: string;
  phone?: string;
  email?: string;
  address?: string;
  status: string;
  acuity: string;
  primary_physician?: string;
  room?: string;
  department?: string;
  insurance?: string;
  height_cm?: number;
  weight_kg?: number;
  avatar_color?: string;
  emergency_contact?: { name?: string; relation?: string; phone?: string };
  admit_date?: string;
  code_status?: string;
}
interface ChildRow {
  id: string;
  patient_id: string;
  table: string;
  substance?: string; reaction?: string; severity?: string; noted?: string;
  name?: string; dose?: string; route?: string; frequency?: string; status?: string; start_date?: string; prescribed_by?: string; class?: string;
  value?: string; unit?: string; range?: string; flag?: string; category?: string; collected?: string;
  recorded_at?: string; temp?: number; hr?: number; bp_sys?: number; bp_dia?: number; rr?: number; spo2?: number; pain?: number;
  event_date?: string; title?: string; type?: string; description?: string; provider?: string;
  note_date?: string; author?: string; author_role?: string; note_type?: string; content?: string;
}

function assemblePatient(p: PatientRow, children: ChildRow[]): Patient {
  const byTable: Record<string, ChildRow[]> = {};
  for (const c of children) {
    (byTable[c.table] ??= []).push(c);
  }
  return {
    id: p.id,
    mrn: p.mrn,
    firstName: p.first_name,
    lastName: p.last_name,
    preferredName: p.preferred_name ?? undefined,
    dateOfBirth: p.date_of_birth,
    gender: p.gender,
    pronouns: p.pronouns ?? "",
    bloodType: p.blood_type ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    address: p.address ?? "",
    status: p.status,
    acuity: p.acuity,
    primaryPhysician: p.primary_physician ?? "",
    room: p.room ?? undefined,
    department: p.department ?? "",
    insurance: p.insurance ?? "",
    heightCm: p.height_cm ?? 0,
    weightKg: p.weight_kg ?? 0,
    avatarColor: p.avatar_color ?? "#13726c",
    initials: `${(p.first_name?.[0] ?? "")}${(p.last_name?.[0] ?? "")}`.toUpperCase(),
    allergies: (byTable.allergies ?? []).map((a) => ({ id: a.id, substance: a.substance ?? "", reaction: a.reaction ?? "", severity: a.severity ?? "Mild", noted: a.noted ?? "" })),
    medications: (byTable.medications ?? []).map((m) => ({ id: m.id, name: m.name ?? "", dose: m.dose ?? "", route: m.route ?? "", frequency: m.frequency ?? "", status: m.status ?? "Active", startDate: m.start_date ?? "", prescribedBy: m.prescribed_by ?? "", class: m.class ?? "" })),
    labs: (byTable.labs ?? []).map((l) => ({ id: l.id, name: l.name ?? "", value: l.value ?? "", unit: l.unit ?? "", range: l.range ?? "", flag: l.flag ?? "Normal", category: l.category ?? "Hematology", collected: l.collected ?? "" })),
    vitals: (byTable.vitals ?? []).map((v) => ({ id: v.id, timestamp: v.recorded_at ?? "", temp: v.temp ?? 0, hr: v.hr ?? 0, bpSys: v.bp_sys ?? 0, bpDia: v.bp_dia ?? 0, rr: v.rr ?? 0, spo2: v.spo2 ?? 0, pain: v.pain ?? 0 })),
    history: (byTable.history ?? []).map((h) => ({ id: h.id, date: h.event_date ?? "", title: h.title ?? "", type: h.type ?? "Visit", description: h.description ?? "", provider: h.provider ?? "" })),
    notes: (byTable.notes ?? []).map((n) => ({ id: n.id, date: n.note_date ?? "", author: n.author ?? "", role: n.author_role ?? "", type: n.note_type ?? "Progress", content: n.content ?? "" })),
    emergencyContact: p.emergency_contact?.name
      ? { name: p.emergency_contact.name, relation: p.emergency_contact.relation ?? "", phone: p.emergency_contact.phone ?? "" }
      : { name: "", relation: "", phone: "" },
    admitDate: p.admit_date ? String(p.admit_date) : undefined,
    codeStatus: p.code_status ?? "Full Code",
  } as Patient;
}

export async function loadPatients(): Promise<Patient[]> {
  if (!isSupabaseConfigured) return mockPatients;
  const { data: ps } = await supabase.from("patients").select("*");
  const [al, med, lab, vit, hist, notes] = await Promise.all([
    supabase.from("allergies").select("*"),
    supabase.from("medications").select("*"),
    supabase.from("labs").select("*"),
    supabase.from("vitals").select("*"),
    supabase.from("history").select("*"),
    supabase.from("notes").select("*"),
  ]);
  const children = [...(al.data ?? []).map((r) => ({ ...r, table: "allergies" })),
    ...(med.data ?? []).map((r) => ({ ...r, table: "medications" })),
    ...(lab.data ?? []).map((r) => ({ ...r, table: "labs" })),
    ...(vit.data ?? []).map((r) => ({ ...r, table: "vitals" })),
    ...(hist.data ?? []).map((r) => ({ ...r, table: "history" })),
    ...(notes.data ?? []).map((r) => ({ ...r, table: "notes" }))];
  return (ps ?? []).map((p) => assemblePatient(p, children.filter((c) => c.patient_id === p.id)));
}

export async function loadPatient(id: string): Promise<Patient | null> {
  const all = await loadPatients();
  return all.find((p) => p.id === id) ?? null;
}

export async function loadMessages(): Promise<Message[]> {
  if (!isSupabaseConfigured) return mockMessages;
  const { data } = await supabase.from("messages").select("*").order("created_at", { ascending: false });
  return (data ?? []).map((m) => ({
    id: m.id,
    from: m.from_profile ?? m.from_role ?? "System",
    fromRole: m.from_role ?? "System",
    subject: m.subject,
    preview: (m.body ?? "").slice(0, 80),
    body: m.body ?? "",
    time: m.created_at ?? "",
    read: m.read ?? false,
    priority: m.priority ?? "Normal",
    category: m.category ?? "Staff",
  })) as Message[];
}

export async function loadOrders(patientId: string): Promise<OrderItem[]> {
  if (!isSupabaseConfigured) return mockOrders.filter((o) => o.patientId === patientId);
  const { data } = await supabase.from("orders").select("*").eq("patient_id", patientId);
  return (data ?? []).map((o) => ({
    id: o.id,
    patientId: o.patient_id,
    type: o.type,
    name: o.name,
    detail: o.detail ?? "",
    priority: o.priority ?? "Routine",
    status: o.status ?? "Pending",
    ordered: o.ordered_at ?? "",
    orderedBy: o.ordered_by ?? "",
    administered: o.administered ?? "Pending",
    recipientName: o.recipient_name ?? undefined,
  })) as OrderItem[];
}

export async function saveOrder(order: OrderItem): Promise<void> {
  if (!isSupabaseConfigured) return; // demo: in-memory only
  await supabase.from("orders").insert({
    id: order.id,
    patient_id: order.patientId,
    type: order.type,
    name: order.name,
    detail: order.detail,
    priority: order.priority,
    status: order.status,
    ordered_at: order.ordered,
    ordered_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    administered: order.administered ?? "Pending",
  });
}

export async function loadAlerts(): Promise<Alert[]> {
  if (!isSupabaseConfigured) return mockAlerts;
  const { data } = await supabase.from("alerts").select("*"); // ponytail: alerts table assumed; seed separately
  return (data ?? []).map((a) => ({
    id: a.id, patientId: a.patient_id, patientName: a.patient_name, initials: a.initials ?? "",
    avatarColor: a.avatar_color ?? "#e11d48", type: a.type ?? "Alert", message: a.message ?? "",
    time: a.time ?? "", severity: a.severity ?? "Info",
  })) as Alert[];
}

export async function loadAppointments(): Promise<Appointment[]> {
  if (!isSupabaseConfigured) return mockAppointments;
  const { data } = await supabase.from("appointments").select("*");
  return (data ?? []).map((a) => ({
    id: a.id, patientId: a.patient_id, patientName: a.patient_name, patientInitials: a.patient_initials ?? "",
    avatarColor: a.avatar_color ?? "#13726c", time: a.time ?? "", durationMin: a.duration_min ?? 30,
    type: a.type ?? "Follow-up", department: a.department ?? "", status: a.status ?? "Scheduled", notes: a.notes ?? undefined,
  })) as Appointment[];
}

// ---- tiny async hook so pages stay declarative ----
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loader()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}
