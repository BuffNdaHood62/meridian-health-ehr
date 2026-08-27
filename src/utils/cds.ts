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

// ponytail: data-driven rules over a mock patient set; scale-up = real drug/allergy
// knowledge base (RxNorm class matching) behind the same runCDS() signature.
interface AllergyRule {
  /** Substring matched (lowercase, word-ish) against the patient's allergy substances */
  allergy: string;
  /** Order-name tokens that indicate this allergy class is being ordered */
  triggers: string[];
}

const ALLERGY_RULES: AllergyRule[] = [
  // Penicillin class incl. common beta-lactam relatives
  { allergy: "penicillin", triggers: ["penicillin", "pcn", "amoxicillin", "ampicillin", "augmentin"] },
  // Sulfonamide antibiotics
  { allergy: "sulfa", triggers: ["sulfa", "sulfonamide", "sulfamethoxazole", "sulfadiazine"] },
  { allergy: "aspirin", triggers: ["aspirin", "asa "] },
  { allergy: "peanut", triggers: ["peanut"] },
  { allergy: "latex", triggers: [] }, // contact allergen — no oral/imaging trigger in this demo
];

// Lab names that indicate impaired renal function for the metformin rule.
const RENAL_LAB_PATTERN = /creatinine|egfr|gfr/i;

/** True when any whitespace-delimited token of `name` matches a trigger */
function matchesTrigger(nameLower: string, triggers: string[]): boolean {
  const words = nameLower.split(/[^a-z]+/).filter(Boolean);
  return triggers.some((t) => {
    const trimmed = t.trim();
    if (!trimmed) return false;
    return trimmed.includes(" ")
      ? nameLower.includes(trimmed)
      : words.some((w) => w === trimmed || w.startsWith(trimmed));
  });
}

// Clinical Decision Support — flags risks for the selected patient
export function runCDS(patientId: string, draft: DraftOrder): CDSFinding[] {
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return [];
  const findings: CDSFinding[] = [];
  const name = draft.name.toLowerCase();

  // Allergy check — one pass over data-driven rules
  for (const rule of ALLERGY_RULES) {
    const hasAllergy = patient.allergies.some((a) =>
      a.substance.toLowerCase().includes(rule.allergy)
    );
    if (hasAllergy && matchesTrigger(name, rule.triggers)) {
      const allergy = patient.allergies.find((a) =>
        a.substance.toLowerCase().includes(rule.allergy)
      )!;
      findings.push({
        level: "danger",
        message: `Allergy conflict: ${allergy.substance} (${allergy.severity}). Order blocked — alternative required.`,
      });
    }
  }

  // Drug interaction / class warnings
  if (
    name.includes("metformin") &&
    patient.labs.some((l) => RENAL_LAB_PATTERN.test(l.name) && l.flag !== "Normal")
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
