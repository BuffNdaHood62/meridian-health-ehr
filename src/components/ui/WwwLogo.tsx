import { cn } from "../../utils/cn";

/**
 * Foundation emblem — placeholder mark until the official logo asset is dropped
 * into the repo. Swap the inner <svg> for the real logo file.
 */
export function WwwLogo({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-200",
        className ?? "h-10 w-10"
      )}
      data-testid="www-logo"
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className={cn("h-6 w-6 text-white", iconClassName)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v18M3 12h18" />
      </svg>
    </div>
  );
}
