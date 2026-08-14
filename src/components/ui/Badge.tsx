import { cn } from "../../utils/cn";

// ============================================================================
// Tone-based badge — the workhorse status pill used across the app
// ============================================================================

export type Tone =
  | "brand"
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "slate"
  | "violet"
  | "orange";

const toneMap: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
};

export function Badge({
  tone = "slate",
  children,
  className,
  dot = false,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        toneMap[tone],
        className
      )}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", {
            "bg-brand-500": tone === "brand",
            "bg-emerald-500": tone === "green",
            "bg-amber-500": tone === "amber",
            "bg-rose-500": tone === "red",
            "bg-sky-500": tone === "blue",
            "bg-slate-400": tone === "slate",
            "bg-violet-500": tone === "violet",
            "bg-orange-500": tone === "orange",
          })}
        />
      )}
      {children}
    </span>
  );
}

// ---- Specialized, domain-aware badges --------------------------------------

export function statusTone(status: string): Tone {
  switch (status) {
    case "ICU":
    case "Critical":
      return "red";
    case "Admitted":
    case "Serious":
      return "blue";
    case "Observation":
      return "amber";
    case "Discharged":
    case "Completed":
    case "Stable":
      return "green";
    case "Outpatient":
    case "Fair":
    case "Scheduled":
    case "Pending":
      return "slate";
    case "In Progress":
    case "Checked-in":
      return "brand";
    case "Hold":
    case "Cancelled":
    case "No-show":
      return "orange";
    default:
      return "slate";
  }
}

export function flagTone(flag: string): Tone {
  switch (flag) {
    case "Critical":
      return "red";
    case "High":
    case "Low":
      return "amber";
    default:
      return "green";
  }
}

export function severityTone(severity: string): Tone {
  switch (severity) {
    case "Severe":
      return "red";
    case "Moderate":
      return "amber";
    default:
      return "slate";
  }
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {status}
    </Badge>
  );
}

export function AcuityBadge({ acuity }: { acuity: string }) {
  const tone: Tone =
    acuity === "Critical"
      ? "red"
      : acuity === "Serious"
      ? "orange"
      : acuity === "Stable"
      ? "green"
      : "slate";
  return (
    <Badge tone={tone} dot>
      {acuity}
    </Badge>
  );
}
