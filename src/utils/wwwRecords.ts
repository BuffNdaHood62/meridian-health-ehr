// ============================================================================
// WWW client registry — immutable visit entries (spec 2026-09-28 §2).
// Once saved, an entry is never edited; each visit/check-up appends a new one.
// ponytail: localStorage-backed demo store; upgrade path is a www_entries
// table + RLS in supabase/migrations, keeping this module's API shape.
// ============================================================================

import type { WwwVisitEntry, MedicalReviewEntry } from "../types";
import { findDemographics } from "./demographics";

const ENTRIES_KEY = "www-client-entries";

/** Zero-padded next WWW number for a NEW client, capped at 999. */
export function nextWwwNumber(entries: Pick<WwwVisitEntry, "wwwNumber">[]): string {
  const used = entries.map((e) => Number(e.wwwNumber)).filter((n) => !isNaN(n));
  const max = used.length ? Math.max(...used) : 0;
  if (max >= 999) throw new Error("WWW number pool exhausted (001-999).");
  return String(max + 1).padStart(3, "0");
}

/** Existing clients keep their assigned number across visits. */
export function wwwNumberForClient(
  entries: Pick<WwwVisitEntry, "wwwNumber" | "clientName">[],
  clientName: string
): string {
  const known = entries.find((e) => e.clientName.trim().toLowerCase() === clientName.trim().toLowerCase());
  return known ? known.wwwNumber : nextWwwNumber(entries);
}

/** Latest entry per client, plus total visit count. */
export function groupClients(entries: WwwVisitEntry[]): {
  wwwNumber: string;
  clientName: string;
  latest: WwwVisitEntry;
  visits: number;
}[] {
  const map = new Map<string, WwwVisitEntry[]>();
  for (const e of entries) {
    const list = map.get(e.wwwNumber) ?? [];
    list.push(e);
    map.set(e.wwwNumber, list);
  }
  return Array.from(map.entries())
    .map(([wwwNumber, list]) => {
      const sorted = [...list].sort((a, b) => b.visitAt.localeCompare(a.visitAt));
      return { wwwNumber, clientName: sorted[0].clientName, latest: sorted[0], visits: list.length };
    })
    .sort((a, b) => a.wwwNumber.localeCompare(b.wwwNumber));
}

export function loadEntries(): WwwVisitEntry[] {
  try {
    return JSON.parse(localStorage.getItem(ENTRIES_KEY) ?? "[]") as WwwVisitEntry[];
  } catch {
    return [];
  }
}

/** Append-only. There is intentionally no update/remove. */
export function addEntry(entry: WwwVisitEntry): WwwVisitEntry[] {
  const next = [...loadEntries(), entry];
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

/**
 * Register a saved Medical Review as a new Clients-registry visit entry (spec §1:
 * "after I saved the medical review, can it go directly to the patients
 * section?"). Biography fields carried over from any saved demographics record.
 */
export function registerReviewAsVisit(review: MedicalReviewEntry): WwwVisitEntry {
  // Seed first: ensureSeeded() only writes when the registry has never been
  // initialised, so a review saved before the first Clients visit can't be
  // overwritten by the demo seed later.
  ensureSeeded();
  const entries = loadEntries();
  const bio = findDemographics(review.clientName);
  const v = review.vitals;
  const entry: WwwVisitEntry = {
    id: `w-${crypto.randomUUID()}`,
    wwwNumber: wwwNumberForClient(entries, review.clientName),
    clientName: review.clientName.trim(),
    ageBand: "",
    facility: "",
    status: "",
    complaints: review.historyOfEvents,
    allergies: "",
    diagnosis: review.diagnosis,
    address: bio?.address,
    nextOfKin: bio?.nextOfKin,
    nextOfKinPhone: bio?.nextOfKinPhone,
    motherName: bio?.motherName,
    motherPhone: bio?.motherPhone,
    fatherName: bio?.fatherName,
    fatherPhone: bio?.fatherPhone,
    vitals: {
      tempC: v.temperatureC ?? null,
      spo2Pct: v.spo2Pct ?? null,
      bpSys: v.bpSystolic ?? null,
      bpDia: v.bpDiastolic ?? null,
      pulseBpm: v.pulseBpm ?? null,
      respRate: v.respirationRate ?? null,
      weightKg: v.weightKg ?? null,
      heightCm: v.heightCm ?? null,
    },
    visitAt: review.savedAt,
    savedAt: review.savedAt,
  };
  addEntry(entry);
  return entry;
}

// ---- demo seed: a few clients so the registry is never a cold empty table ----
const SEED_FLAG = "www-client-entries-seeded";

function seedEntries(): WwwVisitEntry[] {
  const now = new Date().toISOString();
  const mk = (wwwNumber: string, clientName: string, ageBand: WwwVisitEntry["ageBand"], facility: string, status: WwwVisitEntry["status"], complaints: string, allergies: string, vitals: WwwVisitEntry["vitals"], day: string): WwwVisitEntry => ({
    id: `w-${wwwNumber}-${day}`, wwwNumber, clientName, ageBand, facility, status, complaints, allergies, vitals,
    visitAt: `2026-09-${day}T09:00:00.000Z`, savedAt: now,
  });
  return [
    mk("001", "Adebayo Okonkwo", "Above 20 years", "WWW Clinic Uyo", "Admitted",
      "Recurring headaches, poor sleep", "Subjective: reports mild reaction to NSAIDs",
      { tempC: 37.1, spo2Pct: 97, bpSys: 148, bpDia: 92, pulseBpm: 88, respRate: 18, weightKg: 78.4, heightCm: 175 }, "12"),
    mk("002", "Grace Etim", "13-19 years", "WWW Mobile Unit 2", "Not admitted",
      "Post-asthma follow-up, occasional cough", "Subjective: dust and cold air trigger cough",
      { tempC: 36.6, spo2Pct: 96, bpSys: 108, bpDia: 70, pulseBpm: 76, respRate: 16, weightKg: 51.2, heightCm: 158 }, "15"),
    mk("003", "Emeka Nwosu", "5-9 years", "WWW Clinic Uyo", "Admitted",
      "Fever and rash for three days", "Subjective: no known allergies",
      { tempC: 38.6, spo2Pct: 95, bpSys: 96, bpDia: 62, pulseBpm: 112, respRate: 24, weightKg: 24.8, heightCm: 112 }, "18"),
    mk("004", "Amina Bello", "1-4 years", "WWW Ikot Ekpene Post", "Not admitted",
      "Routine immunisation check-up", "Subjective: mild swelling after previous dose",
      { tempC: 36.9, spo2Pct: 98, bpSys: 88, bpDia: 56, pulseBpm: 120, respRate: 26, weightKg: 11.6, heightCm: 92 }, "20"),
    // Second visit for an existing client keeps its WWW number (002), not a new one.
    mk("002", "Grace Etim", "13-19 years", "WWW Clinic Uyo", "Admitted",
      "Chest tightness during morning run", "Subjective: dust and cold air trigger cough",
      { tempC: 36.8, spo2Pct: 94, bpSys: 104, bpDia: 68, pulseBpm: 82, respRate: 19, weightKg: 51.0, heightCm: 158 }, "26"),
  ];
}

/** First run only: seed demo entries so the registry opens populated. */
export function ensureSeeded(): WwwVisitEntry[] {
  try {
    if (!localStorage.getItem(SEED_FLAG)) {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(seedEntries()));
      localStorage.setItem(SEED_FLAG, "1");
    }
  } catch {
    /* storage unavailable */
  }
  return loadEntries();
}

/** Plain-text record sheet used by both print and mailto export. */
export function clientRecordText(entry: WwwVisitEntry): string {
  const v = entry.vitals;
  const num = (n: number | null | undefined) => (n == null ? "—" : String(n));
  const line = (label: string, val?: string) => (val ? `${label}: ${val}` : null);
  return [
    `WWW ${entry.wwwNumber} — ${entry.clientName}`,
    `Visit date: ${new Date(entry.visitAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `Age band: ${entry.ageBand || "—"} · Facility: ${entry.facility || "—"} · Status: ${entry.status}`,
    entry.diagnosis ? `Diagnosis: ${entry.diagnosis}` : null,
    `Complaints: ${entry.complaints || "—"}`,
    `Allergies (subjective): ${entry.allergies || "—"}`,
    `Vitals: Temp ${num(v.tempC)} °C · SpO₂ ${num(v.spo2Pct)} % · BP ${num(v.bpSys)}/${num(v.bpDia)} mmHg · Pulse ${num(v.pulseBpm)} bpm · Respiration ${num(v.respRate)} /min · Height ${num(v.heightCm)} cm · Weight ${num(v.weightKg)} kg`,
    line("Address", entry.address),
    line("Next of kin", entry.nextOfKin ? `${entry.nextOfKin}${entry.nextOfKinPhone ? ` (${entry.nextOfKinPhone})` : ""}` : undefined),
    line("Mother", entry.motherName ? `${entry.motherName}${entry.motherPhone ? ` (${entry.motherPhone})` : ""}` : undefined),
    line("Father", entry.fatherName ? `${entry.fatherName}${entry.fatherPhone ? ` (${entry.fatherPhone})` : ""}` : undefined),
  ].filter((s): s is string => s != null).join("\n");
}
