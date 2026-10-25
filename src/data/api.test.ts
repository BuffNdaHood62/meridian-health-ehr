import { describe, expect, it } from "vitest";
import { DEMO_DATA_ALLOWED } from "../env";
import { appointments as mockAppointments, patients as mockPatients } from "./mockData";
import { loadAppointments, loadPatients } from "./api";

// ============================================================================
// The demo build has no backend either, so the mock fallback must key on the
// MODE. This suite is the regression guard for the version of demoFallback()
// that called requireBackend() unconditionally and broke every loader in the
// demo artifact (unit tests stayed green because nothing exercised api.ts).
// ============================================================================

describe("data layer in demo mode", () => {
  it("runs without a configured backend", () => {
    expect(DEMO_DATA_ALLOWED).toBe(true);
  });

  it("serves the whole fixture instead of throwing", async () => {
    const patients = await loadPatients();
    expect(patients).toHaveLength(mockPatients.length);
    for (const p of patients) {
      expect(Array.isArray(p.medications)).toBe(true);
      expect(Array.isArray(p.labs)).toBe(true);
    }
  });

  it("serves appointments for the dashboard KPI", async () => {
    await expect(loadAppointments()).resolves.toHaveLength(mockAppointments.length);
  });
});
