"use client";

import { useId, useState } from "react";
import { X, Lock, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileIcon } from "@/components/ui/FileIcon";
import { ExpirationSelect } from "@/components/upload/ExpirationSelect";
import { formatBytes } from "@/lib/utils/bytes";
import type { ExpirationValue } from "@/lib/utils/time";

/**
 * P2P's review step before the transfer link is created — a single file
 * (multi-file P2P would need multiple data channels, out of scope for
 * now), expiration for the link itself, and an optional password gating
 * who can connect as the receiver. No download limit or burn-after-read
 * here: those describe server-stored copies, and P2P never stores one.
 */
export function P2pReviewStep({
  file,
  onRemoveFile,
  expiration,
  onExpirationChange,
  password,
  onPasswordChange,
  onStart,
  onCancel,
}: {
  file: File;
  onRemoveFile: () => void;
  expiration: ExpirationValue;
  onExpirationChange: (value: ExpirationValue) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();

  return (
    <Card className="w-full p-6 sm:p-8 animate-fade-in">
      <h2 className="text-base font-semibold text-foreground">1 file selected</h2>
      <p className="mt-1 text-sm text-muted">
        Set your options, then create the link when you&apos;re ready.
      </p>

      <div className="mt-5">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3">
          <FileIcon mimeType={file.type} className="h-6 w-6 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={onRemoveFile}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground cursor-pointer"
            aria-label={`Remove ${file.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-6">
        <ExpirationSelect value={expiration} onChange={onExpirationChange} />
      </div>

      <div className="mt-6">
        <label
          htmlFor={passwordId}
          className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted"
        >
          <Lock className="h-3.5 w-3.5" /> Password protect (optional)
        </label>
        <div className="relative">
          <input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Leave blank for no password"
            maxLength={200}
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/60 focus:outline-none"
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

      <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row-reverse">
        <Button size="lg" onClick={onStart} className="flex-1">
          Create Transfer Link
        </Button>
        <Button size="lg" variant="secondary" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </Card>
  );
}
