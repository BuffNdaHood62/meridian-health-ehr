import { cn } from "../../utils/cn";

export function Avatar({
  initials,
  color,
  size = "md",
  className,
  ring = false,
}: {
  initials: string;
  color: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  ring?: boolean;
}) {
  const sizes: Record<string, string> = {
    xs: "h-7 w-7 text-[10px]",
    sm: "h-9 w-9 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-xl",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizes[size],
        ring && "ring-2 ring-white",
        className
      )}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
