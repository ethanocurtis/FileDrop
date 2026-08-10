import { ArrowDownToLine } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

export function Logo({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <Link
      href="/"
      className={clsx("group inline-flex items-center gap-2 select-none", className)}
      aria-label="FileDrop home"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-accent-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition-transform group-hover:scale-105">
        <ArrowDownToLine className="h-5 w-5" strokeWidth={2.5} />
      </span>
      {!iconOnly && (
        <span className="text-lg font-semibold tracking-tight text-foreground">FileDrop</span>
      )}
    </Link>
  );
}
