import type { HTMLAttributes } from "react";
import clsx from "clsx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-[var(--radius-lg)] border border-border bg-card/80 backdrop-blur-sm shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]",
        className,
      )}
      {...props}
    />
  );
}
