import Link from "next/link";
import { Ban } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function ExpiredState({
  title = "This drop has expired.",
  message = "This file is no longer available.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <Card className="w-full max-w-md p-8 text-center animate-fade-in">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <Ban className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <Link
        href="/"
        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-card-hover hover:border-border-strong"
      >
        Go to FileDrop
      </Link>
    </Card>
  );
}
