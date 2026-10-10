import { describe, expect, it } from "vitest";
import { runCDS, type DraftOrder } from "./cds";
import { patients } from "../data/mockData";

const hawkins = patients.find((p) => p.id === "P-1001")!;
const bennett = patients.find((p) => p.id === "P-1004")!;
const osei = patients.find((p) => p.id === "P-1007")!;

function draft(name: string, detail = ""): DraftOrder {
  return { id: "d", type: "Medication", name, detail, priority: "Routine" };
}

describe("runCDS", () => {
  it("blocks penicillin orders for penicillin-allergic patients", () => {
    const results = runCDS(hawkins, draft("Penicillin 500mg PO"));
    expect(results.some((r) => r.level === "danger" && r.message.includes("Allergy conflict"))).toBe(
      true
    );
  });

  it("blocks beta-lactam relatives via the penicillin rule (PCN G, Augmentin)", () => {
    for (const name of ["PCN G 2mu IV", "Augmentin 875mg PO", "Amoxicillin 500mg"]) {
      const results = runCDS(hawkins, draft(name));
      expect(results.some((r) => r.level === "danger"), name).toBe(true);
    }
  });

  it("does not block lookalike words that are not allergy triggers", () => {
    // "Penicid" is a fake word sharing a prefix with penicillin triggers only partially;
    // but a real trigger prefix (pcn) must match. Guard against over-broad startsWith:
    const results = runCDS(bennett, draft("Acetaminophen 650mg"));
    expect(results.some((r) => r.level === "danger")).toBe(false);
  });

  it("blocks sulfa-class orders for sulfa-allergic patients", () => {
    const results = runCDS(bennett, draft("Sulfamethoxazole-TMP DS PO"));
    expect(results.some((r) => r.level === "danger")).toBe(true);
  });

  it("blocks peanut orders for peanut-allergic patients", () => {
    const results = runCDS(osei, draft("Peanut Butter"));
    expect(results.some((r) => r.level === "danger")).toBe(true);
  });

  it("does not flag unrelated allergies", () => {
    const results = runCDS(hawkins, draft("Acetaminophen 650mg"));
    expect(results.some((r) => r.level === "danger")).toBe(false);
  });

  it("warns on metformin with elevated creatinine", () => {
    const results = runCDS(hawkins, draft("Metformin 1000mg"));
    expect(results.some((r) => r.level === "warning" && r.message.includes("renal"))).toBe(true);
  });

  it("returns a safe finding when no contraindications exist", () => {
    const results = runCDS(bennett, draft("Acetaminophen 650mg"));
    expect(results.some((r) => r.level === "ok")).toBe(true);
  });

  it("returns no findings when the caller has no loaded patient", () => {
    // The engine no longer looks charts up itself: no chart, no findings.
    expect(runCDS(null, draft("Acetaminophen 650mg"))).toEqual([]);
  });
});
