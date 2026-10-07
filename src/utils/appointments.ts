// Appointments scheduled from the Dashboard (spec §"How do I schedule
// appointments?"). The Schedule page was removed by the 2026-09-28 analysis, so
// scheduling lives here and feeds the WWW Scheduled Appointments KPI.
// ponytail: localStorage demo store; production swaps to an appointments table.

export interface WwwAppointment {
  id: string;
  clientName: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm, 24h */
  time: string;
  reason: string;
  createdAt: string;
}

const KEY = "www-appointments";

export function loadAppointments(): WwwAppointment[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as WwwAppointment[];
  } catch {
    return [];
  }
}

/** Sorted soonest first. */
export function addAppointment(a: WwwAppointment): WwwAppointment[] {
  const next = [...loadAppointments(), a].sort((x, y) =>
    `${x.date}T${x.time}`.localeCompare(`${y.date}T${y.time}`)
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

export function cancelAppointment(id: string): WwwAppointment[] {
  const next = loadAppointments().filter((a) => a.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
