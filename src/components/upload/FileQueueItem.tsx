"use client";

import clsx from "clsx";
import { X, AlertCircle, CheckCircle2 } from "lucide-react";
import { FileIcon } from "@/components/ui/FileIcon";
import { formatBytes } from "@/lib/utils/bytes";

export interface FileQueueEntry {
  key: string;
  file: File;
  progress: number; // 0-100
  status: "queued" | "uploading" | "done" | "error" | "cancelled";
  error?: string;
}

export function FileQueueItem({
  entry,
  onCancel,
}: {
  entry: FileQueueEntry;
  onCancel: (key: string) => void;
}) {
  const isActive = entry.status === "uploading" || entry.status === "queued";

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 animate-fade-in sm:gap-3 sm:px-4 sm:py-3">
      <FileIcon mimeType={entry.file.type} className="h-7 w-7 shrink-0 text-muted sm:h-8 sm:w-8" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">{entry.file.name}</p>
          {entry.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
          {entry.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-danger" />}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatBytes(entry.file.size)}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{entry.file.type || "Unknown type"}</span>
        </div>

        {entry.status !== "error" ? (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={clsx(
                "h-full rounded-full bg-gradient-to-r from-accent to-accent-strong transition-[width] duration-200 ease-out",
                entry.status === "done" && "bg-success",
              )}
              style={{ width: `${entry.status === "done" ? 100 : entry.progress}%` }}
            />
          </div>
        ) : (
          <p className="mt-1 text-xs text-danger">{entry.error ?? "Upload failed."}</p>
        )}
      </div>

      {isActive && (
        <button
          type="button"
          onClick={() => onCancel(entry.key)}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background-elevated hover:text-foreground cursor-pointer"
          aria-label={`Cancel upload of ${entry.file.name}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
