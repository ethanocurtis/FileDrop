"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Eye, EyeOff, Lock, Flame } from "lucide-react";
import { MAX_DOWNLOAD_OPTIONS } from "@/types/drop";

export interface DropOptions {
  password: string;
  maxDownloads: number | null;
  burnAfterRead: boolean;
}

export function OptionsPanel({
  options,
  onChange,
  disabled,
}: {
  options: DropOptions;
  onChange: (next: DropOptions) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex w-full items-center justify-between text-sm font-medium text-muted hover:text-foreground transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        <span>Advanced options</span>
        <ChevronDown className={clsx("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-4 grid gap-5 rounded-xl border border-border bg-background-elevated/60 p-4 animate-fade-in">
          <div>
            <label htmlFor={passwordId} className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted">
              <Lock className="h-3.5 w-3.5" /> Password protect (optional)
            </label>
            <div className="relative">
              <input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                value={options.password}
                onChange={(e) => onChange({ ...options, password: e.target.value })}
                disabled={disabled}
                placeholder="Leave blank for no password"
                maxLength={200}
                autoComplete="new-password"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/60 focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-muted">Download limit</span>
            <div className="flex flex-wrap gap-2">
              {[{ label: "Unlimited", value: null as number | null }, ...MAX_DOWNLOAD_OPTIONS.map((n) => ({ label: `${n} download${n > 1 ? "s" : ""}`, value: n }))].map(
                (opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ ...options, maxDownloads: opt.value })}
                    className={clsx(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                      options.maxDownloads === opt.value
                        ? "border-accent/60 bg-accent/15 text-accent-strong"
                        : "border-border bg-card text-muted hover:border-border-strong hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ),
              )}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={options.burnAfterRead}
              disabled={disabled}
              onChange={(e) => onChange({ ...options, burnAfterRead: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-border-strong bg-card accent-[var(--accent)]"
            />
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Flame className="h-3.5 w-3.5 text-warning" /> Delete after first download
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
