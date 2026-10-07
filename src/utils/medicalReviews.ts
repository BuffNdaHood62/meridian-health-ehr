// Shared store for Dashboard Medical Reviews; read by Medical History.
import type { MedicalReviewEntry } from "../types";

const KEY = "www-medical-reviews";

export function loadMedicalReviews(): MedicalReviewEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as MedicalReviewEntry[];
  } catch {
    return [];
  }
}

export function addMedicalReview(r: MedicalReviewEntry): MedicalReviewEntry[] {
  const next = [r, ...loadMedicalReviews()];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}
