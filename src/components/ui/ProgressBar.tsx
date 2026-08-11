import clsx from "clsx";

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={clsx("h-2 w-full overflow-hidden rounded-full bg-background-elevated", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent-strong to-accent transition-[width] duration-200 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
