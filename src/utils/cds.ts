import type { OrderType } from "../types";
import { patients } from "../data/mockData";

export interface DraftOrder {
  id: string;
  type: OrderType;
  name: string;
  detail: string;
  priority: "Routine" | "STAT" | "Urgent";
}

export type CDSLevel = "danger" | "warning" | "ok";

export interface CDSFinding {
  level: CDSLevel;
  message: string;
}

// Clinical Decision Support — flags risks for the selected patient
export function runCDS(patientId: string, draft: DraftOrder): CDSFinding[] {
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return [];
  const findings: CDSFinding[] = [];
  const name = draft.name.toLowerCase();

  // Allergy check
  patient.allergies.forEach((a) => {
    const sub = a.substance.toLowerCase();
    if (
      (sub.includes("penicillin") &&
        (name.includes("penicillin") ||
          name.includes("amoxicillin") ||
          name.includes("ampicillin"))) ||
      (sub.includes("sulfa") && name.includes("sulfa")) ||
      (sub === "aspirin" && name.includes("aspirin")) ||
      (sub.includes("peanut") && name.includes("peanut"))
    ) {
      findings.push({
        level: "danger",
        message: `Allergy conflict: ${a.substance} (${a.severity}). Order blocked — alternative required.`,
      });
    }
  });

  // Drug interaction / class warnings
  if (
    name.includes("metformin") &&
    patient.labs.some((l) => l.name.includes("Creatinine") && l.flag !== "Normal")
  ) {
    findings.push({
      level: "warning",
      message: "Metformin caution: elevated creatinine detected. Reassess renal function.",
    });
  }
  if (
    name.includes("heparin") &&
    patient.medications.some((m) => m.class.includes("Antiplatelet"))
  ) {
    findings.push({
      level: "warning",
      message: "Bleeding risk: concurrent antiplatelet therapy detected.",
    });
  }
  if (
    (name.includes("ct") || name.includes("contrast")) &&
    patient.allergies.some((a) => a.substance.toLowerCase().includes("iodine"))
  ) {
    findings.push({
      level: "danger",
      message: "Iodine contrast allergy documented. Premedication required or use alternative.",
    });
  }

  if (findings.length === 0) {
    findings.push({ level: "ok", message: "No contraindications detected. Safe to order." });
  }
  return findings;
}
