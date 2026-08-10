"use client";

import { RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { QrCode } from "@/components/ui/QrCode";
import { FileIcon } from "@/components/ui/FileIcon";
import { formatBytes } from "@/lib/utils/bytes";
import { formatAbsolute } from "@/lib/utils/time";

export interface UploadedFileSummary {
  name: string;
  size: number;
  mimeType: string;
}

export function UploadSuccess({
  files,
  expiresAt,
  shareUrl,
  onReset,
}: {
  files: UploadedFileSummary[];
  expiresAt: Date;
  shareUrl: string;
  onReset: () => void;
}) {
  return (
    <Card className="w-full p-6 sm:p-8 animate-fade-in">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success animate-pop">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
            <path
              d="M20 6L9 17l-5-5"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Your drop is ready</h2>
        <p className="mt-1 text-sm text-muted">Share this link — it expires automatically.</p>
      </div>

      <div className="mt-6 grid gap-2">
        {files.map((file, i) => (
          <div
            key={`${file.name}-${i}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3"
          >
            <FileIcon mimeType={file.mimeType} className="h-6 w-6 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shareable link
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background-elevated px-3 py-2.5 font-mono text-sm text-foreground">
              {shareUrl}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Expires <span className="text-muted">{formatAbsolute(expiresAt)}</span>
          </p>
          <div className="mt-4 flex gap-2">
            <CopyButton value={shareUrl} className="flex-1 sm:flex-none" />
          </div>
        </div>

        <QrCode value={shareUrl} size={132} />
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <Button variant="secondary" onClick={onReset} className="w-full">
          <RotateCcw className="h-4 w-4" />
          Upload Another File
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Files are automatically deleted after expiration.
      </p>
    </Card>
  );
}
