import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./Card";
import { cn } from "../../utils/cn";

export function StatCard({
  label,
  value,
  icon,
  trend,
  trendLabel,
  tone = "brand",
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: "up" | "down";
  trendLabel?: string;
  tone?: "brand" | "red" | "amber" | "blue" | "green" | "violet";
  hint?: string;
}) {
  const toneStyles: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    red: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-sky-50 text-sky-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
  };

  return (
    <Card className="p-5" >
      <div className="flex items-start justify-between">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", toneStyles[tone])}>
          {icon}
        </div>
        {trend && trendLabel && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              trend === "up" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            )}
          >
            {trend === "up" ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trendLabel}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-500">{label}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
    </Card>
  );
}
