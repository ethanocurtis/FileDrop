"use client";

import { useState, type FormEvent } from "react";
import { Lock, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function PasswordGate({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    const result = await onSubmit(password);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? "Incorrect password.");
    }
  }

  return (
    <Card className="w-full max-w-md p-8 animate-fade-in">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent-strong">
        <Lock className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h1 className="mt-4 text-center text-xl font-semibold text-foreground">
        This drop is password protected
      </h1>
      <p className="mt-1 text-center text-sm text-muted">Enter the password to view and download.</p>

      <form onSubmit={handleSubmit} className="mt-6">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-border bg-background-elevated px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/60 focus:outline-none"
        />
        {error && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-danger">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
        <Button type="submit" disabled={loading || !password} className="mt-4 w-full">
          {loading ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </Card>
  );
}
