// ============================================================================
// Demographics store (spec §1). Autosaved from the Dashboard Demographics slot
// and read by the Clients registry when a new visit entry is saved.
// ponytail: localStorage-backed demo store; keyed by client name. Swap to a
// demographics table + RLS in supabase/migrations keeping this API shape.
// ============================================================================

export interface Demographics {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  phone: string;
  address: string;
  nextOfKin: string;
  nextOfKinPhone: string;
  motherName: string;
  motherPhone: string;
  fatherName: string;
  fatherPhone: string;
}

export const EMPTY_DEMOGRAPHICS: Demographics = {
  firstName: "", lastName: "", dob: "", gender: "Male", phone: "",
  address: "", nextOfKin: "", nextOfKinPhone: "",
  motherName: "", motherPhone: "", fatherName: "", fatherPhone: "",
};

const KEY = "www-demographics"; // record of "<firstName> <lastName>" -> Demographics

type Store = Record<string, Demographics>;

function clientKey(d: Pick<Demographics, "firstName" | "lastName">): string {
  return `${d.firstName} ${d.lastName}`.trim().toLowerCase().replace(/\s+/g, " ");
}

export function loadDemographics(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

/** Upsert by client name; returns the stored record for later lookup. */
export function saveDemographics(d: Demographics): void {
  if (!d.firstName.trim() || !d.lastName.trim()) return;
  const store = loadDemographics();
  store[clientKey(d)] = d;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable */
  }
}

/** Biography for a full client name (case/space-insensitive); null when none saved. */
export function findDemographics(fullName: string): Demographics | null {
  const norm = fullName.trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return null;
  return loadDemographics()[norm] ?? null;
}

/** Age band derived from date of birth, using the registry's WWW_AGE_BANDS. */
export function ageBandFromDob(dob: string): string {
  if (!dob) return "";
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return "";
  const years = (Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return "Below 1 year";
  if (years < 5) return "1-4 years";
  if (years < 10) return "5-9 years";
  if (years < 13) return "10-12 years";
  if (years < 20) return "13-19 years";
  return "Above 20 years";
}
