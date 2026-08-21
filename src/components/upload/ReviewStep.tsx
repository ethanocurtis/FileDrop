"use client";

import { Infinity as InfinityIcon, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileIcon } from "@/components/ui/FileIcon";
import { ExpirationSelect } from "@/components/upload/ExpirationSelect";
import { OptionsPanel, type DropOptions } from "@/components/upload/OptionsPanel";
import { useAdminSession } from "@/lib/client/adminSession";
import { formatBytes } from "@/lib/utils/bytes";
import type { ExpirationValue } from "@/lib/utils/time";

/**
 * Shown after files are picked but before anything is uploaded, so
 * expiration/password/download-limit/burn-after-read can be set (or
 * changed) with the actual file list in view — not just beforehand.
 */
export function ReviewStep({
  files,
  onRemoveFile,
  expiration,
  onExpirationChange,
  noExpiration,
  onNoExpirationChange,
  options,
  onOptionsChange,
  onUpload,
  onCancel,
}: {
  files: File[];
  onRemoveFile: (index: number) => void;
  expiration: ExpirationValue;
  onExpirationChange: (value: ExpirationValue) => void;
  noExpiration: boolean;
  onNoExpirationChange: (value: boolean) => void;
  options: DropOptions;
  onOptionsChange: (options: DropOptions) => void;
  onUpload: () => void;
  onCancel: () => void;
}) {
  const { isAdmin } = useAdminSession();
  return (
    <Card className="w-full p-6 sm:p-8 animate-fade-in">
      <h2 className="text-base font-semibold text-foreground">
        {files.length === 1 ? "1 file selected" : `${files.length} files selected`}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Set your options, then upload when you&apos;re ready.
      </p>

      <div className="mt-5 grid gap-2">
        {files.map((file, i) => (
          <div
            key={`${file.name}-${file.size}-${i}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3"
          >
            <FileIcon mimeType={file.type} className="h-6 w-6 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => onRemoveFile(i)}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground cursor-pointer"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <ExpirationSelect value={expiration} onChange={onExpirationChange} disabled={noExpiration} />
        {isAdmin && (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={noExpiration}
              onChange={(e) => onNoExpirationChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border-strong bg-card accent-[var(--accent)]"
            />
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <InfinityIcon className="h-3.5 w-3.5 text-accent-strong" /> Never expire (Admin)
            </span>
          </label>
        )}
      </div>
      <div className="mt-6">
        <OptionsPanel options={options} onChange={onOptionsChange} />
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row-reverse">
        <Button size="lg" onClick={onUpload} disabled={files.length === 0} className="flex-1">
          {files.length === 0
            ? "Select a file"
            : files.length === 1
              ? "Upload File"
              : `Upload ${files.length} Files`}
        </Button>
        <Button size="lg" variant="secondary" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </Card>
  );
}
