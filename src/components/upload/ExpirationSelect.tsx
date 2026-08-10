"use client";

import clsx from "clsx";
import { EXPIRATION_OPTIONS, type ExpirationValue } from "@/lib/utils/time";

export function ExpirationSelect({
  value,
  onChange,
  disabled,
}: {
  value: ExpirationValue;
  onChange: (value: ExpirationValue) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-muted">Link expires after</legend>
      <div className="flex flex-wrap gap-2">
        {EXPIRATION_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={clsx(
              "rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
              value === option.value
                ? "border-accent/60 bg-accent/15 text-accent-strong"
                : "border-border bg-card text-muted hover:border-border-strong hover:text-foreground",
            )}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
