// ============================================================================
// Shared formatting & calculation helpers
// ============================================================================

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(
    "en-US",
    opts ?? { year: "numeric", month: "short", day: "numeric" }
  );
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(value: number): string {
  if (value < 18.5) return "Underweight";
  if (value < 25) return "Normal";
  if (value < 30) return "Overweight";
  return "Obese";
}

/** Returns a tailwind text class based on whether a vitals reading is in range */
export function bpTone(sys: number): "good" | "warn" | "bad" {
  if (sys >= 140 || sys < 90) return "bad";
  if (sys >= 130) return "warn";
  return "good";
}

export function hrTone(hr: number): "good" | "warn" | "bad" {
  if (hr > 110 || hr < 50) return "bad";
  if (hr > 100 || hr < 55) return "warn";
  return "good";
}

export function spo2Tone(spo2: number): "good" | "warn" | "bad" {
  if (spo2 < 90) return "bad";
  if (spo2 < 94) return "warn";
  return "good";
}

export function tempTone(temp: number): "good" | "warn" | "bad" {
  if (temp >= 100.4 || temp < 95) return "bad";
  if (temp >= 99.6) return "warn";
  return "good";
}
