// Locally-added laboratory results (spec 2026-09-28 §4): immutable, append-only.
export interface UserLabEntry {
  id: string;
  patientId: string;
  patientName: string;
  initials: string;
  avatarColor: string;
  department: string;
  name: string;
  value: string;
  unit: string;
  range: string;
  flag: "Normal" | "High" | "Low" | "Critical";
  category: string;
  collected: string;
  savedAt: string;
}

const KEY = "www-lab-results";

export function loadUserLabs(): UserLabEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as UserLabEntry[];
  } catch {
    return [];
  }
}

export function addUserLab(entry: UserLabEntry): UserLabEntry[] {
  const next = [entry, ...loadUserLabs()];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}
