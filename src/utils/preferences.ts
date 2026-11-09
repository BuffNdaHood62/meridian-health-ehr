// ============================================================================
// Clinician interface preferences (device-local)
// ============================================================================

// ponytail: one localStorage key per preference; there is no server settings
// table yet, so a preference does not follow the account to another browser.
// The upgrade path is a `user_preferences` row behind an RPC — the call sites
// already go through these two functions, so only this file changes.

/** Chart tabs a clinician can choose to open first. PatientDetail.tsx renders
 * a panel per name, so adding one here without a panel gives a blank tab. */
export const CHART_TAB_NAMES = ["Overview", "Vitals", "Medications", "Labs", "History", "Notes"] as const;

const DEFAULT_CHART_TAB_KEY = "www-default-chart-tab";

/** The chosen tab, or null when the clinician never picked one. */
export function getDefaultChartTab(): string | null {
  try {
    return localStorage.getItem(DEFAULT_CHART_TAB_KEY);
  } catch {
    return null;
  }
}

/** False when the browser refused to store it (private mode, quota, disabled). */
export function saveDefaultChartTab(tab: string): boolean {
  try {
    localStorage.setItem(DEFAULT_CHART_TAB_KEY, tab);
    return true;
  } catch {
    return false;
  }
}
