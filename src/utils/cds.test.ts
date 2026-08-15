import { describe, expect, it } from "vitest";
import { runCDS, type DraftOrder } from "./cds";
import { patients } from "../data/mockData";

const hawkins = patients.find((p) => p.id === "P-1001")!;
const bennett = patients.find((p) => p.id === "P-1004")!;

function draft(name: string, detail = ""): DraftOrder {
  return { id: "d", type: "Medication", name, detail, priority: "Routine" };
}

describe("runCDS", () => {
  it("blocks penicillin orders for penicillin-allergic patients", () => {
    const results = runCDS(hawkins.id, draft("Penicillin 500mg PO"));
    expect(results.some((r) => r.level === "danger" && r.message.includes("Allergy conflict"))).toBe(
      true
    );
  });

  it("blocks peanut orders for peanut-allergic patients", () => {
    const results = runCDS("P-1007", draft("Peanut Butter"));
    expect(results.some((r) => r.level === "danger")).toBe(true);
  });

  it("does not flag unrelated allergies", () => {
    const results = runCDS(hawkins.id, draft("Acetaminophen 650mg"));
    expect(results.some((r) => r.level === "danger")).toBe(false);
  });

  it("warns on metformin with elevated creatinine", () => {
    const results = runCDS(hawkins.id, draft("Metformin 1000mg"));
    expect(results.some((r) => r.level === "warning" && r.message.includes("renal"))).toBe(true);
  });

  it("returns a safe finding when no contraindications exist", () => {
    const results = runCDS(bennett.id, draft("Acetaminophen 650mg"));
    expect(results.some((r) => r.level === "ok")).toBe(true);
  });

  it("returns no findings for an unknown patient", () => {
    expect(runCDS("P-9999", draft("Acetaminophen 650mg"))).toEqual([]);
  });
});
